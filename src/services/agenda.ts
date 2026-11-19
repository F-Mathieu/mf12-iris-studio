/**
 * Agenda : événements saisis (prestations, livraisons, rendez-vous, perso…) + tout ce que l'app connaît déjà
 * (séances, rendez-vous des inscrits, mariages, livrables, échéances de paiement, validité des devis).
 * Rappels du tableau de bord ; journées réservées (séance, mariage signé, prestation) pour éviter les doublons.
 */
import { batch, insertStmt, nowIso, one, run, sel, uid, updateStmt, getSetting } from './base';
import { addDays } from '../lib/weddingTexts';
import { instalmentStatus, schedule, type PaymentPlan } from '../lib/pricing';
import { eur } from '../lib/money';

export const EVENT_KINDS = { prestation: 'Prestation', livraison: 'Livraison', rdv: 'Rendez-vous', perso: 'Personnel', autre: 'Autre' } as const;
export type EventKind = keyof typeof EVENT_KINDS;
export interface CalendarEvent {
  id: string; title: string; kind: EventKind; date: string; end_date: string | null; start_time: string | null; end_time: string | null;
  location: string | null; notes: string | null; remind_days: number | null; blocks_day: number; done_at: string | null; family_id: string | null;
}

/** Everything shown in the agenda. source: where it comes from (only 'event' is edited in the agenda). */
export type AgendaSource = 'event' | 'seance' | 'rdv' | 'mariage' | 'livraison' | 'echeance' | 'devis';
export interface AgendaItem {
  key: string; source: AgendaSource; kind: string; date: string; end_date?: string | null; time?: string | null; end_time?: string | null;
  title: string; detail?: string | null; link?: string | null; done?: boolean; blocks?: boolean; event?: CalendarEvent;
}

export async function saveEvent(e: Partial<CalendarEvent> & { title: string; date: string }): Promise<string> {
  if (!e.title.trim()) throw new Error('Titre obligatoire.');
  if (!e.date) throw new Error('Date obligatoire.');
  if (e.end_date && e.end_date < e.date) throw new Error('La date de fin précède la date de début.');
  const row = { title: e.title.trim(), kind: e.kind ?? 'rdv', date: e.date, end_date: e.end_date || null, start_time: e.start_time || null, end_time: e.end_time || null,
    location: e.location || null, notes: e.notes || null, remind_days: e.remind_days == null || (e.remind_days as unknown) === '' ? null : Math.max(0, Number(e.remind_days)),
    blocks_day: e.blocks_day ? 1 : 0, done_at: e.done_at ?? null, family_id: e.family_id ?? null };
  if (e.id) { await batch([updateStmt('calendar_events', e.id, row)]); return e.id; }
  const id = uid();
  await batch([insertStmt('calendar_events', { id, ...row, created_at: nowIso() })]);
  return id;
}
export const deleteEvent = (id: string) => run('DELETE FROM calendar_events WHERE id=?', [id]);
export const setEventDone = (id: string, done: boolean) => run('UPDATE calendar_events SET done_at=? WHERE id=?', [done ? nowIso().slice(0, 10) : null, id]);

const overlaps = (from: string, to: string) => `(date <= '${to}' AND COALESCE(end_date, date) >= '${from}')`;

/** All agenda items between two dates (inclusive). */
export async function agenda(from: string, to: string): Promise<AgendaItem[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Dates invalides');
  const out: AgendaItem[] = [];
  const [events, sessions, appts, weddings, teaserDays, finalDays] = await Promise.all([
    sel<CalendarEvent>(`SELECT * FROM calendar_events WHERE ${overlaps(from, to)} ORDER BY date, start_time`),
    sel<{ id: string; name: string; date: string; start_time: string | null; end_time: string | null; location: string | null; status: string }>(
      "SELECT id, name, date, start_time, end_time, location, status FROM sessions WHERE date BETWEEN ? AND ? AND status<>'archivee' AND id NOT IN (SELECT session_id FROM weddings)", [from, to]),
    sel<{ id: string; session_id: string; session: string; family: string; appt_date: string; appt_time: string | null; appt_duration: number | null }>(
      `SELECT r.id, r.session_id, s.name session, f.name family, r.appt_date, r.appt_time, r.appt_duration FROM session_registrations r
       JOIN sessions s ON s.id=r.session_id JOIN families f ON f.id=r.family_id
       WHERE r.appt_date BETWEEN ? AND ? AND r.appt_status NOT IN ('annule','absent') AND r.session_id NOT IN (SELECT session_id FROM weddings) AND r.appt_date <> COALESCE(s.date, '')`, [from, to]),
    sel<{ id: string; partner1: string; partner2: string | null; date: string | null; status: string; services: string; location: string | null; teaser_delivered_at: string | null; final_delivered_at: string | null }>(
      "SELECT w.id, w.partner1, w.partner2, w.date, w.status, w.services, s.location, w.teaser_delivered_at, w.final_delivered_at FROM weddings w JOIN sessions s ON s.id=w.session_id WHERE w.status<>'annule' AND w.date IS NOT NULL"),
    getSetting('wedding_teaser_days', '15'), getSetting('wedding_final_days', '30'),
  ]);
  for (const e of events) out.push({ key: `e:${e.id}`, source: 'event', kind: e.kind, date: e.date, end_date: e.end_date, time: e.start_time, end_time: e.end_time,
    title: e.title, detail: e.location, done: !!e.done_at, blocks: !!e.blocks_day, event: e });
  for (const s of sessions) out.push({ key: `s:${s.id}`, source: 'seance', kind: 'seance', date: s.date, time: s.start_time, end_time: s.end_time, title: s.name, detail: s.location, link: `/seances/${s.id}`, blocks: true });
  for (const r of appts) out.push({ key: `r:${r.id}`, source: 'rdv', kind: 'inscrit', date: r.appt_date, time: r.appt_time, title: `RDV ${r.family}`, detail: r.session, link: `/seances/${r.session_id}?tab=planning` });
  const couple = (w: { partner1: string; partner2: string | null }) => [w.partner1, w.partner2].filter(Boolean).join(' & ');
  for (const w of weddings) {
    const d = w.date!;
    if (d >= from && d <= to) out.push({ key: `w:${w.id}`, source: 'mariage', kind: 'mariage', date: d, title: `Mariage ${couple(w)}${w.status === 'devis' ? ' (option, devis non signé)' : ''}`, detail: w.location, link: `/mariages/${w.id}`, blocks: w.status !== 'devis' });
    if (w.status === 'devis') continue;
    const t = addDays(d, Number(teaserDays) || 15), f = addDays(d, Number(finalDays) || 30);
    const what = w.services === 'photo' ? ['premières photos', 'galerie complète'] : w.services === 'video' ? ['teaser', 'film'] : ['teaser / premières photos', 'film + galerie'];
    if (t >= from && t <= to) out.push({ key: `wt:${w.id}`, source: 'livraison', kind: 'livraison', date: t, title: `Livrer ${what[0]} — ${couple(w)}`, link: `/mariages/${w.id}`, done: !!w.teaser_delivered_at });
    if (f >= from && f <= to) out.push({ key: `wf:${w.id}`, source: 'livraison', kind: 'livraison', date: f, title: `Livrer ${what[1]} — ${couple(w)}`, link: `/mariages/${w.id}`, done: !!w.final_delivered_at });
  }
  for (const x of await dueInstalments()) if (x.date >= from && x.date <= to) out.push(x);
  for (const q of await sel<{ id: string; number: string; valid_until: string; order_id: string; client: string }>(
    `SELECT q.id, q.number, q.valid_until, q.order_id, json_extract(q.data,'$.client.name') client FROM quotes q JOIN orders o ON o.id=q.order_id
     WHERE q.status='envoye' AND o.status='brouillon' AND q.valid_until BETWEEN ? AND ?`, [from, to]))
    out.push({ key: `q:${q.id}`, source: 'devis', kind: 'devis', date: q.valid_until, title: `Fin de validité du devis ${q.number} — ${q.client}`, link: `/documents` });
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'));
}

/** Unpaid instalments of validated orders (payment schedules: deposit, balance, monthly payments). */
async function dueInstalments(): Promise<AgendaItem[]> {
  const rows = await sel<{ id: string; number: string; family: string; total_cents: number; payment_plan: string; paid: number; wedding_id: string | null }>(
    `SELECT o.id, o.number, f.name family, o.total_cents, o.payment_plan, (SELECT id FROM weddings w WHERE w.order_id=o.id) wedding_id,
       COALESCE((SELECT sum(amount_cents) FROM payments p WHERE p.order_id=o.id),0) paid
     FROM orders o JOIN families f ON f.id=o.family_id WHERE o.status='validee' AND o.payment_plan IS NOT NULL`);
  const today = nowIso().slice(0, 10);
  return rows.flatMap((o) => {
    const plan = JSON.parse(o.payment_plan) as PaymentPlan;
    return instalmentStatus(schedule(o.total_cents, plan), o.paid, today).filter((i) => i.remaining_cents > 0).map((i) => ({
      key: `p:${o.id}:${i.n}`, source: 'echeance' as const, kind: 'echeance', date: i.date,
      title: `Échéance ${eur(i.remaining_cents)} — ${o.family}`, detail: `Commande ${o.number}`, link: o.wedding_id ? `/mariages/${o.wedding_id}` : `/commandes/${o.id}`,
    }));
  });
}

/** What already takes the day (séance, signed wedding, event marked « journée réservée »). */
export async function bookedOn(date: string, exceptWeddingId?: string): Promise<AgendaItem[]> {
  return (await agenda(date, date)).filter((x) => x.blocks && !(exceptWeddingId && x.key === `w:${exceptWeddingId}`));
}

export interface Reminder { key: string; group: 'livraison' | 'fiche' | 'echeance' | 'devis' | 'bat' | 'rappel'; title: string; date: string; late: boolean; link?: string | null; detail?: string | null }

/** Dashboard reminders: overdue or soon (deliveries, information sheets, instalments, quotes, agenda reminders). */
export async function reminders(today = nowIso().slice(0, 10)): Promise<Reminder[]> {
  const out: Reminder[] = [];
  const items = await agenda(addDays(today, -365), addDays(today, 30));
  for (const x of items) {
    if (x.done) continue;
    if (x.source === 'livraison' && x.date <= addDays(today, 7)) out.push({ key: x.key, group: 'livraison', title: x.title, date: x.date, late: x.date < today, link: x.link });
    if (x.source === 'echeance' && x.date <= addDays(today, 14)) out.push({ key: x.key, group: 'echeance', title: x.title, date: x.date, late: x.date < today, link: x.link, detail: x.detail });
    if (x.source === 'devis' && x.date < today && x.date >= addDays(today, -60)) out.push({ key: x.key, group: 'devis', title: x.title.replace('Fin de validité du', 'Devis expiré :'), date: x.date, late: true, link: x.link });
    if (x.source === 'event' && x.event) {
      const e = x.event, end = e.end_date ?? e.date;
      const remind = e.remind_days != null && today >= addDays(e.date, -e.remind_days) && today <= end;
      const lateDelivery = e.kind === 'livraison' && end < today;
      if (remind || lateDelivery) out.push({ key: x.key, group: e.kind === 'livraison' ? 'livraison' : 'rappel', title: e.title, date: e.date, late: e.date < today, detail: e.location });
    }
  }
  for (const w of await sel<{ id: string; partner1: string; partner2: string | null; date: string }>(
    `SELECT id, partner1, partner2, date FROM weddings WHERE status='signe' AND info_received_at IS NULL AND date BETWEEN ? AND ?`, [today, addDays(today, 45)]))
    out.push({ key: `fi:${w.id}`, group: 'fiche', title: `Fiche jour J à recevoir — ${[w.partner1, w.partner2].filter(Boolean).join(' & ')}`, date: w.date, late: w.date <= addDays(today, 30), link: `/mariages/${w.id}` });
  // BAT sent 3 days ago or more, still without answer (late after 7 days)
  for (const p of await (await import('./proofs')).pendingProofs())
    if (p.sent_at <= addDays(today, -3)) out.push({ key: `bat:${p.order_id}:${p.label}`, group: 'bat', title: `BAT sans réponse — ${p.family} (${p.label})`, date: p.sent_at, late: p.sent_at <= addDays(today, -7), link: `/commandes/${p.order_id}`, detail: `envoyé, commande ${p.number}` });
  return out.sort((a, b) => Number(b.late) - Number(a.late) || a.date.localeCompare(b.date));
}

export const getEvent = (id: string) => one<CalendarEvent>('SELECT * FROM calendar_events WHERE id=?', [id]);
