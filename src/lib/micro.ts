/**
 * Micro-entreprise (auto-entrepreneur): social contributions are a percentage of the turnover (CA encaissé),
 * whatever the expenses. Purchases (prints bought from the lab) are NOT deducted: the whole sale price is CA.
 * Rates are settings (they change with the law); defaults = 2026 rates, to be checked on autoentrepreneur.urssaf.fr.
 * Amounts in cents, rates in basis points (1 % = 100).
 */
export interface MicroSettings {
  /** 'services': all CA as prestations de services; 'mixte': resold goods (bought from a supplier) as vente de marchandises. */
  mode: 'services' | 'mixte';
  servicesBp: number; salesBp: number;
  /** Versement libératoire de l'impôt sur le revenu (optional). */
  vl: boolean; vlServicesBp: number; vlSalesBp: number;
  /** Other contributions on CA (formation professionnelle, taxe chambre consulaire…). */
  otherBp: number;
}
export const MICRO_DEFAULTS: MicroSettings = { mode: 'services', servicesBp: 2120, salesBp: 1230, vl: false, vlServicesBp: 170, vlSalesBp: 100, otherBp: 0 };

const pct = (v: string | undefined, d: number) => {
  if (v == null || v.trim() === '') return d;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 100 ? Math.round(n * 100) : d;
};
export function microFromSettings(s: Record<string, string | undefined>): MicroSettings {
  const D = MICRO_DEFAULTS;
  return {
    mode: s.micro_mode === 'mixte' ? 'mixte' : 'services',
    servicesBp: pct(s.micro_services_rate, D.servicesBp), salesBp: pct(s.micro_sales_rate, D.salesBp),
    vl: s.micro_vl === '1', vlServicesBp: pct(s.micro_vl_services_rate, D.vlServicesBp), vlSalesBp: pct(s.micro_vl_sales_rate, D.vlSalesBp),
    otherBp: pct(s.micro_other_rate, D.otherBp),
  };
}

const part = (cents: number, bp: number) => Math.round((cents * bp) / 10000);

/**
 * Splits the CA (after discounts) into services / sales: in 'mixte' mode, the share of resold goods is
 * goodsGross / gross (discounts spread proportionally). Returns the contributions.
 */
export function microCharges(ca: number, goodsGross: number, gross: number, m: MicroSettings) {
  const caSales = m.mode === 'mixte' && gross > 0 ? Math.round((ca * Math.min(goodsGross, gross)) / gross) : 0;
  const caServices = ca - caSales;
  const social = part(caServices, m.servicesBp) + part(caSales, m.salesBp);
  const tax = m.vl ? part(caServices, m.vlServicesBp) + part(caSales, m.vlSalesBp) : 0;
  const other = part(ca, m.otherBp);
  return { caServices, caSales, social, tax, other, total: social + tax + other };
}
