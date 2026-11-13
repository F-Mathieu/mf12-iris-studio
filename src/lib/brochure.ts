/**
 * Client brochure (« Brochure des offres ») — illustrated, given to families after the session.
 * Sale prices only: never costs, suppliers or margins.
 */
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { eur } from './money';
import { fmtDate } from './format';
import { FORMAT_GUIDE, arrangementFor, dimsLabel } from './formatsGuide';
import { GOLD, GREY, INK, footer, header, lastY, out, tableStyle, type Brand } from './pdf';

export interface BrochureData {
  brand: Brand; session: string; date: string; forName?: string | null; intro?: string | null; conditions?: string | null;
  /** Cover photo, already cropped to 210:165. */
  cover?: string | null;
  /** Images already cropped square. */
  styles: { name: string; description: string | null; minIris: number; maxIris: number; hero?: string | null; thumbs: string[]; prices: { label: string; price: number }[] }[];
  products: { category: string; name: string; description: string | null; image?: string | null; variants: { name: string; price: number; framed?: number | null }[] }[];
  frameName?: string | null;
  promotions: { name: string; description: string | null }[];
}

const W = 210, H = 297, M = 14;
const IRIS_COLORS: [number, number, number][] = [[211, 155, 74], [111, 163, 196], [143, 174, 98], [176, 127, 184], [224, 149, 107], [138, 166, 214]];
const img = (doc: jsPDF, data: string | null | undefined, x: number, y: number, w: number, h: number) => {
  if (!data) return false;
  try { doc.addImage(data, 'JPEG', x, y, w, h, undefined, 'FAST'); return true; } catch { return false; }
};
const text = (doc: jsPDF, size: number, color: [number, number, number], style: 'normal' | 'bold' | 'italic' = 'normal') => {
  doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
};
function title(doc: jsPDF, y: number, t: string, sub?: string) {
  text(doc, 17, INK, 'bold'); doc.text(t, M, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(M, y + 2.5, M + 22, y + 2.5);
  if (sub) { text(doc, 9.5, GREY); doc.text(doc.splitTextToSize(sub, W - 2 * M), M, y + 9); return y + 18; }
  return y + 11;
}
function newPage(doc: jsPDF, brand: Brand, t: string, sub?: string) { doc.addPage(); header(doc, brand, t, sub); return 44; }

function cover(doc: jsPDF, d: BrochureData) {
  doc.setFillColor(...INK); doc.rect(0, 0, W, H, 'F');
  const hasImg = img(doc, d.cover, 0, 0, W, 165);
  let y = hasImg ? 188 : 90;
  text(doc, 32, GOLD, 'bold'); doc.text(d.brand.name || 'MF/1.2', M + 4, y);
  text(doc, 9, [200, 200, 200]); doc.text((d.brand.tagline || 'Iris Studio').toUpperCase(), M + 4, y + 8, { charSpace: 1.6 });
  y += 26;
  text(doc, 24, [255, 255, 255], 'bold'); doc.text('Vos créations iris', M + 4, y);
  text(doc, 12, [200, 200, 200]); doc.text('Montages, supports, formats et tarifs', M + 4, y + 8);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(M + 4, y + 14, M + 34, y + 14);
  text(doc, 10, [225, 225, 225]);
  doc.text([`Séance : ${d.session}`, ...(d.forName ? [`Préparé pour : ${d.forName}`] : []), fmtDate(d.date, { day: 'numeric', month: 'long', year: 'numeric' })], M + 4, y + 23, { lineHeightFactor: 1.5 });
  const contact = [d.brand.contact, d.brand.phone, d.brand.email, d.brand.website].filter(Boolean).join('   ·   ');
  if (contact) { text(doc, 8.5, [160, 160, 160]); doc.text(contact, M + 4, H - 12); }
}

function journey(doc: jsPDF, d: BrochureData) {
  let y = newPage(doc, d.brand, 'Comment ça se passe ?', d.session);
  y = title(doc, y, 'Votre création, étape par étape', d.intro || 'Merci pour votre confiance ! Cette brochure réunit toutes les créations, supports et formats proposés, pour choisir tranquillement à la maison.');
  const steps = [
    ['La séance', 'Vos iris sont photographiés en très haute définition, un par un.'],
    ['La création', 'Choisissez un montage et les iris à réunir : seul, en duo, en famille…'],
    ['Le support', 'Fichier numérique et/ou impression, au format adapté au nombre d’iris.'],
    ['La réalisation', 'Votre création est réalisée à partir de vos propres iris, puis livrée.'],
  ];
  const cw = (W - 2 * M - 3 * 5) / 4;
  steps.forEach(([t, s], i) => {
    const x = M + i * (cw + 5);
    doc.setFillColor(248, 247, 244); doc.roundedRect(x, y, cw, 52, 2.5, 2.5, 'F');
    doc.setFillColor(...GOLD); doc.circle(x + 9, y + 10, 5, 'F');
    text(doc, 11, [255, 255, 255], 'bold'); doc.text(String(i + 1), x + 9, y + 11.6, { align: 'center' });
    text(doc, 10.5, INK, 'bold'); doc.text(t, x + 5, y + 23);
    text(doc, 8.6, GREY); doc.text(doc.splitTextToSize(s, cw - 9), x + 5, y + 29);
  });
  y += 64;
  y = title(doc, y, 'Bon à savoir');
  const notes = [
    'Chaque création (le montage de vos iris) est facturée une seule fois, quel que soit le nombre de produits choisis ensuite.',
    'Pour chaque création, choisissez le fichier numérique et/ou une ou plusieurs impressions, dans le format de votre choix.',
    'Les visuels de cette brochure sont des exemples de réalisations : votre création sera réalisée à partir de vos propres iris.',
    ...(d.promotions.length ? ['Des packs et offres sont détaillés en fin de brochure.'] : []),
    'Prix en euros, TVA non applicable, art. 293 B du CGI.',
  ];
  text(doc, 9.5, INK);
  for (const n of notes) { const t = doc.splitTextToSize(n, W - 2 * M - 8); doc.setFillColor(...GOLD); doc.circle(M + 1.5, y - 1.2, 0.9, 'F'); doc.text(t, M + 6, y); y += t.length * 4.6 + 2.5; }
  // illustration strip: one image per creation
  const strip = d.styles.map((s) => s.hero).filter(Boolean).slice(0, 4) as string[];
  if (strip.length && y < 200) {
    const sz = Math.min(42, (W - 2 * M - (strip.length - 1) * 4) / strip.length);
    const yy = Math.max(y + 6, 210);
    strip.forEach((s, i) => img(doc, s, M + i * (sz + 4), yy, sz, sz));
  }
}

function styles(doc: jsPDF, d: BrochureData) {
  const list = d.styles.filter((s) => s.prices.length);
  if (!list.length) return;
  let y = newPage(doc, d.brand, 'Les créations', d.session);
  y = title(doc, y, 'Les créations', 'Chaque montage réunit vos iris dans une composition unique. Le prix dépend du nombre d’iris réunis.');
  for (const s of list) {
    const blockH = 104;
    if (y + blockH > H - 20) { y = newPage(doc, d.brand, 'Les créations', d.session); }
    const hasImg = !!s.hero;
    const hero = 72, tx = hasImg ? M + hero + 8 : M, tw = W - M - tx;
    if (hasImg) {
      img(doc, s.hero, M, y, hero, hero);
      const th = (hero - 2 * 3) / 3;
      s.thumbs.slice(0, 3).forEach((t, i) => img(doc, t, M + i * (th + 3), y + hero + 3, th, th));
    }
    text(doc, 18, INK, 'bold'); doc.text(s.name, tx, y + 7);
    text(doc, 9, GOLD, 'bold'); doc.text(s.minIris === s.maxIris ? `${s.minIris} iris` : `De ${s.minIris} à ${s.maxIris} iris`, tx, y + 13);
    let yy = y + 20;
    if (s.description) { text(doc, 9.3, [60, 60, 64]); const t = doc.splitTextToSize(s.description, tw); doc.text(t.slice(0, 9), tx, yy); yy += Math.min(9, t.length) * 4.3 + 4; }
    text(doc, 9.5, INK);
    for (const p of s.prices.slice(0, 12)) {
      doc.text(p.label, tx, yy);
      doc.setFont('helvetica', 'bold'); doc.text(eur(p.price), W - M, yy, { align: 'right' }); doc.setFont('helvetica', 'normal');
      doc.setDrawColor(215, 212, 205); doc.setLineWidth(0.15); doc.setLineDashPattern([0.6, 0.9], 0);
      doc.line(tx + doc.getTextWidth(p.label) + 2, yy - 0.6, W - M - doc.getTextWidth(eur(p.price)) - 2, yy - 0.6);
      doc.setLineDashPattern([], 0);
      yy += 6;
    }
    y = Math.max(y + (hasImg ? hero + 3 + (hero - 6) / 3 : 0), yy) + 10;
  }
}

function formats(doc: jsPDF, d: BrochureData) {
  let y = newPage(doc, d.brand, 'Choisir son format', d.session);
  y = title(doc, y, 'Quel format pour combien d’iris ?', 'Nos conseils pour que chaque iris garde tous ses détails. Schémas indicatifs : proportions et disposition.');
  const cw = (W - 2 * M - 2 * 6) / 3, ch = 78;
  FORMAT_GUIDE.forEach((g, i) => {
    const x = M + (i % 3) * (cw + 6), yy = y + Math.floor(i / 3) * (ch + 6);
    doc.setFillColor(248, 247, 244); doc.roundedRect(x, yy, cw, ch, 2.5, 2.5, 'F');
    // sketch
    const [fw, fh] = g.format, box = cw - 16, sc = Math.min(box / fw, 34 / fh);
    const sw = fw * sc, sh = fh * sc, sx = x + (cw - sw) / 2, sy = yy + 6 + (34 - sh) / 2;
    doc.setFillColor(16, 22, 31); doc.setDrawColor(...GOLD); doc.setLineWidth(0.5); doc.rect(sx, sy, sw, sh, 'FD');
    arrangementFor(g.iris, fw, fh).circles.forEach((c, k) => {
      doc.setFillColor(...IRIS_COLORS[k % IRIS_COLORS.length]); doc.circle(sx + c.x * sc, sy + c.y * sc, c.r * sc, 'F');
      doc.setFillColor(11, 11, 12); doc.circle(sx + c.x * sc, sy + c.y * sc, c.r * sc * 0.34, 'F');
    });
    text(doc, 8.5, GOLD, 'bold'); doc.text(`${g.iris} IRIS`, x + 5, yy + 49);
    text(doc, 12, INK, 'bold'); doc.text(dimsLabel(g.format), x + 5, yy + 55.5);
    text(doc, 8.3, GREY); doc.text(doc.splitTextToSize(`${g.layout}${g.altText ? ' ' + g.altText : ''}`, cw - 10).slice(0, 4), x + 5, yy + 61);
  });
  y += 2 * (ch + 6) + 4;
  text(doc, 8.5, GREY); doc.text('Pour une composition verticale, le même format est simplement tourné. Disposition au choix : horizontale, verticale ou en diagonale.', M, y, { maxWidth: W - 2 * M });
}

const CAT_TITLE: Record<string, [string, string]> = {
  numerique: ['Fichiers numériques', 'Votre création en haute définition, à imprimer ou partager.'],
  impression: ['Impressions & supports', 'Tirages et supports d’exception, au format de votre choix.'],
  option: ['Options', 'Pour personnaliser votre création.'],
};
function products(doc: jsPDF, d: BrochureData) {
  for (const cat of ['numerique', 'impression', 'option']) {
    const prods = d.products.filter((p) => p.category === cat && p.variants.length);
    if (!prods.length) continue;
    let y = newPage(doc, d.brand, CAT_TITLE[cat][0], d.session);
    y = title(doc, y, CAT_TITLE[cat][0], CAT_TITLE[cat][1]);
    for (const p of prods) {
      const framed = p.variants.some((v) => v.framed != null);
      const asList = !framed && p.variants.length <= 3; // few prices: dotted lines instead of a table
      const IMG = 24, tx = p.image ? M + IMG + 7 : M, tw = W - M - tx;
      text(doc, 8.8, GREY);
      const desc = p.description ? (doc.splitTextToSize(p.description, tw) as string[]).slice(0, 4) : [];
      // whole block height, so a product is never split between two pages
      const h = Math.max(p.image ? IMG : 0, 7 + desc.length * 4 + (framed ? 5 : 0) + (asList ? p.variants.length * 6 : 9 + Math.ceil(p.variants.length / (p.variants.length > 6 ? 2 : 1)) * 6.2)) + 9;
      if (y + Math.min(h, H - 64) > H - 22) y = newPage(doc, d.brand, CAT_TITLE[cat][0], d.session);
      const top = y, page = doc.getCurrentPageInfo().pageNumber;
      img(doc, p.image, M, top, IMG, IMG);
      text(doc, 12.5, INK, 'bold'); doc.text(p.name, tx, top + 5);
      let yy = top + 10.5;
      if (desc.length) { text(doc, 8.8, GREY); doc.text(desc, tx, yy); yy += desc.length * 4; }
      if (framed) { text(doc, 8.6, GOLD, 'bold'); doc.text(`Encadrement possible : ${d.frameName ?? 'cadre'} (prix « avec cadre » = tirage + cadre).`, tx, yy, { maxWidth: tw }); yy += 5; }
      if (asList) {
        yy += 2;
        for (const v of p.variants) {
          text(doc, 9.5, INK); doc.text(v.name, tx, yy);
          doc.setFont('helvetica', 'bold'); doc.text(eur(v.price), W - M, yy, { align: 'right' });
          doc.setDrawColor(215, 212, 205); doc.setLineWidth(0.15); doc.setLineDashPattern([0.6, 0.9], 0);
          doc.line(tx + doc.getTextWidth(v.name) + 2, yy - 0.6, W - M - doc.getTextWidth(eur(v.price)) - 2, yy - 0.6);
          doc.setLineDashPattern([], 0);
          yy += 6;
        }
        y = Math.max(yy, p.image ? top + IMG : 0) + 8;
      } else {
        const head = framed ? [['Format', 'Tirage seul', 'Avec cadre']] : [['Format', 'Prix']];
        const rowOf = (v: (typeof p.variants)[number]): RowInput => (framed ? [v.name, eur(v.price), v.framed != null ? eur(v.framed) : '—'] : [v.name, eur(v.price)]);
        // long lists: two tables side by side (half the height)
        const half = p.variants.length > 6 ? Math.ceil(p.variants.length / 2) : p.variants.length;
        const parts = [p.variants.slice(0, half), p.variants.slice(half)].filter((x) => x.length);
        const gap = 6, colW = parts.length > 1 ? (tw - gap) / 2 : tw;
        let end = 0, endPage = page;
        parts.forEach((part, k) => {
          if (k > 0) doc.setPage(page);
          const left = tx + k * (colW + gap);
          autoTable(doc, { ...tableStyle, startY: yy + 1, head, body: part.map(rowOf), margin: { ...tableStyle.margin, left, right: W - left - colW, top: 40 },
            styles: { ...tableStyle.styles, fontSize: 8.8, cellPadding: 1.7 },
            columnStyles: framed ? { 1: { halign: 'right', cellWidth: parts.length > 1 ? 22 : 32 }, 2: { halign: 'right', cellWidth: parts.length > 1 ? 22 : 32, fontStyle: 'bold' } } : { 1: { halign: 'right', cellWidth: parts.length > 1 ? 26 : 36 } } });
          const pg = doc.getCurrentPageInfo().pageNumber; // page where this table ended
          if (pg > endPage || (pg === endPage && lastY(doc) > end)) { end = pg > endPage ? lastY(doc) : Math.max(end, lastY(doc)); endPage = pg; }
        });
        doc.setPage(endPage);
        (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY = end;
        y = (endPage === page ? Math.max(lastY(doc), p.image ? top + IMG : 0) : lastY(doc)) + 10;
      }
    }
  }
}

function packs(doc: jsPDF, d: BrochureData) {
  let y = newPage(doc, d.brand, 'Offres & informations', d.session);
  if (d.promotions.length) {
    y = title(doc, y, 'Packs & offres');
    for (const p of d.promotions) {
      const t = p.description ? doc.splitTextToSize(p.description, W - 2 * M - 12) : [];
      const h = 11 + t.length * 4.2;
      if (y + h > H - 60) { y = newPage(doc, d.brand, 'Offres & informations', d.session); }
      doc.setFillColor(248, 247, 244); doc.rect(M, y, W - 2 * M, h, 'F'); doc.setFillColor(...GOLD); doc.rect(M, y, 1.4, h, 'F');
      text(doc, 10.5, INK, 'bold'); doc.text(p.name, M + 6, y + 6.5);
      if (t.length) { text(doc, 8.8, GREY); doc.text(t, M + 6, y + 11.5); }
      y += h + 4;
    }
    y += 10;
  }
  if (d.conditions) {
    y = title(doc, y, 'Conditions');
    text(doc, 8.8, [60, 60, 64]); const t = doc.splitTextToSize(d.conditions, W - 2 * M); doc.text(t, M, y); y += t.length * 4.2 + 8;
  }
  if (y > H - 70) y = newPage(doc, d.brand, 'Offres & informations', d.session);
  y = title(doc, y, 'Pour commander');
  doc.setFillColor(...INK); doc.roundedRect(M, y, W - 2 * M, 34, 3, 3, 'F');
  text(doc, 11, GOLD, 'bold'); doc.text(d.brand.name || 'MF/1.2', M + 7, y + 9);
  text(doc, 9.5, [235, 235, 235]);
  const contact = [d.brand.contact, d.brand.phone, d.brand.email, d.brand.website].filter(Boolean).join('   ·   ');
  doc.text(contact ? ['Répondez simplement à l’e-mail ou contactez-moi :', contact] : ['Répondez simplement à l’e-mail qui accompagne cette brochure', 'pour valider ou ajuster votre sélection.'], M + 7, y + 16, { lineHeightFactor: 1.6 });
  text(doc, 7.8, GREY); doc.text('Prix en euros, TVA non applicable, art. 293 B du CGI. Visuels non contractuels : exemples de réalisations.', M, y + 42, { maxWidth: W - 2 * M });
}

export function brochurePdf(d: BrochureData): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  cover(doc, d);
  journey(doc, d);
  styles(doc, d);
  formats(doc, d);
  products(doc, d);
  packs(doc, d);
  // footer on every page but the cover
  footer(doc, d.brand);
  doc.setPage(1); doc.setFillColor(...INK); doc.rect(0, H - 16, W, 16, 'F');
  const contact = [d.brand.contact, d.brand.phone, d.brand.email, d.brand.website].filter(Boolean).join('   ·   ');
  if (contact) { text(doc, 8.5, [160, 160, 160]); doc.text(contact, M + 4, H - 12); }
  return out(doc);
}
