/** PDF des mariages : contrat d'engagement (+ CGV), fiche de renseignements à compléter, fiche du jour J remplie. */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { footer, GOLD, GREY, header, INK, lastY, out, tableStyle, type Brand } from './pdf';
import { eur } from './money';
import { fmtDate } from './format';
import { WEDDING_INFO } from './weddingTexts';

/** Characters missing from the PDF standard fonts. */
const safe = (t: string) => t.replace(/☐/g, '[  ]').replace(/[★☆]/g, '*').replace(/[  ]/g, ' ');

/** Flowing text with page breaks; « 1. Titre » / « Article 1 — … » lines are bold headings. */
function flow(doc: jsPDF, text: string, y: number, top = 40): number {
  const w = doc.internal.pageSize.getWidth() - 28, bottom = doc.internal.pageSize.getHeight() - 22;
  for (const raw of safe(text).split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { y += 2.5; continue; }
    const heading = /^(\d+\.\s|Article \d+|Formulaire de rétractation|Conditions générales)/.test(line);
    doc.setFont('helvetica', heading ? 'bold' : 'normal'); doc.setFontSize(heading ? 10 : 9); doc.setTextColor(...INK);
    const parts = doc.splitTextToSize(line, w) as string[];
    if (heading && y + 14 > bottom) { doc.addPage(); y = top; }
    for (const p of parts) {
      if (y > bottom) { doc.addPage(); y = top; }
      doc.text(p, 14, y); y += heading ? 5 : 4.2;
    }
    if (heading) y += 0.8;
  }
  return y;
}

export interface WeddingContractData {
  brand: Brand; seller: { name: string; siret: string; address: string };
  couple: string; email?: string | null; phone?: string | null; date: string | null; location: string | null; services: string;
  lines: { label: string; detail?: string; qty: number; unit: number; total: number }[]; total: number;
  schedule: { date: string; amount: number; label: string }[];
  contract: string; cgv: string; quoteNumber?: string | null;
}

export function weddingContractPdf(d: WeddingContractData): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  header(doc, d.brand, 'Contrat d’engagement', `Mariage ${d.couple}${d.date ? ' — ' + fmtDate(d.date) : ''}`);
  let y = 40;
  doc.setFontSize(9); doc.setTextColor(...GREY); doc.text('ENTRE', 14, y); doc.text('ET', 110, y);
  doc.setTextColor(...INK); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
  doc.text(safe(d.seller.name), 14, y + 5); doc.text(safe(d.couple), 110, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(doc.splitTextToSize(safe([`Entrepreneur individuel — SIRET ${d.seller.siret}`, d.seller.address].filter(Boolean).join('\n')), 85), 14, y + 10);
  doc.text(doc.splitTextToSize(safe(['les Mariés', d.email, d.phone].filter(Boolean).join('\n')), 85), 110, y + 10);
  y += 26;
  doc.setFillColor(248, 247, 244); doc.rect(14, y, doc.internal.pageSize.getWidth() - 28, 14, 'F');
  doc.setFontSize(9.5);
  doc.text(safe(`Mariage du ${d.date ? fmtDate(d.date) : '(date à préciser)'}${d.location ? ' — ' + d.location : ''}`), 18, y + 5.5);
  doc.text(safe(`Prestation : ${d.services}${d.quoteNumber ? ` — selon devis ${d.quoteNumber}` : ''}`), 18, y + 10.5);
  y += 20;
  autoTable(doc, { ...tableStyle, startY: y, head: [['Désignation', 'Qté', 'Prix unitaire', 'Total']],
    body: d.lines.map((l) => [safe(l.label + (l.detail ? `\n${l.detail}` : '')), String(l.qty), eur(l.unit), eur(l.total)]),
    foot: [[{ content: 'Total — TVA non applicable, art. 293 B du CGI', colSpan: 3, styles: { halign: 'right' } }, { content: eur(d.total), styles: { halign: 'right' } }]],
    footStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 14 }, 2: { halign: 'right', cellWidth: 34 }, 3: { halign: 'right', cellWidth: 28 } } });
  y = lastY(doc) + 6;
  if (d.schedule.length) {
    autoTable(doc, { ...tableStyle, startY: y, head: [['Échéancier', 'Date', 'Montant']], body: d.schedule.map((s) => [s.label, fmtDate(s.date), eur(s.amount)]),
      columnStyles: { 1: { cellWidth: 34 }, 2: { halign: 'right', cellWidth: 28 } } });
    y = lastY(doc) + 8;
  }
  y = flow(doc, d.contract, y);
  // signatures
  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 40; }
  y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text('Fait en deux exemplaires, à ........................................, le ......................', 14, y); y += 9;
  doc.setFont('helvetica', 'bold');
  doc.text('Le Prestataire', 14, y); doc.text('Les Mariés', 110, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text('« Lu et approuvé », signature', 14, y + 4.5); doc.text('« Lu et approuvé », signatures', 110, y + 4.5);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.3); doc.rect(14, y + 7, 80, 28); doc.rect(110, y + 7, 86, 28);
  // CGV
  doc.addPage();
  header(doc, d.brand, 'Conditions générales de vente', 'Prestations de mariage');
  flow(doc, d.cgv, 40);
  footer(doc, d.brand);
  return out(doc);
}

export interface WeddingSheetData {
  brand: Brand; couple: string; date: string | null; location: string | null; services: string; video: boolean;
  info: Record<string, string>; contact?: string | null;
}

/** blank = questionnaire to send (answers already known pre-filled, room to write); otherwise the filled day sheet. */
export function weddingSheetPdf(d: WeddingSheetData, blank: boolean): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  header(doc, d.brand, blank ? 'Fiche de renseignements' : 'Fiche du jour J', `Mariage ${d.couple}${d.date ? ' — ' + fmtDate(d.date) : ''}`);
  let y = 40;
  doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text(safe(`${d.services}${d.location ? ' · ' + d.location : ''}${d.contact ? ' · ' + d.contact : ''}`), 14, y);
  if (blank) { y += 5; doc.setTextColor(...GREY); doc.text('Merci de compléter cette fiche et de la renvoyer au plus tard un mois avant le mariage.', 14, y); }
  y += 4;
  for (const sec of WEDDING_INFO) {
    const fields = sec.fields.filter((f) => !f.video || d.video).filter((f) => blank || d.info[f.key]?.trim());
    if (!fields.length) continue;
    autoTable(doc, { ...tableStyle, startY: y + 3, head: [[sec.title, '']],
      body: fields.map((f) => [safe(f.label), safe(d.info[f.key] ?? '') + (blank && !d.info[f.key] ? (f.long ? '\n\n\n\n' : '\n\n') : '')]),
      columnStyles: { 0: { cellWidth: 70, textColor: GREY }, 1: { cellWidth: 'auto' } }, alternateRowStyles: { fillColor: [255, 255, 255] } });
    y = lastY(doc);
  }
  footer(doc, d.brand);
  return out(doc);
}
