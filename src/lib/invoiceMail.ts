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
    signature: [d.seller.legalName, d.seller.tradeName, d.seller.phone, d.seller.website].filter(Boolean).join('\n'),
  };
  return (template?.trim() ? template : DEFAULT_INVOICE_MAIL)
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const mailtoUrl = (to: string, subject: string, body: string) =>
  `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
