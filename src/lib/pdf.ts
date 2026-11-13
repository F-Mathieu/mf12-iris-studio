/** Local PDF generation (jsPDF). Client documents NEVER include costs, suppliers or margins. */
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { eur } from './money';
import { fmtDate } from './format';
import type { InvoiceData } from '../services/invoices';

export const GOLD: [number, number, number] = [184, 155, 104];
export const INK: [number, number, number] = [20, 20, 22];
export const GREY: [number, number, number] = [110, 110, 115];

export interface Brand { name: string; tagline?: string; contact?: string; email?: string; phone?: string; website?: string; address?: string }

export function header(doc: jsPDF, brand: Brand, title: string, subtitle?: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INK);
  doc.rect(0, 0, w, 30, 'F');
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(brand.name || 'MF/1.2', 14, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 200, 200);
  doc.text((brand.tagline || 'IRIS STUDIO').toUpperCase(), 14, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(title, w - 14, 15, { align: 'right' });
  if (subtitle) { doc.setFontSize(8.5); doc.setTextColor(200, 200, 200); doc.text(subtitle, w - 14, 22, { align: 'right' }); }
  doc.setTextColor(...INK);
}

export function footer(doc: jsPDF, brand: Brand) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  const contact = [brand.contact, brand.phone, brand.email, brand.website].filter(Boolean).join('  ·  ');
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.3); doc.line(14, h - 14, w - 14, h - 14);
    doc.setFontSize(7.5); doc.setTextColor(...GREY);
    if (contact) doc.text(contact, 14, h - 9);
    doc.text(`${i} / ${n}`, w - 14, h - 9, { align: 'right' });
  }
}

export const tableStyle = {
  styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.4, textColor: INK, lineColor: [225, 225, 228] as [number, number, number], lineWidth: 0.1 },
  headStyles: { fillColor: [38, 38, 42] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: [248, 247, 244] as [number, number, number] },
  margin: { left: 14, right: 14, top: 36, bottom: 20 },
};
export const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
export const out = (doc: jsPDF) => new Uint8Array(doc.output('arraybuffer'));

function section(doc: jsPDF, y: number, text: string) {
  if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 40; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(text, 14, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.6); doc.line(14, y + 1.8, 34, y + 1.8);
  doc.setFont('helvetica', 'normal');
  return y + 6;
}

/* ------------------------------------------------------------ client recap */
export interface RecapData {
  brand: Brand; number: string; date: string; status: string; session: string; family: string; contact?: string | null;
  /** Draft = « Votre sélection » (proposal, no payment block). */
  draft?: boolean;
  compositions: { style: string; iris: number; participants: string; fee: number; image?: string | null; orientation?: string | null; instructions?: string | null; items: { name: string; qty: number; unit: number }[] }[];
  looseItems: { name: string; qty: number; unit: number }[];
  subtotal: number; discounts: { label: string; amount: number }[]; total: number; paid: number; paymentStatus: string;
  payments: { date: string; method: string; amount: number }[]; dueDate?: string | null; notes?: string | null;
  instalments?: { n: number; date: string; amount: number; paid: boolean }[];
}
export function clientRecapPdf(d: RecapData): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  header(doc, d.brand, d.draft ? 'Votre sélection' : 'Récapitulatif de commande', `N° ${d.number} — ${fmtDate(d.date)}`);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold'); doc.text(d.family, 14, 42);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY);
  doc.text([d.contact ? `Contact : ${d.contact}` : '', `Séance : ${d.session}`, d.draft ? 'Proposition — non contractuelle' : `Statut : ${d.status}`].filter(Boolean), 14, 48);
  doc.setTextColor(...INK);
  // creations chosen, illustrated with the style's example
  let startY = 64;
  const pics = d.compositions.filter((c) => c.image).slice(0, 5);
  if (pics.length) {
    const sz = 30;
    pics.forEach((c, i) => {
      const x = 14 + i * (sz + 6);
      try { doc.addImage(c.image!, 'JPEG', x, 62, sz, sz, undefined, 'FAST'); } catch { /* skip */ }
      doc.setFontSize(7.8); doc.setFont('helvetica', 'bold'); doc.text(doc.splitTextToSize(`${c.style} · ${c.iris} iris`, sz + 4)[0], x, 96);
      doc.setFont('helvetica', 'normal');
    });
    doc.setFontSize(7); doc.setTextColor(...GREY); doc.text('Visuels d’exemple : votre création sera réalisée avec vos propres iris.', 14, 101); doc.setTextColor(...INK);
    startY = 106;
  }
  const body: RowInput[] = [];
  for (const c of d.compositions) {
    body.push([{ content: `Création ${c.style} — ${c.iris} iris${c.participants ? ` (${c.participants})` : ''}`, styles: { fontStyle: 'bold' } }, '1', eur(c.fee), eur(c.fee)]);
    const extra = [c.orientation ? `Disposition : ${c.orientation}` : '', c.instructions ? `Souhaits : ${c.instructions}` : ''].filter(Boolean).join('\n');
    if (extra) body.push([{ content: extra, colSpan: 4, styles: { fontStyle: 'italic', textColor: GREY, fontSize: 8.5 } }]);
    for (const i of c.items) body.push([`    ${i.name}`, String(i.qty), eur(i.unit), eur(i.unit * i.qty)]);
  }
  for (const i of d.looseItems) body.push([i.name, String(i.qty), eur(i.unit), eur(i.unit * i.qty)]);
  autoTable(doc, { ...tableStyle, startY, head: [['Désignation', 'Qté', 'Prix unitaire', 'Total']], body,
    columnStyles: { 1: { halign: 'center', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 30 } } });
  const tot: RowInput[] = [['Sous-total', eur(d.subtotal)], ...d.discounts.map((x) => [x.label, `- ${eur(x.amount)}`]),
    [{ content: 'Total', styles: { fontStyle: 'bold', fontSize: 11 } }, { content: eur(d.total), styles: { fontStyle: 'bold', fontSize: 11 } }],
    ...(d.draft ? [] : [['Déjà réglé', eur(d.paid)], [{ content: 'Solde restant', styles: { fontStyle: 'bold' } }, { content: eur(d.total - d.paid), styles: { fontStyle: 'bold' } }]] as RowInput[])];
  autoTable(doc, { ...tableStyle, startY: lastY(doc) + 4, body: tot, theme: 'plain', margin: { left: 110, right: 14 }, columnStyles: { 1: { halign: 'right' } } });
  let y = lastY(doc) + 8;
  doc.setFontSize(9.5);
  if (d.draft) {
    doc.setTextColor(...GREY);
    doc.text(doc.splitTextToSize('Récapitulatif de votre sélection, à titre indicatif : la commande est confirmée à sa validation. Toutes les créations, supports et formats proposés sont présentés dans la brochure des offres.', 182), 14, y);
    doc.setTextColor(...INK); y += 10;
  } else
  doc.text(`Règlement : ${d.paymentStatus}${d.dueDate ? ` — échéance prévue le ${fmtDate(d.dueDate)}` : ''}`, 14, y);
  if (d.payments.length) { y += 5; doc.setTextColor(...GREY); doc.text(d.payments.map((p) => `${fmtDate(p.date)} · ${p.method} · ${eur(p.amount)}`), 14, y); y += d.payments.length * 4.2; doc.setTextColor(...INK); }
  if (d.instalments?.length) {
    y += 7; doc.setFont('helvetica', 'bold'); doc.text(`Paiement en ${d.instalments.length} fois`, 14, y); doc.setFont('helvetica', 'normal');
    d.instalments.forEach((x) => { y += 4.6; doc.text(`${x.n}. ${fmtDate(x.date)} : ${eur(x.amount)}${x.paid ? ' (réglé)' : ''}`, 18, y); });
  }
  if (d.notes) { y += 6; doc.setFontSize(8.5); doc.text(doc.splitTextToSize(`Notes : ${d.notes}`, 180), 14, y); }
  y = Math.max(y + 10, lastY(doc) + 30);
  doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text('TVA non applicable, art. 293 B du CGI. Les visuels présentés lors de la séance sont des exemples de réalisations ; vos créations seront réalisées à partir de vos propres iris.', 14, Math.min(y, 275), { maxWidth: 182 });
  footer(doc, d.brand);
  return out(doc);
}

/* ------------------------------------------------------------ production sheet (internal) */
export interface ProductionSheetData {
  brand: Brand; title: string;
  entries: { family: string; order: string; session: string; style: string; iris: number; participants: string; refs: string; instructions: string; products: string; orientation?: string | null; delivery?: string | null; status: string; thumb?: string | null }[];
}
export function productionSheetPdf(d: ProductionSheetData): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  header(doc, d.brand, 'Fiche de production', d.title);
  let y = 40;
  for (const e of d.entries) {
    const lines = [
      `Commande ${e.order} · ${e.session}`, `Participants : ${e.participants || '—'}`, `Références iris : ${e.refs || '—'}`,
      `Produits : ${e.products || '—'}`, ...(e.orientation ? [`Disposition : ${e.orientation}`] : []), ...(e.instructions ? [`Instructions : ${e.instructions}`] : []), ...(e.delivery ? [`Livraison souhaitée : ${fmtDate(e.delivery)}`] : []),
    ];
    const wrapped = lines.flatMap((l) => doc.splitTextToSize(l, e.thumb ? 140 : 178) as string[]);
    const h = Math.max(e.thumb ? 34 : 0, 12 + wrapped.length * 4.4);
    if (y + h > 280) { doc.addPage(); y = 40; }
    doc.setDrawColor(225, 225, 228); doc.setLineWidth(0.2); doc.roundedRect(14, y, 182, h, 2, 2);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text(`${e.family} — ${e.style} (${e.iris} iris)`, 18, y + 6.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GOLD);
    doc.text(e.status, 192, y + 6.5, { align: 'right' });
    doc.setTextColor(...INK); doc.setFontSize(8.8);
    doc.text(wrapped, 18, y + 12.5);
    if (e.thumb) try { doc.addImage(e.thumb, 'JPEG', 164, y + 3, 28, 28); } catch { /* ignore broken image */ }
    y += h + 4;
  }
  if (!d.entries.length) { doc.setFontSize(10); doc.text('Aucune création à produire.', 14, 46); }
  footer(doc, d.brand);
  return out(doc);
}

/* ------------------------------------------------------------ catalogue & price grid (client) */
export interface CatalogData {
  brand: Brand; session: string; conditions?: string | null;
  styles: { name: string; description: string | null; minIris: number; maxIris: number; images: string[]; prices: { label: string; price: number }[] }[];
  products: { category: string; name: string; description: string | null; variants: { name: string; price: number }[] }[];
  promotions: { name: string; description: string | null }[];
}
export function catalogPdf(d: CatalogData, compact = false): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  header(doc, d.brand, compact ? 'Grille tarifaire' : 'Catalogue', d.session);
  let y = 42;
  if (!compact) {
    doc.setFontSize(9); doc.setTextColor(...GREY);
    doc.text('Exemples de réalisations. Chaque création est réalisée à la main à partir des iris photographiés lors de votre séance.', 14, y, { maxWidth: 182 });
    doc.setTextColor(...INK); y += 10;
    for (const s of d.styles) {
      const need = s.images.length ? 70 : 30;
      if (y + need > 278) { doc.addPage(); y = 40; }
      y = section(doc, y, s.name);
      doc.setFontSize(9);
      if (s.description) { const t = doc.splitTextToSize(s.description, 182); doc.text(t, 14, y); y += t.length * 4.2; }
      const imgs = s.images.slice(0, 4);
      if (imgs.length) {
        const size = 42;
        imgs.forEach((im, i) => { try { doc.addImage(im, 'JPEG', 14 + i * (size + 4), y + 1, size, size); } catch { /* skip */ } });
        y += size + 5;
      }
      if (s.prices.length) { doc.setFontSize(9); doc.text(s.prices.map((p) => `${p.label} : ${eur(p.price)}`).join('   ·   '), 14, y + 2, { maxWidth: 182 }); y += 9; }
      else y += 3;
    }
  } else {
    const rows: RowInput[] = d.styles.flatMap((s) => s.prices.map((p) => [`${s.name}`, p.label, eur(p.price)]));
    if (rows.length) {
      autoTable(doc, { ...tableStyle, startY: y, head: [['Création', 'Détail', 'Prix']], body: rows, columnStyles: { 2: { halign: 'right', cellWidth: 30 } } });
      y = lastY(doc) + 8;
    }
  }
  for (const cat of ['numerique', 'impression', 'option']) {
    const prods = d.products.filter((p) => p.category === cat && p.variants.length);
    if (!prods.length) continue;
    y = section(doc, y + 2, cat === 'numerique' ? 'Fichiers numériques' : cat === 'impression' ? 'Impressions & supports' : 'Options');
    autoTable(doc, { ...tableStyle, startY: y, head: [['Produit', 'Format / variante', 'Prix']],
      body: prods.flatMap((p) => p.variants.map((v, i) => [i === 0 ? p.name : '', v.name, eur(v.price)])), columnStyles: { 2: { halign: 'right', cellWidth: 30 } } });
    y = lastY(doc) + 8;
  }
  if (d.promotions.length) {
    y = section(doc, y + 2, 'Packs & offres');
    doc.setFontSize(9);
    for (const p of d.promotions) {
      const t = doc.splitTextToSize(`• ${p.name}${p.description ? ' — ' + p.description : ''}`, 182);
      if (y + t.length * 4.4 > 280) { doc.addPage(); y = 40; }
      doc.text(t, 14, y); y += t.length * 4.4 + 1;
    }
  }
  if (d.conditions) {
    y = section(doc, y + 4, 'Conditions');
    doc.setFontSize(8.5); const t = doc.splitTextToSize(d.conditions, 182); doc.text(t, 14, y);
  }
  doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text('Prix en euros, TVA non applicable, art. 293 B du CGI.', 14, 282);
  footer(doc, d.brand);
  return out(doc);
}

/* ------------------------------------------------------------ supplier order recap (internal) */
export function supplierOrderPdf(brand: Brand, supplier: string, ref: string | null, lines: { product: string; variant: string | null; qty: number; family: string; order: string; style: string | null }[]): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  header(doc, brand, `Commande ${supplier}`, ref ? `Réf. ${ref}` : fmtDate(new Date().toISOString()));
  autoTable(doc, { ...tableStyle, startY: 40, head: [['Produit', 'Format', 'Qté', 'Famille', 'Commande', 'Création']],
    body: lines.map((l) => [l.product, l.variant ?? '', String(l.qty), l.family, l.order, l.style ?? '']), columnStyles: { 2: { halign: 'center' } } });
  doc.setFontSize(10);
  doc.text(`Total : ${lines.reduce((s, l) => s + l.qty, 0)} tirage(s)`, 14, lastY(doc) + 8);
  footer(doc, brand);
  return out(doc);
}

/* ------------------------------------------------------------ invoice / credit note (official) */

/** Official invoice (facture) or credit note (avoir) for a micro-entrepreneur en franchise de TVA. */
export function invoicePdf(d: InvoiceData): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const avoir = d.kind === 'avoir';
  // Seller block
  doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(d.seller.tradeName, 14, 20);
  doc.setTextColor(...INK); doc.setFontSize(9.5);
  doc.text(`${d.seller.legalName} ${d.seller.status}`.trim(), 14, 27);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
  const sellerLines = [
    ...doc.splitTextToSize(d.seller.address, 85) as string[],
    `SIRET : ${d.seller.siret}`, d.seller.registration,
    ...(d.seller.ape ? [`Code APE : ${d.seller.ape}`] : []),
    [d.seller.phone, d.seller.email].filter(Boolean).join(' · '),
    ...(d.seller.website ? [d.seller.website] : []),
  ].filter(Boolean);
  doc.text(sellerLines, 14, 32);
  // Title block
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(avoir ? 'AVOIR' : 'FACTURE', W - 14, 20, { align: 'right' });
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const meta = [`N° ${d.number}`, `Date : ${fmtDate(d.date)}`, `Date de la vente : ${fmtDate(d.saleDate)}`, `Commande : ${d.order.number}`];
  if (d.ref) meta.push(`Annule la facture ${d.ref.number} du ${fmtDate(d.ref.date)}`);
  doc.text(meta, W - 14, 27, { align: 'right' });
  // Client block
  const cy = Math.max(32 + sellerLines.length * 3.9, 50) + 4;
  doc.setDrawColor(225, 225, 228); doc.setFillColor(248, 247, 244); doc.roundedRect(W - 96, cy, 82, 22, 2, 2, 'FD');
  doc.setFontSize(8); doc.setTextColor(...GREY); doc.text('CLIENT', W - 92, cy + 6);
  doc.setFontSize(11); doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.text(d.client.name, W - 92, cy + 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GREY);
  doc.text([d.client.phone, d.client.email].filter(Boolean).join(' · '), W - 92, cy + 17.5);
  doc.setTextColor(...INK); doc.setFontSize(9); doc.text(`Séance : ${d.order.session}`, 14, cy + 12);
  // Lines
  const body: RowInput[] = d.lines.map((l) => [
    { content: l.detail ? `${l.label}\n${l.detail}` : l.label }, String(l.qty), eur(l.unit), eur(l.total),
  ]);
  for (const x of d.discounts) body.push([{ content: x.label, styles: { textColor: [46, 125, 79] } }, '', '', avoir ? `+ ${eur(Math.abs(x.amount))}` : `- ${eur(x.amount)}`]);
  autoTable(doc, { ...tableStyle, startY: cy + 28, head: [['Désignation', 'Qté', 'Prix unitaire', 'Montant']], body,
    columnStyles: { 1: { halign: 'center', cellWidth: 14 }, 2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'right', cellWidth: 28 } },
    margin: { left: 14, right: 14, top: 20, bottom: 30 } });
  const tot: RowInput[] = [['Total brut', eur(d.subtotal)]];
  if (d.discount) tot.push(['Remises', `- ${eur(Math.abs(d.discount))}`]);
  tot.push([{ content: avoir ? 'Total de l’avoir' : 'Total à payer', styles: { fontStyle: 'bold', fontSize: 11 } }, { content: eur(d.total), styles: { fontStyle: 'bold', fontSize: 11 } }]);
  if (!avoir) {
    tot.push(['Déjà réglé', eur(d.paid)]);
    tot.push([{ content: d.balance > 0 ? 'Reste à payer' : 'Facture acquittée', styles: { fontStyle: 'bold' } }, { content: eur(d.balance), styles: { fontStyle: 'bold' } }]);
  }
  autoTable(doc, { ...tableStyle, startY: lastY(doc) + 3, body: tot, theme: 'plain', margin: { left: 112, right: 14 }, columnStyles: { 1: { halign: 'right' } } });
  let y = lastY(doc) + 6;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('TVA non applicable, art. 293 B du CGI', 14, y); doc.setFont('helvetica', 'normal');
  y += 6;
  if (avoir) {
    doc.text(doc.splitTextToSize(`Cet avoir annule la facture ${d.ref?.number}${d.reason ? ` — motif : ${d.reason}` : ''}.`, 182), 14, y); y += 6;
  } else {
    if (d.payments.length) { doc.text('Règlements reçus :', 14, y); d.payments.forEach((p) => { y += 4.5; doc.text(`${fmtDate(p.date)} — ${p.method} — ${eur(p.amount)}`, 18, y); }); y += 6; }
    if (d.instalments?.length) {
      doc.text(`Paiement en ${d.instalments.length} fois :`, 14, y);
      d.instalments.forEach((x) => { y += 4.5; doc.text(`${x.n}. ${fmtDate(x.date)} — ${eur(x.amount)}${x.paid ? ' (réglé)' : ''}`, 18, y); }); y += 6;
    } else if (d.balance > 0) { doc.text('Conditions de règlement : solde payable à réception de la facture.', 14, y); y += 6; }
    if (d.seller.iban && d.balance > 0) { doc.text(`Règlement par virement : IBAN ${d.seller.iban}`, 14, y); y += 6; }
  }
  if (d.seller.terms) { doc.setFontSize(8.5); const t = doc.splitTextToSize(d.seller.terms, 182); doc.text(t, 14, y); y += t.length * 4; }
  // Footer on every page
  const n = doc.getNumberOfPages(), h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setDrawColor(...GOLD); doc.setLineWidth(0.3); doc.line(14, h - 18, W - 14, h - 18);
    doc.setFontSize(7.2); doc.setTextColor(...GREY);
    const f = [`${d.seller.legalName} ${d.seller.status} — ${d.seller.tradeName} — SIRET ${d.seller.siret} — ${d.seller.registration} — TVA non applicable, art. 293 B du CGI`,
      d.seller.mediator ? `Médiateur de la consommation : ${d.seller.mediator}` : ''].filter(Boolean);
    doc.text(f, W / 2, h - 13.5, { align: 'center', maxWidth: W - 28 });
    doc.text(`${d.number} — ${i} / ${n}`, W - 14, h - 6, { align: 'right' });
  }
  return out(doc);
}
