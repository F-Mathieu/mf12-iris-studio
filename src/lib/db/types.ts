export type SqlValue = string | number | null | boolean;
export interface Stmt { sql: string; params?: SqlValue[] }
export interface ExecResult { changes: number; last_id: number }

/** Unique abstraction used by every service: Tauri (rusqlite), sql.js (browser preview) or node:sqlite (tests). */
export interface Db {
  select<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  execute(sql: string, params?: SqlValue[]): Promise<ExecResult>;
  /** Atomic: all statements in one transaction, rollback on error. */
  batch(stmts: Stmt[]): Promise<void>;
}
