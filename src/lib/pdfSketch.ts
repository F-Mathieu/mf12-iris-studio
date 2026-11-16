/** Iris layout sketches drawn in PDFs (same layouts as the app): numbered iris + names legend. */
import type { jsPDF } from 'jspdf';
import { arrangementFor, ORIENTATION_LABEL, type Orientation } from './formatsGuide';

const GOLD: [number, number, number] = [184, 155, 104];
const COLORS: [number, number, number][] = [[211, 155, 74], [111, 163, 196], [143, 174, 98], [176, 127, 184], [224, 149, 107], [138, 166, 214], [201, 178, 90], [111, 181, 163]];

export interface CompositionSketch {
  style: string; iris: number; orientation: Orientation | null;
  /** Names in the montage order (n° 1 = first). */
  names: string[];
  /** Frame (cm, width × height as printed) and the product it comes from. */
  format: [number, number]; formatLabel?: string | null;
}

/** Draws the frame and the iris inside a box (mm). Returns the drawn size. */
export function drawIrisSketch(doc: jsPDF, x: number, y: number, boxW: number, boxH: number, n: number, fw: number, fh: number, orientation: Orientation | null, numbered = false) {
  const sc = Math.min(boxW / fw, boxH / fh);
  const sw = fw * sc, sh = fh * sc, sx = x + (boxW - sw) / 2, sy = y + (boxH - sh) / 2;
  doc.setFillColor(16, 22, 31); doc.setDrawColor(...GOLD); doc.setLineWidth(0.5); doc.rect(sx, sy, sw, sh, 'FD');
  arrangementFor(Math.max(1, n), fw, fh, orientation).circles.forEach((c, k) => {
    const cx = sx + c.x * sc, cy = sy + c.y * sc, r = c.r * sc;
    doc.setFillColor(...COLORS[k % COLORS.length]); doc.circle(cx, cy, r, 'F');
    doc.setFillColor(11, 11, 12); doc.circle(cx, cy, r * (numbered ? 0.46 : 0.34), 'F');
    if (numbered) {
      const mm = Math.max(1.6, r * 0.62);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(mm * 2.835); doc.setTextColor(255, 255, 255);
      doc.text(String(k + 1), cx, cy + mm * 0.36, { align: 'center' });
    }
  });
  return { w: sw, h: sh };
}

/** « Vos créations — disposition et ordre des iris »: one block per creation. Returns the new y. */
export function sketchesBlock(doc: jsPDF, y: number, list: CompositionSketch[], opts: { left?: number; width?: number; bottom?: number; ink?: [number, number, number]; grey?: [number, number, number] } = {}) {
  if (!list.length) return y;
  const L = opts.left ?? 14, Wd = opts.width ?? 182, H = doc.internal.pageSize.getHeight(), bottom = opts.bottom ?? 24;
  const ink = opts.ink ?? [20, 20, 22], grey = opts.grey ?? [110, 110, 115];
  const boxW = 52, boxH = 34;
  if (y + 8 + boxH > H - bottom) { doc.addPage(); y = 24; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...ink);
  doc.text('Vos créations — disposition et ordre des iris', L, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.6); doc.line(L, y + 1.8, L + 20, y + 1.8);
  y += 6;
  for (const s of list) {
    const legend = doc.splitTextToSize(s.names.map((nm, i) => `${i + 1}  ${nm}`).join('    '), Wd - boxW - 8) as string[];
    const h = Math.max(boxH, 14 + legend.length * 4.4) + 4;
    if (y + h > H - bottom) { doc.addPage(); y = 24; }
    doc.setFillColor(248, 247, 244); doc.roundedRect(L, y, Wd, h - 2, 2, 2, 'F');
    drawIrisSketch(doc, L + 3, y + 2, boxW - 6, boxH - 6, s.iris, s.format[0], s.format[1], s.iris > 1 ? s.orientation : null, true);
    const tx = L + boxW + 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...ink);
    doc.text(`${s.style} — ${s.iris} iris`, tx, y + 6.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(...grey);
    const info = [s.iris > 1 && s.orientation ? `Disposition : ${ORIENTATION_LABEL[s.orientation].toLowerCase()}` : '', s.formatLabel ? `Format : ${s.formatLabel}` : 'Format indicatif'].filter(Boolean).join('   ·   ');
    doc.text(info, tx, y + 11.5, { maxWidth: Wd - boxW - 6 });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); doc.setTextColor(...ink);
    doc.text(legend, tx, y + 18);
    y += h;
  }
  doc.setFont('helvetica', 'normal');
  return y + 2;
}
