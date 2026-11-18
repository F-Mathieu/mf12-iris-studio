import { auditStmt, batch, insertStmt, nowIso, one, run, sel, uid, updateStmt } from './base';
import { processImage } from '../lib/images';
import { linkedFilter, linkedIds, setLinksStmts, splitIds, universeFilter } from './universes';

export interface Style { id: string; name: string; description: string | null; min_iris: number; max_iris: number; active: number; archived: number; sort: number; universe_id: string | null; examples_count?: number; cover_thumb?: string | null }
export interface Example { id: string; style_id: string; media_id: string; iris_count: number | null; caption: string | null; sort: number; thumb: string }
export type Category = 'numerique' | 'impression' | 'option';
export const CATEGORY_LABEL: Record<Category | 'creation', string> = { numerique: 'Numérique', impression: 'Impressions', option: 'Options', creation: 'Créations' };
export interface Product { id: string; category: Category; name: string; description: string | null; media_id: string | null; style_id: string | null; needs_composition: number; active: number; archived: number; sort: number; universe_ids: string[]; photos_per_unit: number | null; thumb?: string | null; style_name?: string | null }
export interface Variant { id: string; product_id: string; name: string; format: string | null; finish: string | null; extra_cost_cents: number; preferred_supplier_product_id: string | null; active: number; archived: number; sort: number; universe_ids: string[] }

/* ---------- media */
export async function addMedia(blob: Blob): Promise<string> {
  const img = await processImage(blob);
  const id = uid();
  await run('INSERT INTO media (id, mime, thumb, full, width, height, created_at) VALUES (?,?,?,?,?,?,?)',
    [id, 'image/jpeg', img.thumb, img.full, img.width, img.height, nowIso()]);
  return id;
}
export const getMediaFull = async (id: string) => (await one<{ full: string }>('SELECT full FROM media WHERE id=?', [id]))?.full ?? null;

/* ---------- styles */
/** universeId: only common items + those of this universe. */
export const listStyles = (includeArchived = false, universeId?: string | null) => {
  const u = universeFilter('s', universeId);
  return sel<Style>(`SELECT s.*, (SELECT count(*) FROM composition_examples e WHERE e.style_id=s.id) examples_count,
     (SELECT m.thumb FROM composition_examples e JOIN media m ON m.id=e.media_id WHERE e.style_id=s.id ORDER BY e.sort LIMIT 1) cover_thumb
     FROM composition_styles s WHERE ${u.sql} ${includeArchived ? '' : 'AND s.archived=0'} ORDER BY s.archived, s.sort, s.name`, u.params);
};

export async function saveStyle(s: Partial<Style> & { name: string }) {
  if (!s.name.trim()) throw new Error('Nom du style obligatoire.');
  const min = Math.max(1, s.min_iris ?? 1), max = Math.max(min, s.max_iris ?? min);
  const row = { name: s.name.trim(), description: s.description ?? null, min_iris: min, max_iris: max, active: s.active ?? 1, archived: s.archived ?? 0, universe_id: s.universe_id || null };
  if (s.id) { await batch([updateStmt('composition_styles', s.id, row)]); return s.id; }
  const id = uid();
  const n = await one<{ n: number }>('SELECT COALESCE(max(sort),0)+1 n FROM composition_styles');
  await batch([insertStmt('composition_styles', { id, ...row, sort: n?.n ?? 0, created_at: nowIso() }), auditStmt('style', id, 'create', row)]);
  return id;
}
export const listExamples = (styleId?: string) =>
  sel<Example>(`SELECT e.*, m.thumb FROM composition_examples e JOIN media m ON m.id=e.media_id
     ${styleId ? 'WHERE e.style_id=?' : ''} ORDER BY e.sort, e.iris_count`, styleId ? [styleId] : []);
export async function addExamples(styleId: string, files: Blob[], irisCount: number | null) {
  for (const f of files) {
    const mid = await addMedia(f);
    await run('INSERT INTO composition_examples (id, style_id, media_id, iris_count, sort) VALUES (?,?,?,?,(SELECT COALESCE(max(sort),0)+1 FROM composition_examples WHERE style_id=?))',
      [uid(), styleId, mid, irisCount, styleId]);
  }
}
/** Makes an example the style's cover (first in order): shown on catalogue cards, sale cards, presentation and PDF. */
export const setCoverExample = (id: string) => batch([{
  sql: 'UPDATE composition_examples SET sort = (SELECT COALESCE(min(sort), 0) - 1 FROM composition_examples x WHERE x.style_id = composition_examples.style_id) WHERE id=?',
  params: [id],
}]);
export const updateExample = (id: string, d: { iris_count?: number | null; caption?: string | null }) => batch([updateStmt('composition_examples', id, d)]);
export async function deleteExample(id: string) {
  const e = await one<{ media_id: string }>('SELECT media_id FROM composition_examples WHERE id=?', [id]);
  await batch([{ sql: 'DELETE FROM composition_examples WHERE id=?', params: [id] }, ...(e ? [{ sql: 'DELETE FROM media WHERE id=? AND NOT EXISTS (SELECT 1 FROM products WHERE media_id=?)', params: [e.media_id, e.media_id] }] : [])]);
}

/* ---------- products */
/** universeId: only common products + those of this universe. */
export const listProducts = async (includeArchived = false, universeId?: string | null) => {
  const u = linkedFilter('product', 'p', universeId);
  const rows = await sel<Product & { uids: string | null }>(`SELECT p.*, ${linkedIds('product', 'p')} uids, m.thumb, s.name style_name FROM products p LEFT JOIN media m ON m.id=p.media_id LEFT JOIN composition_styles s ON s.id=p.style_id
     WHERE ${u.sql} ${includeArchived ? '' : 'AND p.archived=0'} ORDER BY p.archived, CASE p.category WHEN 'numerique' THEN 0 WHEN 'impression' THEN 1 ELSE 2 END, p.sort, p.name`, u.params);
  return rows.map(({ uids, universe_id: _u, ...p }: Product & { uids: string | null; universe_id?: unknown }) => ({ ...p, universe_ids: splitIds(uids) }));
};
/** universeId: variants of this universe, or without own universe (they follow their product). */
export const listVariants = async (includeArchived = false, universeId?: string | null) => {
  const u = linkedFilter('variant', 'v', universeId);
  const rows = await sel<Variant & { uids: string | null }>(`SELECT v.*, ${linkedIds('variant', 'v')} uids FROM product_variants v
     WHERE ${u.sql} ${includeArchived ? '' : 'AND v.archived=0'} ORDER BY v.sort, v.name`, u.params);
  return rows.map(({ uids, ...v }) => ({ ...v, universe_ids: splitIds(uids) }));
};

export async function saveProduct(p: Partial<Product> & { name: string; category: Category }) {
  if (!p.name.trim()) throw new Error('Nom du produit obligatoire.');
  const row = { category: p.category, name: p.name.trim(), description: p.description ?? null, media_id: p.media_id ?? null, style_id: p.style_id || null,
    needs_composition: p.needs_composition ?? (p.category === 'option' ? 0 : 1), active: p.active ?? 1, archived: p.archived ?? 0,
    photos_per_unit: p.photos_per_unit == null || (p.photos_per_unit as unknown) === '' ? null : Math.max(0, Math.round(Number(p.photos_per_unit))) };
  const linkStmts = (id: string) => (p.universe_ids ? setLinksStmts('product', id, p.universe_ids) : []);
  if (p.id) { await batch([updateStmt('products', p.id, row), ...linkStmts(p.id)]); return p.id; }
  const id = uid();
  const n = await one<{ n: number }>('SELECT COALESCE(max(sort),0)+1 n FROM products');
  await batch([insertStmt('products', { id, ...row, sort: n?.n ?? 0, created_at: nowIso() }), ...linkStmts(id),
    insertStmt('product_variants', { id: uid(), product_id: id, name: p.category === 'numerique' ? 'Fichier HD' : 'Standard', sort: 0 })]);
  return id;
}
export async function saveVariant(v: Partial<Variant> & { product_id: string; name: string }) {
  if (!v.name.trim()) throw new Error('Nom de la variante obligatoire.');
  const row = { name: v.name.trim(), format: v.format ?? null, finish: v.finish ?? null, extra_cost_cents: v.extra_cost_cents ?? 0,
    preferred_supplier_product_id: v.preferred_supplier_product_id ?? null, active: v.active ?? 1, archived: v.archived ?? 0 };
  const links = (id: string) => (v.universe_ids ? setLinksStmts('variant', id, v.universe_ids) : []);
  if (v.id) { await batch([updateStmt('product_variants', v.id, row), ...links(v.id)]); return v.id; }
  const id = uid();
  await batch([insertStmt('product_variants', { id, product_id: v.product_id, ...row, sort: Date.now() % 1e9 }), ...links(id)]);
  return id;
}
/** Hard delete only if never sold; otherwise archive (history preserved). */
export async function removeVariant(id: string) {
  const used = await one<{ n: number }>('SELECT count(*) n FROM order_items WHERE variant_id=?', [id]);
  if (used && used.n > 0) { await run('UPDATE product_variants SET archived=1, active=0 WHERE id=?', [id]); return 'archived'; }
  await batch([{ sql: 'DELETE FROM price_list_items WHERE kind=? AND ref_id=?', params: ['variant', id] }, { sql: "DELETE FROM catalog_universes WHERE kind='variant' AND ref_id=?", params: [id] }, { sql: 'DELETE FROM product_variants WHERE id=?', params: [id] }]);
  return 'deleted';
}
