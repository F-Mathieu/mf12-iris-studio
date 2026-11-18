/**
 * Relances (devis sans réponse, échéance impayée) et demande d'avis après la livraison : e-mails préparés dans Mail
 * en un clic depuis « À faire ». Chaque envoi (ou « ne pas relancer ») est noté dans l'historique (audit_logs).
 */
import { auditStmt, batch, getSettings, one, sel } from './base';
import { composeMail, type MailResult } from './mail';
import { clientName, sellerInfo } from './invoices';
import { DEFAULT_PAYMENT_FOLLOWUP, DEFAULT_QUOTE_FOLLOWUP, DEFAULT_REVIEW_MAIL, fillMail } from '../lib/followUpMail';
import { signatureOf } from '../lib/invoiceMail';
import { instalmentStatus, schedule, type PaymentPlan } from '../lib/pricing';
import { addDays } from '../lib/weddingTexts';
import { eur } from '../lib/money';
import { fmtDate } from '../lib/format';
import { todayIso } from '../lib/ids';

export type FollowUpKind = 'quote' | 'payment' | 'review';
const ACTION: Record<FollowUpKind, string> = { quote: 'relance_devis', payment: 'relance_paiement', review: 'demande_avis' };

export interface FollowUp {
  kind: FollowUpKind; id: string; title: string; date: string; late: boolean; detail: string | null; last: string | null; link: string;
}

/** Last time this follow-up was sent (or dismissed), per order. */
const lastActions = async (kind: FollowUpKind) =>
  new Map((await sel<{ entity_id: string; d: string }>("SELECT entity_id, max(created_at) d FROM audit_logs WHERE entity='order' AND action=? GROUP BY entity_id", [ACTION[kind]]))
    .map((r) => [r.entity_id, r.d.slice(0, 10)]));

/**
 * What can be followed up today:
 * - quotes still « envoyé » on a draft order, sent more than N days ago (setting quote_followup_days, 7), not followed up in the last 7 days;
 * - overdue instalments, not followed up in the last 7 days;
 * - delivered orders (files sent, production delivered, or wedding gallery/film delivered) N days ago (review_delay_days, 7),
 *   less than 90 days ago, review never asked.
 */
export async function followUps(today = todayIso()): Promise<FollowUp[]> {
  const s = await getSettings();
  const qDays = Number(s.quote_followup_days) || 7, rDays = Number(s.review_delay_days) || 7;
  const out: FollowUp[] = [];
  const recent = (d: string | undefined) => !!d && d > addDays(today, -7);
  const [lq, lp, lr] = await Promise.all([lastActions('quote'), lastActions('payment'), lastActions('review')]);

  for (const q of await sel<{ id: string; number: string; order_id: string; issued_at: string; valid_until: string; total_cents: number; client: string; wedding_id: string | null }>(
    `SELECT q.id, q.number, q.order_id, q.issued_at, q.valid_until, q.total_cents, json_extract(q.data,'$.client.name') client, (SELECT id FROM weddings w WHERE w.order_id=q.order_id) wedding_id
     FROM quotes q JOIN orders o ON o.id=q.order_id WHERE q.status='envoye' AND o.status='brouillon'
       AND q.issued_at = (SELECT max(issued_at) FROM quotes x WHERE x.order_id=q.order_id)`)) {
    if (q.issued_at.slice(0, 10) > addDays(today, -qDays) || recent(lq.get(q.order_id))) continue;
    out.push({ kind: 'quote', id: q.order_id, title: `Devis ${q.number} sans réponse — ${q.client}`, date: q.issued_at.slice(0, 10), late: q.valid_until < today,
      detail: q.valid_until < today ? `expiré le ${fmtDate(q.valid_until)}` : `envoyé le ${fmtDate(q.issued_at)}`, last: lq.get(q.order_id) ?? null,
      link: q.wedding_id ? `/mariages/${q.wedding_id}` : `/vente/commande/${q.order_id}` });
  }

  for (const o of await sel<{ id: string; number: string; family: string; total_cents: number; payment_plan: string; paid: number; wedding_id: string | null }>(
    `SELECT o.id, o.number, f.name family, o.total_cents, o.payment_plan, (SELECT id FROM weddings w WHERE w.order_id=o.id) wedding_id,
       COALESCE((SELECT sum(amount_cents) FROM payments p WHERE p.order_id=o.id),0) paid
     FROM orders o JOIN families f ON f.id=o.family_id WHERE o.status='validee' AND o.payment_plan IS NOT NULL`)) {
    const late = instalmentStatus(schedule(o.total_cents, JSON.parse(o.payment_plan) as PaymentPlan), o.paid, today).filter((i) => i.state === 'retard');
    if (!late.length || recent(lp.get(o.id))) continue;
    const due = late.reduce((t, i) => t + i.remaining_cents, 0);
    out.push({ kind: 'payment', id: o.id, title: `Échéance impayée ${eur(due)} — ${o.family}`, date: late[0].date, late: true,
      detail: `commande ${o.number}`, last: lp.get(o.id) ?? null, link: o.wedding_id ? `/mariages/${o.wedding_id}` : `/commandes/${o.id}` });
  }

  for (const o of await sel<{ id: string; family: string; session: string; delivered: string | null; wedding_id: string | null }>(
    `SELECT o.id, f.name family, s.name session, w.id wedding_id,
       COALESCE(w.final_delivered_at, o.delivered_at,
         CASE WHEN EXISTS (SELECT 1 FROM production_tasks t WHERE t.order_id=o.id) AND NOT EXISTS (SELECT 1 FROM production_tasks t WHERE t.order_id=o.id AND t.status<>'livre')
           THEN (SELECT substr(max(t.updated_at),1,10) FROM production_tasks t WHERE t.order_id=o.id) END) delivered
     FROM orders o JOIN families f ON f.id=o.family_id JOIN sessions s ON s.id=o.session_id LEFT JOIN weddings w ON w.order_id=o.id
     WHERE o.status='validee'`)) {
    if (!o.delivered || lr.has(o.id)) continue;
    const ask = addDays(o.delivered.slice(0, 10), rDays);
    if (ask > today || ask < addDays(today, -90)) continue;
    out.push({ kind: 'review', id: o.id, title: `Demander un avis — ${o.family}`, date: ask, late: false, detail: `${o.session}, livré le ${fmtDate(o.delivered)}`, last: null,
      link: o.wedding_id ? `/mariages/${o.wedding_id}` : `/commandes/${o.id}` });
  }
  return out;
}

/** Prepares the e-mail in Mail and notes it in the order history. */
export async function sendFollowUp(kind: FollowUpKind, orderId: string): Promise<MailResult> {
  const o = await one<{ number: string; total_cents: number; payment_plan: string | null; email: string | null; first: string | null; family: string; session: string; paid: number }>(
    `SELECT o.number, o.total_cents, o.payment_plan, f.email, f.contact_first_name first, f.name family, s.name session,
       COALESCE((SELECT sum(amount_cents) FROM payments p WHERE p.order_id=o.id),0) paid
     FROM orders o JOIN families f ON f.id=o.family_id JOIN sessions s ON s.id=o.session_id WHERE o.id=?`, [orderId]);
  if (!o) throw new Error('Commande introuvable');
  const [s, seller] = await Promise.all([getSettings(), sellerInfo()]);
  const vars: Record<string, string> = { bonjour: o.first ? `Bonjour ${o.first},` : 'Bonjour,', client: clientName(o.first, o.family), seance: o.session, numero: o.number,
    montant: eur(o.total_cents), date: '', validite: '', lien_avis: (s.google_review_url ?? '').trim(), signature: signatureOf(seller) };
  let subject = '', template = '';
  if (kind === 'quote') {
    const q = await one<{ number: string; issued_at: string; valid_until: string; total_cents: number }>('SELECT number, issued_at, valid_until, total_cents FROM quotes WHERE order_id=? ORDER BY issued_at DESC LIMIT 1', [orderId]);
    if (!q) throw new Error('Aucun devis pour cette commande');
    Object.assign(vars, { numero: q.number, montant: eur(q.total_cents), date: fmtDate(q.issued_at), validite: fmtDate(q.valid_until) });
    subject = `Votre devis ${q.number} — ${o.session}`; template = s.quote_followup_mail || DEFAULT_QUOTE_FOLLOWUP;
  } else if (kind === 'payment') {
    const late = o.payment_plan ? instalmentStatus(schedule(o.total_cents, JSON.parse(o.payment_plan)), o.paid, todayIso()).filter((i) => i.state === 'retard') : [];
    if (!late.length) throw new Error('Aucune échéance en retard');
    Object.assign(vars, { montant: eur(late.reduce((t, i) => t + i.remaining_cents, 0)), date: fmtDate(late[0].date) });
    subject = `Rappel d’échéance — ${o.session}`; template = s.payment_followup_mail || DEFAULT_PAYMENT_FOLLOWUP;
  } else {
    subject = `Votre avis compte — ${o.session}`; template = s.review_mail || DEFAULT_REVIEW_MAIL;
  }
  const how = await composeMail({ to: (o.email ?? '').trim(), subject, body: fillMail(template, vars), files: [] });
  await batch([auditStmt('order', orderId, ACTION[kind], { mail: true })]);
  return how;
}

/** « Ne pas relancer / ne pas demander d'avis » : removes the item (for 7 days for follow-ups, for good for a review). */
export const dismissFollowUp = (kind: FollowUpKind, orderId: string) => batch([auditStmt('order', orderId, ACTION[kind], { dismissed: true })]);
