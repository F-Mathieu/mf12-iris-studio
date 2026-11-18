/**
 * Storage of photo previews OUTSIDE the database (folder « apercus » next to it in the app data): the database and
 * its backups stay light; previews can be re-imported from the Lightroom export.
 * Tauri: app data folder ; browser preview: IndexedDB ; tests: memory.
 */
import { isTauri } from './db';

export interface PhotoStore {
  put(path: string, bytes: Uint8Array): Promise<void>;
  get(path: string): Promise<Uint8Array | null>;
  /** Removes a file or a whole folder (prefix). */
  remove(prefix: string): Promise<void>;
}

const ROOT = 'apercus';

const tauriStore: PhotoStore = {
  async put(path, bytes) {
    const fs = await import('@tauri-apps/plugin-fs');
    const full = `${ROOT}/${path}`;
    await fs.mkdir(full.slice(0, full.lastIndexOf('/')), { baseDir: fs.BaseDirectory.AppData, recursive: true });
    await fs.writeFile(full, bytes, { baseDir: fs.BaseDirectory.AppData });
  },
  async get(path) {
    const fs = await import('@tauri-apps/plugin-fs');
    try { return await fs.readFile(`${ROOT}/${path}`, { baseDir: fs.BaseDirectory.AppData }); } catch { return null; }
  },
  async remove(prefix) {
    const fs = await import('@tauri-apps/plugin-fs');
    const full = `${ROOT}/${prefix}`;
    if (await fs.exists(full, { baseDir: fs.BaseDirectory.AppData })) await fs.remove(full, { baseDir: fs.BaseDirectory.AppData, recursive: true });
  },
};

function idbStore(): PhotoStore {
  const open = () => new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('mf12-apercus', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void) => {
    const db = await open();
    return new Promise<T>((res, rej) => {
      const t = db.transaction('files', mode); const s = t.objectStore('files');
      const req = fn(s);
      t.oncomplete = () => res(req ? req.result : (undefined as T)); t.onerror = () => rej(t.error);
    });
  };
  return {
    put: (path, bytes) => tx('readwrite', (s) => { s.put(bytes, path); }).then(() => undefined),
    get: async (path) => ((await tx<Uint8Array | undefined>('readonly', (s) => s.get(path))) ?? null),
    remove: (prefix) => tx('readwrite', (s) => { s.delete(IDBKeyRange.bound(prefix, prefix + '￿')); }).then(() => undefined),
  };
}

export function memoryStore(): PhotoStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    put: async (p, b) => { files.set(p, b); },
    get: async (p) => files.get(p) ?? null,
    remove: async (prefix) => { for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k); },
  };
}

let store: PhotoStore | null = null;
export const setPhotoStore = (s: PhotoStore) => { store = s; };
export function photoStore(): PhotoStore {
  if (!store) store = isTauri() ? tauriStore : typeof indexedDB !== 'undefined' ? idbStore() : memoryStore();
  return store;
}

/** Display version (1600 px) and thumbnail (400 px) as JPEG bytes. Without a canvas (tests): the original bytes. */
export async function makePreviews(bytes: Uint8Array): Promise<{ preview: Uint8Array; thumb: Uint8Array; width: number | null; height: number | null }> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return { preview: bytes, thumb: bytes, width: null, height: null };
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    const out = async (max: number, q: number) => {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', q));
      return new Uint8Array(await blob.arrayBuffer());
    };
    return { preview: await out(1600, 0.82), thumb: await out(400, 0.75), width: bmp.width, height: bmp.height };
  } finally { bmp.close(); }
}
