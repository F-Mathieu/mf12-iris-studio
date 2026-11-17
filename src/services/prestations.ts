/**
 * Prestations signed BEFORE the software (or outside the catalogue): client, free lines, signature date,
 * deposits already received (on their real date → livre des recettes / URSSAF declarations).
 * Stored as a one-family « séance » + a validated order with free lines (category 'prestation').
 */
import { batch, nowIso } from './base';
import { createSession } from './sessions';
import { addRegistration } from './registrations';
import { addPayment, emptyCart, saveCart, type PaymentMethod } from './orders';
import { uid } from '../lib/ids';

export const PRESTATION_KINDS = { mariage: 'Mariage', seance: 'Séance photo', iris: 'Séance iris', autre: 'Autre prestation' } as const;
export type PrestationKind = keyof typeof PRESTATION_KINDS;

export interface PrestationInput {
  family: { id?: string; name: string; first?: string | null; email?: string | null; phone?: string | null };
  kind: PrestationKind; title: string;
  /** Date of the shoot / event (may be in the future). */
  date: string | null;
  /** Date the client signed (sale date). */
  signedAt: string | null;
  lines: { label: string; qty: number; unit_cents: number }[];
  payments: { date: string; amount_cents: number; method: PaymentMethod; note?: string | null }[];
  /** Already done and delivered (no production task left to do). */
  delivered: boolean;
  notes?: string | null;
}

export async function createPrestation(p: PrestationInput): Promise<{ orderId: string; sessionId: string; number: string }> {
  const lines = p.lines.filter((l) => l.label.trim() && l.qty > 0);
  if (!lines.length) throw new Error('Ajoutez au moins une ligne (désignation et prix).');
  if (lines.some((l) => !(l.unit_cents >= 0))) throw new Error('Prix invalide.');
  if (!p.family.id && !p.family.name.trim()) throw new Error('Nom du client obligatoire.');
  const total = lines.reduce((s, l) => s + l.qty * l.unit_cents, 0);
  const paid = p.payments.reduce((s, x) => s + x.amount_cents, 0);
  if (paid > total) throw new Error('Les acomptes dépassent le total de la prestation.');
  const today = nowIso().slice(0, 10);
  const name = p.title.trim() || `${p.kind === 'mariage' ? 'Mariage' : PRESTATION_KINDS[p.kind]} ${p.family.first ? p.family.first + ' ' : ''}${p.family.name}`.trim();
  const sessionId = await createSession({ name, date: p.date, status: p.date && p.date >= today ? 'active' : 'terminee', description: `${PRESTATION_KINDS[p.kind]} — prestation saisie hors catalogue${p.signedAt ? `, signée le ${p.signedAt}` : ''}.` });
  const reg = await addRegistration(sessionId, p.family.id ? { id: p.family.id } : { input: { name: p.family.name.trim(), contact_first_name: p.family.first || null, email: p.family.email || null, phone: p.family.phone || null } },
    { appt_date: p.date, appt_status: p.delivered || (p.date && p.date < today) ? 'termine' : 'a_venir' });
  const cart = { ...emptyCart(sessionId, reg.familyId, reg.id), notes: p.notes ?? '',
    items: lines.map((l) => ({ key: uid(), variantId: null, productId: null, category: 'prestation', productName: l.label.trim(), variantName: null, compositionKey: null, qty: l.qty, unitPriceCents: l.unit_cents, unitCostCents: 0 })) };
  const { id: orderId, number } = await saveCart(cart, 'validee');
  for (const x of p.payments) await addPayment(orderId, { amount_cents: x.amount_cents, method: x.method, paid_at: x.date, note: x.note ?? 'Acompte reçu avant le logiciel' });
  const upcoming = !p.delivered && !!p.date && p.date >= today;
  await batch([
    // validating an order marks the registration « terminé »: an event still to come stays « à venir »
    { sql: 'UPDATE session_registrations SET appt_status=? WHERE id=?', params: [upcoming ? 'a_venir' : 'termine', reg.id] },
    ...(p.signedAt ? [{ sql: 'UPDATE orders SET validated_at=? WHERE id=?', params: [p.signedAt + 'T12:00:00.000Z', orderId] },
      { sql: 'UPDATE session_registrations SET quote_sent_at=?, quote_signed_at=? WHERE id=?', params: [p.signedAt, p.signedAt, reg.id] }] : []),
    ...(p.delivered ? [{ sql: "UPDATE production_tasks SET status='livre', updated_at=? WHERE order_id=?", params: [nowIso(), orderId] },
      { sql: 'UPDATE session_registrations SET done_at=? WHERE id=?', params: [today, reg.id] }] : []),
  ]);
  return { orderId, sessionId, number };
}
