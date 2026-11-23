import { Fragment, useMemo, useState } from 'react';
import { ArrowUpToLine, CheckSquare, Download, FileDown, Flag, ImageOff, PackagePlus, Square, Truck, Wand2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, DataTable, Empty, Field, Input, Loading, Modal, MoneyInput, PageHeader, SearchInput, Segmented, Select, Tabs, Textarea, useAsync, cx } from '../components/ui';
import { TaskBadge } from '../components/badges';
import { taskPhotos, createSupplierOrder, flowFor, listPrintLines, listSupplierOrders, listTasks, setTaskNotes, setTaskOrder, setTaskPriority, setTaskStatus, sortTasks, PRIORITY_LABEL, TASK_SORT_LABEL, type TaskSort, supplierOrderLines, SUPPLIER_ORDER_STATUS, TASK_STATUS, updateSupplierOrder, type PrintLine, type SupplierOrder, type Task, type TaskStatus } from '../services/production';
import { listSessions } from '../services/sessions';
import { listSuppliers } from '../services/suppliers';
import { brand, productionPdf } from '../services/documents';
import { supplierOrderPdf } from '../lib/pdf';
import { toCsv } from '../lib/csv';
import { saveFile, PDF_FILTER } from '../lib/files';
import { eur } from '../lib/money';
import { fmtDate, slug } from '../lib/format';
import { todayIso } from '../lib/ids';
import { ORIENTATION_LABEL } from '../lib/formatsGuide';
import { act } from '../lib/act';

export default function Production() {
  const sessions = useAsync(() => listSessions({ includeArchived: true }), []);
  const [sid, setSid] = useState('');
  return (
    <>
      <PageHeader title="Postproduction" subtitle="Créations à réaliser dans Photoshop, fichiers, impressions et livraisons."
        actions={<Select className="w-64" value={sid} onChange={(e) => setSid(e.target.value)}><option value="">Toutes les séances</option>{sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>} />
      <ProductionBoard key={sid} sessionId={sid || undefined} />
    </>
  );
}

type View = 'tableau' | 'kanban' | 'groupes';
type Group = 'session' | 'family' | 'style' | 'status';

export function ProductionBoard({ sessionId }: { sessionId?: string }) {
  const [tab, setTab] = useState<'taches' | 'impressions'>('taches');
  return (
    <>
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[{ id: 'taches', label: 'Créations & tâches' }, { id: 'impressions', label: 'Impressions & fournisseurs' }]} />
      {tab === 'taches' ? <TasksView sessionId={sessionId} /> : <PrintsView sessionId={sessionId} />}
    </>
  );
}

function TasksView({ sessionId }: { sessionId?: string }) {
  const data = useAsync(() => listTasks({ sessionId }), [sessionId]);
  const [view, setView] = useState<View>('tableau');
  const [group, setGroup] = useState<Group>('family');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [noteTask, setNoteTask] = useState<Task | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [overCard, setOverCard] = useState<string | null>(null);
  const [sortMode, setSortModeState] = useState<TaskSort>(() => { try { return (localStorage.getItem('production_sort') as TaskSort) || 'manuel'; } catch { return 'manuel'; } });
  const setSortMode = (m: TaskSort) => { setSortModeState(m); try { localStorage.setItem('production_sort', m); } catch { /* ignore */ } };
  const tasks = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sortTasks((data.data ?? []).filter((t) => (!status || (status === 'open' ? t.status !== 'livre' : t.status === status)) &&
      (!s || [t.family_name, t.order_number, t.style_name, t.item_product, t.participant_names, ...t.refs.map((r) => r.reference)].some((x) => x?.toLowerCase().includes(s)))), sortMode);
  }, [data.data, q, status, sortMode]);
  if (!data.data) return <Loading />;
  const change = (ids: string[], s: TaskStatus) => act(() => setTaskStatus(ids, s).then(data.reload), `${ids.length} tâche(s) : ${TASK_STATUS[s]}`);
  /** Moves a task in the order of treatment: before `beforeId` (null = end of the column), in column `to` (status change if needed). */
  const reorder = (id: string, beforeId: string | null, to: TaskStatus) => act(async () => {
    const t = tasks.find((x) => x.id === id); if (!t || id === beforeId) return;
    if (t.status !== to) await setTaskStatus([id], to);
    const col = tasks.filter((x) => x.status === to && x.id !== id).map((x) => x.id);
    const at = beforeId ? col.indexOf(beforeId) : -1;
    col.splice(at < 0 ? col.length : at, 0, id);
    await setTaskOrder(col);
    if (sortMode !== 'manuel') setSortMode('manuel');
    await data.reload();
  });
  const cyclePriority = (t: Task) => act(() => setTaskPriority([t.id], ((t.priority ?? 0) + 1) % 3).then(data.reload), `${t.family_name} : ${PRIORITY_LABEL[((t.priority ?? 0) + 1) % 3]}`);
  const PriorityButton = ({ t }: { t: Task }) => (
    <button title="Urgence : cliquer pour changer (Normale → Prioritaire → Urgent)" onClick={(e) => { e.stopPropagation(); cyclePriority(t); }}
      className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium transition', t.priority === 2 ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30' : t.priority === 1 ? 'bg-amber-500/12 text-amber-300 ring-1 ring-amber-500/25' : 'text-mist-500 hover:text-mist-200')}>
      <Flag className="size-3" />{t.priority ? PRIORITY_LABEL[t.priority] : ''}
    </button>
  );
  const exportCsv = () => act(() => saveFile(`postproduction-${todayIso()}.csv`, toCsv(['Commande', 'Séance', 'Famille', 'Création', 'Iris', 'Participants', 'Références', 'Produits', 'Instructions', 'Statut', 'Notes'],
    tasks.map((t) => [t.order_number, t.session_name, t.family_name, t.style_name ?? t.item_product, t.iris_count ?? '', t.participant_names ?? '', t.refs.map((r) => r.reference).join(' '), t.items.map((i) => `${i.product_name} ${i.variant_name ?? ''} x${i.qty}`).join(' ; '), t.instructions ?? '', TASK_STATUS[t.status], t.notes ?? ''])), [{ name: 'CSV', extensions: ['csv'] }]), 'Export CSV enregistré');
  const pdf = () => act(async () => saveFile(`fiche-production-${todayIso()}.pdf`, await productionPdf({ sessionId, taskIds: sel.length ? sel : tasks.map((t) => t.id) }, sel.length ? `${sel.length} création(s)` : 'Toutes les créations'), PDF_FILTER), 'Fiche de production enregistrée');
  const groups = (() => {
    const key = (t: Task) => (group === 'session' ? t.session_name : group === 'family' ? t.family_name : group === 'style' ? t.style_name ?? t.item_product ?? '—' : TASK_STATUS[t.status]);
    const m = new Map<string, Task[]>();
    tasks.forEach((t) => m.set(key(t), [...(m.get(key(t)) ?? []), t]));
    return [...m.entries()];
  })();

  const StatusSelect = ({ t }: { t: Task }) => (
    <Select className="h-8 w-[178px] text-[12px]" value={t.status} onClick={(e) => e.stopPropagation()} onChange={(e) => change([t.id], e.target.value as TaskStatus)}>
      {flowFor(t.hasPrint).map((s) => <option key={s} value={s}>{TASK_STATUS[s]}</option>)}
    </Select>
  );
  const TaskCard = ({ t }: { t: Task }) => (
    <div draggable={view === 'kanban'} onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDrag(t.id); }} onDragEnd={() => { setDrag(null); setOver(null); setOverCard(null); }}
      onDragOver={view === 'kanban' ? (e) => { e.preventDefault(); if (overCard !== t.id) setOverCard(t.id); } : undefined}
      onDrop={view === 'kanban' ? (e) => { e.preventDefault(); e.stopPropagation(); const id = drag ?? e.dataTransfer.getData('text/plain'); if (id) reorder(id, t.id, t.status); setDrag(null); setOver(null); setOverCard(null); } : undefined}
      className={cx('rounded-xl border border-l-4 bg-ink-850 p-3 transition', view === 'kanban' && 'cursor-grab active:cursor-grabbing', drag === t.id && 'opacity-40', overCard === t.id && drag && drag !== t.id && 'shadow-[0_-3px_0_0] shadow-gold-400',
        sel.includes(t.id) ? 'border-gold-500/60' : 'border-ink-700 hover:border-ink-500', t.priority === 2 ? '!border-l-red-500/80' : t.priority === 1 ? '!border-l-amber-400/80' : '')}>
      <div className="flex gap-3">
        <button onClick={() => setSel((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]))} className="mt-0.5 text-mist-400">{sel.includes(t.id) ? <CheckSquare className="size-4 text-gold-400" /> : <Square className="size-4" />}</button>
        {t.example_thumb ? <img src={t.example_thumb} className="size-14 shrink-0 rounded-lg object-cover" alt="" /> : t.kind === 'composition' && <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-ink-800"><ImageOff className="size-4 text-mist-400/50" /></div>}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t.family_name} <span className="font-normal text-mist-400">· {t.order_number}</span></div>
          <div className="text-[13px] text-gold-300">{t.kind === 'composition' ? `${t.style_name} · ${t.iris_count} iris${t.orientation ? ` · ${ORIENTATION_LABEL[t.orientation].toLowerCase()}` : ''}` : `${t.item_product} ${t.item_variant ?? ''} × ${t.item_qty}${taskPhotos(t) ? ` — ${taskPhotos(t)}` : ''}`}</div>
          {t.participant_names && <div className="text-[12px] text-mist-300">{t.participant_names}</div>}
          {t.refs.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{t.refs.map((r) => <Badge key={r.reference} className="font-mono">{r.reference}</Badge>)}</div>}
          {t.items.length > 0 && <div className="mt-1 text-[12px] text-mist-400">{t.items.map((i) => `${i.product_name}${i.variant_name ? ' ' + i.variant_name : ''} ×${i.qty}`).join(' · ')}</div>}
          {t.instructions && <div className="mt-1 text-[12px] text-mist-300 italic">« {t.instructions} »</div>}
          {t.notes && <div className="mt-1 rounded bg-ink-800 px-2 py-1 text-[12px] text-amber-200/90">{t.notes}</div>}
          {t.internal_notes && <div className="mt-1.5 line-clamp-3 whitespace-pre-line text-[12px] text-amber-200/90" title="Note interne de la commande">📝 {t.internal_notes}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-2"><PriorityButton t={t} />{view === 'kanban' && <button title="Mettre en haut de la colonne" className="text-mist-500 hover:text-gold-300" onClick={() => { const first = tasks.find((x) => x.status === t.status); if (first && first.id !== t.id) reorder(t.id, first.id, t.status); }}><ArrowUpToLine className="size-3.5" /></button>}{view !== 'kanban' && <StatusSelect t={t} />}<button className="text-[12px] text-mist-400 hover:text-mist-100" onClick={() => setNoteTask(t)}>Note</button>{t.desired_delivery && <span className="text-[11.5px] text-mist-400">Livraison {fmtDate(t.desired_delivery)}</span>}</div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ id: 'tableau', label: 'Tableau' }, { id: 'kanban', label: 'Kanban' }, { id: 'groupes', label: 'Regroupé' }]} />
        {view === 'groupes' && <Select className="w-44" value={group} onChange={(e) => setGroup(e.target.value as Group)}><option value="session">Par séance</option><option value="family">Par famille</option><option value="style">Par montage</option><option value="status">Par statut</option></Select>}
        <SearchInput value={q} onChange={setQ} className="w-60" placeholder="Famille, référence, style…" />
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tous statuts</option><option value="open">Non livrés</option>{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select className="w-48" value={sortMode} onChange={(e) => setSortMode(e.target.value as TaskSort)} title="Ordre de traitement">{(Object.keys(TASK_SORT_LABEL) as TaskSort[]).map((k) => <option key={k} value={k}>Tri : {TASK_SORT_LABEL[k]}</option>)}</Select>
        <div className="flex-1" />
        {sel.length > 0 && <Select className="w-44" value="" onChange={(e) => e.target.value && act(() => setTaskPriority(sel, Number(e.target.value)).then(data.reload))}><option value="">Urgence…</option>{PRIORITY_LABEL.map((l, i) => <option key={l} value={i}>{l}</option>)}</Select>}
        {sel.length > 0 && <Select className="w-56" value="" onChange={(e) => e.target.value && change(sel, e.target.value as TaskStatus).then(() => setSel([]))}><option value="">{sel.length} sélection(s) → statut…</option>{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
        <Button variant="ghost" icon={<Download className="size-4" />} onClick={exportCsv}>CSV</Button>
        <Button icon={<FileDown className="size-4" />} onClick={pdf}>Fiche de production</Button>
      </div>
      {!tasks.length && <Card><Empty icon={<Wand2 className="size-5" />} title="Rien à produire" text="Les tâches apparaissent à la validation des commandes." /></Card>}
      {tasks.length > 0 && view === 'tableau' && (
        <Card>
          <DataTable<Task> rows={tasks} rowKey={(t) => t.id} dense columns={[
            { key: 'u', header: 'Urgence', sort: (t) => -(t.priority ?? 0), cell: (t) => <PriorityButton t={t} /> },
            { key: 'img', header: '', cell: (t) => (t.example_thumb ? <img src={t.example_thumb} className="size-10 rounded-md object-cover" alt="" /> : null) },
            { key: 'f', header: 'Famille', sort: (t) => t.family_name, cell: (t) => <div><div className="font-medium">{t.family_name}</div><div className="text-[11.5px] text-mist-400">{t.order_number}{!sessionId && ` · ${t.session_name}`}</div></div> },
            { key: 'c', header: 'Création', sort: (t) => t.style_name ?? '', cell: (t) => (t.kind === 'composition' ? `${t.style_name} · ${t.iris_count} iris${t.orientation ? ` · ${ORIENTATION_LABEL[t.orientation].toLowerCase()}` : ''}` : `${t.item_product} ${t.item_variant ?? ''} ×${t.item_qty}${taskPhotos(t) ? ` — ${taskPhotos(t)}` : ''}`) },
            { key: 'p', header: 'Participants / réf.', cell: (t) => <div className="max-w-[240px] text-[12.5px]"><div className="truncate">{t.participant_names}</div><div className="truncate font-mono text-mist-400">{t.refs.map((r) => r.reference).join(' ')}</div></div> },
            { key: 'i', header: 'Produits', cell: (t) => <div className="max-w-[260px] truncate text-[12.5px] text-mist-300">{t.items.map((i) => `${i.product_name} ${i.variant_name ?? ''} ×${i.qty}`).join(' · ')}</div> },
            { key: 's', header: 'Statut', sort: (t) => t.status, cell: (t) => <StatusSelect t={t} /> },
            { key: 'n', header: '', cell: (t) => <button className="text-[12px] text-mist-400 hover:text-mist-100" onClick={() => setNoteTask(t)}>{t.notes ? 'Note ✎' : 'Note'}</button> },
          ]} />
        </Card>
      )}
      {tasks.length > 0 && view === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {(Object.keys(TASK_STATUS) as TaskStatus[]).map((s) => (
            <div key={s} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== s) setOver(s); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={(e) => { e.preventDefault(); const id = drag ?? e.dataTransfer.getData('text/plain'); if (id) reorder(id, null, s); setDrag(null); setOver(null); setOverCard(null); }}
              className={cx('min-h-[200px] w-[290px] shrink-0 rounded-2xl bg-ink-900 p-2.5 transition', over === s && drag && 'bg-ink-800 ring-2 ring-gold-500/60')}>
              <div className="mb-2 flex items-center justify-between px-1"><TaskBadge s={s} /><span className="text-[12px] text-mist-400">{tasks.filter((t) => t.status === s).length}</span></div>
              <div className="space-y-2">{tasks.filter((t) => t.status === s).map((t) => <Fragment key={t.id}>{TaskCard({ t })}</Fragment>)}</div>
            </div>
          ))}
        </div>
      )}
      {tasks.length > 0 && view === 'groupes' && (
        <div className="space-y-6">{groups.map(([k, ts]) => (
          <div key={k}><div className="mb-2 flex items-center gap-2 text-[14px] font-semibold">{k}<span className="text-[12px] font-normal text-mist-400">{ts.length}</span></div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-2">{ts.map((t) => <Fragment key={t.id}>{TaskCard({ t })}</Fragment>)}</div></div>
        ))}</div>
      )}
      <NoteDialog task={noteTask} onClose={() => setNoteTask(null)} onSave={(n) => act(() => setTaskNotes(noteTask!.id, n).then(data.reload)).then(() => setNoteTask(null))} />
    </>
  );
}

function NoteDialog({ task, onClose, onSave }: { task: Task | null; onClose: () => void; onSave: (n: string) => void }) {
  const [n, setN] = useState('');
  return (
    <Modal open={!!task} onClose={onClose} title={`Note interne — ${task?.family_name ?? ''}`} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" onClick={() => onSave(n)}>Enregistrer</Button></>}>
      <Textarea key={task?.id} autoFocus rows={5} defaultValue={task?.notes ?? ''} onChange={(e) => setN(e.target.value)} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ prints & supplier orders */
function PrintsView({ sessionId }: { sessionId?: string }) {
  const lines = useAsync(() => listPrintLines(sessionId), [sessionId]);
  const orders = useAsync(() => listSupplierOrders(sessionId), [sessionId]);
  const suppliers = useAsync(() => listSuppliers(), []);
  const [sel, setSel] = useState<string[]>([]);
  const [supplierFor, setSupplierFor] = useState<Record<string, string>>({});
  const [editOrder, setEditOrder] = useState<SupplierOrder | null>(null);
  if (!lines.data || !orders.data) return <Loading />;
  const todo = lines.data.filter((l) => !l.supplier_order_id);
  const bySupplier = new Map<string, PrintLine[]>();
  todo.forEach((l) => bySupplier.set(l.supplier_id || '', [...(bySupplier.get(l.supplier_id || '') ?? []), l]));
  const reload = () => { lines.reload(); orders.reload(); setSel([]); };
  const create = (key: string, ls: PrintLine[]) => {
    const chosen = ls.filter((l) => sel.includes(l.order_item_id));
    const use = chosen.length ? chosen : ls;
    const sup = supplierFor[key] || key;
    return act(() => createSupplierOrder(sup, use, sessionId ?? (new Set(use.map((l) => l.session_id)).size === 1 ? use[0].session_id : null)).then(reload), 'Commande fournisseur préparée');
  };
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Impressions à commander" subtitle="Regroupées par fournisseur préféré de chaque variante (paramétrable dans Fournisseurs). Aucune commande n’est passée automatiquement." />
        {!todo.length && <Empty icon={<Truck className="size-5" />} title="Aucune impression en attente" />}
        {[...bySupplier.entries()].map(([key, ls]) => (
          <div key={key} className="border-t border-ink-700/70 px-5 py-4">
            <div className="mb-2 flex items-center gap-3">
              <div className="font-semibold">{ls[0].supplier_name}</div>
              <Badge>{ls.reduce((s, l) => s + l.qty, 0)} tirage(s)</Badge>
              <span className="text-[12.5px] text-mist-400">Coût estimé {eur(ls.reduce((s, l) => s + (l.unit_cost ?? 0) * l.qty, 0))}</span>
              <div className="flex-1" />
              <Select className="h-8 w-48 text-[12px]" value={supplierFor[key] ?? key} onChange={(e) => setSupplierFor({ ...supplierFor, [key]: e.target.value })}>
                <option value="">Choisir le fournisseur…</option>{suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Button size="sm" variant="gold" icon={<PackagePlus className="size-3.5" />} disabled={!(supplierFor[key] || key)} onClick={() => create(key, ls)}>Préparer la commande {ls.some((l) => sel.includes(l.order_item_id)) ? '(sélection)' : ''}</Button>
            </div>
            <table className="w-full text-[13px]"><tbody>
              {ls.map((l) => (
                <tr key={l.order_item_id} className="border-t border-ink-700/40">
                  <td className="w-8 py-1.5"><button onClick={() => setSel((s) => (s.includes(l.order_item_id) ? s.filter((x) => x !== l.order_item_id) : [...s, l.order_item_id]))}>{sel.includes(l.order_item_id) ? <CheckSquare className="size-4 text-gold-400" /> : <Square className="size-4 text-mist-400" />}</button></td>
                  <td className="py-1.5">{l.product_name} <span className="text-mist-400">{l.variant_name}</span></td><td className="text-center tabular">× {l.qty}</td>
                  <td>{l.family_name} <span className="text-mist-400">· {l.order_number}</span></td><td className="text-mist-300">{l.style_name}</td>
                  <td className="text-right text-mist-400 tabular">{l.unit_cost != null ? eur(l.unit_cost * l.qty) : 'coût inconnu'}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ))}
      </Card>
      <Card>
        <CardHeader title="Commandes fournisseurs" />
        <DataTable<SupplierOrder> rows={orders.data} rowKey={(o) => o.id} onRowClick={setEditOrder} empty={<div className="px-5 py-6 text-[13px] text-mist-400">Aucune commande fournisseur.</div>} columns={[
          { key: 'd', header: 'Créée le', cell: (o) => fmtDate(o.created_at) },
          { key: 's', header: 'Fournisseur', cell: (o) => <span className="font-medium">{o.supplier_name}</span> },
          { key: 'r', header: 'N° fournisseur', cell: (o) => <span className="font-mono text-[12.5px]">{o.reference ?? '—'}</span> },
          { key: 'l', header: 'Lignes', align: 'right', cell: (o) => o.lines },
          { key: 'st', header: 'Statut', cell: (o) => <Badge tone={o.status === 'recue' ? 'green' : o.status === 'commandee' ? 'blue' : o.status === 'annulee' ? 'red' : 'amber'}>{SUPPLIER_ORDER_STATUS[o.status]}</Badge> },
          { key: 'e', header: 'Coût estimé', align: 'right', cell: (o) => eur(o.estimated_cost_cents) },
          { key: 'a', header: 'Coût réel', align: 'right', cell: (o) => (o.actual_cost_cents != null ? eur(o.actual_cost_cents + o.shipping_cents) : '—') },
          { key: 'dt', header: 'Commandée / reçue', cell: (o) => <span className="text-[12.5px] text-mist-400">{fmtDate(o.ordered_at)} / {fmtDate(o.received_at)}</span> },
        ]} />
      </Card>
      {editOrder && <SupplierOrderDialog order={editOrder} onClose={() => setEditOrder(null)} onSaved={() => { setEditOrder(null); reload(); }} />}
    </div>
  );
}

function SupplierOrderDialog({ order, onClose, onSaved }: { order: SupplierOrder; onClose: () => void; onSaved: () => void }) {
  const [o, setO] = useState(order);
  const lines = useAsync(() => supplierOrderLines(order.id), [order.id]);
  const exportFile = (kind: 'csv' | 'pdf') => act(async () => {
    const ls = lines.data ?? [];
    if (kind === 'csv') return saveFile(`commande-${slug(o.supplier_name)}-${todayIso()}.csv`, toCsv(['Produit', 'Format', 'Quantité', 'Famille', 'Commande', 'Création'], ls.map((l) => [l.product_name, l.variant_name ?? '', l.qty, l.family_name, l.order_number, l.style_name ?? ''])), [{ name: 'CSV', extensions: ['csv'] }]);
    return saveFile(`commande-${slug(o.supplier_name)}-${todayIso()}.pdf`, supplierOrderPdf(await brand(), o.supplier_name, o.reference, ls.map((l) => ({ product: l.product_name, variant: l.variant_name, qty: l.qty, family: l.family_name, order: l.order_number, style: l.style_name }))), PDF_FILTER);
  }, 'Récapitulatif enregistré');
  return (
    <Modal open onClose={onClose} size="lg" title={`Commande ${o.supplier_name}`} subtitle="Le statut met à jour les tâches de postproduction liées."
      footer={<><Button variant="ghost" icon={<Download className="size-4" />} onClick={() => exportFile('csv')}>CSV</Button><Button variant="ghost" icon={<FileDown className="size-4" />} onClick={() => exportFile('pdf')}>PDF</Button><div className="flex-1" /><Button variant="ghost" onClick={onClose}>Fermer</Button>
        <Button variant="gold" onClick={() => act(() => updateSupplierOrder(o.id, { status: o.status, reference: o.reference, actual_cost_cents: o.actual_cost_cents, shipping_cents: o.shipping_cents, ordered_at: o.ordered_at, received_at: o.received_at, notes: o.notes }), 'Commande fournisseur mise à jour').then(onSaved)}>Enregistrer</Button></>}>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Statut"><Select value={o.status} onChange={(e) => { const s = e.target.value as SupplierOrder['status']; setO({ ...o, status: s, ordered_at: s === 'commandee' && !o.ordered_at ? todayIso() : o.ordered_at, received_at: s === 'recue' && !o.received_at ? todayIso() : o.received_at }); }}>{Object.entries(SUPPLIER_ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="N° de commande fournisseur"><Input value={o.reference ?? ''} onChange={(e) => setO({ ...o, reference: e.target.value })} /></Field>
        <Field label="Coût estimé"><div className="flex h-9.5 items-center tabular text-mist-300">{eur(o.estimated_cost_cents)}</div></Field>
        <Field label="Date de commande"><Input type="date" value={o.ordered_at ?? ''} onChange={(e) => setO({ ...o, ordered_at: e.target.value || null })} /></Field>
        <Field label="Date de réception"><Input type="date" value={o.received_at ?? ''} onChange={(e) => setO({ ...o, received_at: e.target.value || null })} /></Field>
        <div />
        <Field label="Coût réel payé (TTC, hors port)"><MoneyInput value={o.actual_cost_cents} onChange={(v) => setO({ ...o, actual_cost_cents: v })} /></Field>
        <Field label="Frais de livraison"><MoneyInput value={o.shipping_cents} onChange={(v) => setO({ ...o, shipping_cents: v ?? 0 })} /></Field>
        <Field label="Notes" className="col-span-3"><Textarea rows={2} value={o.notes ?? ''} onChange={(e) => setO({ ...o, notes: e.target.value })} /></Field>
      </div>
      <div className="mt-4 max-h-60 overflow-auto rounded-xl border border-ink-700 text-[13px]">
        {lines.data?.map((l) => <div key={l.id} className="flex justify-between border-b border-ink-700/50 px-3 py-2 last:border-0"><span>{l.product_name} {l.variant_name} × {l.qty}</span><span className="text-mist-400">{l.family_name} · {l.order_number}</span></div>)}
      </div>
    </Modal>
  );
}
