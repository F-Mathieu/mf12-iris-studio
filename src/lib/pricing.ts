/**
 * Pure pricing / cart engine (no DB). All amounts in integer cents.
 *
 * Billing model:
 *  - A *composition* (création photographique: style + iris) is billed once with its creation fee
 *    (price row kind 'style'), whatever the number of products derived from it.
 *  - Each *item* (product variant × qty) is billed at its unit price (price row kind 'variant').
 *  → a fusion printed 3 times = 1 creation fee + 3 print lines, never 3 creation fees.
 */
import { divRound, pctOf } from './money';

export interface PriceRow {
  kind: 'variant' | 'style';
  ref_id: string;
  iris_count: number; // 0 = any
  price_cents: number;
  enabled?: number | boolean;
}

/** Exact iris-count row first, then the generic (0) row. Disabled rows are ignored. */
export function findPrice(rows: PriceRow[], kind: PriceRow['kind'], refId: string, iris = 0): number | null {
  let generic: number | null = null;
  for (const r of rows) {
    if (r.kind !== kind || r.ref_id !== refId || r.enabled === 0 || r.enabled === false) continue;
    if (iris > 0 && r.iris_count === iris) return r.price_cents;
    if (r.iris_count === 0) generic = r.price_cents;
  }
  return generic;
}

export interface CartComposition {
  key: string;
  styleId: string | null;
  styleName: string;
  irisCount: number;
  feeCents: number;
}
export interface CartItem {
  key: string;
  variantId: string | null;
  productId: string | null;
  category: string; // numerique | impression | option
  productName: string;
  variantName?: string | null;
  compositionKey?: string | null;
  /** Option attached to another line of the cart (e.g. a frame under a print): follows its quantity. */
  parentKey?: string | null;
  styleId?: string | null; // style of the linked composition (for pack/promo selectors)
  qty: number;
  unitPriceCents: number;
}

export interface Selector {
  variantId?: string;
  productId?: string;
  category?: string; // numerique | impression | option | creation
  styleId?: string;
}
/**
 * Optional order-amount condition, valid for every promotion type, based on the normal price (before discounts).
 * threshold_category: only items of this category count (e.g. 'impression' = "dès 200 € de tableaux").
 */
export interface Threshold { min_subtotal_cents?: number; max_subtotal_cents?: number; threshold_category?: string }
export type PromoConfig = Threshold & (
  | { kind?: 'pack'; items: { selector: Selector; qty: number }[]; mode: 'price' | 'discount'; value_cents: number; repeat?: boolean }
  | { kind?: 'percent'; pct_bp: number; scope: 'order' | 'category' | 'product' | 'style'; target?: string; max_units?: number }
  | { kind?: 'amount'; amount_cents: number; scope?: 'order' | 'category' | 'product' | 'style'; target?: string; max_units?: number }
  | { kind?: 'quantity'; scope: 'category' | 'product'; target: string; min_qty: number; pct_bp: number });

const scopeSelector = (scope: string | undefined, target: string | undefined): Selector | null =>
  !scope || scope === 'order' ? null : scope === 'category' ? { category: target } : scope === 'product' ? { productId: target } : { styleId: target };

export interface Promotion {
  id: string;
  name: string;
  type: 'pack' | 'percent' | 'amount' | 'quantity';
  config: PromoConfig;
  priority: number; // lower = evaluated first
  stackable: boolean;
  active: boolean;
}
export interface ManualDiscount {
  label: string;
  reason?: string | null;
  amount_cents?: number;
  pct_bp?: number;
}
export interface AppliedDiscount {
  promotionId: string | null;
  kind: 'auto' | 'manual';
  label: string;
  amount_cents: number;
  reason?: string | null;
  /** For manual discounts: index in the manual list (to remove exactly this one). */
  manualIndex?: number;
  /** How many times the offer applies: pack sets, or number of discounted items for a targeted offer. */
  count?: number;
}
export interface CartTotals {
  subtotal_cents: number;
  discounts: AppliedDiscount[];
  discount_cents: number;
  total_cents: number;
}

interface Unit {
  id: string; // `${lineKey}#${n}`
  lineKey: string;
  price: number;
  variantId: string | null;
  productId: string | null;
  category: string;
  styleId: string | null;
}

function toUnits(comps: CartComposition[], items: CartItem[]): Unit[] {
  const u: Unit[] = [];
  for (const c of comps)
    u.push({ id: `${c.key}#0`, lineKey: c.key, price: c.feeCents, variantId: null, productId: null, category: 'creation', styleId: c.styleId });
  for (const it of items) {
    const styleId = it.styleId ?? comps.find((c) => c.key === it.compositionKey)?.styleId ?? null;
    for (let n = 0; n < it.qty; n++)
      u.push({ id: `${it.key}#${n}`, lineKey: it.key, price: it.unitPriceCents, variantId: it.variantId, productId: it.productId, category: it.category, styleId });
  }
  return u;
}

export function matches(u: Unit | { variantId: string | null; productId: string | null; category: string; styleId: string | null }, s: Selector): boolean {
  if (s.variantId && u.variantId !== s.variantId) return false;
  if (s.productId && u.productId !== s.productId) return false;
  if (s.category && u.category !== s.category) return false;
  if (s.styleId && u.styleId !== s.styleId) return false;
  return !!(s.variantId || s.productId || s.category || s.styleId);
}

/** Tries to take one full set of the pack from `free` units (cheapest matching units first: protects the margin). */
function takePack(cfg: Extract<PromoConfig, { items: unknown }>, free: Unit[]): Unit[] | null {
  const taken: Unit[] = [];
  const pool = [...free].sort((a, b) => a.price - b.price);
  for (const req of cfg.items) {
    for (let n = 0; n < req.qty; n++) {
      const i = pool.findIndex((u) => matches(u, req.selector));
      if (i < 0) return null;
      taken.push(pool[i]);
      pool.splice(i, 1);
    }
  }
  return taken;
}

export function computeCart(
  comps: CartComposition[],
  items: CartItem[],
  promos: Promotion[] = [],
  manual: ManualDiscount[] = [],
): CartTotals {
  const units = toUnits(comps, items);
  const subtotal = units.reduce((s, u) => s + u.price, 0);
  const discounts: AppliedDiscount[] = [];
  const consumed = new Set<string>(); // units already used by a pack
  // Remaining value of each unit after previous discounts: a unit can never be discounted below 0
  // (e.g. a file already offered cannot also be discounted by a pack).
  const rem = new Map(units.map((u) => [u.id, u.price]));
  const remOf = (us: Unit[]) => us.reduce((s, u) => s + (rem.get(u.id) ?? 0), 0);
  const spend = (us: Unit[], amount: number) => {
    const live = us.filter((u) => (rem.get(u.id) ?? 0) > 0);
    allocate(Math.min(amount, remOf(live)), live.map((u) => rem.get(u.id)!)).forEach((a, i) => rem.set(live[i].id, rem.get(live[i].id)! - a));
  };
  let remaining = subtotal;
  let exclusiveApplied = false;

  const push = (d: AppliedDiscount) => {
    const amt = Math.min(Math.max(0, d.amount_cents), remaining); // never negative totals
    if (amt <= 0) return 0;
    discounts.push({ ...d, amount_cents: amt });
    remaining -= amt;
    return amt;
  };

  const active = promos.filter((p) => p.active).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  for (const p of active) {
    if (exclusiveApplied) break;
    if (!p.stackable && discounts.length > 0) continue; // exclusive promo cannot join others
    const cfg = p.config as PromoConfig;
    const base = cfg.threshold_category ? units.filter((u) => u.category === cfg.threshold_category).reduce((t, u) => t + u.price, 0) : subtotal;
    if (cfg.min_subtotal_cents != null && base < cfg.min_subtotal_cents) continue;
    if (cfg.max_subtotal_cents != null && base > cfg.max_subtotal_cents) continue;
    // Limit a scoped discount to N items (cheapest first, to protect the margin).
    const limit = (us: Unit[]) => {
      const n = (cfg as { max_units?: number }).max_units;
      return n && n > 0 ? [...us].filter((u) => (rem.get(u.id) ?? 0) > 0).sort((a, b) => a.price - b.price).slice(0, n) : us;
    };
    let amount = 0;
    let target: Unit[] = units; // units the discount is taken from
    if (p.type === 'pack' && 'items' in cfg) {
      let guard = 0, sets = 0;
      const used: Unit[] = [];
      do {
        const free = units.filter((u) => !consumed.has(u.id) && (rem.get(u.id) ?? 0) > 0);
        const set = takePack(cfg, free);
        if (!set) break;
        const value = remOf(set);
        const d = Math.min(cfg.mode === 'price' ? value - cfg.value_cents : cfg.value_cents, value);
        if (d <= 0) break;
        set.forEach((u) => consumed.add(u.id));
        spend(set, d);
        used.push(...set);
        amount += d; sets++;
      } while (cfg.repeat && ++guard < 50);
      target = [];
      if (amount > 0) { push({ promotionId: p.id, kind: 'auto', label: p.name, amount_cents: amount, count: sets }); if (!p.stackable) exclusiveApplied = true; }
      continue;
    } else if (p.type === 'percent' && 'pct_bp' in cfg && !('min_qty' in cfg)) {
      const sel = scopeSelector(cfg.scope, cfg.target);
      if (!sel) amount = pctOf(remaining, cfg.pct_bp);
      else { target = limit(units.filter((u) => !consumed.has(u.id) && matches(u, sel))); amount = pctOf(remOf(target), cfg.pct_bp); }
    } else if (p.type === 'amount' && 'amount_cents' in cfg) {
      const sel = scopeSelector(cfg.scope, cfg.target);
      if (!sel) amount = cfg.amount_cents;
      else { target = limit(units.filter((u) => matches(u, sel))); amount = Math.min(cfg.amount_cents, remOf(target)); }
    } else if (p.type === 'quantity' && 'min_qty' in cfg) {
      const sel: Selector = cfg.scope === 'category' ? { category: cfg.target } : { productId: cfg.target };
      const eligible = units.filter((u) => matches(u, sel));
      if (eligible.length >= cfg.min_qty) {
        target = eligible.filter((u) => !consumed.has(u.id));
        amount = pctOf(remOf(target), cfg.pct_bp);
      }
    }
    if (amount > 0) {
      const scoped = target !== units;
      const applied = push({ promotionId: p.id, kind: 'auto', label: p.name, amount_cents: amount, count: scoped ? target.filter((u) => (rem.get(u.id) ?? 0) > 0).length || undefined : undefined });
      if (applied) { spend(target, applied); if (!p.stackable) exclusiveApplied = true; }
    }
  }

  manual.forEach((m, manualIndex) => {
    const amt = m.pct_bp != null ? pctOf(remaining, m.pct_bp) : m.amount_cents ?? 0;
    push({ promotionId: null, kind: 'manual', label: m.label || 'Remise exceptionnelle', amount_cents: amt, reason: m.reason ?? null, manualIndex });
  });

  const discount = subtotal - remaining;
  return { subtotal_cents: subtotal, discounts, discount_cents: discount, total_cents: remaining };
}

export const lineTotal = (it: Pick<CartItem, 'qty' | 'unitPriceCents'>) => it.qty * it.unitPriceCents;

export type PaymentStatus = 'paye' | 'partiel' | 'a_payer';
export function paymentStatus(total: number, paid: number): PaymentStatus {
  if (total <= 0 || paid >= total) return 'paye';
  return paid > 0 ? 'partiel' : 'a_payer';
}

/** Allocates an amount proportionally (used for cost/discount splits), exact sum guaranteed. */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => divRound(amount * w, total));
  const diff = amount - raw.reduce((a, b) => a + b, 0);
  if (raw.length) raw[raw.indexOf(Math.max(...raw))] += diff;
  return raw;
}

/* ---------------------------------------------------------------- payment in instalments */
export interface PaymentPlan { count: number; first_date: string }
export interface Instalment { n: number; date: string; amount_cents: number }

/** Adds months to an ISO date, clamping to the end of the month (31/01 + 1 month = 28/02). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** Monthly schedule; the first instalment absorbs the rounding so the sum is exact. */
export function schedule(total: number, plan: PaymentPlan): Instalment[] {
  const count = Math.max(1, Math.floor(plan.count));
  const base = Math.floor(total / count);
  const first = total - base * (count - 1);
  return Array.from({ length: count }, (_, i) => ({ n: i + 1, date: addMonths(plan.first_date, i), amount_cents: i === 0 ? first : base }));
}

/** Status of each instalment given the amount already paid (payments fill instalments in order). */
export function instalmentStatus(sched: Instalment[], paid: number, today: string) {
  let left = paid;
  return sched.map((it) => {
    const covered = Math.min(it.amount_cents, Math.max(0, left));
    left -= covered;
    const remaining = it.amount_cents - covered;
    return { ...it, paid_cents: covered, remaining_cents: remaining, state: remaining === 0 ? 'paye' as const : it.date < today ? 'retard' as const : 'a_venir' as const };
  });
}

/** Label shown to the client: "Pack 3 fichiers HD ×2". */
export const discountLabel = (d: Pick<AppliedDiscount, 'label' | 'count'>) => (d.count ? `${d.label} ×${d.count}` : d.label);
