import { auditStmt, batch, insertStmt, like, nowIso, one, sel, uid, updateStmt } from './base';
import { copyPriceListStmts } from './pricing';
import type { Stmt } from '../lib/db/types';

export type SessionStatus = 'preparation' | 'active' | 'terminee' | 'archivee';
export const SESSION_STATUS: Record<SessionStatus, string> = {
  preparation: 'En préparation', active: 'Active', terminee: 'Terminée', archivee: 'Archivée',
};
export interface Session {
  id: string; name: string; date: string | null; start_time: string | null; end_time: string | null;
  location: string | null; organizer: string | null; description: string | null; status: SessionStatus;
  price_list_id: string | null; slot_minutes: number; slot_capacity: number; created_at: string; updated_at: string;
}
export interface SessionRow extends Session {
  registrations: number; orders: number; sales_cents: number; price_list_name: string | null;
}

export async function listSessions(opts: { q?: string; status?: string; includeArchived?: boolean } = {}): Promise<SessionRow[]> {
  const w: string[] = [], p: string[] = [];
  if (opts.q?.trim()) { w.push('(s.name LIKE ? OR s.location LIKE ? OR s.organizer LIKE ?)'); p.push(like(opts.q), like(opts.q), like(opts.q)); }
  if (opts.status) { w.push('s.status=?'); p.push(opts.status); }
  else if (!opts.includeArchived) w.push("s.status<>'archivee'");
  return sel<SessionRow>(
    `SELECT s.*, pl.name price_list_name,
       (SELECT count(*) FROM session_registrations r WHERE r.session_id=s.id) registrations,
       (SELECT count(*) FROM orders o WHERE o.session_id=s.id AND o.status='validee') orders,
       COALESCE((SELECT sum(total_cents) FROM orders o WHERE o.session_id=s.id AND o.status='validee'),0) sales_cents
     FROM sessions s LEFT JOIN price_lists pl ON pl.id=s.price_list_id
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY COALESCE(s.date,'9999') DESC, s.created_at DESC`, p);
}

export const getSession = (id: string) =>
  one<Session & { price_list_name: string | null; source_template_id: string | null; source_template_name: string | null }>(
    `SELECT s.*, pl.name price_list_name, pl.source_template_id, pl.source_template_name FROM sessions s
     LEFT JOIN price_lists pl ON pl.id=s.price_list_id WHERE s.id=?`, [id]);

export type SessionInput = Partial<Omit<Session, 'id' | 'created_at' | 'updated_at' | 'price_list_id'>> & { name: string; template_id?: string | null };

export async function createSession(input: SessionInput): Promise<string> {
  if (!input.name?.trim()) throw new Error('Le nom de la séance est obligatoire.');
  const id = uid(), now = nowIso();
  const stmts: Stmt[] = [];
  let priceListId: string | null = null;
  if (input.template_id) {
    const c = await copyPriceListStmts({ fromTemplateId: input.template_id });
    priceListId = c.id; stmts.push(...c.stmts);
  }
  const { template_id: _t, ...rest } = input;
  stmts.push(insertStmt('sessions', {
    id, ...rest, name: input.name.trim(), status: input.status ?? 'preparation', price_list_id: priceListId,
    slot_minutes: input.slot_minutes ?? 20, slot_capacity: input.slot_capacity ?? 1, created_at: now, updated_at: now,
  }));
  stmts.push(auditStmt('session', id, 'create', { name: input.name }));
  await batch(stmts);
  return id;
}

const EDITABLE = ['name', 'date', 'start_time', 'end_time', 'location', 'organizer', 'description', 'status', 'slot_minutes', 'slot_capacity'] as const;
export async function updateSession(id: string, input: Partial<SessionInput>) {
  const rest = Object.fromEntries(EDITABLE.filter((k) => k in input).map((k) => [k, (input as Record<string, unknown>)[k] ?? null])) as Record<string, string | number | null>;
  if ('name' in rest && !String(rest.name ?? '').trim()) throw new Error('Le nom de la séance est obligatoire.');
  await batch([updateStmt('sessions', id, { ...rest, updated_at: nowIso() }), auditStmt('session', id, 'update', rest)]);
}

/** Applies a template: creates a NEW session-specific copy. Existing orders keep their own price snapshots. */
export async function applyTemplateToSession(sessionId: string, templateId: string) {
  const c = await copyPriceListStmts({ fromTemplateId: templateId });
  await batch([
    ...c.stmts,
    { sql: 'UPDATE sessions SET price_list_id=?, updated_at=? WHERE id=?', params: [c.id, nowIso(), sessionId] },
    auditStmt('session', sessionId, 'apply_template', { templateId, priceListId: c.id }),
  ]);
}

/** Duplicates the session settings and its own price list (not families nor orders). */
export async function duplicateSession(id: string): Promise<string> {
  const s = await getSession(id);
  if (!s) throw new Error('Séance introuvable');
  const nid = uid(), now = nowIso();
  const stmts: Stmt[] = [];
  let pl: string | null = null;
  if (s.price_list_id) { const c = await copyPriceListStmts({ fromPriceListId: s.price_list_id }); pl = c.id; stmts.push(...c.stmts); }
  stmts.push(insertStmt('sessions', {
    id: nid, name: `${s.name} (copie)`, date: s.date, start_time: s.start_time, end_time: s.end_time, location: s.location,
    organizer: s.organizer, description: s.description, status: 'preparation', price_list_id: pl,
    slot_minutes: s.slot_minutes, slot_capacity: s.slot_capacity, created_at: now, updated_at: now,
  }), auditStmt('session', nid, 'duplicate', { from: id }));
  await batch(stmts);
  return nid;
}

export async function deleteSession(id: string) {
  const o = await one<{ n: number }>("SELECT count(*) n FROM orders WHERE session_id=?", [id]);
  if (o && o.n > 0) throw new Error(`Cette séance contient ${o.n} commande(s). Archivez-la plutôt que de la supprimer.`);
  const s = await getSession(id);
  await batch([
    { sql: 'DELETE FROM sessions WHERE id=?', params: [id] },
    ...(s?.price_list_id ? [{ sql: 'DELETE FROM price_lists WHERE id=? AND template_id IS NULL', params: [s.price_list_id] }] : []),
    auditStmt('session', id, 'delete', { name: s?.name }),
  ]);
}
