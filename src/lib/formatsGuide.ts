/**
 * Formats recommended by number of iris (guide « MF12 Guide formats iris avec croquis », TEMPSDANSES).
 * Dimensions in cm, landscape (width ≥ height); a portrait print is the same format rotated.
 * 3 iris: the guide says 40 × 30 cm, which Onelab does not produce → nearest standard 45 × 30 cm.
 */
export interface FormatAdvice {
  iris: number;
  format: [number, number];
  shape: 'Carré' | 'Horizontal';
  layout: string; // client-facing sentence
  alt?: [number, number];
  altText?: string;
  highlight?: string;
  note?: string; // internal / adaptation note
}

export const FORMAT_GUIDE: FormatAdvice[] = [
  { iris: 1, format: [20, 20], shape: 'Carré', layout: 'Iris unique, centré et bien visible.', altText: 'Une présentation simple qui met en valeur les textures.' },
  { iris: 2, format: [30, 20], shape: 'Horizontal', layout: 'Deux iris côte à côte, avec une belle respiration.', alt: [20, 20], altText: 'Alternative : 20 × 20 cm carré.' },
  { iris: 3, format: [45, 30], shape: 'Horizontal', layout: 'Trois iris alignés pour une lecture naturelle.', alt: [30, 30], altText: 'Alternative : 30 × 30 cm, en triangle.', note: 'Le guide indique 40 × 30 cm, format non proposé par Onelab : 45 × 30 cm est le plus proche.' },
  { iris: 4, format: [40, 40], shape: 'Carré', layout: 'Quatre iris en disposition équilibrée 2 × 2.', alt: [30, 30], altText: 'Format vedette famille ; alternative : 30 × 30 cm.', highlight: 'Format conseillé pour une famille de 4' },
  { iris: 5, format: [50, 40], shape: 'Horizontal', layout: 'Composition en 3 + 2, bien répartie.', alt: [40, 40], altText: 'Alternative : 40 × 40 cm carré.' },
  { iris: 6, format: [60, 40], shape: 'Horizontal', layout: 'Six iris en 3 × 2 pour préserver les détails.', alt: [40, 40], altText: 'Alternative : 40 × 40 cm carré.' },
];

export const adviceFor = (iris: number | null | undefined) => FORMAT_GUIDE.find((g) => g.iris === iris) ?? null;

/** "40 × 50 cm", "40x50", "50 x 40 cm" → [50, 40] (landscape order). */
export function parseDims(s: string | null | undefined): [number, number] | null {
  const m = (s ?? '').match(/(\d+(?:[.,]\d+)?)\s*[x×X*]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const a = Number(m[1].replace(',', '.')), b = Number(m[2].replace(',', '.'));
  return a >= b ? [a, b] : [b, a];
}
export const sameDims = (a: [number, number] | null, b: [number, number] | null | undefined) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
export const dimsLabel = (d: [number, number]) => `${d[0]} × ${d[1]} cm`;

/**
 * Best arrangement of n circles in a w × h frame: rows of balanced counts maximising the circle size.
 * Returns circles centres/radius in the frame's units.
 */
export function arrangement(n: number, w: number, h: number, margin = 0.08) {
  const iw = w * (1 - margin), ih = h * (1 - margin);
  let best = { rows: [n], d: 0 };
  for (let r = 1; r <= n; r++) {
    const base = Math.floor(n / r), extra = n % r;
    const rows = Array.from({ length: r }, (_, i) => base + (i < extra ? 1 : 0)).filter((x) => x > 0);
    const cols = Math.max(...rows);
    const d = Math.min(iw / cols, ih / rows.length);
    if (d > best.d + 1e-9) best = { rows, d };
  }
  const { rows, d } = best;
  const circles: { x: number; y: number; r: number }[] = [];
  const top = (h - rows.length * d) / 2;
  rows.forEach((count, ri) => {
    const left = (w - count * d) / 2;
    for (let c = 0; c < count; c++) circles.push({ x: left + d * (c + 0.5), y: top + d * (ri + 0.5), r: (d / 2) * 0.96 });
  });
  return { rows, circles };
}

export type Orientation = 'horizontal' | 'vertical' | 'diagonale';
export const ORIENTATION_LABEL: Record<Orientation, string> = { horizontal: 'Horizontale', vertical: 'Verticale', diagonale: 'Diagonale' };

/** Circles for a given disposition: vertical = horizontal layout turned 90°, diagonal = iris along the diagonal. */
export function arrangementFor(n: number, w: number, h: number, orientation?: Orientation | null) {
  if (orientation === 'vertical') {
    const t = arrangement(n, h, w);
    return { rows: t.rows, circles: t.circles.map((c) => ({ x: c.y, y: c.x, r: c.r })) };
  }
  if (orientation === 'diagonale' && n > 1) {
    const m = Math.min(w, h) * 0.06;
    const r = Math.min(Math.min(w, h) / 2 - m, Math.hypot(w - 2 * m, h - 2 * m) / (n + 0.4) / 2 * 1.15);
    const x0 = m + r, y0 = m + r, x1 = w - m - r, y1 = h - m - r;
    const circles = Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, r };
    });
    return { rows: [n], circles };
  }
  return arrangement(n, w, h);
}
