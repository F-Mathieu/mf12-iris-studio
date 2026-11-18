/** Documents des mariages : contrat + CGV, fiche de renseignements (à envoyer plus tard), fiche du jour J ; e-mails préparés dans Mail. */
import { getSettings, nowIso, updateStmt, batch } from './base';
import { brand } from './documents';
import { sellerInfo } from './invoices';
import { buildInvoiceData } from './invoices';
import { getWedding, coupleName, deadlines, WEDDING_SERVICES, type WeddingRow } from './weddings';
import { composeMail, type MailResult } from './mail';
import { weddingContractPdf, weddingSheetPdf } from '../lib/weddingPdf';
import { DEFAULT_WEDDING_CGV, DEFAULT_WEDDING_CONTRACT, DEFAULT_WEDDING_INFO_MAIL, DEFAULT_WEDDING_QUOTE_MAIL, fillText } from '../lib/weddingTexts';
import { schedule, type PaymentPlan } from '../lib/pricing';
import { eur } from '../lib/money';
import { fmtDate, slug } from '../lib/format';
import { signatureOf } from '../lib/invoiceMail';
import { todayIso } from '../lib/ids';

async function need(id: string): Promise<WeddingRow> {
  const w = await getWedding(id);
  if (!w) throw new Error('Mariage introuvable');
  return w;
}

/** Schedule rows of the contract (deposit, balance instalments) from the order's plan. */
function scheduleRows(w: WeddingRow, total: number) {
  const plan: PaymentPlan = { count: Math.max(1, w.balance_count), first_date: w.signed_at ?? todayIso(), deposit_bp: w.deposit_bp, last_date: w.date };
  const s = schedule(total, plan), n = s.length - 1;
  return s.map((x, i) => ({ date: x.date, amount: x.amount_cents,
    label: i === 0 ? `Acompte (${(w.deposit_bp / 100).toLocaleString('fr-FR')} %) à la signature` : n > 1 ? `Solde — échéance ${i} / ${n}${i === n ? ' (jour du mariage)' : ''}` : 'Solde le jour du mariage' }));
}

/** Variables of the contract / CGV texts. */
async function vars(w: WeddingRow, total: number) {
  const [seller, s, dl] = await Promise.all([sellerInfo(), getSettings(), deadlines(w)]);
  const rows = scheduleRows(w, total);
  const deposit = rows[0]?.amount ?? 0;
  return {
    seller, s, rows,
    vars: {
      photographe: seller.legalName || seller.tradeName, siret: seller.siret || '…', adresse_photographe: seller.address || '…', maries: coupleName(w),
      date: w.date ? fmtDate(w.date) : '(date à préciser)', lieu: w.location || '(lieu à préciser)', prestations: WEDDING_SERVICES[w.services].toLowerCase().replace('photo + vidéo', 'photo et vidéo'),
      total: eur(total), acompte: eur(deposit), solde: eur(total - deposit), echeancier: rows.map((r) => `${r.label} : ${eur(r.amount)} le ${fmtDate(r.date)}`).join(' ; '),
      delai_teaser: String(dl.teaserDays), delai_final: String(dl.finalDays), mediateur: seller.mediator || '(médiateur à indiquer dans Paramètres → Facturation)',
    } as Record<string, string>,
  };
}

/** Contract + CGV PDF (from the current quote lines, or the signed order). */
export async function weddingContract(id: string): Promise<{ name: string; bytes: Uint8Array }> {
  const w = await need(id);
  if (!w.order_id) throw new Error('Ajoutez d’abord les lignes du devis.');
  const inv = await buildInvoiceData(w.order_id, '');
  const { seller, s, rows, vars: v } = await vars(w, inv.total);
  const { quotesOfOrder } = await import('./quotes');
  const [q] = await quotesOfOrder(w.order_id);
  const bytes = weddingContractPdf({
    brand: await brand(), seller: { name: seller.legalName || seller.tradeName, siret: seller.siret, address: seller.address },
    couple: coupleName(w), email: w.email, phone: w.phone, date: w.date, location: w.location, services: WEDDING_SERVICES[w.services],
    lines: inv.lines, total: inv.total, schedule: rows, quoteNumber: q?.number ?? null,
    contract: fillText(s.wedding_contract || DEFAULT_WEDDING_CONTRACT, v), cgv: fillText(s.wedding_cgv || DEFAULT_WEDDING_CGV, v),
  });
  return { name: `contrat-mariage-${slug(coupleName(w))}.pdf`, bytes };
}

/** Information sheet: blank questionnaire (to send) or filled day sheet (for the day). */
export async function weddingSheet(id: string, blank: boolean): Promise<{ name: string; bytes: Uint8Array }> {
  const w = await need(id);
  const bytes = weddingSheetPdf({ brand: await brand(), couple: coupleName(w), date: w.date, location: w.location, services: WEDDING_SERVICES[w.services],
    video: w.services !== 'photo', info: w.info ? JSON.parse(w.info) : {}, contact: [w.phone, w.email].filter(Boolean).join(' · ') || null }, blank);
  return { name: `${blank ? 'fiche-renseignements' : 'fiche-jour-j'}-${slug(coupleName(w))}.pdf`, bytes };
}

const hello = (w: WeddingRow) => (w.partner1 ? `Bonjour ${[w.partner1, w.partner2?.split(' ')[0]].filter(Boolean).join(' et ')},` : 'Bonjour,');

/** Quote (issued now, or the same one if unchanged) + contract + CGV in one e-mail. */
export async function emailWeddingQuote(id: string): Promise<{ how: MailResult; number: string }> {
  const w = await need(id);
  if (!w.order_id) throw new Error('Ajoutez d’abord les lignes du devis.');
  const { issueQuote, markQuoteOnRegistration } = await import('./quotes');
  const { invoicePdf } = await import('../lib/pdf');
  const q = await issueQuote(w.order_id);
  const contract = await weddingContract(id);
  const { seller, s, vars: v } = await vars(w, q.data.total);
  const how = await composeMail({
    to: (w.email ?? '').trim(), subject: `Devis et contrat — mariage ${coupleName(w)} — ${seller.tradeName}`,
    body: fillText(s.wedding_quote_mail || DEFAULT_WEDDING_QUOTE_MAIL, { ...v, bonjour: hello(w), signature: signatureOf(seller) }),
    files: [{ name: `devis-${q.row.number}-${slug(coupleName(w))}.pdf`, bytes: invoicePdf(q.data) }, contract],
  });
  await batch([markQuoteOnRegistration(w.order_id, 'sent')]);
  return { how, number: q.row.number };
}

/** The information sheet to fill, sent later (not with the quote). */
export async function emailWeddingInfo(id: string): Promise<MailResult> {
  const w = await need(id);
  const [seller, s, sheet] = await Promise.all([sellerInfo(), getSettings(), weddingSheet(id, true)]);
  const how = await composeMail({
    to: (w.email ?? '').trim(), subject: `Fiche de renseignements — mariage ${coupleName(w)}`,
    body: fillText(s.wedding_info_mail || DEFAULT_WEDDING_INFO_MAIL, { bonjour: hello(w), signature: signatureOf(seller) }), files: [sheet],
  });
  await batch([updateStmt('weddings', id, { info_sent_at: todayIso(), updated_at: nowIso() })]);
  return how;
}
