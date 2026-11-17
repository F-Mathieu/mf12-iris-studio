/**
 * Compta (micro-entreprise): livre des recettes (from payments), URSSAF declarations (frozen snapshot),
 * general expenses, purchases, yearly summary and ceilings. Estimates only — not a certified accounting.
 */
import { batch, getSettings, insertStmt, nowIso, one, run, sel, uid } from './base';
import { PAYMENT_METHODS, type PaymentMethod } from './orders';
import { clientName } from './invoices';
import { microCharges, microFromSettings } from '../lib/micro';
import { proratedCeiling, suggestPeriod } from '../lib/compta';

export interface Receipt {
  id: string; date: string; amount_cents: number; method: string; order_id: string; order_number: string;
  client: string; session: string; invoice: string | null;
  /** Part of the amount that is resale of goods (only in « mixte » mode), the rest is services. */
  sales_cents: number; services_cents: number;
}

/** Livre des recettes: every payment received between two dates (inclusive), oldest first. */
export async function receipts(from: string, to: string): Promise<Receipt[]> {
  const rows = await sel<{ id: string; date: string; amount_cents: number; method: PaymentMethod; order_id: string; order_number: string; family: string; first: string | null; session: string; sub: number; goods: number; invoice: string | null }>(
    `SELECT p.id, p.paid_at date, p.amount_cents, p.method, o.id order_id, o.number order_number, f.name family, f.contact_first_name first, s.name session, o.subtotal_cents sub,
       (SELECT COALESCE(sum(i.line_total_cents),0) FROM order_items i WHERE i.order_id=o.id AND i.unit_cost_cents > 0) goods,
       (SELECT number FROM invoices v WHERE v.order_id=o.id AND v.kind='facture' ORDER BY v.issued_at DESC LIMIT 1) invoice
     FROM payments p JOIN orders o ON o.id=p.order_id JOIN families f ON f.id=o.family_id JOIN sessions s ON s.id=o.session_id
     WHERE substr(p.paid_at,1,10) BETWEEN ? AND ? ORDER BY p.paid_at, p.created_at`, [from, to]);
  const m = microFromSettings(await getSettings());
  return rows.map((r) => {
    const sales = m.mode === 'mixte' && r.sub > 0 ? Math.round((r.amount_cents * Math.min(r.goods, r.sub)) / r.sub) : 0;
    return { id: r.id, date: r.date.slice(0, 10), amount_cents: r.amount_cents, method: PAYMENT_METHODS[r.method] ?? r.method, order_id: r.order_id, order_number: r.order_number,
      client: clientName(r.first, r.family), session: r.session, invoice: r.invoice, sales_cents: sales, services_cents: r.amount_cents - sales };
  });
}

/** What to declare for a period: CA encaissé (services / sales) and the estimated contributions. */
export async function declarationFor(from: string, to: string) {
  const list = await receipts(from, to);
  const total = list.reduce((s, r) => s + r.amount_cents, 0), sales = list.reduce((s, r) => s + r.sales_cents, 0);
  const c = microCharges(total, sales, total, microFromSettings(await getSettings()));
  return { from, to, count: list.length, total_cents: total, ca_services_cents: c.caServices, ca_sales_cents: c.caSales, social_cents: c.social, tax_cents: c.tax, other_cents: c.other, charges_cents: c.total };
}

export interface Declaration { id: string; period_start: string; period_end: string; ca_services_cents: number; ca_sales_cents: number; social_cents: number; tax_cents: number; other_cents: number; declared_at: string; paid_at: string | null; note: string | null }
export const listDeclarations = () => sel<Declaration>('SELECT * FROM urssaf_declarations ORDER BY period_start DESC');

/** Records the declaration made on the URSSAF site (amounts frozen as computed now). */
export async function recordDeclaration(from: string, to: string, declaredAt: string, note?: string | null) {
  if (from > to) throw new Error('Période invalide.');
  const overlap = await one('SELECT id FROM urssaf_declarations WHERE NOT (period_end < ? OR period_start > ?)', [from, to]);
  if (overlap) throw new Error('Cette période chevauche une déclaration déjà enregistrée.');
  const d = await declarationFor(from, to);
  await batch([insertStmt('urssaf_declarations', { id: uid(), period_start: from, period_end: to, ca_services_cents: d.ca_services_cents, ca_sales_cents: d.ca_sales_cents,
    social_cents: d.social_cents, tax_cents: d.tax_cents, other_cents: d.other_cents, declared_at: declaredAt, paid_at: null, note: note ?? null, created_at: nowIso() })]);
}
export const setDeclarationPaid = (id: string, paidAt: string | null) => run('UPDATE urssaf_declarations SET paid_at=? WHERE id=?', [paidAt, id]);
export const deleteDeclaration = (id: string) => run('DELETE FROM urssaf_declarations WHERE id=?', [id]);

/** Next period to declare (from settings: activity start date, monthly / quarterly). */
export async function nextDeclaration(today: string) {
  const s = await getSettings();
  const last = await one<{ e: string | null }>('SELECT max(period_end) e FROM urssaf_declarations');
  const start = s.activity_start || `${today.slice(0, 4)}-01-01`;
  const p = suggestPeriod(last?.e ?? null, start, today, s.urssaf_frequency === 'trimestrielle' ? 'trimestrielle' : 'mensuelle');
  return { ...p, ready: p.end < today, configured: !!s.activity_start };
}

/* ---------- expenses */
export const GENERAL_EXPENSE_CATEGORIES = {
  materiel: 'Matériel photo / informatique', logiciels: 'Logiciels & abonnements', assurance: 'Assurance', banque: 'Banque',
  deplacements: 'Déplacements', publicite: 'Publicité & site', fournitures: 'Fournitures & consommables', formation: 'Formation',
  telecom: 'Téléphone & internet', local: 'Local / location', autre: 'Autre',
} as const;
export type GeneralExpenseCategory = keyof typeof GENERAL_EXPENSE_CATEGORIES;
export interface GeneralExpense { id: string; date: string; category: GeneralExpenseCategory; label: string | null; supplier: string | null; amount_cents: number; method: string | null; note: string | null }
export const listGeneralExpenses = (from: string, to: string) => sel<GeneralExpense>('SELECT * FROM general_expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC', [from, to]);
export async function addGeneralExpense(e: Omit<GeneralExpense, 'id'>) {
  if (!(e.amount_cents > 0)) throw new Error('Montant invalide.');
  await batch([insertStmt('general_expenses', { id: uid(), ...e, created_at: nowIso() })]);
}
export const deleteGeneralExpense = (id: string) => run('DELETE FROM general_expenses WHERE id=?', [id]);

/** All purchases of a period: supplier orders (real cost if known, else estimate, + shipping), session expenses, general expenses. */
export async function purchases(from: string, to: string) {
  const supplier = await sel<{ id: string; date: string; supplier: string; reference: string | null; amount_cents: number; real: number }>(
    `SELECT so.id, substr(COALESCE(so.ordered_at, so.created_at),1,10) date, su.name supplier, so.reference,
       COALESCE(so.actual_cost_cents, so.estimated_cost_cents) + so.shipping_cents amount_cents, (so.actual_cost_cents IS NOT NULL) real
     FROM supplier_orders so JOIN suppliers su ON su.id=so.supplier_id
     WHERE so.status<>'annulee' AND so.status<>'brouillon' AND substr(COALESCE(so.ordered_at, so.created_at),1,10) BETWEEN ? AND ? ORDER BY date DESC`, [from, to]);
  const session = await sel<{ id: string; date: string; session: string; category: string; label: string | null; amount_cents: number }>(
    `SELECT e.id, COALESCE(e.date, substr(e.created_at,1,10)) date, s.name session, e.category, e.label, e.amount_cents
     FROM session_expenses e JOIN sessions s ON s.id=e.session_id
     WHERE e.category<>'temps' AND COALESCE(e.date, substr(e.created_at,1,10)) BETWEEN ? AND ? ORDER BY date DESC`, [from, to]);
  const general = await listGeneralExpenses(from, to);
  const sum = (l: { amount_cents: number }[]) => l.reduce((s, x) => s + x.amount_cents, 0);
  return { supplier, session, general, supplier_cents: sum(supplier), session_cents: sum(session), general_cents: sum(general), total_cents: sum(supplier) + sum(session) + sum(general) };
}

/** Year summary: CA encaissé, purchases, contributions, net, ceilings (prorated the first year). */
export async function yearSummary(year: number) {
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const s = await getSettings();
  const [d, p] = await Promise.all([declarationFor(from, to), purchases(from, to)]);
  const num = (k: string, def: number) => { const v = Number(String(s[k] ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : def; };
  const microCeiling = proratedCeiling(num('ceiling_micro_services', 8360000), year, s.activity_start);
  const vatCeiling = proratedCeiling(num('ceiling_vat', 3750000), year, s.activity_start);
  const vatMajor = proratedCeiling(num('ceiling_vat_major', 4125000), year, s.activity_start);
  return { year, ...d, purchases: p, net_cents: d.total_cents - p.total_cents - d.charges_cents, microCeiling, vatCeiling, vatMajor };
}
