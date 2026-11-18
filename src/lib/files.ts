import { isTauri } from './db';

type Filter = { name: string; extensions: string[] };

/** Saves bytes/text to a user-chosen file. Returns the path (or name in browser), null if cancelled. */
export async function saveFile(defaultName: string, data: Uint8Array | string, filters: Filter[] = []): Promise<string | null> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: defaultName, filters });
    if (!path) return null;
    await writeFile(path, bytes);
    return path;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const a = Object.assign(document.createElement('a'), { href: url, download: defaultName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return defaultName;
}

export interface PickedFile { name: string; path?: string; bytes: Uint8Array }

/** Opens one or several files. */
export async function pickFiles(filters: Filter[] = [], multiple = false): Promise<PickedFile[]> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const r = await open({ multiple, filters });
    if (!r) return [];
    const paths = Array.isArray(r) ? r : [r];
    return Promise.all(paths.map(async (p) => ({ name: p.split(/[\\/]/).pop() ?? p, path: p, bytes: await readFile(p) })));
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', multiple, accept: filters.flatMap((f) => f.extensions.map((e) => '.' + e)).join(',') });
    input.onchange = async () => resolve(await Promise.all([...(input.files ?? [])].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    input.click();
  });
}

export async function pickBackupFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ multiple: false, filters: [{ name: 'Sauvegarde MF/1.2 Studio', extensions: ['db', 'sqlite'] }] });
  return typeof r === 'string' ? r : null;
}

export const CSV_FILTER: Filter[] = [{ name: 'CSV', extensions: ['csv', 'txt'] }];
export const PDF_FILTER: Filter[] = [{ name: 'PDF', extensions: ['pdf'] }];
export const IMAGE_FILTER: Filter[] = [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }];

export interface FolderFile { name: string; read: () => Promise<Uint8Array> }
/**
 * Session folder exported from Lightroom, one sub-folder per family: returns the sub-folders and their image files
 * (read lazily, one at a time). Files directly in the folder are grouped under ''.
 */
export async function pickPhotoFolder(exts: string[]): Promise<Map<string, FolderFile[]> | null> {
  const ok = (n: string) => exts.includes(n.split('.').pop()?.toLowerCase() ?? '');
  const out = new Map<string, FolderFile[]>();
  const push = (folder: string, f: FolderFile) => { if (!out.has(folder)) out.set(folder, []); out.get(folder)!.push(f); };
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');
    const root = await open({ directory: true, multiple: false });
    if (typeof root !== 'string') return null;
    for (const e of await fs.readDir(root)) {
      const p = `${root}/${e.name}`;
      if (e.isDirectory) { for (const f of await fs.readDir(p)) if (f.isFile && ok(f.name)) push(e.name, { name: f.name, read: () => fs.readFile(`${p}/${f.name}`) }); }
      else if (e.isFile && ok(e.name)) push('', { name: e.name, read: () => fs.readFile(p) });
    }
    return out;
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', multiple: true }) as HTMLInputElement & { webkitdirectory: boolean };
    input.webkitdirectory = true;
    input.onchange = () => {
      for (const f of [...(input.files ?? [])]) {
        if (!ok(f.name)) continue;
        const parts = (f.webkitRelativePath || f.name).split('/');
        push(parts.length > 2 ? parts[1] : '', { name: f.name, read: async () => new Uint8Array(await f.arrayBuffer()) });
      }
      resolve(out);
    };
    input.click();
  });
}
