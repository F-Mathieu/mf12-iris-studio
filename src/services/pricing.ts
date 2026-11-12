import { auditStmt, batch, insertStmt, nowIso, one, run, sel, uid, updateStmt } from './base';
import type { Stmt } from '../lib/db/types';
import type { PriceRow, Promotion, PromoConfig } from '../lib/pricing';

export interface PriceTemplate {
  id: string; name: string; description: string | null; conditions: string | null; archived: number;
  created_at: string; updated_at: string; price_list_id: string; items_count: number; sessions_count: number;
}
export interface PriceListItem extends PriceRow { id: string; price_list_id: string; pricing_mode: 'manual' | 'coef' | 'margin'; pricing_param: number | null; enabled: number }
export interface PromotionRow { id: string; price_list_id: string; name: string; description: string | null; type: Promotion['type']; config: string; priority: number; stackable: number; active: number; sort: number }

export const toPromotion = (r: PromotionRow): Promotion => ({
  id: r.id, name: r.name, type: r.type, config: JSON.parse(r.config) as PromoConfig, priority: r.priority, stackable: !!r.stackable, active: !!r.active,
});

export async function listTemplates(includeArchived = false): Promise<PriceTemplate[]> {
  return sel<PriceTemplate>(
    `SELECT t.*, pl.id price_list_id,
       (SELECT count(*) FROM price_list_items i WHERE i.price_list_id=pl.id) items_count,
       (SELECT count(*) FROM sessions s JOIN price_lists sp ON sp.id=s.price_list_id WHERE sp.source_template_id=t.id) sessions_count
     FROM price_templates t JOIN price_lists pl ON pl.template_id=t.id
     ${includeArchived ? '' : 'WHERE t.archived=0'} ORDER BY t.archived, t.name COLLATE NOCASE`);
}
export const getTemplate = (id: string) =>
  one<PriceTemplate>('SELECT t.*, pl.id price_list_id FROM price_templates t JOIN price_lists pl ON pl.template_id=t.id WHERE t.id=?', [id]);

export async function createTemplate(name: string, description = '', fromTemplateId?: string): Promise<string> {
  const id = uid(), now = nowIso();
  const stmts: Stmt[] = [insertStmt('price_templates', { id, name: name.trim(), description, created_at: now, updated_at: now })];
  if (fromTemplateId) {
    const c = await copyPriceListStmts({ fromTemplateId, toTemplateId: id, name });
    stmts.push(...c.stmts);
    const src = await getTemplate(fromTemplateId);
    stmts.push({ sql: 'UPDATE price_templates SET conditions=? WHERE id=?', params: [src?.conditions ?? null, id] });
  } else stmts.push(insertStmt('price_lists', { id: uid(), template_id: id, name: name.trim(), created_at: now, updated_at: now }));
  stmts.push(auditStmt('price_template', id, fromTemplateId ? 'duplicate' : 'create', { name, from: fromTemplateId }));
  await batch(stmts);
  return id;
}
export const updateTemplate = (id: string, d: { name?: string; description?: string | null; conditions?: string | null; archived?: number }) =>
  batch([updateStmt('price_templates', id, { ...d, updated_at: nowIso() }),
    ...(d.name ? [{ sql: 'UPDATE price_lists SET name=? WHERE template_id=?', params: [d.name, id] }] : [])]);

/** Statements copying a price list (items + promotions) into a new list owned by a template or by a session. */
export async function copyPriceListStmts(o: { fromTemplateId?: string; fromPriceListId?: string; toTemplateId?: string; name?: string }) {
  let srcId = o.fromPriceListId;
  let srcTpl: { id: string; name: string } | null = null;
  if (o.fromTemplateId) {
    srcTpl = await one<{ id: string; name: string }>('SELECT id, name FROM price_templates WHERE id=?', [o.fromTemplateId]);
    srcId = (await one<{ id: string }>('SELECT id FROM price_lists WHERE template_id=?', [o.fromTemplateId]))?.id;
  }
  if (!srcId) throw new Error('Grille tarifaire source introuvable');
  const src = await one<{ name: string; source_template_id: string | null; source_template_name: string | null }>('SELECT * FROM price_lists WHERE id=?', [srcId]);
  const id = uid(), now = nowIso();
  const stmts: Stmt[] = [insertStmt('price_lists', {
    id, template_id: o.toTemplateId ?? null,
    source_template_id: srcTpl?.id ?? src?.source_template_id ?? null,
    source_template_name: srcTpl?.name ?? src?.source_template_name ?? null,
    name: o.name ?? (srcTpl ? `${srcTpl.name} — version séance` : src?.name ?? 'Grille'), created_at: now, updated_at: now,
  })];
  for (const it of await sel<PriceListItem>('SELECT * FROM price_list_items WHERE price_list_id=?', [srcId]))
    stmts.push(insertStmt('price_list_items', { ...it, id: uid(), price_list_id: id }));
  for (const p of await sel<PromotionRow>('SELECT * FROM promotions WHERE price_list_id=?', [srcId]))
    stmts.push(insertStmt('promotions', { ...p, id: uid(), price_list_id: id }));
  return { id, stmts };
}

export const getPriceItems = (priceListId: string) =>
  sel<PriceListItem>('SELECT * FROM price_list_items WHERE price_list_id=?', [priceListId]);

/** Upserts a price (null price removes the row). */
export async function setPrice(priceListId: string, kind: 'variant' | 'style', refId: string, irisCount: number, price: number | null,
  mode: PriceListItem['pricing_mode'] = 'manual', param: number | null = null) {
  if (price == null) {
    await run('DELETE FROM price_list_items WHERE price_list_id=? AND kind=? AND ref_id=? AND iris_count=?', [priceListId, kind, refId, irisCount]);
  } else {
    if (price < 0) throw new Error('Un prix ne peut pas être négatif.');
    await run(
      `INSERT INTO price_list_items (id, price_list_id, kind, ref_id, iris_count, price_cents, pricing_mode, pricing_param)
       VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(price_list_id, kind, ref_id, iris_count)
       DO UPDATE SET price_cents=excluded.price_cents, pricing_mode=excluded.pricing_mode, pricing_param=excluded.pricing_param`,
      [uid(), priceListId, kind, refId, irisCount, price, mode, param]);
  }
  await run('UPDATE price_lists SET updated_at=? WHERE id=?', [nowIso(), priceListId]);
}

export const listPromotions = (priceListId: string) =>
  sel<PromotionRow>('SELECT * FROM promotions WHERE price_list_id=? ORDER BY priority, sort, name', [priceListId]);

export async function savePromotion(priceListId: string, p: Omit<Promotion, 'id'> & { id?: string; description?: string | null }) {
  const row = { name: p.name.trim(), description: p.description ?? null, type: p.type, config: JSON.stringify(p.config), priority: p.priority, stackable: p.stackable ? 1 : 0, active: p.active ? 1 : 0 };
  if (!row.name) throw new Error('Nom de la promotion obligatoire.');
  if (p.id) await batch([updateStmt('promotions', p.id, row)]);
  else await batch([insertStmt('promotions', { id: uid(), price_list_id: priceListId, ...row })]);
}
export const setPromotionActive = (id: string, active: boolean) => run('UPDATE promotions SET active=? WHERE id=?', [active ? 1 : 0, id]);
export const deletePromotion = (id: string) => run('DELETE FROM promotions WHERE id=?', [id]);

/** Sets the sale price of several variants to cost × coefficient in one transaction (mode « Coefficient »). */
export async function setPricesFromCoef(priceListId: string, rows: { variantId: string; cost: number }[], coef: number) {
  if (!(coef > 0)) throw new Error('Coefficient invalide.');
  if (!rows.length) throw new Error('Aucun format avec un coût de revient connu.');
  const stmts = rows.map((r) => ({
    sql: `INSERT INTO price_list_items (id, price_list_id, kind, ref_id, iris_count, price_cents, pricing_mode, pricing_param)
          VALUES (?,?,'variant',?,0,?,'coef',?) ON CONFLICT(price_list_id, kind, ref_id, iris_count)
          DO UPDATE SET price_cents=excluded.price_cents, pricing_mode='coef', pricing_param=excluded.pricing_param`,
    params: [uid(), priceListId, r.variantId, Math.max(0, Math.round(r.cost * coef)), coef],
  }));
  await batch([...stmts, { sql: 'UPDATE price_lists SET updated_at=? WHERE id=?', params: [nowIso(), priceListId] },
    auditStmt('price_list', priceListId, 'bulk_coef', { coef, variants: rows.length })]);
  return rows.length;
}

/** "1,07" → 1.07 ; "+7 %" / "7%" → 1.07 ; null if invalid. */
export function parseCoefInput(raw: string): number | null {
  const t = raw.trim().replace(',', '.').replace(/\s/g, '');
  const pct = /^\+?(-?\d+(?:\.\d+)?)%$/.exec(t);
  const n = pct ? 1 + Number(pct[1]) / 100 : Number(t.replace(/^[x×]/i, ''));
  return Number.isFinite(n) && n > 0 && t !== '' ? n : null;
}
