/**
 * Pièces jointes d’une commande (devis signé, capture d’e-mail, bon de commande…), pour suivre le dossier.
 * Stockées en base (base64) → incluses dans les sauvegardes. Jamais montrées en mode client.
 */
import { auditStmt, batch, insertStmt, nowIso, one, sel, uid, updateStmt } from './base';

export const ATTACHMENT_KINDS = { devis_signe: 'Devis signé', mail: 'Échange e-mail', bon_commande: 'Bon de commande', paiement: 'Justificatif de paiement', autre: 'Autre' } as const;
export type AttachmentKind = keyof typeof ATTACHMENT_KINDS;
export interface Attachment { id: string; order_id: string; kind: AttachmentKind; name: string; mime: string; size: number; note: string | null; created_at: string }
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
  eml: 'message/rfc822', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
export const mimeOfName = (name: string) => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
/** Guess the kind from the file name (« devis… signé » → devis signé, image / .eml → e-mail). */
export function guessKind(name: string, mime: string): AttachmentKind {
  const n = name.toLowerCase();
  if (/devis|sign/.test(n)) return 'devis_signe';
  if (/bon.?de.?commande|\bbdc\b/.test(n)) return 'bon_commande';
  if (/virement|paiement|recu|reçu|cheque|chèque/.test(n)) return 'paiement';
  if (mime === 'message/rfc822' || /mail|capture|screenshot|screen/.test(n)) return 'mail';
  return 'autre';
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const listAttachments = (orderId: string) =>
  sel<Attachment>('SELECT id, order_id, kind, name, mime, size, note, created_at FROM order_attachments WHERE order_id=? ORDER BY created_at DESC', [orderId]);

export async function addAttachment(orderId: string, f: { name: string; bytes: Uint8Array; mime?: string; kind?: AttachmentKind; note?: string | null }): Promise<string> {
  if (!f.bytes.length) throw new Error(`Fichier vide : ${f.name}`);
  if (f.bytes.length > MAX_ATTACHMENT_BYTES) throw new Error(`« ${f.name} » dépasse 20 Mo.`);
  const name = f.name.trim() || 'piece-jointe';
  const mime = f.mime || mimeOfName(name);
  const kind = f.kind ?? guessKind(name, mime);
  const id = uid();
  await batch([
    insertStmt('order_attachments', { id, order_id: orderId, kind, name, mime, size: f.bytes.length, data: toBase64(f.bytes), note: f.note ?? null, created_at: nowIso() }),
    auditStmt('order', orderId, 'attachment_add', { name, kind }),
  ]);
  return id;
}

export const updateAttachment = (id: string, d: { kind?: AttachmentKind; note?: string | null; name?: string }) => batch([updateStmt('order_attachments', id, d)]);

export async function getAttachmentBytes(id: string): Promise<{ name: string; mime: string; bytes: Uint8Array } | null> {
  const r = await one<{ name: string; mime: string; data: string }>('SELECT name, mime, data FROM order_attachments WHERE id=?', [id]);
  return r ? { name: r.name, mime: r.mime, bytes: fromBase64(r.data) } : null;
}

export async function deleteAttachment(id: string) {
  const r = await one<{ order_id: string; name: string }>('SELECT order_id, name FROM order_attachments WHERE id=?', [id]);
  if (!r) return;
  await batch([{ sql: 'DELETE FROM order_attachments WHERE id=?', params: [id] }, auditStmt('order', r.order_id, 'attachment_delete', { name: r.name })]);
}
