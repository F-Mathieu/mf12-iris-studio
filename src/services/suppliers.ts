import { auditStmt, batch, getSetting, insertStmt, nowIso, one, sel, uid, updateStmt } from './base';
import { supplierCost, type SupplierCost } from '../lib/money';
import { cleanCell, normHeader, parseCsv, parseDate } from '../lib/csv';
import { parseEuros, pctToBp } from '../lib/money';
import type { Stmt } from '../lib/db/types';

export interface Supplier { id: string; name: string; contact: string | null; email: string | null; phone: string | null; website: string | null; currency: string; vat_bp: number; discount_bp: number; shipping_cents: number; lead_time: string | null; notes: string | null; archived: number; products_count?: number }
export interface SupplierProduct {
  id: string; supplier_id: string; supplier_name: string; name: string; sku: string | null; support: string | null; format: string | null; finish: string | null;
  variant_id: string | null; variant_name: string | null; product_name: string | null; equivalence: 'equivalent' | 'proche'; notes: string | null; archived: number;
  price_cents: number | null; price_is_ttc: number | null; p_vat_bp: number | null; p_discount_bp: number | null; p_shipping_cents: number | null; valid_from: string | null;
  s_vat_bp: number; s_discount_bp: number; s_shipping_cents: number;
}

export const listSuppliers = (includeArchived = false) =>
  sel<Supplier>(`SELECT s.*, (SELECT count(*) FROM supplier_products p WHERE p.supplier_id=s.id AND p.archived=0) products_count FROM suppliers s
    ${includeArchived ? '' : 'WHERE s.archived=0'} ORDER BY s.archived, s.name COLLATE NOCASE`);

export async function saveSupplier(s: Partial<Supplier> & { name: string }) {
  if (!s.name.trim()) throw new Error('Nom du fournisseur obligatoire.');
  const { id, products_count: _p, ...row } = s;
  if (id) { await batch([updateStmt('suppliers', id, row)]); return id; }
  const nid = uid();
  await batch([insertStmt('suppliers', { id: nid, ...row, created_at: nowIso() })]);
  return nid;
}

const SP_SELECT = `SELECT sp.*, s.name supplier_name, s.vat_bp s_vat_bp, s.discount_bp s_discount_bp, s.shipping_cents s_shipping_cents,
   v.name variant_name, p.name product_name,
   pr.price_cents, pr.price_is_ttc, pr.vat_bp p_vat_bp, pr.discount_bp p_discount_bp, pr.shipping_cents p_shipping_cents, pr.valid_from
 FROM supplier_products sp JOIN suppliers s ON s.id=sp.supplier_id
 LEFT JOIN product_variants v ON v.id=sp.variant_id LEFT JOIN products p ON p.id=v.product_id
 LEFT JOIN supplier_prices pr ON pr.id=(SELECT id FROM supplier_prices x WHERE x.supplier_product_id=sp.id ORDER BY valid_from DESC, created_at DESC LIMIT 1)`;

export const listSupplierProducts = (supplierId?: string) =>
  sel<SupplierProduct>(`${SP_SELECT} WHERE sp.archived=0 ${supplierId ? 'AND sp.supplier_id=?' : ''} ORDER BY s.name, sp.support, sp.format, sp.name`, supplierId ? [supplierId] : []);

export async function saveSupplierProduct(p: Partial<SupplierProduct> & { supplier_id: string; name: string }) {
  const row = { supplier_id: p.supplier_id, name: p.name.trim(), sku: p.sku ?? null, support: p.support ?? null, format: p.format ?? null, finish: p.finish ?? null,
    variant_id: p.variant_id || null, equivalence: p.equivalence ?? 'equivalent', notes: p.notes ?? null, archived: p.archived ?? 0 };
  if (!row.name) throw new Error('Nom du produit fournisseur obligatoire.');
  if (p.id) { await batch([updateStmt('supplier_products', p.id, row)]); return p.id; }
  const id = uid();
  await batch([insertStmt('supplier_products', { id, ...row, created_at: nowIso() })]);
  return id;
}

export interface PriceInput { price_cents: number; price_is_ttc: boolean; vat_bp?: number | null; discount_bp?: number | null; shipping_cents?: number | null; valid_from?: string }
export const priceStmt = (spId: string, p: PriceInput): Stmt => insertStmt('supplier_prices', {
  id: uid(), supplier_product_id: spId, price_cents: p.price_cents, price_is_ttc: p.price_is_ttc ? 1 : 0, vat_bp: p.vat_bp ?? null,
  discount_bp: p.discount_bp ?? null, shipping_cents: p.shipping_cents ?? null, valid_from: p.valid_from ?? nowIso().slice(0, 10), created_at: nowIso(),
});
export async function addSupplierPrice(spId: string, p: PriceInput) {
  if (!(p.price_cents >= 0)) throw new Error('Prix invalide.');
  await batch([priceStmt(spId, p), auditStmt('supplier_product', spId, 'price', p)]);
}
export const priceHistory = (spId: string) =>
  sel<{ id: string; price_cents: number; price_is_ttc: number; vat_bp: number | null; discount_bp: number | null; shipping_cents: number | null; valid_from: string }>(
    'SELECT * FROM supplier_prices WHERE supplier_product_id=? ORDER BY valid_from DESC, created_at DESC', [spId]);

/** Real unit cost of a supplier product with its current price (null if no price: prices are never invented). */
export function costOf(sp: SupplierProduct, vatRecoverable: boolean, extra = 0): SupplierCost | null {
  if (sp.price_cents == null) return null;
  return supplierCost({
    price_cents: sp.price_cents, price_is_ttc: !!sp.price_is_ttc, vat_bp: sp.p_vat_bp ?? sp.s_vat_bp,
    discount_bp: sp.p_discount_bp ?? sp.s_discount_bp, shipping_cents: sp.p_shipping_cents ?? sp.s_shipping_cents, extra_cents: extra,
  }, vatRecoverable);
}

/** Estimated unit cost per variant: preferred supplier product, else cheapest *equivalent* one. */
export async function variantCosts(): Promise<Map<string, { cost: number; supplierId: string; supplierName: string; spId: string }>> {
  const vatRec = (await getSetting('vat_recoverable')) === '1';
  const [sps, variants] = await Promise.all([
    listSupplierProducts(),
    sel<{ id: string; preferred_supplier_product_id: string | null; extra_cost_cents: number }>('SELECT id, preferred_supplier_product_id, extra_cost_cents FROM product_variants'),
  ]);
  const out = new Map<string, { cost: number; supplierId: string; supplierName: string; spId: string }>();
  for (const v of variants) {
    const cands = sps.filter((s) => s.variant_id === v.id && s.equivalence === 'equivalent' && s.price_cents != null);
    const pref = cands.find((c) => c.id === v.preferred_supplier_product_id);
    const best = pref ?? cands.map((c) => ({ c, k: costOf(c, vatRec, v.extra_cost_cents)!.real_cost_cents })).sort((a, b) => a.k - b.k)[0]?.c;
    if (best) out.set(v.id, { cost: costOf(best, vatRec, v.extra_cost_cents)!.real_cost_cents, supplierId: best.supplier_id, supplierName: best.supplier_name, spId: best.id });
    else if (v.extra_cost_cents) out.set(v.id, { cost: v.extra_cost_cents, supplierId: '', supplierName: '', spId: '' });
  }
  return out;
}

export const SUPPLIER_CSV_COLUMNS = ['Produit', 'Référence', 'Support', 'Format', 'Finition', 'Prix', 'Prix TTC (oui/non)', 'TVA %', 'Remise %', 'Livraison', 'Date'] as const;

/** Parses a supplier price CSV. Rows without a valid price are reported, never filled in. */
export function parseSupplierCsv(text: string) {
  const data = parseCsv(text);
  const h = (data[0] ?? []).map(normHeader);
  const ix = (c: string) => h.indexOf(normHeader(c));
  if (ix('Produit') < 0 || ix('Prix') < 0) return { rows: [], fatal: 'Colonnes « Produit » et « Prix » obligatoires.' };
  const g = (r: string[], c: string) => (ix(c) < 0 ? '' : cleanCell(r[ix(c)] ?? ''));
  const rows = data.slice(1).filter((r) => r.some((c) => c.trim())).map((r, i) => {
    const errors: string[] = [];
    const price = parseEuros(g(r, 'Prix'));
    if (price == null) errors.push('Prix manquant ou invalide');
    const ttcRaw = g(r, 'Prix TTC (oui/non)').toLowerCase();
    if (!['oui', 'non', 'ttc', 'ht', 'o', 'n', '1', '0', 'true', 'false'].includes(ttcRaw)) errors.push('Colonne « Prix TTC » : indiquez oui ou non');
    const date = g(r, 'Date') ? parseDate(g(r, 'Date')) : null;
    if (g(r, 'Date') && !date) errors.push('Date invalide');
    return {
      line: i + 2, name: g(r, 'Produit'), sku: g(r, 'Référence') || null, support: g(r, 'Support') || null, format: g(r, 'Format') || null, finish: g(r, 'Finition') || null,
      price_cents: price, price_is_ttc: !['non', 'ht', 'n', '0', 'false'].includes(ttcRaw), vat_bp: g(r, 'TVA %') ? pctToBp(g(r, 'TVA %')) : null,
      discount_bp: g(r, 'Remise %') ? pctToBp(g(r, 'Remise %')) : null, shipping_cents: g(r, 'Livraison') ? parseEuros(g(r, 'Livraison')) : null,
      valid_from: date ?? undefined, errors: g(r, 'Produit') ? errors : ['Nom du produit manquant', ...errors],
    };
  });
  return { rows, fatal: null as string | null };
}

/** Imports parsed rows: matches existing supplier products by reference (or name+format), appends price history. */
export async function importSupplierRows(supplierId: string, rows: ReturnType<typeof parseSupplierCsv>['rows']) {
  const existing = await listSupplierProducts(supplierId);
  const stmts: Stmt[] = [];
  let created = 0, priced = 0, skipped = 0;
  for (const r of rows) {
    if (r.errors.length || r.price_cents == null) { skipped++; continue; }
    let sp = existing.find((e) => (r.sku && e.sku === r.sku) || (!r.sku && e.name === r.name && (e.format ?? '') === (r.format ?? '')));
    let spId = sp?.id;
    if (!spId) {
      spId = uid(); created++;
      stmts.push(insertStmt('supplier_products', { id: spId, supplier_id: supplierId, name: r.name, sku: r.sku, support: r.support, format: r.format, finish: r.finish, created_at: nowIso() }));
    }
    if (!sp || sp.price_cents !== r.price_cents || sp.valid_from !== (r.valid_from ?? sp.valid_from)) { stmts.push(priceStmt(spId, { ...r, price_cents: r.price_cents })); priced++; }
    sp = undefined;
  }
  stmts.push(auditStmt('supplier', supplierId, 'csv_import', { created, priced, skipped }));
  await batch(stmts);
  return { created, priced, skipped };
}

export async function archiveSupplier(id: string, archived = true) {
  await batch([updateStmt('suppliers', id, { archived: archived ? 1 : 0 })]);
}
export const getSupplier = (id: string) => one<Supplier>('SELECT * FROM suppliers WHERE id=?', [id]);

/** "30x30" | "30 × 30" | "30x30 cm" → "30 × 30 cm"; other formats kept as is. */
export function formatLabel(f: string | null | undefined): string {
  const s = (f ?? '').trim();
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*[x×X*]\s*(\d+(?:[.,]\d+)?)\s*(cm)?$/);
  return m ? `${m[1]} × ${m[2]} cm` : s || 'Standard';
}

/**
 * Creates (or reuses) the catalogue product + variant matching supplier products, then links them
 * (equivalent, preferred supplier if none). Product name defaults to the supplier "support" or name.
 */
export async function createCatalogFromSupplierProducts(spIds: string[], opts: { productName?: string; category?: 'numerique' | 'impression' | 'option' } = {}) {
  if (!spIds.length) return { products: 0, variants: 0, linked: 0 };
  const sps = await sel<{ id: string; name: string; support: string | null; format: string | null; variant_id: string | null }>(
    `SELECT id, name, support, format, variant_id FROM supplier_products WHERE id IN (${spIds.map(() => '?').join(',')})`, spIds);
  const products = await sel<{ id: string; name: string; category: string }>('SELECT id, name, category FROM products WHERE archived=0');
  const variants = await sel<{ id: string; product_id: string; name: string; preferred_supplier_product_id: string | null }>('SELECT id, product_id, name, preferred_supplier_product_id FROM product_variants WHERE archived=0');
  const category = opts.category ?? 'impression';
  const now = nowIso();
  const stmts: Stmt[] = [];
  const stats = { products: 0, variants: 0, linked: 0 };
  for (const sp of sps) {
    if (sp.variant_id) continue;
    const pname = (opts.productName ?? (sp.support || sp.name)).trim();
    let prod = products.find((p) => p.name.toLowerCase() === pname.toLowerCase() && p.category === category);
    if (!prod) {
      prod = { id: uid(), name: pname, category };
      products.push(prod); stats.products++;
      stmts.push(insertStmt('products', { id: prod.id, category, name: pname, needs_composition: category === 'option' ? 0 : 1, sort: 50 + stats.products, created_at: now }));
    }
    const vname = formatLabel(sp.format);
    let v = variants.find((x) => x.product_id === prod!.id && x.name.toLowerCase() === vname.toLowerCase());
    if (!v) {
      v = { id: uid(), product_id: prod.id, name: vname, preferred_supplier_product_id: null };
      variants.push(v); stats.variants++;
      stmts.push(insertStmt('product_variants', { id: v.id, product_id: prod.id, name: vname, format: category === 'impression' ? vname : null, sort: variants.filter((x) => x.product_id === prod!.id).length }));
    }
    stmts.push({ sql: "UPDATE supplier_products SET variant_id=?, equivalence='equivalent' WHERE id=?", params: [v.id, sp.id] });
    if (!v.preferred_supplier_product_id) { stmts.push({ sql: 'UPDATE product_variants SET preferred_supplier_product_id=? WHERE id=?', params: [sp.id, v.id] }); v.preferred_supplier_product_id = sp.id; }
    stats.linked++;
  }
  if (stmts.length) await batch([...stmts, auditStmt('supplier', spIds[0], 'create_catalog', stats)]);
  return stats;
}
