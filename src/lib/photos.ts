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
export function parsePhotoNumbers(text: string): string[] {
  const out: string[] = [];
  const add = (n: string) => { if (!out.includes(n)) out.push(n); };
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

/** Photos still to choose on a line: a digital line needs one photo per unit, a print or other line one photo. */
export function photosMissing(line: { category: string; qty: number; photos?: string[] | null }): number {
  const have = line.photos?.length ?? 0;
  return Math.max(0, (line.category === 'numerique' ? line.qty : 1) - have);
}

/** Folder name ↔ family: case, accents and separators ignored. */
export const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
