import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarHeart, FileDown, FileSignature, Mail, Plus, Save, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, DataTable, Empty, Field, IconButton, Input, Loading, Modal, MoneyInput, PageHeader, Select, Tabs, Textarea, useAsync, useConfirm, cx } from '../components/ui';
import { OrderAttachments } from '../components/OrderAttachments';
import { ALBUM_STEPS, createWedding, coupleName, deadlines, deleteWedding, getWedding, listWeddings, refreshSchedule, saveWeddingLines, setWeddingInfo, signWedding, updateWedding, weddingCart,
  WEDDING_SERVICES, WEDDING_STATUS, type AlbumStep, type WeddingInput, type WeddingRow, type WeddingServices, type WeddingStatus } from '../services/weddings';
import { bookedOn } from '../services/agenda';
import { emailWeddingInfo, emailWeddingQuote, weddingContract, weddingSheet } from '../services/weddingDocs';
import { listProducts, listVariants } from '../services/catalog';
import { listSuppliers } from '../services/suppliers';
import { pricingContext, type CartLine } from '../services/orders';
import { findPrice, schedule } from '../lib/pricing';
import { WEDDING_INFO } from '../lib/weddingTexts';
import { saveFile, PDF_FILTER } from '../lib/files';
import { eur } from '../lib/money';
import { fmtDate } from '../lib/format';
import { todayIso, uid } from '../lib/ids';
import { act } from '../lib/act';
import { one } from '../services/base';

const STATUS_TONE: Record<WeddingStatus, 'neutral' | 'gold' | 'green' | 'amber'> = { devis: 'amber', signe: 'gold', livre: 'green', annule: 'neutral' };

export default function Weddings() {
  const { id } = useParams();
  return id ? <WeddingDetail id={id} /> : <WeddingList />;
}

function WeddingList() {
  const nav = useNavigate();
  const [all, setAll] = useState(false);
  const list = useAsync(() => listWeddings({ includeCancelled: all }), [all]);
  const [open, setOpen] = useState(false);
  const today = todayIso();
  return (
    <>
      <PageHeader title="Mariages" subtitle="Un projet par couple : devis, contrat, acompte et solde, fiche du jour J, livraisons, album."
        actions={<><Button variant="ghost" onClick={() => setAll(!all)}>{all ? 'Masquer les annulés' : 'Afficher les annulés'}</Button><Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Nouveau mariage</Button></>} />
      <Card>
        <DataTable<WeddingRow> rows={list.data ?? []} rowKey={(r) => r.id} onRowClick={(r) => nav(`/mariages/${r.id}`)}
          empty={<Empty icon={<CalendarHeart className="size-5" />} title="Aucun mariage" text="Créez un projet pour établir le devis et le contrat." />}
          columns={[
            { key: 'date', header: 'Date', sort: (r) => r.date ?? '9999', cell: (r) => <span className={cx('tabular', r.date && r.date < today && r.status === 'signe' && 'text-mist-400')}>{r.date ? fmtDate(r.date) : '—'}</span> },
            { key: 'c', header: 'Mariés', sort: (r) => coupleName(r), cell: (r) => <div><div className="font-medium">{coupleName(r)}</div>{r.location && <div className="text-[12px] text-mist-400">{r.location}</div>}</div> },
            { key: 's', header: 'Prestation', cell: (r) => WEDDING_SERVICES[r.services] },
            { key: 'st', header: 'Statut', cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{WEDDING_STATUS[r.status]}</Badge> },
            { key: 't', header: 'Total', align: 'right', sort: (r) => r.total_cents ?? 0, cell: (r) => (r.total_cents != null ? eur(r.total_cents) : '') },
            { key: 'p', header: 'Encaissé', align: 'right', sort: (r) => r.paid_cents, cell: (r) => (r.paid_cents ? eur(r.paid_cents) : '') },
            { key: 'n', header: 'À suivre', cell: (r) => <NextStep w={r} /> },
          ]} />
      </Card>
      {open && <WeddingForm onClose={() => setOpen(false)} onSave={async (d) => { const nid = await act(() => createWedding(d), 'Mariage créé'); if (nid) nav(`/mariages/${nid}`); }} />}
    </>
  );
}

/** What is next for this wedding (list column). */
function NextStep({ w }: { w: WeddingRow }) {
  const dl = useAsync(() => deadlines(w), [w.date]);
  const today = todayIso();
  if (w.status === 'devis') return <span className="text-[12.5px] text-mist-400">Devis à faire signer</span>;
  if (w.status !== 'signe' || !dl.data) return null;
  const items: [string, string | null, boolean][] = [];
  if (w.date && w.date >= today && !w.info_received_at) items.push(['Fiche jour J', null, false]);
  if (w.date && w.date < today) {
    if (!w.teaser_delivered_at) items.push(['Teaser', dl.data.teaser, !!dl.data.teaser && dl.data.teaser < today]);
    if (!w.final_delivered_at) items.push(['Galerie / film', dl.data.final, !!dl.data.final && dl.data.final < today]);
  }
  if (w.album_status !== 'aucun' && w.album_status !== 'livre') items.push([`Album : ${ALBUM_STEPS[w.album_status].toLowerCase()}`, null, false]);
  return <div className="flex flex-wrap gap-1">{items.map(([l, d, late]) => <Badge key={l} tone={late ? 'amber' : 'neutral'}>{l}{d ? ` · ${fmtDate(d)}` : ''}</Badge>)}</div>;
}

function WeddingForm({ initial, weddingId, onClose, onSave }: { initial?: Partial<WeddingInput>; weddingId?: string; onClose: () => void; onSave: (d: WeddingInput) => Promise<void> }) {
  const [d, setD] = useState<WeddingInput>({ partner1: '', partner2: '', services: 'photo', ...initial });
  const booked = useAsync(() => (d.date ? bookedOn(d.date, weddingId) : Promise.resolve([])), [d.date]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof WeddingInput, v: string | null) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Modal open onClose={onClose} title={initial ? 'Modifier le mariage' : 'Nouveau mariage'} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" loading={busy} disabled={!d.partner1.trim()} onClick={async () => { setBusy(true); await onSave(d); setBusy(false); }}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Marié(e) 1 *"><Input autoFocus value={d.partner1} placeholder="Julie Martin" onChange={(e) => set('partner1', e.target.value)} /></Field>
        <Field label="Marié(e) 2"><Input value={d.partner2 ?? ''} placeholder="Tom Durand" onChange={(e) => set('partner2', e.target.value)} /></Field>
        <Field label="E-mail"><Input type="email" value={d.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Téléphone"><Input value={d.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Date du mariage"><Input type="date" value={d.date ?? ''} onChange={(e) => set('date', e.target.value || null)} /></Field>
        <Field label="Prestation"><Select value={d.services} onChange={(e) => set('services', e.target.value as WeddingServices)}>{Object.entries(WEDDING_SERVICES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Lieu (réception)" className="col-span-2"><Input value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Notes" className="col-span-2"><Textarea rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        {!!booked.data?.length && <div className="col-span-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">⚠ Date déjà réservée : {booked.data.map((x) => x.title).join(', ')}</div>}
      </div>
    </Modal>
  );
}

type Tab = 'devis' | 'jourj' | 'livraisons' | 'album';

function WeddingDetail({ id }: { id: string }) {
  const nav = useNavigate();
  const confirm = useConfirm();
  const w = useAsync(() => getWedding(id), [id]);
  const [tab, setTab] = useState<Tab>('devis');
  const [edit, setEdit] = useState(false);
  if (!w.data) return <Loading />;
  const x = w.data;
  const reload = w.reload;
  return (
    <>
      <PageHeader back={() => nav('/mariages')} title={`Mariage ${coupleName(x)}`}
        subtitle={<span className="flex flex-wrap items-center gap-3"><Badge tone={STATUS_TONE[x.status]}>{WEDDING_STATUS[x.status]}</Badge>{x.date ? fmtDate(x.date) : 'Date à préciser'}{x.location && ` · ${x.location}`} · {WEDDING_SERVICES[x.services]}{x.email && ` · ${x.email}`}</span>}
        actions={<>
          <Button onClick={() => setEdit(true)}>Modifier</Button>
          <Select className="w-36" value={x.status} onChange={(e) => act(() => updateWedding(id, { status: e.target.value as WeddingStatus }).then(reload), 'Statut mis à jour')}>
            {Object.entries(WEDDING_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          {x.order_status !== 'validee' && <IconButton title="Supprimer le projet" onClick={async () => (await confirm({ title: `Supprimer le projet « ${coupleName(x)} » ?`, text: 'Le devis en brouillon est supprimé. Les devis déjà numérotés restent dans le registre.', danger: true, confirm: 'Supprimer' })) && (await act(() => deleteWedding(id), 'Projet supprimé')) !== undefined && nav('/mariages')}><Trash2 className="size-4" /></IconButton>}
        </>} />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ id: 'devis', label: 'Devis & contrat' }, { id: 'jourj', label: 'Fiche jour J' }, { id: 'livraisons', label: 'Livraisons' }, { id: 'album', label: 'Album' }]} />
      {tab === 'devis' && <QuoteTab w={x} reload={reload} />}
      {tab === 'jourj' && <InfoTab w={x} reload={reload} />}
      {tab === 'livraisons' && <DeliveryTab w={x} reload={reload} />}
      {tab === 'album' && <AlbumTab w={x} reload={reload} />}
      {edit && <WeddingForm weddingId={x.id} initial={{ partner1: x.partner1, partner2: x.partner2, email: x.email, phone: x.phone, date: x.date, location: x.location, services: x.services, notes: x.notes }}
        onClose={() => setEdit(false)} onSave={async (d) => { if (await act(() => updateWedding(id, d), 'Mariage mis à jour') !== undefined) { setEdit(false); reload(); } }} />}
    </>
  );
}

/* ------------------------------------------------------------------ devis & contrat */
function QuoteTab({ w, reload }: { w: WeddingRow; reload: () => void }) {
  const confirm = useConfirm();
  const nav = useNavigate();
  const data = useAsync(async () => {
    const [cart, products, variants, ctx] = await Promise.all([weddingCart(w), listProducts(), listVariants(), pricingContext(w.session_id)]);
    const universe = (await one<{ universe_id: string | null }>('SELECT universe_id FROM sessions WHERE id=?', [w.session_id]))?.universe_id;
    const offer = products.filter((p) => p.active && (!universe || p.universe_ids.includes(universe)))
      .flatMap((p) => variants.filter((v) => v.product_id === p.id && v.active).map((v) => ({ p, v, price: findPrice(ctx.rows, 'variant', v.id) })));
    return { cart, offer };
  }, [w.id, w.order_id]);
  const [items, setItems] = useState<CartLine[] | null>(null);
  const [notes, setNotes] = useState('');
  const [pick, setPick] = useState('');
  const [signDate, setSignDate] = useState(todayIso());
  useEffect(() => { if (data.data) { setItems(data.data.cart.items); setNotes(data.data.cart.notes); } }, [data.data]);
  if (!data.data || !items) return <Loading />;
  const signed = data.data.cart.status === 'validee';
  const total = items.reduce((s, i) => s + i.qty * i.unitPriceCents, 0);
  const dirty = JSON.stringify([items, notes]) !== JSON.stringify([data.data.cart.items, data.data.cart.notes]);
  const sched = total > 0 ? schedule(total, { count: Math.max(1, w.balance_count), first_date: w.signed_at ?? todayIso(), deposit_bp: w.deposit_bp, last_date: w.date }) : [];
  const upd = (key: string, patch: Partial<CartLine>) => setItems(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const add = (l: Partial<CartLine>) => setItems([...items, { key: uid(), variantId: null, productId: null, category: 'prestation', productName: '', variantName: null, compositionKey: null, qty: 1, unitPriceCents: 0, unitCostCents: 0, ...l }]);
  const save = async () => {
    let reason: string | undefined;
    if (signed) { const r = await confirm({ title: 'Modifier un contrat signé ?', text: 'La commande est corrigée (historique conservé ; avoir automatique si elle a été facturée).', input: { label: 'Motif (avenant…)', required: true }, confirm: 'Enregistrer' }); if (!r) return; reason = r; }
    if (await act(() => saveWeddingLines(w.id, items.filter((i) => i.productName.trim()), notes, reason), 'Devis enregistré') !== undefined) { data.reload(); reload(); }
  };
  const ensureSaved = async () => { if (dirty || !w.order_id) { await saveWeddingLines(w.id, items.filter((i) => i.productName.trim()), notes); } };
  return (
    <div className="grid grid-cols-[1fr_340px] gap-5 animate-fade">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Lignes du devis" subtitle={signed ? 'Contrat signé : toute modification est enregistrée comme correction (avenant).' : 'Forfaits et options du catalogue (univers Mariage) ou lignes libres ; prix modifiables.'}
            actions={<Button size="sm" variant="gold" icon={<Save className="size-3.5" />} disabled={!dirty} onClick={save}>Enregistrer</Button>} />
          <div className="space-y-2 px-5 py-4">
            {!items.length && <div className="py-4 text-center text-[13px] text-mist-400">Aucune ligne. Ajoutez un forfait du catalogue ou une ligne libre.</div>}
            {items.map((i) => (
              <div key={i.key} className="grid grid-cols-[1fr_70px_130px_100px_auto] items-center gap-2">
                <Input value={i.productName} placeholder="Désignation (ex. Forfait photo journée, Film 10 min, Drone…)" onChange={(e) => upd(i.key, { productName: e.target.value })} />
                <Input type="number" min={1} value={i.qty} onChange={(e) => upd(i.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                <MoneyInput value={i.unitPriceCents} onChange={(c) => upd(i.key, { unitPriceCents: c ?? 0 })} />
                <span className="text-right tabular">{eur(i.qty * i.unitPriceCents)}</span>
                <IconButton title="Retirer" onClick={() => setItems(items.filter((x) => x.key !== i.key))}><Trash2 className="size-4" /></IconButton>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Select className="w-80" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Forfait / option du catalogue…</option>
                {data.data.offer.map((o) => <option key={o.v.id} value={o.v.id}>{o.p.name}{o.v.name && o.v.name !== 'Standard' ? ` — ${o.v.name}` : ''}{o.price != null ? ` · ${eur(o.price)}` : ''}</option>)}
              </Select>
              <Button size="sm" disabled={!pick} onClick={() => { const o = data.data!.offer.find((x) => x.v.id === pick)!; add({ variantId: o.v.id, productId: o.p.id, category: o.p.category, productName: o.v.name && o.v.name !== 'Standard' ? `${o.p.name} — ${o.v.name}` : o.p.name, unitPriceCents: o.price ?? 0 }); setPick(''); }}>Ajouter</Button>
              <Button size="sm" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => add({})}>Ligne libre</Button>
              {!data.data.offer.length && <span className="text-[12px] text-mist-400">Catalogue → produits de l’univers « Mariage » (forfaits, options), prix dans un template de cet univers.</span>}
            </div>
            <div className="flex justify-end pt-2 text-[18px] font-semibold">Total <span className="ml-4 text-gold-400 tabular">{eur(total)}</span></div>
            <Field label="Remarques (imprimées sur le devis)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        </Card>
        {w.order_id && signed && <OrderAttachments orderId={w.order_id} />}
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Paiement" />
          <div className="space-y-3 px-5 py-4 text-[13px]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Acompte (%)"><Input type="number" min={0} max={100} value={w.deposit_bp / 100} disabled={signed}
                onChange={(e) => act(() => updateWedding(w.id, { deposit_bp: Math.round(Math.min(100, Math.max(0, Number(e.target.value) || 0)) * 100) }).then(() => refreshSchedule(w.id)).then(reload))} /></Field>
              <Field label="Solde en (fois)"><Input type="number" min={1} max={12} value={w.balance_count}
                onChange={(e) => act(() => updateWedding(w.id, { balance_count: Math.min(12, Math.max(1, Number(e.target.value) || 1)) }).then(() => refreshSchedule(w.id)).then(reload))} /></Field>
            </div>
            {sched.map((s, i) => (
              <div key={i} className="flex justify-between"><span className="text-mist-300">{i === 0 ? 'Acompte' : sched.length > 2 ? `Solde ${i}/${sched.length - 1}` : 'Solde'} · {fmtDate(s.date)}</span><span className="tabular">{eur(s.amount_cents)}</span></div>
            ))}
            {!w.date && <div className="text-amber-300">Indiquez la date du mariage : le solde est dû ce jour-là.</div>}
            {signed && <div className="flex justify-between border-t border-ink-700 pt-2"><span>Encaissé</span><span className="tabular">{eur(w.paid_cents)}</span></div>}
            {signed && <Button className="w-full" onClick={() => nav(`/commandes/${w.order_id}`)}>Règlements & factures</Button>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Devis & contrat" />
          <div className="space-y-2 px-5 py-4">
            <Button className="w-full" variant="gold" icon={<Mail className="size-4" />} disabled={!items.length || !w.email} title={w.email ? '' : 'Ajoutez l’e-mail des mariés (Modifier)'}
              onClick={() => act(async () => { await ensureSaved(); const r = await emailWeddingQuote(w.id); data.reload(); reload(); return r; }, (r) => `Devis ${r.number} + contrat${r.how === 'mail' ? ' prêts dans Mail' : ' enregistrés — joignez-les au message'}`)}>Envoyer devis + contrat + CGV</Button>
            <Button className="w-full" icon={<FileDown className="size-4" />} disabled={!items.length}
              onClick={() => act(async () => { await ensureSaved(); const c = await weddingContract(w.id); return saveFile(c.name, c.bytes, PDF_FILTER); }, 'Contrat enregistré')}>Contrat + CGV (PDF)</Button>
            {!signed && (
              <div className="space-y-2 border-t border-ink-700 pt-3">
                <Field label="Signé le"><Input type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} /></Field>
                <Button className="w-full" variant="gold" icon={<FileSignature className="size-4" />} disabled={!items.length}
                  onClick={async () => (await confirm({ title: 'Contrat signé ?', text: 'Les prix sont figés, le devis passe en « signé » et l’échéancier démarre à cette date. Enregistrez ensuite l’acompte reçu (Règlements). Joignez le contrat signé en pièce jointe.' }))
                    && act(async () => { await ensureSaved(); await signWedding(w.id, signDate); data.reload(); reload(); }, 'Contrat signé')}>Marquer signé</Button>
              </div>
            )}
            {signed && <div className="text-[12.5px] text-mist-400">Signé le {fmtDate(w.signed_at)}. Joignez le contrat signé dans « Pièces jointes ».</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ fiche jour J */
function InfoTab({ w, reload }: { w: WeddingRow; reload: () => void }) {
  const [info, setInfo] = useState<Record<string, string>>(() => (w.info ? JSON.parse(w.info) : {}));
  const dirty = JSON.stringify(info) !== (w.info ?? '{}');
  const pdf = (blank: boolean) => act(async () => { const s = await weddingSheet(w.id, blank); return saveFile(s.name, s.bytes, PDF_FILTER); }, 'PDF enregistré');
  return (
    <div className="space-y-5 animate-fade">
      <Card className="flex flex-wrap items-center gap-3 px-5 py-4 text-[13px]">
        <span className="text-mist-300">Fiche de renseignements : {w.info_sent_at ? <>envoyée le {fmtDate(w.info_sent_at)}</> : 'pas encore envoyée'}{w.info_received_at && <> · reçue / saisie le {fmtDate(w.info_received_at)}</>}</span>
        <div className="flex-1" />
        <Button variant="gold" icon={<Mail className="size-4" />} disabled={!w.email} onClick={() => act(() => emailWeddingInfo(w.id).then((h) => { reload(); return h; }), (h) => (h === 'mail' ? 'Fiche prête dans Mail' : 'Fiche enregistrée — joignez-la au message'))}>Envoyer la fiche à compléter</Button>
        <Button icon={<FileDown className="size-4" />} onClick={() => pdf(true)}>Fiche à compléter (PDF)</Button>
        <Button icon={<FileDown className="size-4" />} onClick={() => pdf(false)}>Fiche du jour J (PDF)</Button>
        <Button variant="gold" icon={<Save className="size-4" />} disabled={!dirty} onClick={() => act(() => setWeddingInfo(w.id, info).then(reload), 'Fiche enregistrée')}>Enregistrer</Button>
      </Card>
      {WEDDING_INFO.map((sec) => (
        <Card key={sec.title}>
          <CardHeader title={sec.title} />
          <div className="grid grid-cols-2 gap-4 px-5 py-4">
            {sec.fields.filter((f) => !f.video || w.services !== 'photo').map((f) => (
              <Field key={f.key} label={f.label} className={f.long ? 'col-span-2' : ''}>
                <Textarea rows={f.long ? 3 : 1} value={info[f.key] ?? ''} onChange={(e) => setInfo({ ...info, [f.key]: e.target.value })} />
              </Field>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ livraisons */
function DeliveryTab({ w, reload }: { w: WeddingRow; reload: () => void }) {
  const dl = useAsync(() => deadlines(w), [w.date]);
  const today = todayIso();
  const row = (label: string, due: string | null | undefined, dateKey: 'teaser_delivered_at' | 'final_delivered_at', linkKey: 'teaser_link' | 'final_link') => {
    const done = w[dateKey];
    return (
      <div className="grid grid-cols-[220px_150px_1fr_170px] items-end gap-3 border-b border-ink-700/50 px-5 py-4 last:border-0">
        <div><div className="font-medium">{label}</div><div className={cx('text-[12.5px]', !done && due && due < today ? 'text-amber-300' : 'text-mist-400')}>{due ? `à livrer avant le ${fmtDate(due)}` : 'date du mariage à préciser'}</div></div>
        <Field label="Livré le"><Input type="date" value={done ?? ''} onChange={(e) => act(() => updateWedding(w.id, { [dateKey]: e.target.value || null }).then(reload))} /></Field>
        <Field label="Lien (TransferNow, galerie Pic-Time)"><Input defaultValue={w[linkKey] ?? ''} placeholder="https://…" onBlur={(e) => e.target.value !== (w[linkKey] ?? '') && act(() => updateWedding(w.id, { [linkKey]: e.target.value || null }).then(reload))} /></Field>
        {done ? <Badge tone="green">Livré</Badge> : <Button variant="ghost" onClick={() => act(() => updateWedding(w.id, { [dateKey]: today }).then(reload), 'Livraison notée')}>Livré aujourd’hui</Button>}
      </div>
    );
  };
  if (!dl.data) return <Loading />;
  return (
    <Card className="animate-fade">
      <CardHeader title="Livrables" subtitle={`Délais comptés depuis le mariage (Paramètres → Mariages) : ${dl.data.teaserDays} jours pour le teaser ou les premières photos, ${dl.data.finalDays} jours pour le film et la galerie complète.`} />
      {row(w.services === 'photo' ? 'Premières photos' : w.services === 'video' ? 'Teaser vidéo' : 'Teaser vidéo / premières photos', dl.data.teaser, 'teaser_delivered_at', 'teaser_link')}
      {row(w.services === 'photo' ? 'Galerie complète' : w.services === 'video' ? 'Film' : 'Film et galerie complète', dl.data.final, 'final_delivered_at', 'final_link')}
      {w.teaser_delivered_at && w.final_delivered_at && w.status === 'signe' && (
        <div className="px-5 py-4"><Button variant="gold" onClick={() => act(() => updateWedding(w.id, { status: 'livre' }).then(reload), 'Mariage livré')}>Marquer le mariage « Livré »</Button></div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ album */
function AlbumTab({ w, reload }: { w: WeddingRow; reload: () => void }) {
  const sup = useAsync(() => listSuppliers(), []);
  const dates: Record<string, string> = w.album_dates ? JSON.parse(w.album_dates) : {};
  const steps = Object.keys(ALBUM_STEPS).filter((k) => k !== 'aucun') as AlbumStep[];
  const at = steps.indexOf(w.album_status);
  return (
    <Card className="animate-fade">
      <CardHeader title="Album" subtitle="Fournisseur (ex. Dreambooks, à créer dans Fournisseurs) et suivi de la maquette jusqu’à la livraison." />
      <div className="space-y-5 px-5 py-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fournisseur"><Select value={w.album_supplier_id ?? ''} onChange={(e) => act(() => updateWedding(w.id, { album_supplier_id: e.target.value || null }).then(reload))}>
            <option value="">— Aucun —</option>{sup.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Note (format, nb de pages, réf. commande…)"><Input defaultValue={w.album_note ?? ''} onBlur={(e) => e.target.value !== (w.album_note ?? '') && act(() => updateWedding(w.id, { album_note: e.target.value || null }).then(reload))} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={w.album_status === 'aucun' ? 'subtle' : 'ghost'} onClick={() => act(() => updateWedding(w.id, { album_status: 'aucun' }).then(reload))}>Pas d’album</Button>
          {steps.map((k, i) => (
            <button key={k} type="button" onClick={() => act(() => updateWedding(w.id, { album_status: k }).then(reload), ALBUM_STEPS[k])}
              className={cx('rounded-xl border px-3 py-2 text-left text-[12.5px] transition', i <= at ? 'border-gold-500/60 bg-gold-500/10 text-gold-100' : 'border-ink-600 text-mist-400 hover:border-gold-500/40')}>
              <div>{i + 1}. {ALBUM_STEPS[k]}</div>{dates[k] && <div className="text-[11px] text-mist-400">{fmtDate(dates[k])}</div>}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
