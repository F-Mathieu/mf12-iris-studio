/**
 * Devis (quotes): continuous numbering per year (D2026-0001…), content frozen in `data` (same shape as an invoice),
 * validity date, follow-up envoyé / signé / refusé. Issuing again an unchanged, still valid quote returns it (no new number).
 */
import { batch, getSettings, insertStmt, nowIso, one, sel, uid, updateStmt } from './base';
import { buildInvoiceData, REQUIRED_SELLER, sellerInfo, type InvoiceData } from './invoices';
import { getOrderDetail } from './orders';
import { hasPlan, schedule } from '../lib/pricing';
import { compositionSketches } from './sketches';
import { singleVisualStyleIds } from './catalog';
import type { Stmt } from '../lib/db/types';

export type QuoteStatus = 'envoye' | 'signe' | 'refuse';
export const QUOTE_STATUS: Record<QuoteStatus, string> = { envoye: 'Envoyé', signe: 'Signé', refuse: 'Refusé' };
export interface QuoteRow { id: string; number: string; order_id: string | null; issued_at: string; valid_until: string; total_cents: number; data: string; status: QuoteStatus; signed_at: string | null }

export const quotesOfOrder = (orderId: string) => sel<QuoteRow>('SELECT * FROM quotes WHERE order_id=? ORDER BY issued_at DESC', [orderId]);
export const listQuotes = () => sel<QuoteRow & { client: string; order_number: string | null; order_status: string | null }>(
  `SELECT q.*, json_extract(q.data, '$.client.name') client, o.number order_number, o.status order_status
   FROM quotes q LEFT JOIN orders o ON o.id=q.order_id ORDER BY q.issued_at DESC, q.number DESC`);

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** What the client agrees to: lines, discounts, total, payment schedule. */
const fingerprint = (d: InvoiceData) => JSON.stringify([d.lines, d.discounts, d.total, d.instalments ?? null, d.client.name]);

async function nextNumber(): Promise<string> {
  const prefix = `D${new Date().getFullYear()}-`;
  const r = await one<{ n: number }>('SELECT COALESCE(max(CAST(substr(number, ?) AS INTEGER)), 0) + 1 n FROM quotes WHERE number LIKE ?', [prefix.length + 1, `${prefix}%`]);
  return `${prefix}${String(r?.n ?? 1).padStart(4, '0')}`;
}

/** Content of a quote for the current order (draft or validated). */
export async function buildQuoteData(orderId: string, number: string): Promise<InvoiceData> {
  const base = await buildInvoiceData(orderId, number);
  const s = await getSettings();
  const d = await getOrderDetail(orderId);
  const plan = d?.cart.paymentPlan;
  const days = Math.max(1, Number(s.quote_validity_days) || 30);
  return {
    ...base, kind: 'devis', validUntil: addDays(base.date, days), quoteTerms: s.quote_terms || null,
    sketches: d ? compositionSketches(d.cart, await singleVisualStyleIds()) : [],
    paid: 0, balance: base.total, payments: [],
    instalments: hasPlan(plan) ? schedule(base.total, plan).map((x) => ({ n: x.n, date: x.date, amount: x.amount_cents, paid: false })) : undefined,
  };
}

/** Issues a quote (new number), or returns the latest one if its content is unchanged and it is still valid. */
export async function issueQuote(orderId: string): Promise<{ row: QuoteRow; data: InvoiceData; created: boolean }> {
  const o = await one<{ status: string }>('SELECT status FROM orders WHERE id=?', [orderId]);
  if (!o) throw new Error('Commande introuvable');
  if (o.status === 'annulee') throw new Error('Commande annulée : pas de devis.');
  const seller = await sellerInfo();
  const missing = REQUIRED_SELLER.filter(([k]) => !String(seller[k] ?? '').trim()).map(([, l]) => l);
  if (missing.length) throw new Error(`Informations légales manquantes (Paramètres → Facturation) : ${missing.join(', ')}.`);
  const draft = await buildQuoteData(orderId, '');
  if (!draft.lines.length) throw new Error('Le panier est vide.');
  const [last] = await quotesOfOrder(orderId);
  if (last && last.status !== 'refuse' && last.valid_until >= draft.date) {
    const data: InvoiceData = JSON.parse(last.data);
    if (fingerprint(data) === fingerprint(draft)) return { row: last, data, created: false };
  }
  const number = await nextNumber();
  const data = { ...draft, number };
  const row: QuoteRow = { id: uid(), number, order_id: orderId, issued_at: nowIso(), valid_until: data.validUntil!, total_cents: data.total, data: JSON.stringify(data), status: 'envoye', signed_at: null };
  await batch([insertStmt('quotes', { ...row })]);
  return { row, data, created: true };
}

/** The registration (session line) of an order: its own, or the family's registration in the session. */
const REG_OF_ORDER = `COALESCE((SELECT registration_id FROM orders WHERE id=?),
  (SELECT r.id FROM session_registrations r JOIN orders o ON o.session_id=r.session_id AND o.family_id=r.family_id WHERE o.id=? LIMIT 1))`;

/** Ticks « devis envoyé » / « devis validé » on the registration of the order (date kept if already ticked). */
export const markQuoteOnRegistration = (orderId: string, what: 'sent' | 'signed', on = true, date?: string | null): Stmt => {
  const col = what === 'sent' ? 'quote_sent_at' : 'quote_signed_at';
  return { sql: `UPDATE session_registrations SET ${col}=${on ? `COALESCE(${col}, ?)` : '?'} WHERE id=${REG_OF_ORDER}`, params: [on ? date || nowIso().slice(0, 10) : null, orderId, orderId] };
};

/**
 * A signed quote was attached to the order: the latest quote still « envoyé » becomes « signé » (signature date = today),
 * and « devis envoyé / validé » are ticked on the registration (even when the quote was made outside the app).
 */
export async function signedQuoteStmts(orderId: string, date = nowIso().slice(0, 10)): Promise<Stmt[]> {
  const q = await one<{ id: string; status: QuoteStatus }>('SELECT id, status FROM quotes WHERE order_id=? ORDER BY issued_at DESC, number DESC LIMIT 1', [orderId]);
  return [
    ...(q?.status === 'envoye' ? [updateStmt('quotes', q.id, { status: 'signe', signed_at: date })] : []),
    markQuoteOnRegistration(orderId, 'sent', true, date), markQuoteOnRegistration(orderId, 'signed', true, date),
  ];
}

export async function setQuoteStatus(id: string, status: QuoteStatus, signedAt?: string | null) {
  const q = await one<{ order_id: string | null }>('SELECT order_id FROM quotes WHERE id=?', [id]);
  const signed = status === 'signe' ? signedAt || nowIso().slice(0, 10) : null;
  await batch([
    updateStmt('quotes', id, { status, signed_at: signed }),
    ...(q?.order_id ? [markQuoteOnRegistration(q.order_id, 'signed', status === 'signe', signed), ...(status === 'signe' ? [markQuoteOnRegistration(q.order_id, 'sent')] : [])] : []),
  ]);
}
