/**
 * "Envoyer par e-mail": saves the invoice PDF and opens a new message in the Mac's Mail app
 * (recipient, subject, text, attachment) — the user only clicks Send. Nothing is sent automatically.
 */
import { isTauri } from '../lib/db';
import { getSetting } from './base';
import { invoicePdfOf } from './documents';
import { invoiceMailBody, invoiceMailSubject, mailtoUrl } from '../lib/invoiceMail';
import { saveFile } from '../lib/files';
import { slug } from '../lib/format';
import type { InvoiceData, InvoiceRow } from './invoices';

/** Returns 'mail' if Mail opened with the attachment, 'fallback' if a mailto was used (attach the PDF by hand). */
export async function emailInvoice(row: InvoiceRow, opts: { to?: string | null; firstName?: string | null; fileName: string }): Promise<'mail' | 'fallback'> {
  const data: InvoiceData = JSON.parse(row.data);
  const to = (opts.to ?? data.client.email ?? '').trim();
  const subject = invoiceMailSubject(data);
  const body = invoiceMailBody(data, opts.firstName, await getSetting('invoice_mail_body'));
  const pdf = invoicePdfOf(row);
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<'mail' | 'fallback'>('compose_mail', { to, subject, body, fileName: opts.fileName, bytes: Array.from(pdf), mailto: mailtoUrl(to, subject, body) });
  }
  await saveFile(opts.fileName, pdf);
  window.location.href = mailtoUrl(to, subject, body);
  return 'fallback';
}

/** Same, from the invoice register: uses the order's current e-mail and contact first name when available. */
export async function emailInvoiceRow(row: InvoiceRow & { client?: string }) {
  const { getOrderDetail } = await import('./orders');
  const o = row.order_id ? (await getOrderDetail(row.order_id))?.order : null;
  const name = o?.family_name ?? row.client ?? '';
  return emailInvoice(row, { to: o?.family_email, firstName: o?.contact_first_name, fileName: `${row.kind}-${row.number}${name ? '-' + slug(name) : ''}.pdf` });
}
