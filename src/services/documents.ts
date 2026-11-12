/** Gathers data for PDF documents (client documents only read sale prices). */
import { getSettings, one, sel } from './base';
import { getOrderDetail, PAYMENT_METHODS, PAYMENT_STATUS, ORDER_STATUS } from './orders';
import { listStyles, listProducts, listVariants } from './catalog';
import { getPriceItems, listPromotions } from './pricing';
import { listTasks, TASK_STATUS } from './production';
import { findPrice, instalmentStatus, paymentStatus, schedule } from '../lib/pricing';
import { todayIso } from '../lib/ids';
import { ORIENTATION_LABEL } from '../lib/formatsGuide';
import { clientName, issueInvoice, type InvoiceRow } from './invoices';
import { invoicePdf } from '../lib/pdf';
import { catalogPdf, clientRecapPdf, productionSheetPdf, type Brand, type CatalogData } from '../lib/pdf';

export async function brand(): Promise<Brand> {
  const s = await getSettings();
  return { name: s.business_name || 'MF/1.2', tagline: s.tagline || 'Iris Studio', contact: s.contact_name, email: s.contact_email, phone: s.contact_phone, website: s.website, address: s.address };
}

export async function orderRecapPdf(orderId: string) {
  const d = await getOrderDetail(orderId);
  if (!d) throw new Error('Commande introuvable');
  const { order: o, cart, payments, discounts } = d;
  return clientRecapPdf({
    brand: await brand(), number: o.number, date: o.validated_at ?? o.created_at, status: ORDER_STATUS[o.status], session: o.session_name,
    family: clientName(o.contact_first_name, o.family_name), contact: [o.family_phone, o.family_email].filter(Boolean).join(' · '),
    compositions: cart.compositions.map((c) => ({ style: c.styleName, iris: c.irisCount, participants: c.participantNames, fee: c.feeCents,
      orientation: c.orientation ? ORIENTATION_LABEL[c.orientation].toLowerCase() : null, instructions: c.instructions || null,
      items: cart.items.filter((i) => i.compositionKey === c.key).map((i) => ({ name: `${i.productName}${i.variantName ? ' — ' + i.variantName : ''}`, qty: i.qty, unit: i.unitPriceCents })) })),
    looseItems: cart.items.filter((i) => !i.compositionKey).map((i) => ({ name: `${i.productName}${i.variantName ? ' — ' + i.variantName : ''}`, qty: i.qty, unit: i.unitPriceCents })),
    subtotal: o.subtotal_cents, discounts: discounts.map((x) => ({ label: x.label, amount: x.amount_cents })), total: o.total_cents, paid: o.paid_cents,
    paymentStatus: PAYMENT_STATUS[paymentStatus(o.total_cents, o.paid_cents)], payments: payments.map((p) => ({ date: p.paid_at, method: PAYMENT_METHODS[p.method], amount: p.amount_cents })),
    dueDate: o.payment_due_date, notes: o.notes,
    instalments: cart.paymentPlan && cart.paymentPlan.count > 1
      ? instalmentStatus(schedule(o.total_cents, cart.paymentPlan), o.paid_cents, todayIso()).map((x) => ({ n: x.n, date: x.date, amount: x.amount_cents, paid: x.state === 'paye' }))
      : undefined,
  });
}

export async function catalogData(sessionId: string): Promise<CatalogData> {
  const s = await one<{ name: string; price_list_id: string | null; conditions: string | null }>(
    `SELECT s.name, s.price_list_id, t.conditions FROM sessions s LEFT JOIN price_lists pl ON pl.id=s.price_list_id LEFT JOIN price_templates t ON t.id=pl.source_template_id WHERE s.id=?`, [sessionId]);
  if (!s) throw new Error('Séance introuvable');
  const rows = s.price_list_id ? await getPriceItems(s.price_list_id) : [];
  const promos = s.price_list_id ? (await listPromotions(s.price_list_id)).filter((p) => p.active) : [];
  const styles = (await listStyles()).filter((x) => x.active);
  const images = await sel<{ style_id: string; full: string }>('SELECT e.style_id, m.full FROM composition_examples e JOIN media m ON m.id=e.media_id ORDER BY e.sort');
  const products = (await listProducts()).filter((p) => p.active);
  const variants = (await listVariants()).filter((v) => v.active);
  return {
    brand: await brand(), session: s.name, conditions: s.conditions,
    styles: styles.map((st) => ({
      name: st.name, description: st.description, minIris: st.min_iris, maxIris: st.max_iris,
      images: images.filter((i) => i.style_id === st.id).map((i) => i.full),
      prices: rows.filter((r) => r.kind === 'style' && r.ref_id === st.id && r.enabled).sort((a, b) => a.iris_count - b.iris_count)
        .map((r) => ({ label: r.iris_count ? `${r.iris_count} iris` : 'Création', price: r.price_cents })),
    })),
    products: products.map((p) => ({ category: p.category, name: p.name, description: p.description,
      variants: variants.filter((v) => v.product_id === p.id).map((v) => ({ name: v.name, price: findPrice(rows, 'variant', v.id) })).filter((v): v is { name: string; price: number } => v.price != null) })),
    promotions: promos.map((p) => ({ name: p.name, description: p.description })),
  };
}
export const sessionCatalogPdf = async (sessionId: string, compact = false) => catalogPdf(await catalogData(sessionId), compact);

export async function productionPdf(f: { sessionId?: string; taskIds?: string[] }, title: string) {
  let tasks = await listTasks({ sessionId: f.sessionId });
  if (f.taskIds) tasks = tasks.filter((t) => f.taskIds!.includes(t.id));
  return productionSheetPdf({
    brand: await brand(), title,
    entries: tasks.map((t) => ({
      family: t.family_name, order: t.order_number, session: t.session_name, style: t.style_name ?? t.item_product ?? '', iris: t.iris_count ?? 0,
      orientation: t.orientation ? ORIENTATION_LABEL[t.orientation].toLowerCase() : null,
      participants: t.participant_names ?? '', refs: t.refs.map((r) => `${r.participant} : ${r.reference}`).join(', '), instructions: t.instructions ?? t.notes ?? '',
      products: t.kind === 'item' ? `${t.item_product} ${t.item_variant ?? ''} × ${t.item_qty}` : t.items.map((i) => `${i.product_name}${i.variant_name ? ' ' + i.variant_name : ''} × ${i.qty}`).join(' ; '),
      delivery: t.desired_delivery, status: TASK_STATUS[t.status], thumb: t.example_thumb,
    })),
  });
}

/** PDF of an issued invoice / credit note (always rendered from its frozen content). */
export const invoicePdfOf = (row: Pick<InvoiceRow, 'data'>) => invoicePdf(JSON.parse(row.data));
/** Issues (or reprints) the invoice of a validated order. */
export async function orderInvoicePdf(orderId: string) {
  const r = await issueInvoice(orderId);
  return { ...r, pdf: invoicePdf(r.data) };
}
