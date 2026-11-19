/**
 * BAT d'une commande : import du fichier final (tirage, montage), copie filigranée basse définition, envoi par e-mail,
 * réponse du client (validé / corrections), nouvelle version. Une nouvelle version d'un même libellé remplace l'ancienne.
 */
import { auditStmt, batch, getSettings, insertStmt, nowIso, one, sel, uid, updateStmt } from './base';
import { composeMail, type MailResult } from './mail';
import { clientName, sellerInfo } from './invoices';
import { fromBase64, toBase64 } from './attachments';
import { DEFAULT_PROOF_STYLE, makeProof, type ProofStyle } from '../lib/proof';
import { fillMail } from '../lib/followUpMail';
import { signatureOf } from '../lib/invoiceMail';
import { slug } from '../lib/format';

export type ProofStatus = 'a_envoyer' | 'envoye' | 'valide' | 'corrections' | 'remplace';
export const PROOF_STATUS: Record<ProofStatus, string> = { a_envoyer: 'À envoyer', envoye: 'Envoyé', valide: 'Validé', corrections: 'Corrections demandées', remplace: 'Remplacé' };
export interface Proof { id: string; order_id: string; label: string; version: number; file_name: string | null; status: ProofStatus; sent_at: string | null; answered_at: string | null; comment: string | null; created_at: string }

export const DEFAULT_PROOF_MAIL = `{bonjour}

Vous trouverez ci-joint le BAT (bon à tirer) de votre commande {numero} :
{liste}

Il s’agit d’un aperçu en basse définition, filigrané, destiné uniquement à la validation : le tirage final sera bien sûr en haute qualité, sans filigrane.

Merci de me confirmer par retour de mail que tout vous convient (cadrage, disposition, photos choisies), ou de m’indiquer les modifications souhaitées. La fabrication sera lancée dès votre validation.

{signature}`;

export const listProofs = (orderId: string) =>
  sel<Proof>('SELECT id, order_id, label, version, file_name, status, sent_at, answered_at, comment, created_at FROM proofs WHERE order_id=? ORDER BY label, version DESC', [orderId]);

export async function proofImage(id: string): Promise<Uint8Array | null> {
  const r = await one<{ data: string }>('SELECT data FROM proofs WHERE id=?', [id]);
  return r ? fromBase64(r.data) : null;
}

/** Adds BAT files: watermarked copy; same label as an existing BAT = new version (the previous one is « remplacé »). */
export async function addProofs(orderId: string, files: { name: string; bytes: Uint8Array }[], label?: string): Promise<number> {
  const o = await one<{ number: string }>('SELECT number FROM orders WHERE id=?', [orderId]);
  if (!o) throw new Error('Commande introuvable');
  const s = await getSettings();
  const brand = s.business_name || 'MF/1.2';
  let n = 0;
  for (const f of files) {
    if (!/\.(jpe?g|png|webp)$/i.test(f.name)) throw new Error(`« ${f.name} » : exportez le BAT en JPEG ou PNG.`);
    const lbl = (files.length === 1 && label?.trim()) || f.name.replace(/\.[a-z0-9]+$/i, '');
    const prev = await one<{ v: number }>('SELECT max(version) v FROM proofs WHERE order_id=? AND label=?', [orderId, lbl]);
    const version = (prev?.v ?? 0) + 1;
    const img = await makeProof(f.bytes, { mark: `BAT · ${brand} · ${o.number}`, banner: `BON À TIRER — ${lbl} — v${version} — aperçu non imprimable, à valider`, style: (s.proof_style as ProofStyle) || DEFAULT_PROOF_STYLE });
    await batch([
      { sql: "UPDATE proofs SET status='remplace' WHERE order_id=? AND label=? AND status<>'valide'", params: [orderId, lbl] },
      insertStmt('proofs', { id: uid(), order_id: orderId, label: lbl, version, file_name: f.name, data: toBase64(img), status: 'a_envoyer', created_at: nowIso() }),
      auditStmt('order', orderId, 'bat_ajout', { label: lbl, version }),
    ]);
    n++;
  }
  return n;
}

export async function setProofStatus(id: string, status: Extract<ProofStatus, 'valide' | 'corrections' | 'a_envoyer'>, comment?: string | null) {
  const p = await one<{ order_id: string; label: string; version: number }>('SELECT order_id, label, version FROM proofs WHERE id=?', [id]);
  if (!p) throw new Error('BAT introuvable');
  await batch([
    updateStmt('proofs', id, { status, comment: comment ?? null, answered_at: status === 'a_envoyer' ? null : nowIso().slice(0, 10) }),
    auditStmt('order', p.order_id, status === 'valide' ? 'bat_valide' : status === 'corrections' ? 'bat_corrections' : 'bat_reouvert', { label: p.label, version: p.version, comment: comment ?? null }),
  ]);
}

export const deleteProof = (id: string) => batch([{ sql: 'DELETE FROM proofs WHERE id=?', params: [id] }]);

/** E-mail with the BAT to send (« à envoyer » and current versions), then marked « envoyé ». */
export async function emailProofs(orderId: string, ids?: string[]): Promise<{ how: MailResult; count: number }> {
  const all = (await listProofs(orderId)).filter((p) => (ids ? ids.includes(p.id) : p.status === 'a_envoyer'));
  if (!all.length) throw new Error('Aucun BAT à envoyer.');
  const o = await one<{ number: string; email: string | null; first: string | null; family: string; session: string }>(
    `SELECT o.number, f.email, f.contact_first_name first, f.name family, s.name session FROM orders o JOIN families f ON f.id=o.family_id JOIN sessions s ON s.id=o.session_id WHERE o.id=?`, [orderId]);
  if (!o) throw new Error('Commande introuvable');
  const [s, seller] = await Promise.all([getSettings(), sellerInfo()]);
  const files = await Promise.all(all.map(async (p) => ({ name: `BAT-${o.number}-${slug(p.label)}-v${p.version}.jpg`, bytes: (await proofImage(p.id))! })));
  const how = await composeMail({
    to: (o.email ?? '').trim(), subject: `BAT à valider — commande ${o.number} — ${o.session}`,
    body: fillMail(s.proof_mail || DEFAULT_PROOF_MAIL, { bonjour: o.first ? `Bonjour ${o.first},` : 'Bonjour,', client: clientName(o.first, o.family), numero: o.number, seance: o.session,
      liste: all.map((p) => `• ${p.label}${p.version > 1 ? ` (version ${p.version})` : ''}`).join('\n'), signature: signatureOf(seller), lien_avis: '' }),
    files,
  });
  const today = nowIso().slice(0, 10);
  await batch([...all.map((p) => updateStmt('proofs', p.id, { status: 'envoye', sent_at: today })), auditStmt('order', orderId, 'bat_envoye', { labels: all.map((p) => p.label) })]);
  return { how, count: all.length };
}

/** BAT sent and still without answer (for « À faire »). */
export const pendingProofs = () =>
  sel<{ order_id: string; number: string; family: string; label: string; sent_at: string }>(
    `SELECT p.order_id, o.number, f.name family, p.label, p.sent_at FROM proofs p JOIN orders o ON o.id=p.order_id JOIN families f ON f.id=o.family_id
     WHERE p.status='envoye' ORDER BY p.sent_at`);
