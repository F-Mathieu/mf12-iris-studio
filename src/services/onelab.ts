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

async function ensureProductWithFormats(s: Stmt[], name: string, category: 'impression' | 'option', sort: number, aliases: string[] = [], description?: string, formats: readonly string[] = ONELAB_FORMATS): Promise<string> {
  const now = nowIso();
  const products = await sel<{ id: string; name: string }>('SELECT id, name FROM products WHERE category=? AND archived=0', [category]);
  const existing = products.find((p) => p.name === name) ?? products.find((p) => aliases.includes(p.name));
  const productId = existing?.id ?? uid();
  if (existing) s.push({ sql: 'UPDATE products SET name=?, sort=? WHERE id=?', params: [name, sort, productId] });
  else s.push(insertStmt('products', { id: productId, category, name, description: description ?? null, needs_composition: 1, sort, created_at: now }));
  const variants = await sel<{ id: string; name: string }>('SELECT id, name FROM product_variants WHERE product_id=?', [productId]);
  formats.forEach((f, i) => {
    const label = variantLabel(f);
    const v = variants.find((x) => x.name === label);
    if (v) s.push({ sql: 'UPDATE product_variants SET format=?, sort=? WHERE id=?', params: [label, i, v.id] });
    else s.push(insertStmt('product_variants', { id: uid(), product_id: productId, name: label, format: category === 'impression' ? label : null, sort: i }));
  });
  return productId;
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

/** Paper prints (Fujifilm DPII Lustre) — Onelab « Petits formats » and « Grands formats » (≤ 50 cm wide). */
export const PAPER_SMALL = ['7x10', '9x13', '10x10', '10x15', '13x13', '13x18', '15x15', '15x20', '15x22', '18x24', '20x20', '20x25'] as const;
export const PAPER_LARGE = ['20x30', '25x25', '25x30', '25x38', '30x30', '30x45', '30x60', '40x40', '40x50', '40x60', '40x80', '50x50', '50x60', '50x75', '50x100'] as const;
/** Flybox 5 frame formats that match a paper print format. */
export const FRAME_FORMATS = ['20x20', '20x30', '25x25', '30x30', '30x45', '30x60', '40x40', '40x50', '40x60', '40x80', '50x50', '50x60', '50x75', '50x100'] as const;
export const PAPER_SMALL_NAME = 'Tirage photo petit format', PAPER_LARGE_NAME = 'Tirage photo grand format', FRAME_NAME = 'Cadre Flybox 5 + acrylique anti-reflet';

/** Settings `print_frame`: frame option offered under a print line of the listed products (same format). */
export interface PrintFrameConfig { frame: string; prints: string[] }
export const parsePrintFrame = (v: string | null | undefined): PrintFrameConfig | null => { try { const c = v ? JSON.parse(v) : null; return c?.frame && Array.isArray(c.prints) ? c : null; } catch { return null; } };

export async function applyOnelabPaper(): Promise<boolean> {
  if ((await getSetting('onelab_paper')) === '1' || (await getSetting('seeded')) !== '1') return false;
  const s: Stmt[] = [];
  const desc = PAPER_DESC;
  const small = await ensureProductWithFormats(s, PAPER_SMALL_NAME, 'impression', 20, [], desc, PAPER_SMALL);
  const large = await ensureProductWithFormats(s, PAPER_LARGE_NAME, 'impression', 21, [], desc, PAPER_LARGE);
  const frame = await ensureProductWithFormats(s, FRAME_NAME, 'option', 41, [], 'Cadre Flybox 5 avec protection acrylique anti-reflet, au format du tirage.', FRAME_FORMATS);
  s.push({ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('print_frame', ?)", params: [JSON.stringify({ frame, prints: [small, large] } satisfies PrintFrameConfig)] });
  s.push({ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('onelab_paper', '1')" });
  await batch(s);
  return true;
}

const PAPER_DESC = 'Tirage sur papier photo Fujifilm DPII Lustre.';
/** 1.1.3 shipped a client-facing description naming the supplier: replaced (only if unchanged by the user). */
export async function fixPaperDescription(): Promise<boolean> {
  if ((await getSetting('paper_desc_v2')) === '1') return false;
  await batch([
    { sql: "UPDATE products SET description=? WHERE description='Tirage papier Fujifilm DPII Lustre (Onelab Pro).'", params: [PAPER_DESC] },
    { sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('paper_desc_v2', '1')" },
  ]);
  return true;
}

/** Data upgrades run at every start after migrations + seed (each one is idempotent). */
export async function applyDataUpgrades() {
  await applyOnelab2026();
  await applyOnelabFramesG6();
  await applyOnelabPaper();
  await fixPaperDescription();
}
