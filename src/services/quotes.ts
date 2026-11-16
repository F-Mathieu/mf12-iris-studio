/**
 * Devis (quotes): continuous numbering per year (D2026-0001…), content frozen in `data` (same shape as an invoice),
 * validity date, follow-up envoyé / signé / refusé. Issuing again an unchanged, still valid quote returns it (no new number).
 */
import { batch, getSettings, insertStmt, nowIso, one, sel, uid, updateStmt } from './base';
import { buildInvoiceData, REQUIRED_SELLER, sellerInfo, type InvoiceData } from './invoices';
import { getOrderDetail } from './orders';
import { schedule } from '../lib/pricing';

export type QuoteStatus = 'envoye' | 'signe' | 'refuse';
export const QUOTE_STATUS: Record<QuoteStatus, string> = { envoye: 'Envoyé', signe: 'Signé', refuse: 'Refusé' };
export interface QuoteRow { id: string; number: string; order_id: string | null; issued_at: string; valid_until: string; total_cents: number; data: string; status: QuoteStatus; signed_at: string | null }

export const quotesOfOrder = (orderId: string) => sel<QuoteRow>('SELECT * FROM quotes WHERE order_id=? ORDER BY issued_at DESC', [orderId]);
export const listQuotes = () => sel<QuoteRow & { client: string }>("SELECT q.*, json_extract(q.data, '$.client.name') client FROM quotes q ORDER BY q.issued_at DESC, q.number DESC");

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
    paid: 0, balance: base.total, payments: [],
    instalments: plan && plan.count > 1 ? schedule(base.total, plan).map((x) => ({ n: x.n, date: x.date, amount: x.amount_cents, paid: false })) : undefined,
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

export async function setQuoteStatus(id: string, status: QuoteStatus, signedAt?: string | null) {
  await batch([updateStmt('quotes', id, { status, signed_at: status === 'signe' ? signedAt || nowIso().slice(0, 10) : null })]);
}
