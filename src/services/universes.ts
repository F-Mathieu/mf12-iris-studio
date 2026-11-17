/**
 * Univers de séance (Iris, Back to school, Noël, Halloween, Fête des mères…).
 * Styles, produits et templates appartiennent à un univers ou sont communs (universe_id NULL).
 * Une séance a un univers : template proposé par défaut, catalogue filtré, textes de brochure / e-mails propres
 * (texte vide = texte des Paramètres).
 */
import { auditStmt, batch, getSetting, insertStmt, nowIso, one, sel, uid, updateStmt } from './base';
import type { Stmt } from '../lib/db/types';

export interface Universe {
  id: string; name: string; description: string | null; default_template_id: string | null;
  brochure_intro: string | null; offers_mail_body: string | null; recap_mail_body: string | null;
  archived: number; sort: number; created_at: string;
  default_template_name?: string | null; sessions_count?: number; styles_count?: number; products_count?: number;
}
export type UniverseText = 'brochure_intro' | 'offers_mail_body' | 'recap_mail_body';
export const IRIS_UNIVERSE = 'Iris';

export const listUniverses = (includeArchived = false) =>
  sel<Universe>(`SELECT u.*, t.name default_template_name,
     (SELECT count(*) FROM sessions s WHERE s.universe_id=u.id) sessions_count,
     (SELECT count(*) FROM composition_styles x WHERE x.universe_id=u.id AND x.archived=0) styles_count,
     (SELECT count(*) FROM products x WHERE x.universe_id=u.id AND x.archived=0) products_count
   FROM universes u LEFT JOIN price_templates t ON t.id=u.default_template_id
   ${includeArchived ? '' : 'WHERE u.archived=0'} ORDER BY u.archived, u.sort, u.name COLLATE NOCASE`);

export const getUniverse = (id: string) => one<Universe>('SELECT * FROM universes WHERE id=?', [id]);

export async function saveUniverse(u: Partial<Universe> & { name: string }): Promise<string> {
  const name = u.name.trim();
  if (!name) throw new Error('Nom de l’univers obligatoire.');
  const dup = await one<{ id: string }>('SELECT id FROM universes WHERE name=? COLLATE NOCASE AND id<>?', [name, u.id ?? '']);
  if (dup) throw new Error(`L’univers « ${name} » existe déjà.`);
  const txt = (v: string | null | undefined) => (v?.trim() ? v : null);
  const row = {
    name, description: txt(u.description), default_template_id: u.default_template_id || null,
    brochure_intro: txt(u.brochure_intro), offers_mail_body: txt(u.offers_mail_body), recap_mail_body: txt(u.recap_mail_body),
    archived: u.archived ?? 0,
  };
  if (u.id) { await batch([updateStmt('universes', u.id, row), auditStmt('universe', u.id, 'update', { name })]); return u.id; }
  const id = uid();
  const n = await one<{ n: number }>('SELECT COALESCE(max(sort),0)+1 n FROM universes');
  await batch([insertStmt('universes', { id, ...row, sort: n?.n ?? 0, created_at: nowIso() }), auditStmt('universe', id, 'create', { name })]);
  return id;
}

/** SQL filter « commun + cet univers » for a table alias (no filter when no universe). */
export const universeFilter = (alias: string, universeId?: string | null): { sql: string; params: string[] } =>
  universeId ? { sql: `(${alias}.universe_id IS NULL OR ${alias}.universe_id=?)`, params: [universeId] } : { sql: '1=1', params: [] };

/** Text of the session's universe, or the general setting when the universe has none. */
export async function universeText(sessionId: string | null | undefined, key: UniverseText): Promise<string> {
  if (sessionId) {
    const r = await one<Record<UniverseText, string | null>>(
      `SELECT u.${key} FROM sessions s JOIN universes u ON u.id=s.universe_id WHERE s.id=?`, [sessionId]);
    if (r?.[key]?.trim()) return r[key]!;
  }
  return getSetting(key);
}

/**
 * Data upgrade: the existing data become the « Iris » universe (sessions, templates, creation styles);
 * products (prints, files, options) stay common. Default template = the most used active template.
 */
export async function applyIrisUniverse(): Promise<boolean> {
  if ((await getSetting('universe_iris')) === '1') return false;
  const s: Stmt[] = [];
  let id = (await one<{ id: string }>('SELECT id FROM universes WHERE name=? COLLATE NOCASE', [IRIS_UNIVERSE]))?.id;
  if (!id) {
    id = uid();
    const tpl = await one<{ id: string }>(`SELECT t.id FROM price_templates t WHERE t.archived=0
      ORDER BY (SELECT count(*) FROM price_lists p WHERE p.source_template_id=t.id) DESC, t.created_at LIMIT 1`);
    s.push(insertStmt('universes', { id, name: IRIS_UNIVERSE, description: 'Créations à partir de photos d’iris', default_template_id: tpl?.id ?? null, sort: 0, created_at: nowIso() }));
  }
  for (const t of ['sessions', 'price_templates', 'composition_styles']) s.push({ sql: `UPDATE ${t} SET universe_id=? WHERE universe_id IS NULL`, params: [id] });
  s.push({ sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('universe_iris', '1')" });
  await batch(s);
  return true;
}
