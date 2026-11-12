/** All amounts are integer cents. Rates are basis points (bp): 1 % = 100 bp. */

const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const eur = (cents: number | null | undefined): string =>
  cents == null ? '—' : fmt.format(cents / 100).replace(/ | /g, ' ');

/** "12,5" | "12.50 €" | "1 234,56" → cents. Returns null if invalid. */
export function parseEuros(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  const s = input.replace(/[\s  €]/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [i, d = ''] = s.replace('-', '').split('.');
  const v = Number(i) * 100 + Number((d + '00').slice(0, 2));
  return neg ? -v : v;
}
export const centsToInput = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

/** Integer division rounded half away from zero. */
export function divRound(n: number, d: number): number {
  if (d === 0) throw new Error('Division par zéro');
  const q = Math.trunc(n / d);
  const r = n - q * d;
  if (Math.abs(r) * 2 >= Math.abs(d)) return q + Math.sign(n) * Math.sign(d);
  return q;
}
/** cents × bp / 10000, rounded to the cent. */
export const pctOf = (cents: number, bp: number) => divRound(cents * bp, 10000);
export const bpToPct = (bp: number | null | undefined) => (bp == null ? '' : String(bp / 100).replace('.', ','));
export const pctToBp = (s: string): number | null => {
  const v = Number(String(s).replace(',', '.').replace('%', '').trim());
  return Number.isFinite(v) && String(s).trim() !== '' ? Math.round(v * 100) : null;
};

export interface SupplierCostInput {
  price_cents: number; // catalogue price as entered
  price_is_ttc: boolean; // entered TTC or HT
  vat_bp: number; // VAT rate of the supplier (e.g. 2000)
  discount_bp?: number; // supplier discount
  shipping_cents?: number; // shipping allocated to one unit
  extra_cents?: number; // other unit costs (consumables, packaging)
}
export interface SupplierCost {
  catalogue_cents: number;
  discount_cents: number;
  after_discount_cents: number; // same basis as entered (HT or TTC)
  ht_cents: number;
  vat_cents: number;
  ttc_cents: number;
  shipping_cents: number;
  extra_cents: number;
  /** Real unit cost: TTC when VAT is not recoverable (micro-entreprise en franchise), HT otherwise. */
  real_cost_cents: number;
}

export function supplierCost(i: SupplierCostInput, vatRecoverable = false): SupplierCost {
  const discount = pctOf(i.price_cents, i.discount_bp ?? 0);
  const after = i.price_cents - discount;
  let ht: number, ttc: number;
  if (i.price_is_ttc) { ttc = after; ht = divRound(after * 10000, 10000 + i.vat_bp); }
  else { ht = after; ttc = after + pctOf(after, i.vat_bp); }
  const shipping = i.shipping_cents ?? 0;
  const extra = i.extra_cents ?? 0;
  return {
    catalogue_cents: i.price_cents, discount_cents: discount, after_discount_cents: after,
    ht_cents: ht, vat_cents: ttc - ht, ttc_cents: ttc, shipping_cents: shipping, extra_cents: extra,
    real_cost_cents: (vatRecoverable ? ht : ttc) + shipping + extra,
  };
}

export interface MarginInfo {
  margin_cents: number; // marge commerciale = prix de vente − coût de revient
  markup_rate: number | null; // taux de marge = marge / coût
  margin_rate: number | null; // taux de marque = marge / prix de vente
  coefficient: number | null; // prix de vente / coût
}
/** Sale price is what the client pays (franchise de TVA: no VAT collected, so HT = TTC). */
export function margin(sale_cents: number, cost_cents: number): MarginInfo {
  const m = sale_cents - cost_cents;
  return {
    margin_cents: m,
    markup_rate: cost_cents > 0 ? m / cost_cents : null,
    margin_rate: sale_cents > 0 ? m / sale_cents : null,
    coefficient: cost_cents > 0 ? sale_cents / cost_cents : null,
  };
}
/** Price = cost × coefficient, rounded to the cent. */
export const priceFromCoef = (cost: number, coef: number) => Math.max(0, Math.round(cost * coef));
/** Price such that (price − cost)/price = target margin rate (taux de marque, 0..1). */
export function priceFromMarginRate(cost: number, rate: number): number {
  if (rate >= 1) throw new Error('Le taux de marque doit être inférieur à 100 %');
  return Math.max(0, Math.ceil(cost / (1 - rate) - 1e-9));
}
export const fmtRate = (r: number | null) => (r == null ? '—' : `${(r * 100).toFixed(1).replace('.', ',')} %`);
export const fmtCoef = (r: number | null) => (r == null ? '—' : `× ${r.toFixed(2).replace('.', ',')}`);
