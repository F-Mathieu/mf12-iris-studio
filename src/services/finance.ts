import { batch, getSettings, insertStmt, nowIso, one, sel, uid } from './base';
import { microCharges, microFromSettings } from '../lib/micro';

export const EXPENSE_CATEGORIES = { location: 'Location', deplacement: 'Déplacement', publicite: 'Publicité', consommables: 'Consommables', temps: 'Temps de travail (estimé)', autre: 'Autres dépenses' } as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
export interface Expense { id: string; session_id: string; category: ExpenseCategory; label: string | null; amount_cents: number; date: string | null }

export const listExpenses = (sessionId: string) => sel<Expense>('SELECT * FROM session_expenses WHERE session_id=? ORDER BY date, created_at', [sessionId]);
export const addExpense = (e: Omit<Expense, 'id'>) => batch([insertStmt('session_expenses', { id: uid(), ...e, created_at: nowIso() })]);
export const deleteExpense = (id: string) => batch([{ sql: 'DELETE FROM session_expenses WHERE id=?', params: [id] }]);

export interface Profitability {
  sales_cents: number; discounts_cents: number; gross_cents: number; collected_cents: number; balance_cents: number; orders: number;
  supplier_estimated_cents: number; supplier_actual_cents: number | null; supplier_shipping_cents: number;
  expenses_cents: number; expenses_without_time_cents: number; time_cents: number; expenses: Record<string, number>;
  margin_cents: number; result_cents: number; result_with_time_cents: number;
  /** Micro-entreprise: CA split, URSSAF contributions, optional income tax (versement libératoire), other contributions. */
  ca_services_cents: number; ca_sales_cents: number; social_cents: number; tax_cents: number; other_charges_cents: number; charges_cents: number;
  /** What is left: result − contributions (before / after the estimated working time). */
  net_cents: number; net_with_time_cents: number;
}

/** Profitability of a session. Commercial margin = sales − supplier costs (real if known, otherwise estimated). Not an accounting net profit. */
export async function profitability(sessionId: string): Promise<Profitability> {
  const o = await one<{ sales: number; disc: number; sub: number; n: number; est: number }>(
    `SELECT COALESCE(sum(total_cents),0) sales, COALESCE(sum(discount_cents),0) disc, COALESCE(sum(subtotal_cents),0) sub, count(*) n,
       COALESCE(sum(cost_estimate_cents),0) est FROM orders WHERE session_id=? AND status='validee'`, [sessionId]);
  const paid = await one<{ p: number }>(`SELECT COALESCE(sum(p.amount_cents),0) p FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.session_id=? AND o.status='validee'`, [sessionId]);
  const so = await one<{ actual: number | null; known: number; total: number; ship: number; est: number }>(
    `SELECT sum(actual_cost_cents) actual, count(actual_cost_cents) known, count(*) total, COALESCE(sum(shipping_cents),0) ship, COALESCE(sum(estimated_cost_cents),0) est
     FROM supplier_orders WHERE session_id=? AND status<>'annulee'`, [sessionId]);
  const ex = await sel<{ category: string; t: number }>('SELECT category, sum(amount_cents) t FROM session_expenses WHERE session_id=? GROUP BY category', [sessionId]);
  const expenses = Object.fromEntries(ex.map((e) => [e.category, e.t]));
  const time = expenses.temps ?? 0;
  const expTotal = ex.reduce((s, e) => s + e.t, 0);
  const sales = o?.sales ?? 0;
  // Actual supplier cost replaces the estimate for the part already ordered with a known invoice amount.
  const allActual = so && so.total > 0 && so.known === so.total;
  const supplierCost = (allActual ? (so!.actual ?? 0) + so!.ship : (o?.est ?? 0) + (so?.ship ?? 0));
  const margin = sales - supplierCost;
  // Resold goods = articles bought from a supplier (cost > 0): prints, frames… (only used in « mixte » mode).
  const goods = await one<{ g: number }>(`SELECT COALESCE(sum(i.line_total_cents),0) g FROM order_items i JOIN orders o ON o.id=i.order_id
     WHERE o.session_id=? AND o.status='validee' AND i.unit_cost_cents > 0`, [sessionId]);
  const ch = microCharges(sales, goods?.g ?? 0, o?.sub ?? 0, microFromSettings(await getSettings()));
  const result = margin - (expTotal - time);
  return {
    sales_cents: sales, discounts_cents: o?.disc ?? 0, gross_cents: o?.sub ?? 0, orders: o?.n ?? 0,
    collected_cents: paid?.p ?? 0, balance_cents: sales - (paid?.p ?? 0),
    supplier_estimated_cents: o?.est ?? 0, supplier_actual_cents: so && so.known ? so.actual : null, supplier_shipping_cents: so?.ship ?? 0,
    expenses_cents: expTotal, expenses_without_time_cents: expTotal - time, time_cents: time, expenses,
    margin_cents: margin, result_cents: result, result_with_time_cents: margin - expTotal,
    ca_services_cents: ch.caServices, ca_sales_cents: ch.caSales, social_cents: ch.social, tax_cents: ch.tax, other_charges_cents: ch.other, charges_cents: ch.total,
    net_cents: result - ch.total, net_with_time_cents: margin - expTotal - ch.total,
  };
}

export interface DashboardFilters { from?: string; to?: string; sessionId?: string }
export async function dashboard(f: DashboardFilters = {}) {
  const w = ["o.status='validee'"], p: string[] = [];
  if (f.sessionId) { w.push('o.session_id=?'); p.push(f.sessionId); }
  if (f.from) { w.push('COALESCE(s.date, substr(o.created_at,1,10))>=?'); p.push(f.from); }
  if (f.to) { w.push('COALESCE(s.date, substr(o.created_at,1,10))<=?'); p.push(f.to); }
  const W = w.join(' AND ');
  const sw: string[] = [], sp: string[] = [];
  if (f.sessionId) { sw.push('s.id=?'); sp.push(f.sessionId); }
  if (f.from) { sw.push('s.date>=?'); sp.push(f.from); }
  if (f.to) { sw.push('s.date<=?'); sp.push(f.to); }
  const SW = sw.length ? 'WHERE ' + sw.join(' AND ') : '';
  const [k, reg, paid, items, styles, supports, prod, ex] = await Promise.all([
    one<{ orders: number; sales: number; cost: number; discounts: number }>(`SELECT count(*) orders, COALESCE(sum(total_cents),0) sales, COALESCE(sum(cost_estimate_cents),0) cost, COALESCE(sum(discount_cents),0) discounts FROM orders o JOIN sessions s ON s.id=o.session_id WHERE ${W}`, p),
    one<{ sessions: number; families: number; present: number }>(`SELECT count(DISTINCT s.id) sessions, count(r.id) families,
       sum(CASE WHEN r.appt_status IN ('present','en_cours','termine') THEN 1 ELSE 0 END) present FROM sessions s LEFT JOIN session_registrations r ON r.session_id=s.id ${SW}`, sp),
    one<{ paid: number }>(`SELECT COALESCE(sum(pa.amount_cents),0) paid FROM payments pa JOIN orders o ON o.id=pa.order_id JOIN sessions s ON s.id=o.session_id WHERE ${W}`, p),
    one<{ n: number }>(`SELECT COALESCE(sum(i.qty),0) n FROM order_items i JOIN orders o ON o.id=i.order_id JOIN sessions s ON s.id=o.session_id WHERE ${W}`, p),
    sel<{ label: string; n: number }>(`SELECT c.style_name label, count(*) n FROM order_compositions c JOIN orders o ON o.id=c.order_id JOIN sessions s ON s.id=o.session_id WHERE ${W} GROUP BY c.style_name ORDER BY n DESC`, p),
    sel<{ label: string; n: number; amount: number }>(`SELECT i.product_name label, sum(i.qty) n, sum(i.line_total_cents) amount FROM order_items i JOIN orders o ON o.id=i.order_id JOIN sessions s ON s.id=o.session_id WHERE ${W} AND i.category='impression' GROUP BY i.product_name ORDER BY n DESC`, p),
    one<{ todo: number; done: number }>(`SELECT sum(CASE WHEN t.status<>'livre' THEN 1 ELSE 0 END) todo, sum(CASE WHEN t.status='livre' THEN 1 ELSE 0 END) done FROM production_tasks t JOIN orders o ON o.id=t.order_id JOIN sessions s ON s.id=o.session_id WHERE t.deleted_at IS NULL AND ${W}`, p),
    one<{ t: number }>(`SELECT COALESCE(sum(e.amount_cents),0) t FROM session_expenses e JOIN sessions s ON s.id=e.session_id ${SW.replace('WHERE', 'WHERE e.category<>\'temps\' AND') || "WHERE e.category<>'temps'"}`, sp),
  ]);
  const sales = k?.sales ?? 0, cost = k?.cost ?? 0;
  const monthly = await sel<{ month: string; sales: number }>(
    `SELECT substr(COALESCE(s.date, o.created_at),1,7) month, sum(o.total_cents) sales FROM orders o JOIN sessions s ON s.id=o.session_id WHERE ${W} GROUP BY month ORDER BY month DESC LIMIT 12`, p);
  return {
    sessions: reg?.sessions ?? 0, families: reg?.families ?? 0, present: reg?.present ?? 0,
    orders: k?.orders ?? 0, sales, collected: paid?.paid ?? 0, balance: sales - (paid?.paid ?? 0),
    avgBasket: k?.orders ? Math.round(sales / k.orders) : 0, itemsSold: items?.n ?? 0, discounts: k?.discounts ?? 0,
    styles, supports, toProduce: prod?.todo ?? 0, delivered: prod?.done ?? 0,
    margin: sales - cost, result: sales - cost - (ex?.t ?? 0), monthly: monthly.reverse(),
  };
}

export async function sessionsComparison() {
  const ss = await sel<{ id: string; name: string; date: string | null; status: string }>("SELECT id, name, date, status FROM sessions ORDER BY COALESCE(date,'') DESC LIMIT 50");
  return Promise.all(ss.map(async (s) => ({ ...s, ...(await profitability(s.id)) })));
}

export interface UniverseStat {
  universe_id: string | null; name: string; sessions: number; orders: number; sales_cents: number; collected_cents: number;
  supplier_cents: number; margin_cents: number; expenses_cents: number; charges_cents: number; net_cents: number;
  avg_basket_cents: number; margin_rate_bp: number | null; share_bp: number;
}

/** Profitability per universe (Iris, Noël, Mariage…): sum of its sessions (year = session date), best net first. */
export async function universeStats(year?: number): Promise<UniverseStat[]> {
  const ss = await sel<{ id: string; universe_id: string | null; uname: string | null }>(
    `SELECT s.id, s.universe_id, u.name uname FROM sessions s LEFT JOIN universes u ON u.id=s.universe_id
     ${year ? "WHERE substr(COALESCE(s.date, s.created_at),1,4)=?" : ''}`, year ? [String(year)] : []);
  const map = new Map<string, UniverseStat>();
  for (const s of ss) {
    const p = await profitability(s.id);
    const k = s.universe_id ?? '';
    const u = map.get(k) ?? { universe_id: s.universe_id, name: s.uname ?? 'Sans univers', sessions: 0, orders: 0, sales_cents: 0, collected_cents: 0, supplier_cents: 0,
      margin_cents: 0, expenses_cents: 0, charges_cents: 0, net_cents: 0, avg_basket_cents: 0, margin_rate_bp: null, share_bp: 0 };
    u.sessions++; u.orders += p.orders; u.sales_cents += p.sales_cents; u.collected_cents += p.collected_cents;
    u.supplier_cents += p.sales_cents - p.margin_cents; u.margin_cents += p.margin_cents; u.expenses_cents += p.expenses_without_time_cents;
    u.charges_cents += p.charges_cents; u.net_cents += p.net_cents;
    map.set(k, u);
  }
  const all = [...map.values()];
  const total = all.reduce((t, u) => t + u.sales_cents, 0);
  for (const u of all) {
    u.avg_basket_cents = u.orders ? Math.round(u.sales_cents / u.orders) : 0;
    u.margin_rate_bp = u.sales_cents ? Math.round((u.margin_cents * 10000) / u.sales_cents) : null;
    u.share_bp = total ? Math.round((u.sales_cents * 10000) / total) : 0;
  }
  return all.filter((u) => u.sessions > 0).sort((a, b) => b.net_cents - a.net_cents || b.sales_cents - a.sales_cents);
}
