import { auditStmt, batch, insertStmt, nowIso, sel, uid, updateStmt } from './base';
import { variantCosts } from './suppliers';
import type { Stmt } from '../lib/db/types';

export type TaskStatus = 'a_realiser' | 'en_cours' | 'montage_termine' | 'fichier_pret' | 'impression_a_commander' | 'commande_fournisseur' | 'recu' | 'livre';
export const TASK_STATUS: Record<TaskStatus, string> = {
  a_realiser: 'À réaliser', en_cours: 'En cours', montage_termine: 'Montage terminé', fichier_pret: 'Fichier numérique prêt',
  impression_a_commander: 'Impression à commander', commande_fournisseur: 'Commandé fournisseur', recu: 'Reçu', livre: 'Livré',
};
export const DIGITAL_FLOW: TaskStatus[] = ['a_realiser', 'en_cours', 'montage_termine', 'fichier_pret', 'livre'];
export const FULL_FLOW: TaskStatus[] = Object.keys(TASK_STATUS) as TaskStatus[];
export const flowFor = (hasPrint: boolean) => (hasPrint ? FULL_FLOW : DIGITAL_FLOW);

export interface TaskItem { id: string; product_name: string; variant_name: string | null; category: string; qty: number; variant_id: string | null; supplier_name?: string }
export interface Task {
  id: string; kind: 'composition' | 'item'; status: TaskStatus; notes: string | null; updated_at: string;
  order_id: string; order_number: string; session_id: string; session_name: string; family_id: string; family_name: string; desired_delivery: string | null;
  composition_id: string | null; style_id: string | null; style_name: string | null; iris_count: number | null; participant_ids: string | null; participant_names: string | null; instructions: string | null; orientation: 'horizontal' | 'vertical' | 'diagonale' | null;
  order_item_id: string | null; item_product: string | null; item_variant: string | null; item_qty: number | null; item_category: string | null;
  example_thumb: string | null;
  items: TaskItem[]; refs: { participant: string; reference: string; file_path: string | null }[]; hasPrint: boolean;
}

export async function listTasks(f: { sessionId?: string; status?: string } = {}): Promise<Task[]> {
  const w = ["o.status='validee'"], p: string[] = [];
  if (f.sessionId) { w.push('o.session_id=?'); p.push(f.sessionId); }
  if (f.status) { w.push('t.status=?'); p.push(f.status); }
  const tasks = await sel<Task>(
    `SELECT t.*, o.number order_number, o.session_id, s.name session_name, o.family_id, fa.name family_name, o.desired_delivery,
       c.style_id, c.style_name, c.iris_count, c.participant_ids, c.participant_names, c.instructions, c.orientation,
       i.product_name item_product, i.variant_name item_variant, i.qty item_qty, i.category item_category, NULL example_thumb
     FROM production_tasks t JOIN orders o ON o.id=t.order_id JOIN sessions s ON s.id=o.session_id JOIN families fa ON fa.id=o.family_id
     LEFT JOIN order_compositions c ON c.id=t.composition_id LEFT JOIN order_items i ON i.id=t.order_item_id
     WHERE ${w.join(' AND ')} ORDER BY s.date DESC, fa.name COLLATE NOCASE, o.number`, p);
  if (!tasks.length) return tasks;
  const orderIds = [...new Set(tasks.map((t) => t.order_id))];
  const ph = orderIds.map(() => '?').join(',');
  const [items, refs] = await Promise.all([
    sel<TaskItem & { composition_id: string | null }>(`SELECT id, composition_id, product_name, variant_name, category, qty, variant_id FROM order_items WHERE order_id IN (${ph}) ORDER BY sort`, orderIds),
    sel<{ participant_id: string; first_name: string; reference: string; file_path: string | null; family_id: string }>(
      `SELECT fr.participant_id, p.first_name, fr.reference, fr.file_path, p.family_id FROM file_references fr JOIN participants p ON p.id=fr.participant_id
       WHERE p.family_id IN (SELECT family_id FROM orders WHERE id IN (${ph})) ORDER BY fr.reference`, orderIds),
  ]);
  // Example image of the style, preferring one made for the same number of iris (computed here: portable across SQLite versions).
  const styleIds = [...new Set(tasks.map((t) => t.style_id).filter((x): x is string => !!x))];
  const examples = styleIds.length
    ? await sel<{ style_id: string; iris_count: number | null; thumb: string }>(
      `SELECT e.style_id, e.iris_count, m.thumb FROM composition_examples e JOIN media m ON m.id=e.media_id WHERE e.style_id IN (${styleIds.map(() => '?').join(',')}) ORDER BY e.sort`, styleIds)
    : [];
  for (const t of tasks) {
    const ex = examples.filter((e) => e.style_id === t.style_id);
    t.example_thumb = (ex.find((e) => e.iris_count === t.iris_count) ?? ex[0])?.thumb ?? null;
    t.items = t.composition_id ? items.filter((i) => i.composition_id === t.composition_id) : [];
    const pids: string[] = t.participant_ids ? JSON.parse(t.participant_ids) : [];
    t.refs = refs.filter((r) => pids.includes(r.participant_id)).map((r) => ({ participant: r.first_name, reference: r.reference, file_path: r.file_path }));
    t.hasPrint = t.kind === 'item' ? t.item_category === 'impression' : t.items.some((i) => i.category === 'impression');
  }
  return tasks;
}

export async function setTaskStatus(ids: string[], status: TaskStatus) {
  const now = nowIso();
  await batch(ids.flatMap((id) => [updateStmt('production_tasks', id, { status, updated_at: now }), auditStmt('task', id, 'status', { status })]));
}
export const setTaskNotes = (id: string, notes: string) => batch([updateStmt('production_tasks', id, { notes, updated_at: nowIso() })]);

/* ---------- prints to order from suppliers */
export interface PrintLine {
  order_item_id: string; order_id: string; order_number: string; session_id: string; session_name: string; family_name: string;
  product_name: string; variant_name: string | null; variant_id: string | null; qty: number; style_name: string | null; composition_id: string | null;
  supplier_id: string; supplier_name: string; unit_cost: number | null; supplier_order_id: string | null; supplier_order_status: string | null;
}
export async function listPrintLines(sessionId?: string): Promise<PrintLine[]> {
  const rows = await sel<Omit<PrintLine, 'supplier_id' | 'supplier_name' | 'unit_cost'>>(
    `SELECT i.id order_item_id, o.id order_id, o.number order_number, o.session_id, s.name session_name, fa.name family_name,
       i.product_name, i.variant_name, i.variant_id, i.qty, c.style_name, i.composition_id,
       so.id supplier_order_id, so.status supplier_order_status, i.category
     FROM order_items i JOIN orders o ON o.id=i.order_id JOIN sessions s ON s.id=o.session_id JOIN families fa ON fa.id=o.family_id
     LEFT JOIN order_compositions c ON c.id=i.composition_id
     LEFT JOIN supplier_order_items soi ON soi.order_item_id=i.id LEFT JOIN supplier_orders so ON so.id=soi.supplier_order_id AND so.status<>'annulee'
     WHERE o.status='validee' AND i.category IN ('impression','option') ${sessionId ? 'AND o.session_id=?' : ''}
     ORDER BY s.date DESC, i.product_name, i.variant_name`, sessionId ? [sessionId] : []);
  const costs = await variantCosts();
  // Options (e.g. frames) are listed only when a supplier provides them.
  return rows.filter((r) => (r as { category?: string }).category === 'impression' || (r.variant_id && costs.has(r.variant_id))).map((r) => {
    const c = r.variant_id ? costs.get(r.variant_id) : undefined;
    return { ...r, supplier_id: c?.supplierId ?? '', supplier_name: c?.supplierName || 'Fournisseur non défini', unit_cost: c?.cost ?? null };
  });
}

export async function createSupplierOrder(supplierId: string, lines: PrintLine[], sessionId: string | null) {
  if (!supplierId) throw new Error('Choisissez un fournisseur.');
  if (!lines.length) throw new Error('Aucune ligne sélectionnée.');
  const id = uid(), now = nowIso();
  const est = lines.reduce((s, l) => s + (l.unit_cost ?? 0) * l.qty, 0);
  const stmts: Stmt[] = [insertStmt('supplier_orders', { id, supplier_id: supplierId, session_id: sessionId, status: 'brouillon', estimated_cost_cents: est, created_at: now })];
  for (const l of lines) stmts.push(insertStmt('supplier_order_items', { id: uid(), supplier_order_id: id, order_item_id: l.order_item_id, qty: l.qty, est_cost_cents: (l.unit_cost ?? 0) * l.qty }));
  stmts.push(auditStmt('supplier_order', id, 'create', { lines: lines.length, est }));
  await batch(stmts);
  return id;
}

export interface SupplierOrder { id: string; supplier_id: string; supplier_name: string; session_id: string | null; session_name: string | null; reference: string | null; status: 'brouillon' | 'commandee' | 'recue' | 'annulee'; estimated_cost_cents: number; actual_cost_cents: number | null; shipping_cents: number; ordered_at: string | null; received_at: string | null; notes: string | null; created_at: string; lines: number }
export const SUPPLIER_ORDER_STATUS = { brouillon: 'À commander', commandee: 'Commandée', recue: 'Reçue', annulee: 'Annulée' } as const;

export const listSupplierOrders = (sessionId?: string) =>
  sel<SupplierOrder>(`SELECT so.*, su.name supplier_name, s.name session_name, (SELECT count(*) FROM supplier_order_items x WHERE x.supplier_order_id=so.id) lines
    FROM supplier_orders so JOIN suppliers su ON su.id=so.supplier_id LEFT JOIN sessions s ON s.id=so.session_id
    ${sessionId ? 'WHERE so.session_id=?' : ''} ORDER BY so.created_at DESC`, sessionId ? [sessionId] : []);

export const supplierOrderLines = (id: string) =>
  sel<{ id: string; qty: number; est_cost_cents: number; product_name: string; variant_name: string | null; family_name: string; order_number: string; style_name: string | null }>(
    `SELECT soi.id, soi.qty, soi.est_cost_cents, i.product_name, i.variant_name, fa.name family_name, o.number order_number, c.style_name
     FROM supplier_order_items soi JOIN order_items i ON i.id=soi.order_item_id JOIN orders o ON o.id=i.order_id JOIN families fa ON fa.id=o.family_id
     LEFT JOIN order_compositions c ON c.id=i.composition_id WHERE soi.supplier_order_id=? ORDER BY i.product_name, i.variant_name`, [id]);

/** Updates a supplier order and propagates the status to linked production tasks. */
export async function updateSupplierOrder(id: string, d: Partial<Pick<SupplierOrder, 'status' | 'reference' | 'actual_cost_cents' | 'shipping_cents' | 'ordered_at' | 'received_at' | 'notes'>>) {
  const stmts: Stmt[] = [updateStmt('supplier_orders', id, d), auditStmt('supplier_order', id, 'update', d)];
  const taskStatus = d.status === 'commandee' ? 'commande_fournisseur' : d.status === 'recue' ? 'recu' : null;
  if (taskStatus) {
    const sub = `SELECT i.composition_id FROM supplier_order_items soi JOIN order_items i ON i.id=soi.order_item_id WHERE soi.supplier_order_id=?`;
    const subItem = `SELECT soi.order_item_id FROM supplier_order_items soi WHERE soi.supplier_order_id=?`;
    stmts.push({ sql: `UPDATE production_tasks SET status=?, updated_at=? WHERE status<>'livre' AND (composition_id IN (${sub}) OR order_item_id IN (${subItem}))`, params: [taskStatus, nowIso(), id, id] });
  }
  await batch(stmts);
}
