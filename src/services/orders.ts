import { auditStmt, batch, insertStmt, like, nowIso, one, sel, uid, updateStmt } from './base';
import { computeCart, discountLabel, findPrice, paymentStatus, schedule, type CartComposition, type CartItem, type CartTotals, type ManualDiscount, type PaymentPlan } from '../lib/pricing';
import { getPriceItems, listPromotions, toPromotion } from './pricing';
import type { Stmt } from '../lib/db/types';
import type { Orientation } from '../lib/formatsGuide';

export type OrderStatus = 'brouillon' | 'validee' | 'annulee';
export const ORDER_STATUS: Record<OrderStatus, string> = { brouillon: 'Brouillon', validee: 'Validée', annulee: 'Annulée' };
export const PAYMENT_METHODS = { carte: 'Carte bancaire', especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', autre: 'Autre' } as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export const PAYMENT_STATUS = { paye: 'Payé', partiel: 'Partiellement payé', a_payer: 'À payer' } as const;

export interface CartComp extends CartComposition { participantIds: string[]; participantNames: string; instructions: string; orientation?: Orientation | null }
export interface CartLine extends CartItem { unitCostCents: number }
export interface Cart {
  orderId: string | null; number?: string; status: OrderStatus;
  sessionId: string; familyId: string; registrationId: string | null;
  compositions: CartComp[]; items: CartLine[]; manual: ManualDiscount[];
  notes: string; desiredDelivery: string | null;
  /** Payment in several instalments (null = paid at once). */
  paymentPlan?: PaymentPlan | null;
}

export interface OrderRow {
  id: string; number: string; status: OrderStatus; session_id: string; family_id: string; session_name: string; family_name: string;
  subtotal_cents: number; discount_cents: number; total_cents: number; paid_cents: number; created_at: string; validated_at: string | null;
  payment_due_date: string | null; items_count: number;
}

export async function listOrders(f: { q?: string; sessionId?: string; familyId?: string; status?: string; from?: string; to?: string; payment?: string } = {}): Promise<OrderRow[]> {
  const w: string[] = [], p: string[] = [];
  if (f.q?.trim()) { w.push('(o.number LIKE ? OR fa.name LIKE ? OR s.name LIKE ?)'); p.push(like(f.q), like(f.q), like(f.q)); }
  if (f.sessionId) { w.push('o.session_id=?'); p.push(f.sessionId); }
  if (f.familyId) { w.push('o.family_id=?'); p.push(f.familyId); }
  if (f.status) { w.push('o.status=?'); p.push(f.status); }
  if (f.from) { w.push('substr(o.created_at,1,10)>=?'); p.push(f.from); }
  if (f.to) { w.push('substr(o.created_at,1,10)<=?'); p.push(f.to); }
  const rows = await sel<OrderRow>(
    `SELECT o.*, s.name session_name, fa.name family_name,
       COALESCE((SELECT sum(amount_cents) FROM payments pa WHERE pa.order_id=o.id),0) paid_cents,
       (SELECT COALESCE(sum(qty),0) FROM order_items i WHERE i.order_id=o.id) items_count
     FROM orders o JOIN sessions s ON s.id=o.session_id JOIN families fa ON fa.id=o.family_id
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY o.created_at DESC LIMIT 2000`, p);
  return f.payment ? rows.filter((r) => r.status === 'validee' && paymentStatus(r.total_cents, r.paid_cents) === f.payment) : rows;
}

/** Session pricing context: price rows + promotions. */
export async function pricingContext(sessionId: string) {
  const s = await one<{ price_list_id: string | null }>('SELECT price_list_id FROM sessions WHERE id=?', [sessionId]);
  if (!s?.price_list_id) return { priceListId: null, rows: [], promotions: [] };
  const [rows, promos] = await Promise.all([getPriceItems(s.price_list_id), listPromotions(s.price_list_id)]);
  return { priceListId: s.price_list_id, rows, promotions: promos.map(toPromotion) };
}

export const totalsOf = (cart: Cart, promotions: Awaited<ReturnType<typeof pricingContext>>['promotions']): CartTotals =>
  computeCart(cart.compositions, cart.items.map((i) => ({ ...i, styleId: cart.compositions.find((c) => c.key === i.compositionKey)?.styleId ?? null })), promotions, cart.manual);

export const emptyCart = (sessionId: string, familyId: string, registrationId: string | null): Cart => ({
  orderId: null, status: 'brouillon', sessionId, familyId, registrationId, compositions: [], items: [], manual: [], notes: '', desiredDelivery: null,
});

export async function loadCart(orderId: string, repriceDraft = true): Promise<Cart> {
  const o = await one<{ id: string; number: string; status: OrderStatus; session_id: string; family_id: string; registration_id: string | null; notes: string | null; desired_delivery: string | null; payment_plan: string | null }>('SELECT * FROM orders WHERE id=?', [orderId]);
  if (!o) throw new Error('Commande introuvable');
  const comps = await sel<{ id: string; style_id: string | null; style_name: string; iris_count: number; participant_ids: string; participant_names: string | null; instructions: string | null; fee_cents: number; orientation: string | null }>(
    'SELECT * FROM order_compositions WHERE order_id=? ORDER BY sort', [orderId]);
  const items = await sel<{ id: string; composition_id: string | null; variant_id: string | null; product_id: string | null; category: string; product_name: string; variant_name: string | null; qty: number; unit_price_cents: number; unit_cost_cents: number; parent_item_id: string | null }>(
    'SELECT * FROM order_items WHERE order_id=? ORDER BY sort', [orderId]);
  const disc = await sel<{ label: string; amount_cents: number; reason: string | null }>("SELECT * FROM order_discounts WHERE order_id=? AND kind='manual'", [orderId]);
  const cart: Cart = {
    orderId: o.id, number: o.number, status: o.status, sessionId: o.session_id, familyId: o.family_id, registrationId: o.registration_id,
    compositions: comps.map((c) => ({ key: c.id, styleId: c.style_id, styleName: c.style_name, irisCount: c.iris_count, feeCents: c.fee_cents,
      participantIds: JSON.parse(c.participant_ids), participantNames: c.participant_names ?? '', instructions: c.instructions ?? '', orientation: (c.orientation as Orientation | null) ?? null })),
    items: items.map((i) => ({ key: i.id, variantId: i.variant_id, productId: i.product_id, category: i.category, productName: i.product_name,
      variantName: i.variant_name, compositionKey: i.composition_id, parentKey: i.parent_item_id, qty: i.qty, unitPriceCents: i.unit_price_cents, unitCostCents: i.unit_cost_cents })),
    manual: disc.map((d) => ({ label: d.label, amount_cents: d.amount_cents, reason: d.reason })),
    notes: o.notes ?? '', desiredDelivery: o.desired_delivery, paymentPlan: o.payment_plan ? JSON.parse(o.payment_plan) : null,
  };
  if (repriceDraft && o.status === 'brouillon') {
    const ctx = await pricingContext(o.session_id);
    for (const c of cart.compositions) if (c.styleId) c.feeCents = findPrice(ctx.rows, 'style', c.styleId, c.irisCount) ?? c.feeCents;
    for (const i of cart.items) if (i.variantId) {
      const iris = cart.compositions.find((c) => c.key === i.compositionKey)?.irisCount ?? 0;
      i.unitPriceCents = findPrice(ctx.rows, 'variant', i.variantId, iris) ?? i.unitPriceCents;
    }
  }
  return cart;
}

async function nextNumber(): Promise<string> {
  const y = new Date().getFullYear();
  const r = await one<{ n: number }>("SELECT COALESCE(max(CAST(substr(number,6) AS INTEGER)),0)+1 n FROM orders WHERE number LIKE ?", [`${y}-%`]);
  return `${y}-${String(r?.n ?? 1).padStart(4, '0')}`;
}

/**
 * Saves the cart as draft or validated order, atomically.
 * - Correction of a validated order is logged in audit_logs with the previous snapshot.
 * - Lines keep their stored unit price (historic prices are never recomputed for validated orders).
 * - Production tasks are created on validation and kept (with their statuses) on correction.
 */
export async function saveCart(cart: Cart, target: 'brouillon' | 'validee', correctionReason?: string): Promise<{ id: string; number: string }> {
  if (!cart.compositions.length && !cart.items.length) throw new Error('La commande est vide.');
  for (const c of cart.compositions) if (c.irisCount < 1) throw new Error(`Création « ${c.styleName} » : sélectionnez au moins un iris.`);
  for (const i of cart.items) if (!(i.qty > 0)) throw new Error(`Quantité invalide pour ${i.productName}.`);
  const { promotions } = await pricingContext(cart.sessionId);
  const t = totalsOf(cart, promotions);
  const now = nowIso();
  const stmts: Stmt[] = [];
  const prev = cart.orderId ? await one<{ status: OrderStatus; number: string }>('SELECT status, number FROM orders WHERE id=?', [cart.orderId]) : null;
  if (prev?.status === 'annulee') throw new Error('Une commande annulée ne peut plus être modifiée.');
  const id = cart.orderId ?? uid();
  const number = prev?.number ?? (await nextNumber());
  const cost = cart.items.reduce((s, i) => s + i.unitCostCents * i.qty, 0);

  if (prev?.status === 'validee') {
    const before = await loadCart(id, false);
    stmts.push(auditStmt('order', id, 'correction', { reason: correctionReason ?? null, before, total_after: t.total_cents }));
    // An issued invoice is immutable: cancel it with a credit note; the next print issues a new invoice.
    stmts.push(...(await (await import('./invoices')).creditNoteStmts(id, `Correction de la commande${correctionReason ? ' : ' + correctionReason : ''}`)));
  }
  const head = {
    session_id: cart.sessionId, family_id: cart.familyId, registration_id: cart.registrationId,
    status: target === 'validee' || prev?.status === 'validee' ? 'validee' : 'brouillon',
    subtotal_cents: t.subtotal_cents, discount_cents: t.discount_cents, total_cents: t.total_cents, cost_estimate_cents: cost,
    notes: cart.notes || null, desired_delivery: cart.desiredDelivery || null, updated_at: now,
    payment_plan: cart.paymentPlan && cart.paymentPlan.count > 1 ? JSON.stringify({ ...cart.paymentPlan, schedule: schedule(t.total_cents, cart.paymentPlan) }) : null,
  };
  if (prev) stmts.push(updateStmt('orders', id, { ...head, validated_at: prev.status !== 'validee' && target === 'validee' ? now : undefined }));
  else stmts.push(insertStmt('orders', { id, number, ...head, created_at: now, validated_at: target === 'validee' ? now : null }));

  // compositions & items: upsert by id, delete removed ones
  const compIds = cart.compositions.map((c) => c.key);
  const itemIds = cart.items.map((i) => i.key);
  const notIn = (ids: string[]) => (ids.length ? `AND id NOT IN (${ids.map(() => '?').join(',')})` : '');
  stmts.push({ sql: `DELETE FROM order_items WHERE order_id=? ${notIn(itemIds)}`, params: [id, ...itemIds] });
  stmts.push({ sql: `DELETE FROM order_compositions WHERE order_id=? ${notIn(compIds)}`, params: [id, ...compIds] });
  cart.compositions.forEach((c, n) => stmts.push({
    sql: `INSERT INTO order_compositions (id, order_id, style_id, style_name, iris_count, participant_ids, participant_names, instructions, fee_cents, sort, orientation)
          VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET style_id=excluded.style_id, style_name=excluded.style_name, iris_count=excluded.iris_count,
          participant_ids=excluded.participant_ids, participant_names=excluded.participant_names, instructions=excluded.instructions, fee_cents=excluded.fee_cents, sort=excluded.sort, orientation=excluded.orientation`,
    params: [c.key, id, c.styleId, c.styleName, c.irisCount, JSON.stringify(c.participantIds), c.participantNames, c.instructions || null, c.feeCents, n, c.orientation ?? null],
  }));
  cart.items.forEach((i, n) => stmts.push({
    sql: `INSERT INTO order_items (id, order_id, composition_id, variant_id, product_id, category, product_name, variant_name, qty, unit_price_cents, line_total_cents, unit_cost_cents, sort, parent_item_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET composition_id=excluded.composition_id, parent_item_id=excluded.parent_item_id, qty=excluded.qty,
          unit_price_cents=excluded.unit_price_cents, line_total_cents=excluded.line_total_cents, unit_cost_cents=excluded.unit_cost_cents, sort=excluded.sort`,
    params: [i.key, id, i.compositionKey ?? null, i.variantId, i.productId, i.category, i.productName, i.variantName ?? null, i.qty, i.unitPriceCents, i.qty * i.unitPriceCents, i.unitCostCents, n, i.parentKey ?? null],
  }));
  stmts.push({ sql: 'DELETE FROM order_discounts WHERE order_id=?', params: [id] });
  for (const d of t.discounts)
    stmts.push(insertStmt('order_discounts', { id: uid(), order_id: id, promotion_id: d.promotionId, kind: d.kind, label: d.kind === 'auto' ? discountLabel(d) : d.label, amount_cents: d.amount_cents, reason: d.reason ?? null, created_at: now }));

  if (head.status === 'validee') {
    for (const c of cart.compositions)
      stmts.push({ sql: `INSERT INTO production_tasks (id, order_id, composition_id, kind, status, updated_at) SELECT ?,?,?,'composition','a_realiser',? WHERE NOT EXISTS (SELECT 1 FROM production_tasks WHERE composition_id=?)`, params: [uid(), id, c.key, now, c.key] });
    for (const i of cart.items.filter((x) => !x.compositionKey))
      stmts.push({ sql: `INSERT INTO production_tasks (id, order_id, order_item_id, kind, status, updated_at) SELECT ?,?,?,'item',?,? WHERE NOT EXISTS (SELECT 1 FROM production_tasks WHERE order_item_id=?)`, params: [uid(), id, i.key, i.category === 'impression' ? 'impression_a_commander' : 'a_realiser', now, i.key] });
    if (cart.registrationId)
      stmts.push({ sql: "UPDATE session_registrations SET appt_status='termine', updated_at=? WHERE id=? AND appt_status IN ('a_venir','present','en_cours')", params: [now, cart.registrationId] });
  }
  if (!prev || prev.status !== head.status) stmts.push(auditStmt('order', id, head.status === 'validee' ? 'validate' : 'save_draft', { total: t.total_cents }));
  await batch(stmts);
  return { id, number };
}

export async function cancelOrder(id: string, reason: string) {
  await batch([
    ...(await (await import('./invoices')).creditNoteStmts(id, `Annulation de la commande : ${reason}`)),
    { sql: "UPDATE orders SET status='annulee', cancelled_at=?, updated_at=? WHERE id=?", params: [nowIso(), nowIso(), id] },
    auditStmt('order', id, 'cancel', { reason }),
  ]);
}
export async function deleteDraft(id: string) {
  const o = await one<{ status: string }>('SELECT status FROM orders WHERE id=?', [id]);
  if (o?.status !== 'brouillon') throw new Error('Seuls les brouillons peuvent être supprimés.');
  const p = await one<{ n: number }>('SELECT count(*) n FROM payments WHERE order_id=?', [id]);
  if (p && p.n) throw new Error('Ce brouillon a des règlements enregistrés.');
  await batch([{ sql: 'DELETE FROM orders WHERE id=?', params: [id] }, auditStmt('order', id, 'delete_draft')]);
}

/**
 * Permanently deletes ANY order (validated or cancelled) with its lines, payments, production tasks and
 * supplier-order lines. A full snapshot is kept in audit_logs. The UI makes a database backup first.
 */
export async function deleteOrder(id: string, reason?: string | null) {
  const o = await one<{ number: string; status: string; total_cents: number; session_id: string; family_id: string }>('SELECT number, status, total_cents, session_id, family_id FROM orders WHERE id=?', [id]);
  if (!o) throw new Error('Commande introuvable');
  const [cart, payments] = await Promise.all([loadCart(id, false), sel('SELECT * FROM payments WHERE order_id=?', [id])]);
  await batch([
    ...(await (await import('./invoices')).creditNoteStmts(id, `Suppression de la commande${reason ? ' : ' + reason : ''}`)),
    { sql: 'DELETE FROM orders WHERE id=?', params: [id] },
    auditStmt('order', id, 'delete_order', { reason: reason ?? null, order: o, cart, payments }),
  ]);
  return o;
}

/** What will be lost when deleting an order (shown in the confirmation). */
export async function orderDeletionImpact(id: string) {
  return (await one<{ payments: number; paid: number; tasks: number; supplier_lines: number }>(
    `SELECT (SELECT count(*) FROM payments WHERE order_id=?) payments, (SELECT COALESCE(sum(amount_cents),0) FROM payments WHERE order_id=?) paid,
       (SELECT count(*) FROM production_tasks WHERE order_id=?) tasks,
       (SELECT count(*) FROM supplier_order_items soi JOIN order_items i ON i.id=soi.order_item_id WHERE i.order_id=?) supplier_lines`, [id, id, id, id]))!;
}

/** Deletes several drafts; drafts with payments are kept. Returns how many were deleted / kept. */
export async function deleteDrafts(ids: string[]) {
  let deleted = 0, kept = 0;
  for (const id of ids) {
    try { await deleteDraft(id); deleted++; } catch { kept++; }
  }
  return { deleted, kept };
}

/** New draft with same content at current prices. */
export async function duplicateOrder(id: string): Promise<string> {
  const c = await loadCart(id, false);
  const map = new Map<string, string>();
  const copy: Cart = {
    ...c, orderId: null, number: undefined, status: 'brouillon',
    compositions: c.compositions.map((x) => { const k = uid(); map.set(x.key, k); return { ...x, key: k }; }),
    items: [],
  };
  const imap = new Map(c.items.map((x) => [x.key, uid()]));
  copy.items = c.items.map((x) => ({ ...x, key: imap.get(x.key)!, compositionKey: x.compositionKey ? map.get(x.compositionKey) ?? null : null, parentKey: x.parentKey ? imap.get(x.parentKey) ?? null : null }));
  const ctx = await pricingContext(c.sessionId);
  for (const x of copy.compositions) if (x.styleId) x.feeCents = findPrice(ctx.rows, 'style', x.styleId, x.irisCount) ?? x.feeCents;
  for (const x of copy.items) if (x.variantId) x.unitPriceCents = findPrice(ctx.rows, 'variant', x.variantId, copy.compositions.find((k) => k.key === x.compositionKey)?.irisCount ?? 0) ?? x.unitPriceCents;
  return (await saveCart(copy, 'brouillon')).id;
}

/* ---------- detail & payments */
export interface Payment { id: string; order_id: string; amount_cents: number; method: PaymentMethod; paid_at: string; note: string | null }
export async function getOrderDetail(id: string) {
  const o = await one<OrderRow & { notes: string | null; desired_delivery: string | null; payment_note: string | null; registration_id: string | null; cancelled_at: string | null; cost_estimate_cents: number; family_phone: string | null; family_email: string | null; contact_first_name: string | null; session_date: string | null }>(
    `SELECT o.*, s.name session_name, s.date session_date, f.name family_name, f.phone family_phone, f.email family_email, f.contact_first_name,
       COALESCE((SELECT sum(amount_cents) FROM payments pa WHERE pa.order_id=o.id),0) paid_cents, 0 items_count
     FROM orders o JOIN sessions s ON s.id=o.session_id JOIN families f ON f.id=o.family_id WHERE o.id=?`, [id]);
  if (!o) return null;
  const [cart, payments, discounts, history] = await Promise.all([
    loadCart(id, false),
    sel<Payment>('SELECT * FROM payments WHERE order_id=? ORDER BY paid_at, created_at', [id]),
    sel<{ id: string; kind: string; label: string; amount_cents: number; reason: string | null }>('SELECT * FROM order_discounts WHERE order_id=? ORDER BY kind', [id]),
    sel<{ id: string; action: string; details: string | null; created_at: string }>("SELECT * FROM audit_logs WHERE (entity='order' OR entity='payment') AND entity_id=? ORDER BY created_at DESC", [id]),
  ]);
  return { order: o, cart, payments, discounts, history };
}

export async function addPayment(orderId: string, p: { amount_cents: number; method: PaymentMethod; paid_at: string; note?: string | null }) {
  if (!(p.amount_cents > 0)) throw new Error('Montant invalide.');
  const o = await one<{ total_cents: number; status: string; paid: number }>(
    'SELECT total_cents, status, COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id=o.id),0) paid FROM orders o WHERE id=?', [orderId]);
  if (!o) throw new Error('Commande introuvable');
  if (o.status === 'annulee') throw new Error('Commande annulée.');
  if (o.paid + p.amount_cents > o.total_cents) throw new Error(`Le montant dépasse le solde restant (${((o.total_cents - o.paid) / 100).toFixed(2).replace('.', ',')} €).`);
  const id = uid();
  await batch([insertStmt('payments', { id, order_id: orderId, ...p, note: p.note ?? null, created_at: nowIso() }),
    auditStmt('payment', orderId, 'payment_add', p)]);
}
export async function deletePayment(id: string) {
  const p = await one<Payment>('SELECT * FROM payments WHERE id=?', [id]);
  if (!p) return;
  await batch([{ sql: 'DELETE FROM payments WHERE id=?', params: [id] }, auditStmt('payment', p.order_id, 'payment_delete', p)]);
}
export const setPaymentPlan = (orderId: string, due: string | null, note: string | null) =>
  batch([updateStmt('orders', orderId, { payment_due_date: due, payment_note: note, updated_at: nowIso() })]);
