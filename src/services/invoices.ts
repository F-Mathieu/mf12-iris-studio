/**
 * Invoices (factures) and credit notes (avoirs) — French rules for a micro-entrepreneur en franchise de TVA:
 * - unique, chronological, continuous numbering per year (F2026-0001…, AV2026-0001…), never reused;
 * - an issued invoice is immutable: its full content is frozen in `data` (JSON) and reprinted identically;
 * - a validated order that is corrected, cancelled or deleted gets a credit note cancelling its invoice;
 *   the next print then issues a new invoice.
 */
import { batch, getSettings, insertStmt, nowIso, one, sel, uid } from './base';
import { getOrderDetail, PAYMENT_METHODS } from './orders';
import { discountLabel, instalmentStatus, schedule } from '../lib/pricing';
import { ORIENTATION_LABEL } from '../lib/formatsGuide';
import type { Stmt } from '../lib/db/types';

export interface Seller {
  tradeName: string; legalName: string; status: string; address: string; siret: string; registration: string;
  ape?: string; email?: string; phone?: string; website?: string; mediator?: string; iban?: string; terms?: string;
}
export interface InvoiceLine { label: string; detail?: string; qty: number; unit: number; total: number }
export interface InvoiceData {
  kind: 'facture' | 'avoir'; number: string; date: string; saleDate: string;
  seller: Seller; client: { name: string; phone?: string | null; email?: string | null };
  order: { number: string; session: string };
  lines: InvoiceLine[]; discounts: { label: string; amount: number }[];
  subtotal: number; discount: number; total: number;
  paid: number; balance: number; payments: { date: string; method: string; amount: number }[];
  instalments?: { n: number; date: string; amount: number; paid: boolean }[];
  ref?: { number: string; date: string }; reason?: string | null;
}
export interface InvoiceRow { id: string; number: string; kind: 'facture' | 'avoir'; order_id: string | null; invoice_id: string | null; issued_at: string; total_cents: number; data: string; cancelled_by: string | null }

export const REQUIRED_SELLER: [keyof Seller, string][] = [['legalName', 'Nom et prénom (entrepreneur)'], ['address', 'Adresse professionnelle'], ['siret', 'SIRET']];

export async function sellerInfo(): Promise<Seller> {
  const s = await getSettings();
  return {
    tradeName: s.business_name || 'MF/1.2', legalName: s.legal_name || '', status: s.legal_status || 'EI', address: s.legal_address || '',
    siret: s.siret || '', registration: s.registration_mention || 'Dispensé d’immatriculation au RCS et au RM', ape: s.ape_code || undefined,
    email: s.contact_email || undefined, phone: s.contact_phone || undefined, website: s.website || undefined,
    mediator: s.mediator || undefined, iban: s.iban || undefined, terms: s.invoice_terms || undefined,
  };
}

const year = () => new Date().getFullYear();
async function nextNumber(kind: 'facture' | 'avoir'): Promise<string> {
  const prefix = `${kind === 'facture' ? 'F' : 'AV'}${year()}-`;
  const r = await one<{ n: number }>('SELECT COALESCE(max(CAST(substr(number, ?) AS INTEGER)), 0) + 1 n FROM invoices WHERE number LIKE ?', [prefix.length + 1, `${prefix}%`]);
  return `${prefix}${String(r?.n ?? 1).padStart(4, '0')}`;
}

export const invoicesOfOrder = (orderId: string) => sel<InvoiceRow>('SELECT * FROM invoices WHERE order_id=? ORDER BY issued_at', [orderId]);
export const activeInvoice = (orderId: string) =>
  one<InvoiceRow>("SELECT * FROM invoices WHERE order_id=? AND kind='facture' AND cancelled_by IS NULL ORDER BY issued_at DESC LIMIT 1", [orderId]);
export const listInvoices = () =>
  sel<InvoiceRow & { client: string }>("SELECT i.*, json_extract(i.data, '$.client.name') client FROM invoices i ORDER BY i.issued_at DESC, i.number DESC");

/** Full name "Prénom Nom". */
export const clientName = (first: string | null | undefined, last: string) => [first?.trim(), last.trim()].filter(Boolean).join(' ');

/** Builds the frozen content of an invoice from the current order. */
export async function buildInvoiceData(orderId: string, number: string): Promise<InvoiceData> {
  const d = await getOrderDetail(orderId);
  if (!d) throw new Error('Commande introuvable');
  const { order: o, cart, payments, discounts } = d;
  const lines: InvoiceLine[] = [];
  for (const c of cart.compositions) {
    const extra = [c.participantNames, c.orientation ? `disposition ${ORIENTATION_LABEL[c.orientation].toLowerCase()}` : '', c.instructions ? `souhaits : ${c.instructions}` : ''].filter(Boolean).join(' — ');
    lines.push({ label: `Création ${c.styleName} — ${c.irisCount} iris`, detail: extra || undefined, qty: 1, unit: c.feeCents, total: c.feeCents });
    for (const i of cart.items.filter((x) => x.compositionKey === c.key))
      lines.push({ label: `${i.productName}${i.variantName ? ' — ' + i.variantName : ''}`, detail: `pour la création ${c.styleName}`, qty: i.qty, unit: i.unitPriceCents, total: i.qty * i.unitPriceCents });
  }
  for (const i of cart.items.filter((x) => !x.compositionKey))
    lines.push({ label: `${i.productName}${i.variantName ? ' — ' + i.variantName : ''}`, qty: i.qty, unit: i.unitPriceCents, total: i.qty * i.unitPriceCents });
  const today = nowIso().slice(0, 10);
  return {
    kind: 'facture', number, date: today, saleDate: (o.validated_at ?? o.created_at).slice(0, 10),
    seller: await sellerInfo(), client: { name: clientName(o.contact_first_name, o.family_name), phone: o.family_phone, email: o.family_email },
    order: { number: o.number, session: o.session_name },
    lines, discounts: discounts.map((x) => ({ label: x.kind === 'auto' ? x.label : discountLabel({ label: x.label }), amount: x.amount_cents })),
    subtotal: o.subtotal_cents, discount: o.discount_cents, total: o.total_cents,
    paid: o.paid_cents, balance: o.total_cents - o.paid_cents,
    payments: payments.map((p) => ({ date: p.paid_at, method: PAYMENT_METHODS[p.method], amount: p.amount_cents })),
    instalments: cart.paymentPlan && cart.paymentPlan.count > 1
      ? instalmentStatus(schedule(o.total_cents, cart.paymentPlan), o.paid_cents, today).map((x) => ({ n: x.n, date: x.date, amount: x.amount_cents, paid: x.state === 'paye' }))
      : undefined,
  };
}

/**
 * Returns the order's current invoice, issuing it (new number) if none is active.
 * Only validated orders can be invoiced; seller legal info must be filled in Settings.
 */
export async function issueInvoice(orderId: string): Promise<{ row: InvoiceRow; data: InvoiceData; created: boolean }> {
  const existing = await activeInvoice(orderId);
  if (existing) return { row: existing, data: JSON.parse(existing.data), created: false };
  const o = await one<{ status: string }>('SELECT status FROM orders WHERE id=?', [orderId]);
  if (o?.status !== 'validee') throw new Error('Seule une commande validée peut être facturée.');
  const seller = await sellerInfo();
  const missing = REQUIRED_SELLER.filter(([k]) => !String(seller[k] ?? '').trim()).map(([, l]) => l);
  if (missing.length) throw new Error(`Informations légales manquantes (Paramètres → Facturation) : ${missing.join(', ')}.`);
  const number = await nextNumber('facture');
  const data = await buildInvoiceData(orderId, number);
  const row: InvoiceRow = { id: uid(), number, kind: 'facture', order_id: orderId, invoice_id: null, issued_at: nowIso(), total_cents: data.total, data: JSON.stringify(data), cancelled_by: null };
  await batch([insertStmt('invoices', { ...row })]);
  return { row, data, created: true };
}

/** Statements issuing a credit note for the order's active invoice (none if not invoiced). */
export async function creditNoteStmts(orderId: string, reason: string): Promise<Stmt[]> {
  const inv = await activeInvoice(orderId);
  if (!inv) return [];
  const src: InvoiceData = JSON.parse(inv.data);
  const number = await nextNumber('avoir');
  const neg = (v: number) => -v;
  const data: InvoiceData = {
    ...src, kind: 'avoir', number, date: nowIso().slice(0, 10), seller: await sellerInfo(),
    lines: src.lines.map((l) => ({ ...l, unit: neg(l.unit), total: neg(l.total) })),
    discounts: src.discounts.map((x) => ({ ...x, amount: neg(x.amount) })),
    subtotal: neg(src.subtotal), discount: neg(src.discount), total: neg(src.total), paid: 0, balance: 0, payments: [], instalments: undefined,
    ref: { number: src.number, date: src.date }, reason,
  };
  const id = uid();
  return [
    insertStmt('invoices', { id, number, kind: 'avoir', order_id: orderId, invoice_id: inv.id, issued_at: nowIso(), total_cents: data.total, data: JSON.stringify(data), cancelled_by: null }),
    { sql: 'UPDATE invoices SET cancelled_by=? WHERE id=?', params: [id, inv.id] },
  ];
}
