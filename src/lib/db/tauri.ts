import { invoke } from '@tauri-apps/api/core';
import type { Db, ExecResult, SqlValue, Stmt } from './types';

const norm = (p: SqlValue[] = []) => p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null));

export const tauriDb: Db = {
  select: (sql, params) => invoke('db_select', { sql, params: norm(params) }),
  execute: (sql, params) => invoke<ExecResult>('db_execute', { sql, params: norm(params) }),
  batch: async (stmts: Stmt[]) => {
    await invoke('db_batch', { stmts: stmts.map((s) => ({ sql: s.sql, params: norm(s.params) })) });
  },
};
