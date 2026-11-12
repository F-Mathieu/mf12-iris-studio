// Browser preview adapter (no Tauri): in-memory sql.js persisted to IndexedDB.
// Used only for `npm run dev` in a plain browser; the macOS app uses the native rusqlite layer.
import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { Db, SqlValue, Stmt } from './types';

const KEY = 'iris-studio-db';
const idb = (): Promise<IDBDatabase> =>
  new Promise((res, rej) => {
    const r = indexedDB.open('iris-studio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
async function load(): Promise<Uint8Array | null> {
  try {
    const d = await idb();
    return await new Promise((res) => {
      const g = d.transaction('kv').objectStore('kv').get(KEY);
      g.onsuccess = () => res(g.result ?? null);
      g.onerror = () => res(null);
    });
  } catch { return null; }
}
async function save(data: Uint8Array) {
  const d = await idb();
  d.transaction('kv', 'readwrite').objectStore('kv').put(data, KEY);
}

const norm = (p: SqlValue[] = []) => p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null));

export async function createSqlJsDb(): Promise<Db> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await load();
  const db: Database = saved ? new SQL.Database(saved) : new SQL.Database();
  db.run('PRAGMA foreign_keys=ON');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => save(db.export()), 300); };
  return {
    async select<T>(sql: string, params?: SqlValue[]) {
      const st = db.prepare(sql);
      st.bind(norm(params) as never);
      const rows: T[] = [];
      while (st.step()) rows.push(st.getAsObject() as T);
      st.free();
      return rows;
    },
    async execute(sql, params) {
      db.run(sql, norm(params) as never);
      const changes = db.getRowsModified();
      persist();
      return { changes, last_id: 0 };
    },
    async batch(stmts: Stmt[]) {
      db.run('BEGIN');
      try {
        for (const s of stmts) {
          if (!s.params?.length) db.exec(s.sql);
          else db.run(s.sql, norm(s.params) as never);
        }
        db.run('COMMIT');
      } catch (e) { db.run('ROLLBACK'); throw e; }
      persist();
    },
  };
}
