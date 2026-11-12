import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, Copy, CreditCard, FileDown, Mail, History, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ErrorBox, Field, IconButton, Input, Loading, Modal, MoneyInput, PageHeader, Textarea, useAsync, useConfirm } from '../components/ui';
import { OrderBadge, PayBadge } from '../components/badges';
import { confirmAndDeleteOrder } from '../components/deleteOrder';
import { addPayment, cancelOrder, deletePayment, duplicateOrder, getOrderDetail, PAYMENT_METHODS, setPaymentPlan, type PaymentMethod } from '../services/orders';
import { invoicePdfOf, orderInvoicePdf, orderRecapPdf } from '../services/documents';
import { activeInvoice, invoicesOfOrder, type InvoiceRow } from '../services/invoices';
import { emailInvoice } from '../services/mail';
import { saveFile, PDF_FILTER } from '../lib/files';
import { eur, fmtRate, margin } from '../lib/money';
import { fmtDate, fmtDateTime, slug } from '../lib/format';
import { todayIso } from '../lib/ids';
import { instalmentStatus, schedule } from '../lib/pricing';
import { ORIENTATION_LABEL } from '../lib/formatsGuide';
import { act } from '../lib/act';

const ACTIONS: Record<string, string> = { delete_order: 'Commande supprimée', save_draft: 'Brouillon enregistré', validate: 'Commande validée', correction: 'Correction', cancel: 'Annulation', payment_add: 'Règlement ajouté', payment_delete: 'Règlement supprimé', delete_draft: 'Brouillon supprimé' };

export default function OrderDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const d = useAsync(() => getOrderDetail(id), [id]);
  const inv = useAsync(() => invoicesOfOrder(id), [id]);
  const [payOpen, setPayOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  if (d.error) return <ErrorBox error={d.error} />;
  if (!d.data) return <Loading />;
  const { order: o, cart, payments, discounts, history } = d.data;
  const balance = o.total_cents - o.paid_cents;
  const plan = cart.paymentPlan && cart.paymentPlan.count > 1 ? instalmentStatus(schedule(o.total_cents, cart.paymentPlan), o.paid_cents, todayIso()) : null;
  const nextDue = plan?.find((x) => x.remaining_cents > 0) ?? null;
  const m = margin(o.total_cents, o.cost_estimate_cents);
  const pdf = () => act(async () => saveFile(`commande-${o.number}-${slug(o.family_name)}.pdf`, await orderRecapPdf(id), PDF_FILTER), 'Récapitulatif PDF enregistré');
  const invoice = async () => {
    const existing = await activeInvoice(id);
    if (!existing && !(await confirm({ title: 'Émettre la facture ?', text: 'Elle reçoit le prochain numéro de facture et son contenu est figé (obligation légale). Si la commande est corrigée ou annulée ensuite, un avoir est émis automatiquement.', confirm: 'Émettre la facture' }))) return;
    await act(async () => {
      const r = await orderInvoicePdf(id);
      await saveFile(`facture-${r.row.number}-${slug(o.family_name)}.pdf`, r.pdf, PDF_FILTER);
      inv.reload();
      return r;
    }, (r) => (r.created ? `Facture ${r.row.number} émise` : `Facture ${r.row.number} enregistrée (duplicata)`));
  };

  const sendMail = async (row?: InvoiceRow) => {
    if (!row) {
      const existing = await activeInvoice(id);
      if (!existing && !(await confirm({ title: 'Émettre la facture ?', text: 'Elle reçoit le prochain numéro de facture et son contenu est figé (obligation légale), puis un e-mail prêt à envoyer s’ouvre dans Mail.', confirm: 'Émettre et préparer l’e-mail' }))) return;
    }
    await act(async () => {
      const r = row ?? (await orderInvoicePdf(id)).row;
      inv.reload();
      const how = await emailInvoice(r, { to: o.family_email, firstName: o.contact_first_name, fileName: `${r.kind}-${r.number}-${slug(o.family_name)}.pdf` });
      return { how, number: r.number };
    }, (x) => x.how === 'mail'
      ? `E-mail prêt dans Mail (${x.number})${o.family_email ? '' : ' — aucune adresse e-mail pour ce client'}`
      : `PDF ${x.number} enregistré — joignez-le au message ouvert`);
  };

  return (
    <>
      <PageHeader back={() => nav(-1)} title={<>Commande <span className="font-mono text-[28px]">{o.number}</span></>}
        subtitle={<div className="flex items-center gap-3"><OrderBadge s={o.status} />{o.status === 'validee' && <PayBadge total={o.total_cents} paid={o.paid_cents} />}<span>{[o.contact_first_name, o.family_name].filter(Boolean).join(' ')} · {o.session_name} · {fmtDate(o.validated_at ?? o.created_at)}</span></div>}
        actions={<>
          {o.status === 'validee' && <Button icon={<Mail className="size-4" />} onClick={() => sendMail()}>Envoyer par e-mail</Button>}
          {o.status === 'validee' ? <Button variant="gold" icon={<FileDown className="size-4" />} onClick={invoice}>Facture PDF</Button> : <Button icon={<FileDown className="size-4" />} onClick={pdf}>Récapitulatif PDF</Button>}
          {o.status !== 'annulee' && <Button icon={<Pencil className="size-4" />} onClick={() => nav(`/vente/commande/${id}`)}>{o.status === 'validee' ? 'Corriger' : 'Reprendre'}</Button>}
          <Button icon={<Copy className="size-4" />} onClick={async () => { const nid = await act(() => duplicateOrder(id), 'Commande dupliquée en brouillon'); if (nid) nav(`/vente/commande/${nid}`); }}>Dupliquer</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirmAndDeleteOrder(confirm, { id, number: o.number, family_name: o.family_name, status: o.status })) nav('/commandes'); }}>{o.status === 'brouillon' ? 'Supprimer le brouillon' : 'Supprimer'}</Button>
          {o.status === 'validee' && <Button variant="danger" icon={<Ban className="size-4" />} onClick={async () => { const r = await confirm({ title: 'Annuler la commande ?', text: 'Elle restera dans l’historique avec le statut « Annulée ».', danger: true, confirm: 'Annuler la commande', input: { label: 'Motif', required: true } }); if (r) act(() => cancelOrder(id, r).then(() => { d.reload(); inv.reload(); }), 'Commande annulée'); }}>Annuler</Button>}
        </>} />
      <div className="grid grid-cols-[1fr_380px] gap-5">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Contenu" subtitle="Prix figés à la validation." />
            <div className="divide-y divide-ink-700/60">
              {cart.compositions.map((c) => (
                <div key={c.key} className="px-5 py-3.5">
                  <div className="flex justify-between"><div><span className="font-semibold">{c.styleName}</span> <span className="text-mist-400">· {c.irisCount} iris {c.participantNames && `· ${c.participantNames}`}</span></div><span className="tabular">{eur(c.feeCents)}</span></div>
                  {c.orientation && <div className="mt-1 text-[12.5px] text-mist-300">Disposition {ORIENTATION_LABEL[c.orientation].toLowerCase()}</div>}
                  {c.instructions && <div className="mt-1 text-[12.5px] text-mist-400 italic">« {c.instructions} »</div>}
                  {cart.items.filter((i) => i.compositionKey === c.key).map((i) => (
                    <div key={i.key} className="mt-1.5 flex justify-between pl-4 text-[13px] text-mist-200"><span>{i.productName} — {i.variantName} × {i.qty} <span className="text-mist-400">({eur(i.unitPriceCents)})</span></span><span className="tabular">{eur(i.qty * i.unitPriceCents)}</span></div>
                  ))}
                </div>
              ))}
              {cart.items.filter((i) => !i.compositionKey).map((i) => (
                <div key={i.key} className="flex justify-between px-5 py-3 text-[13.5px]"><span>{i.productName} — {i.variantName} × {i.qty}</span><span className="tabular">{eur(i.qty * i.unitPriceCents)}</span></div>
              ))}
            </div>
            <div className="space-y-1.5 border-t border-ink-700 px-5 py-4 text-[13.5px]">
              <div className="flex justify-between text-mist-300"><span>Sous-total</span><span className="tabular">{eur(o.subtotal_cents)}</span></div>
              {discounts.map((x) => <div key={x.id} className="flex justify-between text-emerald-300"><span>{x.label}{x.kind === 'manual' && <span className="text-mist-400"> — {x.reason}</span>}</span><span className="tabular">− {eur(x.amount_cents)}</span></div>)}
              <div className="flex justify-between pt-2 text-[20px] font-semibold"><span>Total</span><span className="text-gold-400 tabular">{eur(o.total_cents)}</span></div>
            </div>
          </Card>
          {o.notes && <Card className="px-5 py-4 text-[13.5px] text-mist-200">{o.notes}</Card>}
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><History className="size-4 text-mist-400" />Historique</span>} />
            <div className="divide-y divide-ink-700/50">
              {history.map((h) => {
                const det = h.details ? JSON.parse(h.details) : null;
                return (
                  <div key={h.id} className="flex gap-4 px-5 py-2.5 text-[13px]">
                    <span className="w-32 shrink-0 text-mist-400 tabular">{fmtDateTime(h.created_at)}</span>
                    <span className="font-medium">{ACTIONS[h.action] ?? h.action}</span>
                    <span className="truncate text-mist-400">{[det?.reason, det?.amount_cents ? `${eur(det.amount_cents)} · ${PAYMENT_METHODS[det.method as PaymentMethod] ?? ''}` : null, det?.total != null ? eur(det.total) : null, det?.total_after != null ? `nouveau total ${eur(det.total_after)}` : null].filter(Boolean).join(' — ')}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Règlements" subtitle="Aucun encaissement n’est effectué par l’application." actions={o.status === 'validee' && balance > 0 && <Button size="sm" variant="gold" icon={<Plus className="size-3.5" />} onClick={() => setPayOpen(true)}>Règlement</Button>} />
            <div className="px-5 py-4">
              <div className="flex justify-between text-[13.5px]"><span className="text-mist-400">Encaissé</span><span className="font-medium tabular">{eur(o.paid_cents)}</span></div>
              <div className="mt-1 flex justify-between text-[15px]"><span className="text-mist-400">Solde restant</span><span className={balance > 0 ? 'font-semibold text-amber-300 tabular' : 'font-semibold text-emerald-300 tabular'}>{eur(balance)}</span></div>
              {o.status === 'validee' && balance > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="subtle" onClick={() => setPayOpen(true)} icon={<CreditCard className="size-3.5" />}>Payé / partiel</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPlanOpen(true)}>À payer…</Button>
                </div>
              )}
              {plan && (
                <div className="mt-3 overflow-hidden rounded-lg border border-ink-700">
                  <div className="bg-ink-800 px-3 py-1.5 text-[12px] font-medium text-mist-300">Paiement en {plan.length} fois</div>
                  {plan.map((x) => (
                    <div key={x.n} className="flex items-center justify-between border-t border-ink-700/60 px-3 py-1.5 text-[12.5px]">
                      <span className="text-mist-300">{x.n}. {fmtDate(x.date)}</span>
                      <span className="flex items-center gap-2"><span className="tabular">{eur(x.amount_cents)}</span>
                        <Badge tone={x.state === 'paye' ? 'green' : x.state === 'retard' ? 'red' : 'neutral'}>{x.state === 'paye' ? 'Payée' : x.state === 'retard' ? (x.paid_cents ? `Reste ${eur(x.remaining_cents)}` : 'En retard') : x.paid_cents ? `Reste ${eur(x.remaining_cents)}` : 'À venir'}</Badge></span>
                    </div>
                  ))}
                </div>
              )}
              {(o.payment_due_date || o.payment_note) && <div className="mt-3 rounded-lg bg-ink-800 px-3 py-2 text-[12.5px] text-mist-300">{o.payment_due_date && <>Échéance prévue : {fmtDate(o.payment_due_date)}<br /></>}{o.payment_note}</div>}
            </div>
            <div className="divide-y divide-ink-700/50 border-t border-ink-700">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className="text-mist-400 tabular">{fmtDate(p.paid_at)}</span><Badge>{PAYMENT_METHODS[p.method]}</Badge>
                  <span className="flex-1 truncate text-mist-400">{p.note}</span><span className="font-medium tabular">{eur(p.amount_cents)}</span>
                  <IconButton title="Supprimer ce règlement" onClick={async () => (await confirm({ title: 'Supprimer ce règlement ?', danger: true, confirm: 'Supprimer' })) && act(() => deletePayment(p.id).then(d.reload))}><Trash2 className="size-3.5" /></IconButton>
                </div>
              ))}
            </div>
          </Card>
          {(inv.data?.length ?? 0) > 0 && (
            <Card>
              <CardHeader title="Factures & avoirs" subtitle="Contenu figé à l’émission ; un nouvel exemplaire est un duplicata identique." />
              <div className="divide-y divide-ink-700/50">
                {inv.data!.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                    <span className="font-mono">{r.number}</span>
                    <Badge tone={r.kind === 'avoir' ? 'amber' : r.cancelled_by ? 'neutral' : 'green'}>{r.kind === 'avoir' ? 'Avoir' : r.cancelled_by ? 'Annulée par avoir' : 'Facture'}</Badge>
                    <span className="flex-1 text-mist-400">{fmtDate(r.issued_at)}</span>
                    <span className="tabular">{eur(r.total_cents)}</span>
                    {!r.cancelled_by && <IconButton title="Envoyer par e-mail" onClick={() => sendMail(r)}><Mail className="size-4" /></IconButton>}
                    <IconButton title="Télécharger le PDF" onClick={() => act(() => saveFile(`${r.kind}-${r.number}.pdf`, invoicePdfOf(r), PDF_FILTER), 'PDF enregistré')}><FileDown className="size-4" /></IconButton>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Données internes" subtitle="Jamais visibles en mode client ni dans les PDF clients." />
            <div className="space-y-1.5 px-5 py-4 text-[13px]">
              <div className="flex justify-between"><span className="text-mist-400">Coût fournisseurs estimé</span><span className="tabular">{eur(o.cost_estimate_cents)}</span></div>
              <div className="flex justify-between"><span className="text-mist-400">Marge commerciale estimée</span><span className="tabular">{eur(m.margin_cents)}</span></div>
              <div className="flex justify-between"><span className="text-mist-400">Taux de marque</span><span className="tabular">{fmtRate(m.margin_rate)}</span></div>
            </div>
          </Card>
          <Card className="px-5 py-4 text-[13px]">
            <div className="font-medium">{[o.contact_first_name, o.family_name].filter(Boolean).join(' ')}</div>
            <div className="mt-1 text-mist-400">{[o.contact_first_name, o.family_phone, o.family_email].filter(Boolean).join(' · ')}</div>
            {o.desired_delivery && <div className="mt-2 text-mist-300">Livraison souhaitée : {fmtDate(o.desired_delivery)}</div>}
          </Card>
        </div>
      </div>
      <PaymentDialog open={payOpen} balance={balance} suggested={nextDue?.remaining_cents} suggestedLabel={nextDue ? `Échéance n° ${nextDue.n} du ${fmtDate(nextDue.date)}` : undefined} onClose={() => setPayOpen(false)} onSave={async (p) => { if (await act(() => addPayment(id, p), 'Règlement enregistré') !== undefined) { setPayOpen(false); d.reload(); } }} />
      <PlanDialog open={planOpen} initial={{ due: o.payment_due_date, note: o.payment_note }} onClose={() => setPlanOpen(false)} onSave={async (due, note) => { await act(() => setPaymentPlan(id, due, note), 'Échéance enregistrée'); setPlanOpen(false); d.reload(); }} />
    </>
  );
}

function PaymentDialog({ open, balance, suggested, suggestedLabel, onClose, onSave }: { open: boolean; balance: number; suggested?: number; suggestedLabel?: string; onClose: () => void; onSave: (p: { amount_cents: number; method: PaymentMethod; paid_at: string; note: string | null }) => void }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('carte');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const a = amount ?? suggested ?? balance;
  return (
    <Modal open={open} onClose={onClose} title="Enregistrer un règlement" subtitle={`Solde restant : ${eur(balance)}${suggestedLabel ? ` · ${suggestedLabel}` : ''}`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={!(a > 0) || a > balance} onClick={() => onSave({ amount_cents: a, method, paid_at: date, note: note || null })}>{a === balance ? 'Marquer comme payé' : 'Enregistrer le paiement partiel'}</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Montant reçu" hint={a < balance ? `Solde après règlement : ${eur(balance - a)}` : 'Règlement complet'}><MoneyInput autoFocus value={a} onChange={setAmount} /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="col-span-2 flex flex-wrap gap-2">
          {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((k) => <Button key={k} size="sm" variant={method === k ? 'gold' : 'subtle'} onClick={() => setMethod(k)}>{PAYMENT_METHODS[k]}</Button>)}
        </div>
        <Field label="Note (facultatif — ne saisissez jamais de numéro de carte)" className="col-span-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="N° de chèque, banque…" /></Field>
      </div>
    </Modal>
  );
}

function PlanDialog({ open, initial, onClose, onSave }: { open: boolean; initial: { due: string | null; note: string | null }; onClose: () => void; onSave: (due: string | null, note: string | null) => void }) {
  const [due, setDue] = useState(initial.due ?? '');
  const [note, setNote] = useState(initial.note ?? '');
  return (
    <Modal open={open} onClose={onClose} title="Règlement à venir" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" onClick={() => onSave(due || null, note || null)}>Enregistrer</Button></>}>
      <div className="space-y-4">
        <Field label="Date de règlement prévue"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
