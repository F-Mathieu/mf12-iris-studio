/**
 * Mariages : un projet par couple = une séance de l'univers « Mariage » (le couple y est inscrit) + une commande
 * (devis en brouillon, validée à la signature). Lignes du catalogue (forfaits / options) ou libres, prix modifiables.
 * Échéancier : acompte (30 % par défaut) à la signature, solde le jour J (en une ou plusieurs fois).
 */
import { auditStmt, batch, getSetting, nowIso, one, sel, uid, updateStmt, insertStmt } from './base';
import { createSession } from './sessions';
import { addRegistration } from './registrations';
import { emptyCart, loadCart, saveCart, type Cart, type CartLine } from './orders';
import { saveUniverse } from './universes';
import { todayIso } from '../lib/ids';
import { addDays } from '../lib/weddingTexts';

export const WEDDING_SERVICES = { photo: 'Photo', video: 'Vidéo', photo_video: 'Photo + vidéo' } as const;
export type WeddingServices = keyof typeof WEDDING_SERVICES;
export const WEDDING_STATUS = { devis: 'Devis', signe: 'Signé', livre: 'Livré', annule: 'Annulé' } as const;
export type WeddingStatus = keyof typeof WEDDING_STATUS;
export const ALBUM_STEPS = { aucun: 'Pas d’album', maquette: 'Maquette en cours', envoyee: 'Maquette envoyée aux mariés', validee: 'Maquette validée', commandee: 'Commandé', recu: 'Reçu', livre: 'Livré' } as const;
export type AlbumStep = keyof typeof ALBUM_STEPS;
export const WEDDING_UNIVERSE = 'Mariage';

export interface Wedding {
  id: string; session_id: string; order_id: string | null; partner1: string; partner2: string | null; date: string | null;
  services: WeddingServices; status: WeddingStatus; deposit_bp: number; balance_count: number; signed_at: string | null;
  info: string | null; info_sent_at: string | null; info_received_at: string | null;
  teaser_delivered_at: string | null; final_delivered_at: string | null; teaser_link: string | null; final_link: string | null;
  album_supplier_id: string | null; album_status: AlbumStep; album_dates: string | null; album_note: string | null; notes: string | null;
  created_at: string; updated_at: string;
}
export interface WeddingRow extends Wedding {
  location: string | null; family_id: string; registration_id: string; email: string | null; phone: string | null;
  order_status: string | null; order_number: string | null; total_cents: number | null; paid_cents: number; album_supplier: string | null;
}

export const coupleName = (w: Pick<Wedding, 'partner1' | 'partner2'>) => [w.partner1, w.partner2].filter((x) => x?.trim()).join(' & ');

/** Delivery deadlines counted from the wedding day (settings: 15 days teaser / first photos, 30 days film & full gallery). */
export async function deadlines(w: Pick<Wedding, 'date'>) {
  const t = Number(await getSetting('wedding_teaser_days', '15')) || 15, f = Number(await getSetting('wedding_final_days', '30')) || 30;
  return { teaserDays: t, finalDays: f, teaser: w.date ? addDays(w.date, t) : null, final: w.date ? addDays(w.date, f) : null };
}

const ROW = `SELECT w.*, s.location, r.family_id, r.id registration_id, f.email, f.phone, o.status order_status, o.number order_number, o.total_cents,
    COALESCE((SELECT sum(amount_cents) FROM payments p WHERE p.order_id=w.order_id),0) paid_cents, su.name album_supplier
  FROM weddings w JOIN sessions s ON s.id=w.session_id
  JOIN session_registrations r ON r.session_id=w.session_id JOIN families f ON f.id=r.family_id
  LEFT JOIN orders o ON o.id=w.order_id LEFT JOIN suppliers su ON su.id=w.album_supplier_id`;

export const listWeddings = (opts: { includeCancelled?: boolean } = {}) =>
  sel<WeddingRow>(`${ROW} ${opts.includeCancelled ? '' : "WHERE w.status<>'annule'"} GROUP BY w.id ORDER BY COALESCE(w.date,'9999') ASC`);
export const getWedding = (id: string) => one<WeddingRow>(`${ROW} WHERE w.id=? GROUP BY w.id`, [id]);

async function weddingUniverse(): Promise<string> {
  const u = await one<{ id: string }>('SELECT id FROM universes WHERE name=? COLLATE NOCASE', [WEDDING_UNIVERSE]);
  return u?.id ?? saveUniverse({ name: WEDDING_UNIVERSE, description: 'Mariages : photo et / ou vidéo' });
}

export interface WeddingInput {
  partner1: string; partner2?: string | null; email?: string | null; phone?: string | null;
  date?: string | null; location?: string | null; services: WeddingServices; notes?: string | null;
}

/** New wedding: its « séance » (univers Mariage, template by default of the universe), the couple, the wedding row. */
export async function createWedding(input: WeddingInput): Promise<string> {
  if (!input.partner1.trim()) throw new Error('Indiquez au moins un des mariés.');
  const universe_id = await weddingUniverse();
  const name = `Mariage ${coupleName({ partner1: input.partner1.trim(), partner2: input.partner2?.trim() || null })}`;
  const sessionId = await createSession({ name, date: input.date || null, location: input.location || null, universe_id, status: 'active', description: 'Mariage' });
  await addRegistration(sessionId, { input: { name: coupleName({ partner1: input.partner1.trim(), partner2: input.partner2?.trim() || null }), email: input.email || null, phone: input.phone || null } },
    { appt_date: input.date || null, appt_status: 'a_venir' });
  const id = uid(), now = nowIso();
  const deposit = Math.round((Number(await getSetting('wedding_deposit_pct', '30')) || 30) * 100);
  await batch([insertStmt('weddings', { id, session_id: sessionId, partner1: input.partner1.trim(), partner2: input.partner2?.trim() || null, date: input.date || null,
    services: input.services, deposit_bp: deposit, notes: input.notes || null, created_at: now, updated_at: now }), auditStmt('wedding', id, 'create', { name })]);
  return id;
}

const EDITABLE = ['partner1', 'partner2', 'date', 'services', 'status', 'deposit_bp', 'balance_count', 'info_sent_at', 'info_received_at', 'teaser_delivered_at', 'final_delivered_at',
  'teaser_link', 'final_link', 'album_supplier_id', 'album_status', 'album_note', 'notes'] as const;
export type WeddingPatch = Partial<Pick<Wedding, typeof EDITABLE[number]>> & { location?: string | null; email?: string | null; phone?: string | null };

export async function updateWedding(id: string, patch: WeddingPatch) {
  const w = await getWedding(id);
  if (!w) throw new Error('Mariage introuvable');
  const row = Object.fromEntries(EDITABLE.filter((k) => k in patch).map((k) => [k, (patch as Record<string, unknown>)[k] ?? null])) as Record<string, string | number | null>;
  if ('partner1' in row && !String(row.partner1 ?? '').trim()) throw new Error('Indiquez au moins un des mariés.');
  if ('album_status' in row && row.album_status !== w.album_status) {
    const dates = { ...(w.album_dates ? JSON.parse(w.album_dates) : {}), [String(row.album_status)]: todayIso() };
    row.album_dates = JSON.stringify(dates);
  }
  const p1 = String(row.partner1 ?? w.partner1), p2 = ('partner2' in row ? row.partner2 : w.partner2) as string | null;
  await batch([
    updateStmt('weddings', id, { ...row, updated_at: nowIso() }),
    ...('date' in patch || 'location' in patch || 'partner1' in patch || 'partner2' in patch
      ? [updateStmt('sessions', w.session_id, { date: 'date' in patch ? patch.date ?? null : w.date, location: 'location' in patch ? patch.location ?? null : w.location,
          name: `Mariage ${coupleName({ partner1: p1, partner2: p2 })}`, updated_at: nowIso() }),
        { sql: 'UPDATE session_registrations SET appt_date=? WHERE id=?', params: ['date' in patch ? patch.date ?? null : w.date, w.registration_id] }] : []),
    ...('partner1' in patch || 'partner2' in patch ? [{ sql: 'UPDATE families SET name=?, updated_at=? WHERE id=?', params: [coupleName({ partner1: p1, partner2: p2 }), nowIso(), w.family_id] }] : []),
    ...('email' in patch || 'phone' in patch ? [{ sql: 'UPDATE families SET email=?, phone=?, updated_at=? WHERE id=?', params: ['email' in patch ? patch.email || null : w.email, 'phone' in patch ? patch.phone || null : w.phone, nowIso(), w.family_id] }] : []),
    auditStmt('wedding', id, 'update', patch),
  ]);
}

/** Lines of the quote / order (catalogue lines keep the price typed: no automatic re-pricing for weddings). */
export async function weddingCart(w: WeddingRow): Promise<Cart> {
  return w.order_id ? loadCart(w.order_id, false) : emptyCart(w.session_id, w.family_id, w.registration_id);
}

const planOf = (w: Pick<Wedding, 'deposit_bp' | 'balance_count' | 'date' | 'signed_at'>) =>
  ({ count: Math.max(1, w.balance_count), first_date: w.signed_at ?? todayIso(), deposit_bp: w.deposit_bp, last_date: w.date ?? null });

/**
 * Saves the lines. Before signature: draft (the quote is issued from it). After signature: correction of the
 * validated order (reason required, credit note if invoiced) — prices of a signed contract change only on purpose.
 */
export async function saveWeddingLines(id: string, items: CartLine[], notes: string, correctionReason?: string): Promise<string> {
  const w = await getWedding(id);
  if (!w) throw new Error('Mariage introuvable');
  const cart = await weddingCart(w);
  const validated = cart.status === 'validee';
  if (validated && !correctionReason?.trim()) throw new Error('Contrat signé : indiquez le motif de la modification.');
  const next: Cart = { ...cart, items, notes, paymentPlan: planOf(w) };
  const r = await saveCart(next, validated ? 'validee' : 'brouillon', correctionReason);
  if (!w.order_id) await batch([{ sql: 'UPDATE weddings SET order_id=?, updated_at=? WHERE id=?', params: [r.id, nowIso(), id] }]);
  return r.id;
}

/** Re-applies the payment schedule (deposit %, number of balance instalments, wedding date) to the order. */
export async function refreshSchedule(id: string) {
  const w = await getWedding(id);
  if (!w?.order_id) return;
  await batch([{ sql: 'UPDATE orders SET payment_plan=? WHERE id=?', params: [JSON.stringify(planOf(w)), w.order_id] }]);
}

/** Signature: the order is validated (prices frozen), the latest quote marked signed, the schedule starts on that day. */
export async function signWedding(id: string, signedAt: string) {
  const w = await getWedding(id);
  if (!w?.order_id) throw new Error('Établissez d’abord le devis (au moins une ligne).');
  const cart = await loadCart(w.order_id, false);
  await saveCart({ ...cart, paymentPlan: planOf({ ...w, signed_at: signedAt }) }, 'validee');
  const { signedQuoteStmts } = await import('./quotes');
  await batch([
    { sql: "UPDATE orders SET validated_at=? WHERE id=?", params: [signedAt + 'T12:00:00.000Z', w.order_id] },
    ...(await signedQuoteStmts(w.order_id, signedAt)),
    // validation marks the registration « terminé »: the wedding is still to come
    { sql: "UPDATE session_registrations SET appt_status='a_venir' WHERE id=?", params: [w.registration_id] },
    updateStmt('weddings', id, { status: 'signe', signed_at: signedAt, updated_at: nowIso() }),
    auditStmt('wedding', id, 'sign', { signedAt }),
  ]);
}

/** Answers of the information sheet (fiche de renseignements du jour J). */
export const setWeddingInfo = (id: string, info: Record<string, string>, received = true) =>
  batch([updateStmt('weddings', id, { info: JSON.stringify(info), info_received_at: received ? todayIso() : null, updated_at: nowIso() })]);

/** A wedding without signed contract can be deleted (its « séance » and draft go with it); a signed one is cancelled. */
export async function deleteWedding(id: string) {
  const w = await getWedding(id);
  if (!w) return;
  if (w.order_status === 'validee') throw new Error('Contrat signé : annulez le mariage (statut « Annulé ») au lieu de le supprimer.');
  await batch([
    ...(w.order_id ? [{ sql: 'DELETE FROM orders WHERE id=?', params: [w.order_id] }] : []),
    { sql: 'DELETE FROM sessions WHERE id=?', params: [w.session_id] },
    auditStmt('wedding', id, 'delete', { couple: coupleName(w) }),
  ]);
}
