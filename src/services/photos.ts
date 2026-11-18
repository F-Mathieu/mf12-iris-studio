/**
 * Photos de séance : aperçus importés depuis l'export Lightroom (un dossier par famille, n° = nom du fichier),
 * stockés hors base (photoStore), favoris (dans l'app ou CSV Pic-Time), suppression des aperçus sans toucher aux commandes.
 */
import { auditStmt, batch, nowIso, one, run, sel, uid } from './base';
import { makePreviews, photoStore } from '../lib/photoStore';
import { lightroomText, normName, parsePhotoNumbers, photoNumber } from '../lib/photos';

export interface SessionPhoto { id: string; session_id: string; registration_id: string; number: string; file_name: string | null; width: number | null; height: number | null; rating: number }
export const PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp'];

const dir = (sessionId: string, registrationId?: string) => `${sessionId}/${registrationId ? registrationId + '/' : ''}`;
const filePath = (p: Pick<SessionPhoto, 'session_id' | 'registration_id' | 'number'>, thumb: boolean) => `${dir(p.session_id, p.registration_id)}${p.number}${thumb ? '_t' : ''}.jpg`;

export const listPhotos = (registrationId: string) =>
  sel<SessionPhoto>('SELECT * FROM session_photos WHERE registration_id=? ORDER BY CAST(number AS INTEGER), number', [registrationId]);

/** Photo count / rated photos (≥ 1 star) per registration of a session. */
export const photoCounts = (sessionId: string) =>
  sel<{ registration_id: string; n: number; fav: number }>('SELECT registration_id, count(*) n, sum(rating > 0) fav FROM session_photos WHERE session_id=? GROUP BY registration_id', [sessionId]);

/** Sessions where this family has a registration (current first), with their photo count: photos of another session can go on a line. */
export const familyPhotoSessions = (familyId: string) =>
  sel<{ registration_id: string; session_id: string; session_name: string; date: string | null; n: number }>(
    `SELECT r.id registration_id, s.id session_id, s.name session_name, s.date, (SELECT count(*) FROM session_photos p WHERE p.registration_id=r.id) n
     FROM session_registrations r JOIN sessions s ON s.id=r.session_id WHERE r.family_id=? ORDER BY COALESCE(s.date, s.created_at) DESC`, [familyId]);

/**
 * Imports the exported files of one family (re-importing a number replaces its preview, rating kept).
 * Files without a number in their name are skipped.
 */
export interface PhotoFile { name: string; bytes?: Uint8Array; read?: () => Promise<Uint8Array> }
export async function importPhotos(sessionId: string, registrationId: string, files: PhotoFile[],
  onProgress?: (done: number, total: number) => void): Promise<{ imported: number; skipped: string[] }> {
  const skipped: string[] = [];
  let imported = 0;
  for (const [i, f] of files.entries()) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const number = PHOTO_EXT.includes(ext) ? photoNumber(f.name) : null;
    if (!number) { skipped.push(f.name); continue; }
    const p = await makePreviews(f.bytes ?? (await f.read!()));
    const row = { session_id: sessionId, registration_id: registrationId, number };
    await photoStore().put(filePath(row, false), p.preview);
    await photoStore().put(filePath(row, true), p.thumb);
    await run(`INSERT INTO session_photos (id, session_id, registration_id, number, file_name, width, height, size, created_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(registration_id, number) DO UPDATE SET file_name=excluded.file_name, width=excluded.width, height=excluded.height, size=excluded.size`,
      [uid(), sessionId, registrationId, number, f.name, p.width, p.height, p.preview.length + p.thumb.length, nowIso()]);
    imported++;
    onProgress?.(i + 1, files.length);
  }
  return { imported, skipped };
}

/**
 * Session folder with one sub-folder per family: matches each sub-folder to a registration by family name
 * (or « Prénom Nom », or external reference). Returns the matches and the folders left unmatched.
 */
export function matchFolders(folders: string[], regs: { id: string; family_name: string; contact_first_name: string | null; external_ref: string | null }[]) {
  const matched: { folder: string; registrationId: string }[] = [], unmatched: string[] = [];
  for (const f of folders) {
    const n = normName(f);
    const exact = regs.find((x) => [x.family_name, `${x.contact_first_name ?? ''} ${x.family_name}`, `${x.family_name} ${x.contact_first_name ?? ''}`, x.external_ref ?? '']
      .some((c) => c.trim() && normName(c) === n));
    // otherwise: the folder name contains the family name (only if a single family matches)
    const loose = regs.filter((x) => normName(x.family_name) && ` ${n} `.includes(` ${normName(x.family_name)} `));
    const r = exact ?? (loose.length === 1 ? loose[0] : undefined);
    if (r) matched.push({ folder: f, registrationId: r.id }); else unmatched.push(f);
  }
  return { matched, unmatched };
}

/** Disk space of the previews (preview + thumbnail of each photo), per session, largest first. */
export const previewsUsage = () =>
  sel<{ session_id: string; session_name: string; date: string | null; status: string; photos: number; bytes: number }>(
    `SELECT s.id session_id, s.name session_name, s.date, s.status, count(*) photos, COALESCE(sum(p.size),0) bytes
     FROM session_photos p JOIN sessions s ON s.id=p.session_id GROUP BY s.id ORDER BY bytes DESC`);

/** Rating 0 (none) to 5 stars, as in Lightroom. */
/** Lightroom list for photos of a family in a session (numbers of an order line, or photos rated ≥ minRating). */
export async function lightroomList(familyId: string, sessionId: string, numbers?: string[] | null, minRating = 1): Promise<string> {
  const reg = await one<{ id: string }>('SELECT id FROM session_registrations WHERE family_id=? AND session_id=?', [familyId, sessionId]);
  const photos = reg ? await listPhotos(reg.id) : [];
  const list = numbers ? numbers.map((n) => photos.find((p) => p.number === n) ?? { number: n, file_name: null }) : photos.filter((p) => p.rating >= minRating);
  return lightroomText(list);
}

export const setRating = (id: string, stars: number) => run('UPDATE session_photos SET rating=? WHERE id=?', [Math.max(0, Math.min(5, Math.round(stars))), id]);

/**
 * Favorites from a Pic-Time CSV (or any list of file names / numbers): the listed photos get at least `stars` stars
 * (ratings given in the app are kept if higher). Returns the numbers not found.
 */
export async function importFavorites(registrationId: string, text: string, stars = 1): Promise<{ marked: number; unknown: string[] }> {
  const nums = parsePhotoNumbers(text);
  const known = new Set((await listPhotos(registrationId)).map((p) => p.number));
  const ok = nums.filter((n) => known.has(n)), r = Math.max(1, Math.min(5, stars));
  await batch(ok.map((n) => ({ sql: 'UPDATE session_photos SET rating=max(rating, ?) WHERE registration_id=? AND number=?', params: [r, registrationId, n] })));
  return { marked: ok.length, unknown: nums.filter((n) => !known.has(n)) };
}

const urls = new Map<string, string>();
/** Object URL of a preview or thumbnail (cached). null if the file is missing. */
export async function photoUrl(p: SessionPhoto, thumb = true): Promise<string | null> {
  const key = filePath(p, thumb);
  if (urls.has(key)) return urls.get(key)!;
  const bytes = await photoStore().get(key);
  if (!bytes) return null;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
  urls.set(key, url);
  return url;
}
const forget = (prefix: string) => { for (const [k, u] of urls) if (k.startsWith(prefix)) { URL.revokeObjectURL(u); urls.delete(k); } };

export async function deletePhoto(id: string) {
  const p = await one<SessionPhoto>('SELECT * FROM session_photos WHERE id=?', [id]);
  if (!p) return;
  await run('DELETE FROM session_photos WHERE id=?', [id]);
  for (const t of [false, true]) { const k = filePath(p, t); await photoStore().remove(k); forget(k); }
}

/** Removes the previews of a whole session or of one family. Orders keep their photo numbers (text). */
export async function deletePreviews(sessionId: string, registrationId?: string) {
  const n = (await one<{ n: number }>(`SELECT count(*) n FROM session_photos WHERE session_id=? ${registrationId ? 'AND registration_id=?' : ''}`, registrationId ? [sessionId, registrationId] : [sessionId]))?.n ?? 0;
  await batch([
    { sql: `DELETE FROM session_photos WHERE session_id=? ${registrationId ? 'AND registration_id=?' : ''}`, params: registrationId ? [sessionId, registrationId] : [sessionId] },
    auditStmt('session', sessionId, 'delete_previews', { registrationId: registrationId ?? null, count: n }),
  ]);
  await photoStore().remove(dir(sessionId, registrationId));
  forget(dir(sessionId, registrationId));
  return n;
}

/** Files left by a deleted registration / session (rows already removed by cascade). */
export const removeFiles = (sessionId: string, registrationId?: string) => photoStore().remove(dir(sessionId, registrationId)).then(() => forget(dir(sessionId, registrationId)));
