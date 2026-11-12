// Test adapter: Node built-in SQLite (same SQL dialect as production).
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlValue, Stmt } from './types';

const norm = (p: SqlValue[] = []) => p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null));

export function createNodeDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON');
  return {
    async select<T>(sql: string, params?: SqlValue[]) {
      return db.prepare(sql).all(...(norm(params) as never[])) as T[];
    },
    async execute(sql, params) {
      const r = db.prepare(sql).run(...(norm(params) as never[]));
      return { changes: Number(r.changes), last_id: Number(r.lastInsertRowid) };
    },
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN');
      try {
        for (const s of stmts) {
          if (!s.params?.length) db.exec(s.sql);
          else db.prepare(s.sql).run(...(norm(s.params) as never[]));
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
