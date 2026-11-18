/** Photo numbers: the number is the file name exported from Lightroom (001.jpg, Martin-012.jpg…). Stored without leading zeros. */

/** Number of a photo from its file name (last group of digits before the extension), or null. */
export function photoNumber(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop()!.replace(/\.[a-z0-9]+$/i, '');
  const m = base.match(/(\d+)(?!.*\d)/);
  return m ? String(Number(m[1])) : null;
}

/** Display: 3 digits minimum (12 → 012). */
export const fmtPhoto = (n: string) => (/^\d+$/.test(n) ? n.padStart(3, '0') : n);

/**
 * Numbers typed or pasted (from Lightroom: file names separated by commas, spaces or lines; ranges 12-15).
 * Returns unique numbers in their order of appearance.
 */
export function parsePhotoNumbers(text: string, unique = true): string[] {
  const out: string[] = [];
  const add = (n: string) => { if (!unique || !out.includes(n)) out.push(n); };
  for (const raw of text.split(/[,;\n\r\t]+|\s+/)) {
    const t = raw.trim();
    if (!t) continue;
    const range = t.match(/^(\d+)\s*[-–à]\s*(\d+)$/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      if (b >= a && b - a <= 500) for (let i = a; i <= b; i++) add(String(i));
      continue;
    }
    const n = photoNumber(t);
    if (n) add(n);
  }
  return out;
}

/** Photos to choose on a line: qty × photos per unit of the product (null = no photo, 0 = all the photos). */
export const photosNeeded = (line: { qty: number; photosPerUnit?: number | null }) => (line.photosPerUnit ? line.qty * line.photosPerUnit : 0);
export const photosMissing = (line: { qty: number; photosPerUnit?: number | null; photos?: string[] | null }) => Math.max(0, photosNeeded(line) - (line.photos?.length ?? 0));

/** Text for documents: « Photos 002, 015 » + « 3 à choisir » / « toutes les photos » (empty if the line has no photos). */
export function photosText(line: { qty: number; photosPerUnit?: number | null; photos?: string[] | null }): string {
  if (line.photosPerUnit == null) return '';
  if (line.photosPerUnit === 0) return 'toutes les photos';
  const m = photosMissing(line);
  return [line.photos?.length ? `photos ${line.photos.map(fmtPhoto).join(', ')}` : '', m ? `${m} à choisir` : ''].filter(Boolean).join(' · ');
}

/** Folder name ↔ family: case, accents and separators ignored. */
export const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
