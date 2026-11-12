import { db } from '../lib/db';
import type { SqlValue, Stmt } from '../lib/db/types';
import { nowIso, uid } from '../lib/ids';

export const sel = <T>(sql: string, p?: SqlValue[]) => db().select<T>(sql, p);
export const one = async <T>(sql: string, p?: SqlValue[]) => (await db().select<T>(sql, p))[0] ?? null;
export const run = (sql: string, p?: SqlValue[]) => db().execute(sql, p);
export const batch = (s: Stmt[]) => db().batch(s);

export const auditStmt = (entity: string, entityId: string, action: string, details?: unknown): Stmt => ({
  sql: 'INSERT INTO audit_logs (id, entity, entity_id, action, details, created_at) VALUES (?,?,?,?,?,?)',
  params: [uid(), entity, entityId, action, details == null ? null : JSON.stringify(details), nowIso()],
});

/** Builds an INSERT statement from an object (undefined values skipped). */
export function insertStmt(table: string, row: Record<string, SqlValue | undefined>): Stmt {
  const keys = Object.keys(row).filter((k) => row[k] !== undefined);
  return { sql: `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, params: keys.map((k) => row[k] as SqlValue) };
}
export function updateStmt(table: string, id: string, row: Record<string, SqlValue | undefined>): Stmt {
  const keys = Object.keys(row).filter((k) => row[k] !== undefined && k !== 'id');
  return { sql: `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, params: [...keys.map((k) => row[k] as SqlValue), id] };
}

export async function getSetting(key: string, def = ''): Promise<string> {
  const r = await one<{ value: string }>('SELECT value FROM settings WHERE key=?', [key]);
  return r?.value ?? def;
}
export const setSetting = (key: string, value: string) =>
  run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await sel<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** LIKE pattern helper (case-insensitive by default for ASCII in SQLite). */
export const like = (s: string) => `%${s.trim().replace(/[%_]/g, '')}%`;
export { uid, nowIso };
