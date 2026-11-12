import { describe, expect, it } from 'vitest';
import { divRound, eur, margin, parseEuros, priceFromCoef, priceFromMarginRate, supplierCost } from '../lib/money';
import { addMonths, computeCart, discountLabel, findPrice, instalmentStatus, paymentStatus, schedule, type CartComposition, type CartItem, type Promotion } from '../lib/pricing';

describe('money', () => {
  it('parse/format euros', () => {
    expect(parseEuros('12,5')).toBe(1250);
    expect(parseEuros('1 234,56 €')).toBe(123456);
    expect(parseEuros('0.1')).toBe(10);
    expect(parseEuros('abc')).toBeNull();
    expect(parseEuros('1,234')).toBeNull();
    expect(eur(123456)).toBe('1 234,56 €');
  });
  it('rounding half away from zero', () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(4, 3)).toBe(1);
  });
  it('supplier cost — franchise de TVA uses TTC', () => {
    const c = supplierCost({ price_cents: 5000, price_is_ttc: false, vat_bp: 2000, discount_bp: 1000, shipping_cents: 300 });
    expect(c.after_discount_cents).toBe(4500);
    expect(c.ttc_cents).toBe(5400);
    expect(c.real_cost_cents).toBe(5700);
    expect(supplierCost({ price_cents: 5000, price_is_ttc: false, vat_bp: 2000, discount_bp: 1000, shipping_cents: 300 }, true).real_cost_cents).toBe(4800);
    const t = supplierCost({ price_cents: 1200, price_is_ttc: true, vat_bp: 2000 });
    expect(t.ht_cents).toBe(1000);
    expect(t.real_cost_cents).toBe(1200);
  });
  it('margin notions', () => {
    const m = margin(10000, 4000);
    expect(m.margin_cents).toBe(6000);
    expect(m.markup_rate).toBeCloseTo(1.5); // taux de marge
    expect(m.margin_rate).toBeCloseTo(0.6); // taux de marque
    expect(m.coefficient).toBeCloseTo(2.5);
    expect(priceFromCoef(3333, 3)).toBe(9999);
    expect(priceFromMarginRate(4000, 0.6)).toBe(10000);
    expect(margin(1000, 0).coefficient).toBeNull();
  });
});

const comp = (key: string, styleId: string, fee: number, iris = 2): CartComposition => ({ key, styleId, styleName: styleId, irisCount: iris, feeCents: fee });
const item = (key: string, o: Partial<CartItem>): CartItem => ({
  key, variantId: o.variantId ?? key, productId: o.productId ?? null, category: o.category ?? 'impression',
  productName: key, qty: o.qty ?? 1, unitPriceCents: o.unitPriceCents ?? 0, compositionKey: o.compositionKey ?? null,
});
const promo = (p: Partial<Promotion> & Pick<Promotion, 'type' | 'config'>): Promotion => ({
  id: p.id ?? p.type, name: p.name ?? p.type, priority: p.priority ?? 100, stackable: p.stackable ?? true, active: p.active ?? true, ...p,
});

describe('findPrice', () => {
  const rows = [
    { kind: 'style' as const, ref_id: 'fusion', iris_count: 0, price_cents: 5000 },
    { kind: 'style' as const, ref_id: 'fusion', iris_count: 4, price_cents: 8000 },
    { kind: 'variant' as const, ref_id: 'v1', iris_count: 0, price_cents: 2000, enabled: 0 },
  ];
  it('exact iris then generic', () => {
    expect(findPrice(rows, 'style', 'fusion', 4)).toBe(8000);
    expect(findPrice(rows, 'style', 'fusion', 3)).toBe(5000);
    expect(findPrice(rows, 'variant', 'v1')).toBeNull();
  });
});

describe('computeCart', () => {
  it('one composition billed once even with several products', () => {
    const t = computeCart([comp('c1', 'fusion', 6000)], [
      item('hd', { category: 'numerique', unitPriceCents: 2500, compositionKey: 'c1' }),
      item('acry', { unitPriceCents: 18900, compositionKey: 'c1', qty: 2 }),
    ]);
    expect(t.subtotal_cents).toBe(6000 + 2500 + 37800);
    expect(t.total_cents).toBe(t.subtotal_cents);
  });

  it('pack auto-detected, applied once, not twice', () => {
    const pack = promo({ id: 'p', type: 'pack', config: { items: [{ selector: { category: 'numerique' }, qty: 1 }, { selector: { category: 'impression' }, qty: 1 }], mode: 'price', value_cents: 5000 } });
    const t = computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 3000, qty: 2 }), item('print', { unitPriceCents: 4000, qty: 2 })], [pack]);
    expect(t.discounts).toHaveLength(1);
    expect(t.discount_cents).toBe(2000); // 7000 → 5000 once
    const r = computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 3000, qty: 2 }), item('print', { unitPriceCents: 4000, qty: 2 })], [{ ...pack, config: { ...(pack.config as object), repeat: true } as never }]);
    expect(r.discount_cents).toBe(4000);
  });

  it('pack uses the cheapest matching units (protects margin)', () => {
    const pack = promo({ type: 'pack', config: { items: [{ selector: { category: 'numerique' }, qty: 1 }, { selector: { category: 'impression' }, qty: 1 }], mode: 'price', value_cents: 4500 } });
    const t = computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 2500 }), item('acry', { unitPriceCents: 18900 }), item('tir', { unitPriceCents: 2900 })], [pack]);
    expect(t.discount_cents).toBe(2500 + 2900 - 4500);
  });

  it('applied offers report how many times they apply (×N)', () => {
    const pack3 = promo({ id: 'p3', name: 'Pack 3 fichiers HD', type: 'pack', config: { items: [{ selector: { category: 'numerique' }, qty: 3 }], mode: 'price', value_cents: 6000, repeat: true } });
    const files = (n: number) => [item('hd', { category: 'numerique', unitPriceCents: 2500, qty: n })];
    expect(computeCart([], files(3), [pack3]).discounts[0]).toMatchObject({ count: 1, amount_cents: 1500 });
    expect(computeCart([], files(7), [pack3]).discounts[0]).toMatchObject({ count: 2, amount_cents: 3000 });
    const q = promo({ id: 'q', name: '−10 % tableaux', type: 'quantity', config: { scope: 'category', target: 'impression', min_qty: 2, pct_bp: 1000 } });
    expect(computeCart([], [item('p', { unitPriceCents: 5000, qty: 3 })], [q]).discounts[0].count).toBe(3);
    const order = promo({ id: 'o', name: '−10 €', type: 'amount', config: { amount_cents: 1000 } });
    expect(computeCart([], [item('p', { unitPriceCents: 5000 })], [order]).discounts[0].count).toBeUndefined();
    expect(discountLabel({ label: 'Pack 3 fichiers HD', count: 2 })).toBe('Pack 3 fichiers HD ×2');
  });

  it('pack not applied when incomplete or pack price higher', () => {
    const pack = promo({ type: 'pack', config: { items: [{ selector: { category: 'numerique' }, qty: 1 }, { selector: { category: 'impression' }, qty: 1 }], mode: 'price', value_cents: 5000 } });
    expect(computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 3000 })], [pack]).discount_cents).toBe(0);
    expect(computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 1000 }), item('p', { unitPriceCents: 1000 })], [pack]).discount_cents).toBe(0);
  });

  it('style-based pack (fusion + tableau)', () => {
    const pack = promo({ type: 'pack', config: { items: [{ selector: { category: 'creation', styleId: 'fusion' }, qty: 1 }, { selector: { productId: 'acry' }, qty: 1 }], mode: 'discount', value_cents: 2000 } });
    const t = computeCart([comp('c1', 'fusion', 6000)], [item('a', { productId: 'acry', unitPriceCents: 15000, compositionKey: 'c1' })], [pack]);
    expect(t.discount_cents).toBe(2000);
  });

  it('stackable vs exclusive & priority', () => {
    const items = [item('p', { unitPriceCents: 10000 })];
    const pct = promo({ id: 'pct', type: 'percent', priority: 1, config: { pct_bp: 1000, scope: 'order' } });
    const amt = promo({ id: 'amt', type: 'amount', priority: 2, config: { amount_cents: 500 } });
    expect(computeCart([], items, [pct, amt]).total_cents).toBe(10000 - 1000 - 500);
    const excl = { ...pct, stackable: false };
    expect(computeCart([], items, [excl, amt]).total_cents).toBe(9000);
    // exclusive with lower priority cannot join an already applied discount
    const excl2 = promo({ id: 'x', type: 'percent', priority: 5, stackable: false, config: { pct_bp: 5000, scope: 'order' } });
    expect(computeCart([], items, [amt, excl2]).total_cents).toBe(9500);
  });

  it('quantity & category promos', () => {
    const q = promo({ type: 'quantity', config: { scope: 'category', target: 'impression', min_qty: 2, pct_bp: 1500 } });
    expect(computeCart([], [item('p', { unitPriceCents: 4000 })], [q]).discount_cents).toBe(0);
    expect(computeCart([], [item('p', { unitPriceCents: 4000, qty: 2 })], [q]).discount_cents).toBe(1200);
    const cat = promo({ type: 'percent', config: { pct_bp: 1000, scope: 'category', target: 'numerique' } });
    expect(computeCart([], [item('d', { category: 'numerique', unitPriceCents: 3333 }), item('p', { unitPriceCents: 9999 })], [cat]).discount_cents).toBe(333);
  });

  it('never negative, manual discount recorded, inactive ignored', () => {
    const big = promo({ type: 'amount', config: { amount_cents: 99999 } });
    const t = computeCart([], [item('p', { unitPriceCents: 1000 })], [big], [{ label: 'Geste', amount_cents: 500, reason: 'fidélité' }]);
    expect(t.total_cents).toBe(0);
    expect(t.discount_cents).toBe(1000);
    expect(t.discounts).toHaveLength(1);
    const m = computeCart([], [item('p', { unitPriceCents: 1000 })], [{ ...big, active: false }], [{ label: 'Geste', pct_bp: 1000, reason: 'x' }]);
    expect(m.total_cents).toBe(900);
    expect(m.discounts[0]).toMatchObject({ kind: 'manual', reason: 'x' });
  });

  it('thresholds: −10 € dès 100 €, HD −10 € de 150 à 199,99 €, HD offert dès 200 €', () => {
    const r10 = promo({ id: 'r10', type: 'amount', config: { amount_cents: 1000, min_subtotal_cents: 10000 } });
    expect(computeCart([], [item('p', { unitPriceCents: 9999 })], [r10]).discount_cents).toBe(0);
    expect(computeCart([], [item('p', { unitPriceCents: 10000 })], [r10]).discount_cents).toBe(1000);
    const hd10 = promo({ id: 'hd10', name: 'Fichier HD −10 €', type: 'amount', priority: 1, config: { amount_cents: 1000, scope: 'category', target: 'numerique', min_subtotal_cents: 15000, max_subtotal_cents: 19999 } });
    const hdFree = promo({ id: 'hdfree', name: 'Fichier HD offert', type: 'percent', priority: 1, config: { pct_bp: 10000, scope: 'category', target: 'numerique', min_subtotal_cents: 20000 } });
    const cart = (print: number) => [item('hd', { category: 'numerique', unitPriceCents: 2000 }), item('pr', { unitPriceCents: print })];
    expect(computeCart([], cart(12000), [hd10, hdFree]).discount_cents).toBe(0); // 140 €
    expect(computeCart([], cart(13000), [hd10, hdFree]).discounts).toMatchObject([{ promotionId: 'hd10', amount_cents: 1000 }]); // 150 €
    expect(computeCart([], cart(18000), [hd10, hdFree]).discounts).toMatchObject([{ promotionId: 'hdfree', amount_cents: 2000 }]); // 200 €
    // scoped amount never exceeds the targeted items, and nothing applies without them
    expect(computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 500 }), item('pr', { unitPriceCents: 15000 })], [hd10]).discount_cents).toBe(500);
    expect(computeCart([], [item('pr', { unitPriceCents: 16000 })], [hd10]).discount_cents).toBe(0);
  });

  it('one file offered (limit 1, cheapest), threshold on prints only — 200 € of files does not give 0 €', () => {
    const hdFree = promo({ id: 'free1', type: 'percent', config: { pct_bp: 10000, scope: 'category', target: 'numerique', max_units: 1, min_subtotal_cents: 20000 } });
    const files = [item('hd1', { category: 'numerique', unitPriceCents: 2500 }), item('hd2', { category: 'numerique', unitPriceCents: 2000, qty: 8 })]; // 185 €
    const t = computeCart([], [...files, item('x', { category: 'numerique', unitPriceCents: 1500 })], [hdFree]); // 200 € of files
    expect(t.total_cents).toBe(20000 - 1500); // only the cheapest single file is offered
    const onPrints = promo({ id: 'free2', type: 'percent', config: { pct_bp: 10000, scope: 'category', target: 'numerique', max_units: 1, min_subtotal_cents: 20000, threshold_category: 'impression' } });
    expect(computeCart([], [...files, item('x', { category: 'numerique', unitPriceCents: 1500 })], [onPrints]).discount_cents).toBe(0); // no prints
    expect(computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 2000 }), item('pr', { unitPriceCents: 19900 })], [onPrints]).discount_cents).toBe(0); // 199 € of prints
    expect(computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 2000 }), item('pr', { unitPriceCents: 20000 })], [onPrints]).discount_cents).toBe(2000);
    const hd10 = promo({ id: 'hd10', type: 'amount', config: { amount_cents: 1000, scope: 'category', target: 'numerique', max_units: 1 } });
    expect(computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 500, qty: 3 })], [hd10]).discount_cents).toBe(500); // capped to one 5 € file
  });

  it('no double discount: a file already offered cannot be discounted again by a pack', () => {
    const hdFree = promo({ id: 'hdfree', type: 'percent', priority: 1, config: { pct_bp: 10000, scope: 'category', target: 'numerique', min_subtotal_cents: 20000 } });
    const pack = promo({ id: 'pack', type: 'pack', priority: 10, config: { items: [{ selector: { category: 'numerique' }, qty: 1 }, { selector: { category: 'impression' }, qty: 1 }], mode: 'discount', value_cents: 1500, repeat: true } });
    const t = computeCart([], [item('hd', { category: 'numerique', unitPriceCents: 2000 }), item('pr', { unitPriceCents: 18000 })], [hdFree, pack]);
    expect(t.discount_cents).toBe(2000); // HD offered; the pack is not added on top
    expect(t.discounts.map((d) => d.promotionId)).toEqual(['hdfree']);
  });

  it('manual commercial discounts: same label twice, each identified by its index', () => {
    const t = computeCart([], [item('p', { unitPriceCents: 10000 })], [], [{ label: 'Remise commerciale', amount_cents: 500 }, { label: 'Remise commerciale', pct_bp: 1000 }]);
    expect(t.discounts.map((d) => [d.manualIndex, d.amount_cents])).toEqual([[0, 500], [1, 950]]);
    expect(t.total_cents).toBe(8550);
  });

  it('min subtotal for amount promo', () => {
    const p = promo({ type: 'amount', config: { amount_cents: 1000, min_subtotal_cents: 10000 } });
    expect(computeCart([], [item('p', { unitPriceCents: 9999 })], [p]).discount_cents).toBe(0);
    expect(computeCart([], [item('p', { unitPriceCents: 10000 })], [p]).discount_cents).toBe(1000);
  });

  it('payment in instalments: exact sum, monthly dates, statuses', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-21', 2)).toBe('2027-01-21');
    const sch = schedule(10000, { count: 3, first_date: '2026-11-21' });
    expect(sch.map((x) => x.amount_cents)).toEqual([3334, 3333, 3333]);
    expect(sch.reduce((a, x) => a + x.amount_cents, 0)).toBe(10000);
    expect(sch.map((x) => x.date)).toEqual(['2026-11-21', '2026-12-21', '2027-01-21']);
    const st = instalmentStatus(sch, 5000, '2026-12-25');
    expect(st.map((x) => x.state)).toEqual(['paye', 'retard', 'a_venir']);
    expect(st[1].remaining_cents).toBe(1667);
    expect(schedule(9000, { count: 2, first_date: '2026-11-21' }).map((x) => x.amount_cents)).toEqual([4500, 4500]);
  });

  it('payment status', () => {
    expect(paymentStatus(1000, 0)).toBe('a_payer');
    expect(paymentStatus(1000, 400)).toBe('partiel');
    expect(paymentStatus(1000, 1000)).toBe('paye');
  });
});
