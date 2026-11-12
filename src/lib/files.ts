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
  const r = await open({ multiple: false, filters: [{ name: 'Sauvegarde Iris Studio', extensions: ['db', 'sqlite'] }] });
  return typeof r === 'string' ? r : null;
}

export const CSV_FILTER: Filter[] = [{ name: 'CSV', extensions: ['csv', 'txt'] }];
export const PDF_FILTER: Filter[] = [{ name: 'PDF', extensions: ['pdf'] }];
export const IMAGE_FILTER: Filter[] = [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }];
