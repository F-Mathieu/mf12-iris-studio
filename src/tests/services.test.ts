import { beforeEach, describe, expect, it } from 'vitest';
import { createNodeDb } from '../lib/db/node';
import { setDb } from '../lib/db';
import { migrate } from '../lib/db/migrations';
import { seedIfEmpty } from '../services/seed';
import { applyDataUpgrades, applyOnelab2026 } from '../services/onelab';
import { variantCosts } from '../services/suppliers';
import { sel, one } from '../services/base';
import { createSession, duplicateSession, getSession, updateSession, deleteSession, applyTemplateToSession, listSessions } from '../services/sessions';
import { parseRegistrationCsv, registrationTemplate, REGISTRATION_COLUMNS, toCsv } from '../lib/csv';
import { applyImport, listRegistrations, planImport } from '../services/registrations';
import { listTemplates, setPrice, createTemplate, savePromotion } from '../services/pricing';
import { listProducts, listStyles, listVariants } from '../services/catalog';
import { addPayment, cancelOrder, emptyCart, getOrderDetail, loadCart, saveCart, duplicateOrder, type Cart } from '../services/orders';
import { uid } from '../lib/ids';
import { paymentStatus } from '../lib/pricing';

const csv = (rows: string[][]) => toCsv(REGISTRATION_COLUMNS, rows);

beforeEach(async () => {
  const d = createNodeDb();
  setDb(d);
  await migrate(d);
  await seedIfEmpty();
  await applyDataUpgrades();
});

describe('migrations & seed', () => {
  it('seeds once, without prices nor clients', async () => {
    expect(await seedIfEmpty()).toBe(false);
    expect((await listStyles()).map((s) => s.name)).toEqual(['Iris naturel', 'Collection', 'Fusion', 'Anneau', 'Explosion']);
    expect((await sel('SELECT * FROM price_list_items')).length).toBe(0);
    expect((await sel('SELECT * FROM families')).length).toBe(0);
    expect((await sel('SELECT * FROM suppliers')).length).toBe(2);
    const prints = (await listProducts()).filter((p) => p.category === 'impression').map((p) => p.name);
    expect(prints).toEqual(['Acrylique 3 mm', 'Acrylique 5 mm', 'Alu Dibond', 'HD Metal Print', 'Tirage photo petit format', 'Tirage photo grand format']);
  });

  it('migration 2 restricts supports on an existing database (history kept)', async () => {
    const { createNodeDb } = await import('../lib/db/node');
    const { MIGRATIONS } = await import('../lib/db/migrations');
    const d = createNodeDb();
    setDb(d);
    await d.batch([{ sql: MIGRATIONS[0] }, { sql: 'PRAGMA user_version = 1;' }]);
    const now = new Date().toISOString();
    await d.batch([
      { sql: "INSERT INTO settings VALUES ('seeded','1')" },
      ...['Tirage photo premium', 'Papier Fine Art', 'Dibond aluminium', 'Acrylique', 'Caisse américaine'].map((n, i) => ({ sql: "INSERT INTO products (id, category, name, created_at) VALUES (?, 'impression', ?, ?)", params: ['p' + i, n, now] })),
    ]);
    await migrate(d);
    const active = (await listProducts()).filter((p) => p.category === 'impression').map((p) => p.name).sort();
    expect(active).toEqual(['Acrylique', 'Alu Dibond', 'HD Metal Print 5 mm']);
    expect((await listProducts(true)).filter((p) => p.archived).length).toBe(3);
    const hd = (await listProducts()).find((p) => p.name === 'HD Metal Print 5 mm')!;
    expect((await listVariants()).filter((v) => v.product_id === hd.id).length).toBe(4);
    await migrate(d); // idempotent
    expect((await listProducts()).filter((p) => p.name === 'HD Metal Print 5 mm').length).toBe(1);
    // Onelab upgrade on this existing base: renames, keeps ids, adds the 12 formats
    const acrId = (await listProducts()).find((p) => p.name === 'Acrylique')!.id;
    expect(await applyOnelab2026()).toBe(true);
    expect(await applyOnelab2026()).toBe(false);
    const after = (await listProducts()).filter((p) => p.category === 'impression');
    expect(after.map((p) => p.name)).toEqual(['Acrylique 3 mm', 'Acrylique 5 mm', 'Alu Dibond', 'HD Metal Print']);
    expect(after[0].id).toBe(acrId);
    expect((await listVariants()).filter((v) => v.product_id === hd.id).length).toBe(12);
  });

  it('print supports and frames: structure only, no purchase price in the code', async () => {
    const products = await listProducts();
    expect(products.filter((p) => p.category === 'impression').map((p) => p.name)).toEqual(['Acrylique 3 mm', 'Acrylique 5 mm', 'Alu Dibond', 'HD Metal Print', 'Tirage photo petit format', 'Tirage photo grand format']);
    const cadre = products.find((p) => p.name === 'Cadre gamme 6')!;
    expect(cadre).toMatchObject({ category: 'option', needs_composition: 1 });
    const variants = await listVariants();
    expect(variants.filter((v) => v.product_id === cadre.id)).toHaveLength(12);
    expect(variants.filter((v) => products.find((p) => p.id === v.product_id)?.category === 'impression')).toHaveLength(48 + 12 + 15);
    expect((await sel('SELECT * FROM supplier_prices')).length).toBe(0);
    expect((await sel('SELECT * FROM price_list_items')).length).toBe(0);
  });

  it('purchase price entered HT → real cost TTC (franchise); coefficient applied to every format', async () => {
    const { saveSupplierProduct, addSupplierPrice } = await import('../services/suppliers');
    const { setPricesFromCoef, parseCoefInput, getPriceItems, listTemplates } = await import('../services/pricing');
    const sup = (await sel<{ id: string }>("SELECT id FROM suppliers WHERE name='Onelab Pro'"))[0].id;
    const cadre = (await listProducts()).find((p) => p.name === 'Cadre gamme 6')!;
    const vs = (await listVariants()).filter((v) => v.product_id === cadre.id);
    for (const v of vs) {
      const sp = await saveSupplierProduct({ supplier_id: sup, name: 'Cadre test', format: v.name, variant_id: v.id });
      await addSupplierPrice(sp, { price_cents: 10000, price_is_ttc: false, vat_bp: 2000 }); // fictitious 100 € HT
    }
    const costs = await variantCosts();
    expect(costs.get(vs[0].id)?.cost).toBe(12000); // 100 € HT + 20 % = 120 € real cost
    expect(parseCoefInput('+7 %')).toBeCloseTo(1.07);
    expect(parseCoefInput('1,07')).toBeCloseTo(1.07);
    expect(parseCoefInput('abc')).toBeNull();
    const [tpl] = await listTemplates();
    expect(await setPricesFromCoef(tpl.price_list_id, vs.map((v) => ({ variantId: v.id, cost: costs.get(v.id)!.cost })), 1.07)).toBe(12);
    expect((await getPriceItems(tpl.price_list_id)).find((i) => i.ref_id === vs[0].id)).toMatchObject({ price_cents: 12840, pricing_mode: 'coef' });
  });

  it('supplier CSV import: re-import adds a price, never duplicates; empty TTC column is rejected', async () => {
    const { parseSupplierCsv, importSupplierRows, listSupplierProducts } = await import('../services/suppliers');
    const sup = (await sel<{ id: string }>("SELECT id FROM suppliers WHERE name='Onelab Pro'"))[0].id;
    const csv = (p: string) => `Produit;Référence;Support;Format;Finition;Prix;Prix TTC (oui/non);TVA %;Remise %;Livraison;Date\r\nCadre test;;Cadre;40x40 cm;;${p};non;20;;;09/11/2026\r\n`;
    await importSupplierRows(sup, parseSupplierCsv(csv('50,00')).rows);
    await importSupplierRows(sup, parseSupplierCsv(csv('55,00')).rows);
    const sps = (await listSupplierProducts(sup)).filter((x) => x.name === 'Cadre test');
    expect(sps).toHaveLength(1);
    expect(sps[0].price_cents).toBe(5500);
    expect(parseSupplierCsv('Produit;Prix;Prix TTC (oui/non)\r\nX;10;\r\n').rows[0].errors.join()).toContain('oui ou non');
  });

  it('paper prints + Flybox frame: structure, print_frame setting, CSV import links to the catalogue', async () => {
    const { parsePrintFrame, FRAME_NAME, applyOnelabPaper } = await import('../services/onelab');
    const { getSetting } = await import('../services/base');
    expect(await applyOnelabPaper()).toBe(false); // idempotent
    const products = await listProducts();
    const cfg = parsePrintFrame(await getSetting('print_frame'))!;
    const frame = products.find((p) => p.id === cfg.frame)!;
    expect(frame).toMatchObject({ name: FRAME_NAME, category: 'option' });
    expect(cfg.prints.map((id) => products.find((p) => p.id === id)!.name)).toEqual(['Tirage photo petit format', 'Tirage photo grand format']);
    const vs = await listVariants();
    expect(vs.filter((v) => v.product_id === frame.id).map((v) => v.name)).toContain('20 × 20 cm');
    expect(vs.filter((v) => v.product_id === cfg.prints[0]).map((v) => v.name)).toContain('10 × 15 cm');
    const { parseSupplierCsv, importSupplierRows } = await import('../services/suppliers');
    const sup = (await sel<{ id: string }>("SELECT id FROM suppliers WHERE name='Onelab Pro'"))[0].id;
    const r = await importSupplierRows(sup, parseSupplierCsv(`Produit;Support;Format;Prix;Prix TTC (oui/non);TVA %\r\nTest tirage;Tirage photo petit format;10x15;1,00;non;20\r\nTest cadre;${FRAME_NAME};20x20;10,00;non;20\r\nInconnu;Autre;10x15;1,00;non;20\r\n`).rows);
    expect(r).toMatchObject({ created: 3, linked: 2 });
    const costs = await variantCosts();
    const v15 = vs.find((v) => v.product_id === cfg.prints[0] && v.name === '10 × 15 cm')!;
    expect(costs.get(v15.id)?.cost).toBe(120); // HT + TVA non récupérable
  });

  it('supplier products not in the catalogue: created and linked in one click', async () => {
    const { saveSupplierProduct, createCatalogFromSupplierProducts, formatLabel, addSupplierPrice } = await import('../services/suppliers');
    expect(formatLabel('30x30')).toBe('30 × 30 cm');
    expect(formatLabel('Standard')).toBe('Standard');
    const sup = (await sel<{ id: string }>("SELECT id FROM suppliers WHERE name='Onelab Pro'"))[0].id;
    const a = await saveSupplierProduct({ supplier_id: sup, name: 'Cadre bois noir', support: 'Cadre', format: '30x30' });
    const b = await saveSupplierProduct({ supplier_id: sup, name: 'Cadre bois noir', support: 'Cadre', format: '40x40' });
    await addSupplierPrice(a, { price_cents: 1000, price_is_ttc: false, vat_bp: 2000 });
    const r = await createCatalogFromSupplierProducts([a, b], { category: 'option' });
    expect(r).toEqual({ products: 1, variants: 2, linked: 2 });
    const cadre = (await listProducts()).find((p) => p.name === 'Cadre')!;
    expect(cadre.category).toBe('option');
    const vs = (await listVariants()).filter((v) => v.product_id === cadre.id).map((v) => v.name).sort();
    expect(vs).toEqual(['30 × 30 cm', '40 × 40 cm']);
    expect((await variantCosts()).get((await listVariants()).find((v) => v.product_id === cadre.id && v.name === '30 × 30 cm')!.id)?.cost).toBe(1200);
    expect(await createCatalogFromSupplierProducts([a, b], { category: 'option' })).toEqual({ products: 0, variants: 0, linked: 0 }); // already linked
  });

});

describe('sessions', () => {
  it('create / update / duplicate / archive / delete', async () => {
    const [tpl] = await listTemplates();
    const id = await createSession({ name: 'TEMPSDANSES — Iris novembre 2026', date: '2026-11-21', template_id: tpl.id });
    const s = await getSession(id);
    expect(s?.price_list_id).toBeTruthy();
    expect(s?.price_list_id).not.toBe(tpl.price_list_id); // own copy
    await updateSession(id, { location: 'Lyon', status: 'active' });
    expect((await getSession(id))?.location).toBe('Lyon');
    const d = await duplicateSession(id);
    const dup = await getSession(d);
    expect(dup?.name).toContain('(copie)');
    expect(dup?.price_list_id).not.toBe(s?.price_list_id);
    await updateSession(d, { status: 'archivee' });
    expect((await listSessions()).map((x) => x.id)).not.toContain(d);
    expect((await listSessions({ includeArchived: true })).map((x) => x.id)).toContain(d);
    await deleteSession(d);
    expect(await getSession(d)).toBeNull();
  });
});

describe('CSV import', () => {
  it('template has BOM, ; and all headers', () => {
    const t = registrationTemplate();
    expect(t.startsWith('﻿')).toBe(true);
    expect(t).toContain('Référence inscription;Nom de famille');
    expect(parseRegistrationCsv(t).fatal).toBe('Aucune ligne de données.');
  });

  it('validates rows, phones, participants 1..5', () => {
    const p = parseRegistrationCsv(csv([
      ['001', 'Martin', 'Julie', '0612345678', 'julie@ex.fr', '21/11/2026', '14h30', '', 'Léa', '', '', '', '', ''],
      ['002', 'Durand', '', '612345678', '', '2026-11-21', '15:00', '5', 'A', 'B', 'C', 'D', 'E', 'note'],
      ['003', '', 'X', '', '', '31/02/2026', '25:00', 'x', '', '', '', '', '', ''],
      ['', 'Bernard', '', '', 'mauvais', '', '', '', '', '', '', '', '', ''],
    ]));
    expect(p.fatal).toBeNull();
    const [a, b, c, d] = p.rows;
    expect(a).toMatchObject({ ref: '001', phone: '0612345678', date: '2026-11-21', time: '14:30', count: 1, participants: ['Léa'] });
    expect(b.phone).toBe('0612345678');
    expect(b.warnings[0]).toContain('Zéro initial');
    expect(b.participants).toHaveLength(5);
    expect(c.errors.length).toBe(4);
    expect(d.errors).toEqual([]);
    expect(d.email).toBe('');
  });

  it('missing columns', () => {
    expect(parseRegistrationCsv('Nom;Téléphone\r\nA;1').fatal).toContain('Nom de famille');
    const p = parseRegistrationCsv('Nom de famille;Téléphone\r\nMartin;0611');
    expect(p.fatal).toBeNull();
    expect(p.missingColumns).toContain('E-mail');
    expect(p.rows[0].lastName).toBe('Martin');
  });

  it('import, re-import without duplicates, conflict update, never touches orders', async () => {
    const sid = await createSession({ name: 'S' });
    const file = csv([
      ['001', 'Martin', 'Julie', '0612345678', '', '21/11/2026', '14:30', '2', 'Léa', 'Tom', '', '', '', ''],
      ['002', 'Durand', 'Paul', '0700000000', '', '21/11/2026', '15:00', '', 'Zoé', '', '', '', '', ''],
    ]);
    let plan = await planImport(sid, parseRegistrationCsv(file).rows);
    expect(plan.map((p) => p.kind)).toEqual(['new', 'new']);
    expect(await applyImport(sid, plan, {})).toMatchObject({ created: 2 });
    const regs = await listRegistrations(sid);
    expect(regs).toHaveLength(2);
    expect(regs[0].participant_names).toBe('Léa, Tom');
    // re-import same file: only conflicts, ignored by default
    plan = await planImport(sid, parseRegistrationCsv(file).rows);
    expect(plan.map((p) => p.kind)).toEqual(['conflict', 'conflict']);
    expect(await applyImport(sid, plan, {})).toMatchObject({ ignored: 2 });
    expect(await listRegistrations(sid)).toHaveLength(2);
    // update: new time + new participant
    const upd = csv([['001', 'Martin', 'Julie', '0612345678', '', '21/11/2026', '16:00', '3', 'Léa', 'Tom', 'Max', '', '', '']]);
    plan = await planImport(sid, parseRegistrationCsv(upd).rows);
    await applyImport(sid, plan, { 2: 'update' });
    const m = (await listRegistrations(sid)).find((r) => r.external_ref === '001')!;
    expect(m.appt_time).toBe('16:00');
    expect(m.nb_participants).toBe(3);
    // create after confirmation
    plan = await planImport(sid, parseRegistrationCsv(upd).rows);
    await applyImport(sid, plan, { 2: 'create' });
    expect(await listRegistrations(sid)).toHaveLength(3);
    // a family already known from another session is linked, not duplicated
    const sid2 = await createSession({ name: 'S2' });
    plan = await planImport(sid2, parseRegistrationCsv(file).rows);
    expect(plan[1].kind).toBe('link');
    await applyImport(sid2, plan, {});
    expect((await one<{ n: number }>("SELECT count(*) n FROM families WHERE name='Durand'"))?.n).toBe(1);
  });
});

async function setupSale() {
  const [tpl] = await listTemplates();
  const styles = await listStyles();
  const fusion = styles.find((s) => s.name === 'Fusion')!;
  const products = await listProducts();
  const variants = await listVariants();
  const acry = products.find((p) => p.name === 'Acrylique 5 mm')!;
  const acry40 = variants.find((v) => v.product_id === acry.id && v.name === '40 × 40 cm')!;
  const fusionHd = products.find((p) => p.name === 'Fusion HD')!;
  const fusionHdV = variants.find((v) => v.product_id === fusionHd.id)!;
  await setPrice(tpl.price_list_id, 'style', fusion.id, 0, 5000);
  await setPrice(tpl.price_list_id, 'style', fusion.id, 4, 8000);
  await setPrice(tpl.price_list_id, 'variant', acry40.id, 0, 18900);
  await setPrice(tpl.price_list_id, 'variant', fusionHdV.id, 0, 3000);
  const sid = await createSession({ name: 'Vente', template_id: tpl.id });
  await applyImport(sid, await planImport(sid, parseRegistrationCsv(csv([['1', 'Petit', '', '', '', '', '', '', 'A', 'B', 'C', 'D', '', '']])).rows), {});
  const [reg] = await listRegistrations(sid);
  const parts = await sel<{ id: string; first_name: string }>('SELECT id, first_name FROM participants WHERE family_id=?', [reg.family_id]);
  return { tpl, sid, reg, parts, fusion, acry, acry40, fusionHd, fusionHdV };
}

describe('orders', () => {
  it('full sale: composition billed once, validation, payments, history, template change does not alter order', async () => {
    const x = await setupSale();
    const ck = uid();
    const cart: Cart = {
      ...emptyCart(x.sid, x.reg.family_id, x.reg.id),
      compositions: [{ key: ck, styleId: x.fusion.id, styleName: 'Fusion', irisCount: 4, feeCents: 8000, participantIds: x.parts.map((p) => p.id), participantNames: 'A, B, C, D', instructions: 'fond noir' }],
      items: [
        { key: uid(), variantId: x.fusionHdV.id, productId: x.fusionHd.id, category: 'numerique', productName: 'Fusion HD', variantName: 'Fichier HD', compositionKey: ck, qty: 1, unitPriceCents: 3000, unitCostCents: 0 },
        { key: uid(), variantId: x.acry40.id, productId: x.acry.id, category: 'impression', productName: 'Acrylique', variantName: '40 × 40 cm', compositionKey: ck, qty: 2, unitPriceCents: 18900, unitCostCents: 6000 },
      ],
    };
    const draft = await saveCart(cart, 'brouillon');
    expect(draft.number).toMatch(/^\d{4}-0001$/);
    // an option attached to a print line keeps its link (saved, reloaded, duplicated)
    const withFrame = await loadCart(draft.id);
    const parent = withFrame.items[1];
    withFrame.items.push({ key: uid(), variantId: null, productId: null, category: 'option', productName: 'Cadre', variantName: '40 × 40 cm', compositionKey: ck, parentKey: parent.key, qty: 2, unitPriceCents: 5000, unitCostCents: 0 });
    await saveCart(withFrame, 'brouillon');
    expect((await loadCart(draft.id)).items[2].parentKey).toBe(parent.key);
    const dup = await loadCart(await duplicateOrder(draft.id));
    expect(dup.items[2].parentKey).toBe(dup.items[1].key);
    expect(dup.items[2].parentKey).not.toBe(parent.key);
    withFrame.items.pop();
    await saveCart(withFrame, 'brouillon');
    const reloaded = await loadCart(draft.id);
    expect(reloaded.items).toHaveLength(2);
    reloaded.items[1].qty = 1; // quantity change
    const { id } = await saveCart(reloaded, 'validee');
    let d = (await getOrderDetail(id))!;
    expect(d.order.status).toBe('validee');
    expect(d.order.total_cents).toBe(8000 + 3000 + 18900);
    expect((await sel('SELECT * FROM production_tasks WHERE order_id=?', [id])).length).toBe(1); // one composition = one creation task
    // template / session price change does not modify the validated order
    await setPrice(x.tpl.price_list_id, 'variant', x.acry40.id, 0, 99900);
    const s = await getSession(x.sid);
    await setPrice(s!.price_list_id!, 'variant', x.acry40.id, 0, 25000);
    expect((await loadCart(id)).items[1].unitPriceCents).toBe(18900);
    // payments: partial then complete
    await addPayment(id, { amount_cents: 10000, method: 'especes', paid_at: '2026-11-21' });
    d = (await getOrderDetail(id))!;
    expect(paymentStatus(d.order.total_cents, d.order.paid_cents)).toBe('partiel');
    await expect(addPayment(id, { amount_cents: 99999, method: 'carte', paid_at: '2026-11-21' })).rejects.toThrow('solde');
    await addPayment(id, { amount_cents: d.order.total_cents - 10000, method: 'carte', paid_at: '2026-11-22' });
    d = (await getOrderDetail(id))!;
    expect(paymentStatus(d.order.total_cents, d.order.paid_cents)).toBe('paye');
    // correction keeps history and tasks
    const c = await loadCart(id);
    c.manual = [{ label: 'Geste commercial', amount_cents: 500, reason: 'fidélité' }];
    await expect(saveCart(c, 'validee', 'remise')).resolves.toBeTruthy();
    d = (await getOrderDetail(id))!;
    expect(d.order.total_cents).toBe(29900 - 500);
    expect(d.history.some((h) => h.action === 'correction')).toBe(true);
    expect(d.discounts[0]).toMatchObject({ kind: 'manual', reason: 'fidélité' });
    // duplicate → new draft with current session price
    const dupId = await duplicateOrder(id);
    expect((await loadCart(dupId)).items.find((i) => i.variantId === x.acry40.id)?.unitPriceCents).toBe(25000);
    await cancelOrder(dupId, 'test');
    // client recap PDF: real PDF, correct content, no internal data
    const { orderRecapPdf, sessionCatalogPdf } = await import('../services/documents');
    const txt = new TextDecoder('latin1').decode(await orderRecapPdf(id));
    expect(txt.startsWith('%PDF-')).toBe(true);
    expect(txt).toContain('Fusion');
    expect(txt).toContain('294,00');
    for (const w of ['Onelab', 'Dreambooks', 'Marge', 'marge', 'Coût', 'Co\\373t', 'coefficient']) expect(txt).not.toContain(w);
    const cat = new TextDecoder('latin1').decode(await sessionCatalogPdf(x.sid));
    expect(cat).toContain('250,00'); // session price, not the template one
    for (const w of ['Onelab', 'Marge', 'marge']) expect(cat).not.toContain(w);
    await expect(saveCart(await loadCart(dupId), 'validee')).rejects.toThrow('annulée');
  });

  it('brochure (sale prices, framed print price, no internal data) and draft recap « Votre sélection »', async () => {
    const x = await setupSale();
    const { parsePrintFrame } = await import('../services/onelab');
    const { getSetting } = await import('../services/base');
    const cfg = parsePrintFrame(await getSetting('print_frame'))!;
    const vs = await listVariants();
    const print20 = vs.find((v) => v.product_id === cfg.prints[0] && v.name === '20 × 20 cm')!;
    const frame20 = vs.find((v) => v.product_id === cfg.frame && v.name === '20 × 20 cm')!;
    const pl = (await getSession(x.sid))!.price_list_id!;
    await setPrice(pl, 'variant', print20.id, 0, 1500);
    await setPrice(pl, 'variant', frame20.id, 0, 4500);
    const { brochureData, sessionBrochurePdf, orderRecapPdf } = await import('../services/documents');
    const data = await brochureData(x.sid, 'Léa Martin');
    const paper = data.products.find((p) => p.name === 'Tirage photo petit format')!;
    expect(paper.variants).toEqual([{ name: '20 × 20 cm', price: 1500, framed: 6000 }]);
    expect(data.products.some((p) => p.name.startsWith('Cadre Flybox'))).toBe(false); // offered under the prints only
    const txt = new TextDecoder('latin1').decode(await sessionBrochurePdf(x.sid, 'Léa Martin'));
    expect(txt.startsWith('%PDF-')).toBe(true);
    for (const w of ['Fusion', '80,00', '60,00', '15,00']) expect(txt).toContain(w);
    for (const w of ['Onelab', 'Marge', 'marge', 'Co\\373t', 'fournisseur']) expect(txt).not.toContain(w);
    const ck = uid();
    const draft = await saveCart({ ...emptyCart(x.sid, x.reg.family_id, x.reg.id),
      compositions: [{ key: ck, styleId: x.fusion.id, styleName: 'Fusion', irisCount: 4, feeCents: 8000, participantIds: [], participantNames: '', instructions: '' }],
      items: [{ key: uid(), variantId: print20.id, productId: cfg.prints[0], category: 'impression', productName: 'Tirage photo petit format', variantName: '20 × 20 cm', compositionKey: ck, qty: 1, unitPriceCents: 1500, unitCostCents: 0 }] }, 'brouillon');
    const recap = new TextDecoder('latin1').decode(await orderRecapPdf(draft.id));
    expect(recap).toContain('Votre s');
    expect(recap).toContain('95,00');
    expect(recap).not.toContain('Solde restant');
    const { recapMailBody, recapMailSubject } = await import('../lib/invoiceMail');
    expect(recapMailSubject('Gala')).toBe('Votre sélection – Gala – MF/1.2');
    const body = recapMailBody({ firstName: 'Léa', client: 'Léa Martin', number: draft.number, session: 'Gala', total: 9500, signature: 'MF/1.2' });
    expect(body).toMatch(/^Bonjour Léa,/);
    expect(body).toMatch(/95,00\s€/);
    expect(body).not.toMatch(/\{\w+\}/);
  });

  it('payment plan is saved with the order, recalculated on correction, printed on the recap', async () => {
    const x = await setupSale();
    const cart: Cart = { ...emptyCart(x.sid, x.reg.family_id, x.reg.id), paymentPlan: { count: 3, first_date: '2026-11-21' },
      items: [{ key: uid(), variantId: x.acry40.id, productId: x.acry.id, category: 'impression', productName: 'Acrylique', qty: 1, unitPriceCents: 18900, unitCostCents: 0 }] };
    const { id } = await saveCart(cart, 'validee');
    const reloaded = await loadCart(id);
    expect(reloaded.paymentPlan).toMatchObject({ count: 3, first_date: '2026-11-21' });
    const row = (await sel<{ payment_plan: string }>('SELECT payment_plan FROM orders WHERE id=?', [id]))[0];
    expect(JSON.parse(row.payment_plan).schedule.map((i: { amount_cents: number }) => i.amount_cents)).toEqual([6300, 6300, 6300]);
    reloaded.manual = [{ label: 'Geste', amount_cents: 900 }];
    await saveCart(reloaded, 'validee', 'remise');
    const r2 = (await sel<{ payment_plan: string }>('SELECT payment_plan FROM orders WHERE id=?', [id]))[0];
    expect(JSON.parse(r2.payment_plan).schedule.map((i: { amount_cents: number }) => i.amount_cents)).toEqual([6000, 6000, 6000]);
    await addPayment(id, { amount_cents: 6000, method: 'carte', paid_at: '2026-11-21' });
    const { orderRecapPdf } = await import('../services/documents');
    const txt = new TextDecoder('latin1').decode(await orderRecapPdf(id));
    expect(txt).toContain('Paiement en 3 fois');
    expect(txt).toContain('1. 21/11/2026 : 60,00');
    expect(txt).toMatch(/\\\(r.gl.\\\)/); // first instalment marked as paid
    // cancelling the plan
    const r3 = await loadCart(id); r3.paymentPlan = null; await saveCart(r3, 'validee', 'comptant');
    expect((await sel<{ payment_plan: string | null }>('SELECT payment_plan FROM orders WHERE id=?', [id]))[0].payment_plan).toBeNull();
  });

  it('a validated order can be deleted with its payments, tasks and supplier lines; snapshot kept in the journal', async () => {
    const { deleteOrder, orderDeletionImpact } = await import('../services/orders');
    const { createSupplierOrder, listPrintLines } = await import('../services/production');
    const x = await setupSale();
    const ck = uid();
    const { id } = await saveCart({ ...emptyCart(x.sid, x.reg.family_id, x.reg.id),
      compositions: [{ key: ck, styleId: x.fusion.id, styleName: 'Fusion', irisCount: 2, feeCents: 5000, participantIds: [], participantNames: '', instructions: '' }],
      items: [{ key: uid(), variantId: x.acry40.id, productId: x.acry.id, category: 'impression', productName: 'Acrylique', compositionKey: ck, qty: 1, unitPriceCents: 18900, unitCostCents: 0 }] }, 'validee');
    await addPayment(id, { amount_cents: 5000, method: 'especes', paid_at: '2026-11-21' });
    const lines = await listPrintLines(x.sid);
    const sup = (await sel<{ id: string }>("SELECT id FROM suppliers WHERE name='Onelab Pro'"))[0].id;
    const soId = await createSupplierOrder(sup, lines, x.sid);
    expect(await orderDeletionImpact(id)).toEqual({ payments: 1, paid: 5000, tasks: 1, supplier_lines: 1 });
    await deleteOrder(id, 'erreur de saisie');
    for (const t of ['orders', 'payments', 'production_tasks', 'order_items', 'supplier_order_items'])
      expect((await sel(`SELECT * FROM ${t}`)).length, t).toBe(0);
    expect((await sel('SELECT * FROM supplier_orders WHERE id=?', [soId])).length).toBe(1); // the supplier order itself stays
    const log = (await sel<{ details: string }>("SELECT details FROM audit_logs WHERE action='delete_order' AND entity_id=?", [id]))[0];
    expect(JSON.parse(log.details)).toMatchObject({ reason: 'erreur de saisie', order: { status: 'validee' }, payments: [{ amount_cents: 5000 }] });
  });

  it('disposition and wishes of a creation are saved and printed on the client recap', async () => {
    const x = await setupSale();
    const ck = uid();
    const { id } = await saveCart({ ...emptyCart(x.sid, x.reg.family_id, x.reg.id),
      compositions: [{ key: ck, styleId: x.fusion.id, styleName: 'Fusion', irisCount: 3, feeCents: 5000, participantIds: [], participantNames: 'A, B, C', instructions: 'fond noir, prénoms dessous', orientation: 'diagonale' }],
      items: [] }, 'validee');
    expect((await loadCart(id)).compositions[0]).toMatchObject({ orientation: 'diagonale', instructions: 'fond noir, prénoms dessous' });
    const { orderRecapPdf, productionPdf } = await import('../services/documents');
    const txt = new TextDecoder('latin1').decode(await orderRecapPdf(id));
    expect(txt).toContain('Disposition : diagonale');
    expect(txt).toContain('fond noir, pr');
    const prod = new TextDecoder('latin1').decode(await productionPdf({ sessionId: x.sid }, 'test'));
    expect(prod).toContain('Disposition : diagonale');
  });

  it('official invoices: legal info required, continuous numbering, duplicate, credit notes on correction/cancel/delete', async () => {
    const { issueInvoice, invoicesOfOrder, listInvoices } = await import('../services/invoices');
    const { orderInvoicePdf } = await import('../services/documents');
    const { setSetting } = await import('../services/base');
    const { cancelOrder, deleteOrder } = await import('../services/orders');
    const x = await setupSale();
    const { saveFamily } = await import('../services/families');
    await saveFamily(x.reg.family_id, { name: 'Petit', contact_first_name: 'Julie' });
    const mk = (): Cart => ({ ...emptyCart(x.sid, x.reg.family_id, x.reg.id),
      items: [{ key: uid(), variantId: x.acry40.id, productId: x.acry.id, category: 'impression', productName: 'Acrylique', variantName: '40 × 40 cm', qty: 1, unitPriceCents: 18900, unitCostCents: 0 }] });
    const draft = await saveCart(mk(), 'brouillon');
    await expect(issueInvoice(draft.id)).rejects.toThrow('validée');
    const a = await saveCart(mk(), 'validee');
    await expect(issueInvoice(a.id)).rejects.toThrow('SIRET');
    await setSetting('legal_name', 'Mathieu Exemple'); await setSetting('legal_address', '1 rue des Iris, 75000 Paris'); await setSetting('siret', '123 456 789 00012');
    await setSetting('mediator', 'CNPM Médiation');
    const y = new Date().getFullYear();
    const i1 = await issueInvoice(a.id);
    expect(i1).toMatchObject({ created: true, row: { number: `F${y}-0001` } });
    expect((await issueInvoice(a.id)).created).toBe(false); // duplicate, same number
    const pdf = new TextDecoder('latin1').decode((await orderInvoicePdf(a.id)).pdf);
    for (const t of ['FACTURE', `F${y}-0001`, 'Julie Petit', 'Mathieu Exemple EI', 'SIRET : 123 456 789 00012', 'TVA non applicable, art. 293 B du CGI', 'immatriculation au RCS et au RM', 'CNPM'])
      expect(pdf, t).toContain(t);
    // correction → credit note + new invoice number on next print
    const c = await loadCart(a.id); c.manual = [{ label: 'Geste', amount_cents: 900 }];
    await saveCart(c, 'validee', 'remise');
    let rows = await invoicesOfOrder(a.id);
    expect(rows.map((r) => [r.number, r.kind, r.total_cents])).toEqual([[`F${y}-0001`, 'facture', 18900], [`AV${y}-0001`, 'avoir', -18900]]);
    expect(rows[0].cancelled_by).toBe(rows[1].id);
    const i2 = await issueInvoice(a.id);
    expect(i2.row.number).toBe(`F${y}-0002`); expect(i2.data.total).toBe(18000);
    // cancellation → credit note
    await cancelOrder(a.id, 'client');
    rows = await invoicesOfOrder(a.id);
    expect(rows.filter((r) => r.kind === 'avoir').map((r) => r.number)).toEqual([`AV${y}-0001`, `AV${y}-0002`]);
    // deletion keeps invoices (order_id set to null) and issues a credit note for an active invoice
    const b = await saveCart(mk(), 'validee');
    await issueInvoice(b.id);
    await deleteOrder(b.id);
    const all = await listInvoices();
    expect(all.map((r) => r.number).sort()).toEqual([`AV${y}-0001`, `AV${y}-0002`, `AV${y}-0003`, `F${y}-0001`, `F${y}-0002`, `F${y}-0003`].sort());
    expect(all.find((r) => r.number === `F${y}-0003`)!.order_id).toBeNull();
  });

  it('cover photo of a style ("à la une") drives the thumbnail everywhere', async () => {
    const { setCoverExample, listExamples } = await import('../services/catalog');
    const { batch } = await import('../services/base');
    const fusion = (await listStyles()).find((s) => s.name === 'Fusion')!;
    const now = new Date().toISOString();
    await batch(['a', 'b', 'c'].flatMap((k, i) => [
      { sql: 'INSERT INTO media (id, thumb, full, created_at) VALUES (?,?,?,?)', params: [`m${k}`, `thumb-${k}`, `full-${k}`, now] },
      { sql: 'INSERT INTO composition_examples (id, style_id, media_id, sort) VALUES (?,?,?,?)', params: [`e${k}`, fusion.id, `m${k}`, i + 1] },
    ]));
    expect((await listStyles()).find((s) => s.id === fusion.id)!.cover_thumb).toBe('thumb-a');
    await setCoverExample('ec');
    expect((await listStyles()).find((s) => s.id === fusion.id)!.cover_thumb).toBe('thumb-c');
    expect((await listExamples(fusion.id)).map((e) => e.id)).toEqual(['ec', 'ea', 'eb']);
    await setCoverExample('eb');
    expect((await listExamples(fusion.id)).map((e) => e.id)).toEqual(['eb', 'ec', 'ea']);
  });

  it('production task shows the style example made for the same number of iris', async () => {
    const { listTasks } = await import('../services/production');
    const { batch } = await import('../services/base');
    const x = await setupSale();
    const now = new Date().toISOString();
    await batch([
      { sql: 'INSERT INTO media (id, thumb, full, created_at) VALUES (?,?,?,?),(?,?,?,?)', params: ['m2', 'thumb-2', 'f', now, 'm4', 'thumb-4', 'f', now] },
      { sql: 'INSERT INTO composition_examples (id, style_id, media_id, iris_count, sort) VALUES (?,?,?,?,?),(?,?,?,?,?)', params: ['e2', x.fusion.id, 'm2', 2, 1, 'e4', x.fusion.id, 'm4', 4, 2] },
    ]);
    const ck = uid();
    await saveCart({ ...emptyCart(x.sid, x.reg.family_id, x.reg.id),
      compositions: [{ key: ck, styleId: x.fusion.id, styleName: 'Fusion', irisCount: 4, feeCents: 8000, participantIds: [], participantNames: '', instructions: '' }], items: [] }, 'validee');
    expect((await listTasks({ sessionId: x.sid }))[0].example_thumb).toBe('thumb-4');
  });

  it('drafts can be deleted (one or many), validated orders never', async () => {
    const { deleteDraft, deleteDrafts } = await import('../services/orders');
    const x = await setupSale();
    const mk = () => ({ ...emptyCart(x.sid, x.reg.family_id, x.reg.id), items: [{ key: uid(), variantId: x.acry40.id, productId: x.acry.id, category: 'impression', productName: 'Acrylique', qty: 1, unitPriceCents: 18900, unitCostCents: 0 }] });
    const d1 = (await saveCart(mk(), 'brouillon')).id;
    const d2 = (await saveCart(mk(), 'brouillon')).id;
    const v = (await saveCart(mk(), 'validee')).id;
    await expect(deleteDraft(v)).rejects.toThrow('brouillons');
    expect(await deleteDrafts([d1, d2, v])).toEqual({ deleted: 2, kept: 1 });
    expect((await sel<{ id: string }>('SELECT id FROM orders')).map((r) => r.id)).toEqual([v]);
    expect((await sel('SELECT * FROM order_items WHERE order_id IN (?,?)', [d1, d2])).length).toBe(0); // cascade
  });

  it('applies session promotions (pack) and new template applied to session keeps old orders', async () => {
    const x = await setupSale();
    const s = await getSession(x.sid);
    await savePromotion(s!.price_list_id!, { name: 'Fusion + tableau', type: 'pack', priority: 1, stackable: true, active: true,
      config: { items: [{ selector: { category: 'creation', styleId: x.fusion.id }, qty: 1 }, { selector: { productId: x.acry.id }, qty: 1 }], mode: 'discount', value_cents: 2000 } });
    const ck = uid();
    const cart: Cart = { ...emptyCart(x.sid, x.reg.family_id, x.reg.id),
      compositions: [{ key: ck, styleId: x.fusion.id, styleName: 'Fusion', irisCount: 2, feeCents: 5000, participantIds: [], participantNames: '', instructions: '' }],
      items: [{ key: uid(), variantId: x.acry40.id, productId: x.acry.id, category: 'impression', productName: 'Acrylique', compositionKey: ck, qty: 1, unitPriceCents: 18900, unitCostCents: 0 }] };
    const { id } = await saveCart(cart, 'validee');
    const d = (await getOrderDetail(id))!;
    expect(d.order.discount_cents).toBe(2000);
    expect(d.order.total_cents).toBe(21900);
    const t2 = await createTemplate('Tarif premium', '', x.tpl.id);
    await applyTemplateToSession(x.sid, t2);
    expect((await getOrderDetail(id))!.order.total_cents).toBe(21900);
  });
});
