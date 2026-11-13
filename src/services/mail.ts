/**
 * E-mails prepared in the Mac's Mail app (recipient, subject, text, attachments): the user only clicks Send.
 * Nothing is sent automatically. Browser preview: files are downloaded and a mailto link is opened.
 */
import { isTauri } from '../lib/db';
import { getSetting } from './base';
import { invoicePdfOf, orderRecapPdf, sessionBrochurePdf } from './documents';
import { invoiceMailBody, invoiceMailSubject, mailtoUrl, recapMailBody, recapMailSubject, signatureOf } from '../lib/invoiceMail';
import { saveFile } from '../lib/files';
import { slug } from '../lib/format';
import { clientName, sellerInfo, type InvoiceData, type InvoiceRow } from './invoices';

export interface MailFile { name: string; bytes: Uint8Array }
export type MailResult = 'mail' | 'fallback';

/** Opens a new message in Mail with the attachments ('fallback': default mail app via mailto, attach the files by hand). */
export async function composeMail(m: { to: string; subject: string; body: string; files: MailFile[] }): Promise<MailResult> {
  const mailto = mailtoUrl(m.to, m.subject, m.body);
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<MailResult>('compose_mail', { to: m.to, subject: m.subject, body: m.body, files: m.files.map((f) => ({ name: f.name, bytes: Array.from(f.bytes) })), mailto });
  }
  for (const f of m.files) await saveFile(f.name, f.bytes);
  window.location.href = mailto;
  return 'fallback';
}

export async function emailInvoice(row: InvoiceRow, opts: { to?: string | null; firstName?: string | null; fileName: string }): Promise<MailResult> {
  const data: InvoiceData = JSON.parse(row.data);
  const to = (opts.to ?? data.client.email ?? '').trim();
  return composeMail({ to, subject: invoiceMailSubject(data), body: invoiceMailBody(data, opts.firstName, await getSetting('invoice_mail_body')), files: [{ name: opts.fileName, bytes: invoicePdfOf(row) }] });
}

/** Same, from the invoice register: uses the order's current e-mail and contact first name when available. */
export async function emailInvoiceRow(row: InvoiceRow & { client?: string }) {
  const { getOrderDetail } = await import('./orders');
  const o = row.order_id ? (await getOrderDetail(row.order_id))?.order : null;
  const name = o?.family_name ?? row.client ?? '';
  return emailInvoice(row, { to: o?.family_email, firstName: o?.contact_first_name, fileName: `${row.kind}-${row.number}${name ? '-' + slug(name) : ''}.pdf` });
}

/** Recap of the selection (« Votre sélection ») + the session brochure, in one e-mail. */
export async function emailOrderRecap(orderId: string): Promise<MailResult> {
  const { getOrderDetail } = await import('./orders');
  const d = await getOrderDetail(orderId);
  if (!d) throw new Error('Commande introuvable');
  const o = d.order;
  const client = clientName(o.contact_first_name, o.family_name);
  const [recap, brochure, seller, tpl] = await Promise.all([orderRecapPdf(orderId), sessionBrochurePdf(o.session_id, client), sellerInfo(), getSetting('recap_mail_body')]);
  return composeMail({
    to: (o.family_email ?? '').trim(),
    subject: recapMailSubject(o.session_name),
    body: recapMailBody({ firstName: o.contact_first_name, client, number: o.number, session: o.session_name, total: o.total_cents, signature: signatureOf(seller) }, tpl),
    files: [
      { name: `selection-${o.number}-${slug(o.family_name)}.pdf`, bytes: recap },
      { name: `brochure-${slug(o.session_name)}.pdf`, bytes: brochure },
    ],
  });
}
