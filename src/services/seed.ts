/** First-run configuration (no prices, no fake clients): initial styles, product catalogue, suppliers and an empty public template. */
import { batch, getSetting, insertStmt, nowIso, uid } from './base';
import type { Stmt } from '../lib/db/types';

export async function seedIfEmpty() {
  if ((await getSetting('seeded')) === '1') return false;
  const now = nowIso();
  const s: Stmt[] = [];
  const styles: [string, string, number, number][] = [
    ['Iris naturel', 'Un iris présenté seul, dans toute sa profondeur.', 1, 1],
    ['Collection', 'Plusieurs iris de la famille réunis côte à côte.', 2, 8],
    ['Fusion', 'Les iris se rejoignent en une seule création.', 2, 6],
    ['Anneau', 'Les iris disposés en anneau.', 1, 6],
    ['Explosion', 'Un iris entouré d’un effet d’éclat.', 1, 1],
  ];
  const styleIds: Record<string, string> = {};
  styles.forEach(([name, description, min, max], i) => {
    const id = uid(); styleIds[name] = id;
    s.push(insertStmt('composition_styles', { id, name, description, min_iris: min, max_iris: max, sort: i, created_at: now }));
  });
  const product = (category: string, name: string, style: string | null, variants: string[], i: number, needs = 1) => {
    const id = uid();
    s.push(insertStmt('products', { id, category, name, style_id: style ? styleIds[style] : null, needs_composition: needs, sort: i, created_at: now }));
    variants.forEach((v, n) => s.push(insertStmt('product_variants', { id: uid(), product_id: id, name: v, format: category === 'impression' ? v : null, sort: n })));
  };
  product('numerique', 'Iris individuel HD', 'Iris naturel', ['Fichier HD'], 1);
  product('numerique', 'Collection HD', 'Collection', ['Fichier HD'], 2);
  product('numerique', 'Fusion HD', 'Fusion', ['Fichier HD'], 3);
  product('numerique', 'Anneau HD', 'Anneau', ['Fichier HD'], 4);
  product('numerique', 'Explosion HD', 'Explosion', ['Fichier HD'], 5);
  product('numerique', 'Fichiers supplémentaires', null, ['Fichier HD'], 6, 0);
  // Supports d'impression iris : créés avec leurs formats et tarifs d'achat par applyOnelab2026() (services/onelab.ts).
  for (const [name, website] of [['Onelab Pro', 'https://www.onelab.pro'], ['Dreambooks Pro', 'https://www.dreambookspro.fr']])
    s.push(insertStmt('suppliers', { id: uid(), name, website, created_at: now }));
  const tpl = uid();
  s.push(insertStmt('price_templates', { id: tpl, name: 'Tarif public', description: 'Grille de référence — prix à compléter', created_at: now, updated_at: now }));
  s.push(insertStmt('price_lists', { id: uid(), template_id: tpl, name: 'Tarif public', created_at: now, updated_at: now }));
  for (const [k, v] of [['seeded', '1'], ['business_name', 'MF/1.2'], ['client_pin', '1212'], ['vat_recoverable', '0'], ['auto_backup', '1'], ['backup_keep', '20']])
    s.push({ sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', params: [k, v] });
  await batch(s);
  return true;
}
