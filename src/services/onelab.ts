/**
 * Data upgrades (outside the schema), run at every start after migrations + seed; each one is idempotent
 * and protected by a flag in `settings`.
 *
 * Catalogue structure only: print supports and formats. Purchase prices are NEVER stored in the code:
 * they are entered or imported (CSV) in Fournisseurs and stay in the local database.
 */
import { batch, getSetting, insertStmt, nowIso, one, sel, uid } from './base';
import type { Stmt } from '../lib/db/types';

/** Standard formats offered for prints (cm, landscape notation). */
export const ONELAB_FORMATS = ['20x20', '20x30', '30x30', '30x45', '40x40', '40x50', '40x60', '50x50', '50x60', '50x75', '60x60', '60x90'] as const;
export const variantLabel = (f: string) => f.replace('x', ' × ') + ' cm';

/** Print supports offered for iris (renames older names, keeps ids so history is preserved). */
const PRINT_SUPPORTS: { product: string; aliases: string[] }[] = [
  { product: 'Acrylique 3 mm', aliases: ['Acrylique'] },
  { product: 'Acrylique 5 mm', aliases: [] },
  { product: 'Alu Dibond', aliases: ['Dibond aluminium'] },
  { product: 'HD Metal Print', aliases: ['HD Metal Print 5 mm'] },
];

async function ensureProductWithFormats(s: Stmt[], name: string, category: 'impression' | 'option', sort: number, aliases: string[] = [], description?: string) {
  const now = nowIso();
  const products = await sel<{ id: string; name: string }>('SELECT id, name FROM products WHERE category=? AND archived=0', [category]);
  const existing = products.find((p) => p.name === name) ?? products.find((p) => aliases.includes(p.name));
  const productId = existing?.id ?? uid();
  if (existing) s.push({ sql: 'UPDATE products SET name=?, sort=? WHERE id=?', params: [name, sort, productId] });
  else s.push(insertStmt('products', { id: productId, category, name, description: description ?? null, needs_composition: 1, sort, created_at: now }));
  const variants = await sel<{ id: string; name: string }>('SELECT id, name FROM product_variants WHERE product_id=?', [productId]);
  ONELAB_FORMATS.forEach((f, i) => {
    const label = variantLabel(f);
    const v = variants.find((x) => x.name === label);
    if (v) s.push({ sql: 'UPDATE product_variants SET format=?, sort=? WHERE id=?', params: [label, i, v.id] });
    else s.push(insertStmt('product_variants', { id: uid(), product_id: productId, name: label, format: category === 'impression' ? label : null, sort: i }));
  });
}

/** Print supports (Acrylique 3/5 mm, Alu Dibond, HD Metal Print) in the 12 standard formats. */
export async function applyOnelab2026(): Promise<boolean> {
  if ((await getSetting('onelab_2026')) === '1' || (await getSetting('seeded')) !== '1') return false;
  const s: Stmt[] = [];
  if (!(await one("SELECT id FROM suppliers WHERE name='Onelab Pro'")))
    s.push(insertStmt('suppliers', { id: uid(), name: 'Onelab Pro', website: 'https://www.onelab.pro', created_at: nowIso() }));
  for (const [i, sup] of PRINT_SUPPORTS.entries()) await ensureProductWithFormats(s, sup.product, 'impression', 10 + i, sup.aliases);
  s.push({ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('onelab_2026', '1')" });
  await batch(s);
  return true;
}

/** Frame option (« Cadre gamme 6 »), sold per format, attached to a creation. */
export async function applyOnelabFramesG6(): Promise<boolean> {
  if ((await getSetting('onelab_frames_g6')) === '1' || (await getSetting('seeded')) !== '1') return false;
  const s: Stmt[] = [];
  await ensureProductWithFormats(s, 'Cadre gamme 6', 'option', 40, [], 'Encadrement — moulure au choix : Royal 5, Fusion ou Retro (à préciser dans les souhaits du montage).');
  s.push({ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('onelab_frames_g6', '1')" });
  await batch(s);
  return true;
}

/** Data upgrades run at every start after migrations + seed (each one is idempotent). */
export async function applyDataUpgrades() {
  await applyOnelab2026();
  await applyOnelabFramesG6();
}
