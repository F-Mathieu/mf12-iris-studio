/** E-mail sent with an invoice: subject, default text with placeholders, mailto fallback. */
import { eur } from './money';
import { fmtDate } from './format';
import type { InvoiceData } from '../services/invoices';

export const DEFAULT_INVOICE_MAIL = `{bonjour}

Veuillez trouver ci-joint la facture {numero} du {date} pour votre commande de la séance « {seance} », d’un montant de {montant}.
{reglement}

Merci encore pour votre confiance, ce fut un plaisir de photographier vos iris. N’hésitez pas à me contacter pour toute question.

Belle journée,
{signature}`;

export const MAIL_PLACEHOLDERS = '{bonjour} {prenom} {client} {numero} {date} {seance} {montant} {reglement} {signature}';

export const invoiceMailSubject = (d: Pick<InvoiceData, 'kind' | 'order'>) =>
  `${d.kind === 'avoir' ? 'Avoir' : 'Facture'} – ${d.order.session} – MF/1.2`;

export function invoiceMailBody(d: InvoiceData, firstName?: string | null, template?: string | null): string {
  const first = firstName?.trim() ?? '';
  const vars: Record<string, string> = {
    bonjour: first ? `Bonjour ${first},` : 'Bonjour,',
    prenom: first,
    client: d.client.name,
    numero: d.number,
    date: fmtDate(d.date),
    seance: d.order.session,
    montant: eur(Math.abs(d.total)),
    reglement: d.kind === 'avoir' ? '' : d.balance > 0 ? `Reste à régler : ${eur(d.balance)}.` : 'Elle est entièrement réglée, merci !',
    signature: signatureOf(d.seller),
  };
  return (template?.trim() ? template : DEFAULT_INVOICE_MAIL)
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const mailtoUrl = (to: string, subject: string, body: string) =>
  `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/* ---------------- recap of a selection (draft) + brochure */
export const DEFAULT_RECAP_MAIL = `{bonjour}

Merci encore pour votre venue à la séance « {seance} » !

Vous trouverez ci-joint le récapitulatif de votre sélection ({montant}), ainsi que la brochure qui présente toutes les créations, les supports et les formats proposés, pour comparer tranquillement à la maison.

Pour modifier votre sélection ou valider votre commande, il suffit de répondre à cet e-mail.

Belle journée,
{signature}`;
export const RECAP_PLACEHOLDERS = '{bonjour} {prenom} {client} {numero} {seance} {montant} {signature}';

export const recapMailSubject = (session: string) => `Votre sélection – ${session} – MF/1.2`;

export function recapMailBody(v: { firstName?: string | null; client: string; number: string; session: string; total: number; signature: string }, template?: string | null): string {
  const first = v.firstName?.trim() ?? '';
  const vars: Record<string, string> = {
    bonjour: first ? `Bonjour ${first},` : 'Bonjour,', prenom: first, client: v.client, numero: v.number, seance: v.session, montant: eur(v.total), signature: v.signature,
  };
  return (template?.trim() ? template : DEFAULT_RECAP_MAIL).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)).replace(/\n{3,}/g, '\n\n').trim();
}

export const signatureOf = (s: { legalName?: string; tradeName?: string; phone?: string; website?: string }) =>
  [s.legalName, s.tradeName, s.phone, s.website].filter(Boolean).join('\n');
