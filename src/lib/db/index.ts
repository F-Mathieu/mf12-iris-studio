import type { Db } from './types';
import { migrate } from './migrations';

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let current: Db | null = null;
export function setDb(db: Db) { current = db; }
export function db(): Db {
  if (!current) throw new Error('Base de données non initialisée');
  return current;
}

export async function initDb(): Promise<Db> {
  let d: Db;
  if (isTauri()) d = (await import('./tauri')).tauriDb;
  else d = await (await import('./sqljs')).createSqlJsDb();
  await migrate(d);
  setDb(d);
  return d;
}
export type { Db } from './types';
