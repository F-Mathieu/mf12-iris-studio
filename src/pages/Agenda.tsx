import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, Loading, Modal, PageHeader, Segmented, Select, Textarea, Toggle, useAsync, useConfirm, cx } from '../components/ui';
import { agenda, bookedOn, deleteEvent, EVENT_KINDS, saveEvent, setEventDone, type AgendaItem, type CalendarEvent, type EventKind } from '../services/agenda';
import { addDays } from '../lib/weddingTexts';
import { fmtDate, fmtLongDate } from '../lib/format';
import { todayIso } from '../lib/ids';
import { act } from '../lib/act';

/** Colours per kind (own events and items coming from the app). */
export const KIND_STYLE: Record<string, { label: string; cls: string }> = {
  mariage: { label: 'Mariage', cls: 'bg-rose-500/20 text-rose-200 border-rose-400/40' },
  seance: { label: 'Séance', cls: 'bg-gold-500/20 text-gold-100 border-gold-400/40' },
  prestation: { label: 'Prestation', cls: 'bg-gold-500/20 text-gold-100 border-gold-400/40' },
  rdv: { label: 'Rendez-vous', cls: 'bg-sky-500/15 text-sky-200 border-sky-400/40' },
  inscrit: { label: 'RDV des inscrits', cls: 'bg-cyan-500/10 text-cyan-200 border-cyan-400/30' },
  livraison: { label: 'Livraison', cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40' },
  echeance: { label: 'Échéance', cls: 'bg-amber-500/15 text-amber-200 border-amber-400/40' },
  devis: { label: 'Devis', cls: 'bg-violet-500/15 text-violet-200 border-violet-400/40' },
  perso: { label: 'Personnel', cls: 'bg-ink-600/60 text-mist-200 border-ink-500' },
  autre: { label: 'Autre', cls: 'bg-ink-600/60 text-mist-200 border-ink-500' },
};
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const monthStart = (iso: string) => iso.slice(0, 8) + '01';
const addMonth = (iso: string, n: number) => { const d = new Date(iso.slice(0, 7) + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const covers = (x: AgendaItem, day: string) => x.date <= day && (x.end_date ?? x.date) >= day;

export default function Agenda() {
  const nav = useNavigate();
  const confirm = useConfirm();
  const today = todayIso();
  const [month, setMonth] = useState(monthStart(today));
  const [view, setView] = useState<'mois' | 'liste'>('mois');
  // the many appointments of registered families are hidden by default (not the events you add yourself)
  const [hide, setHide] = useState<Set<string>>(new Set(['inscrit']));
  const [day, setDay] = useState<string | null>(today);
  const [edit, setEdit] = useState<Partial<CalendarEvent> | null>(null);
  // grid from the Monday before the 1st to the Sunday after the end of the month
  const first = new Date(month + 'T12:00:00Z'), offset = (first.getUTCDay() + 6) % 7;
  const gridStart = addDays(month, -offset);
  const lastDay = addDays(addMonth(month, 1), -1);
  const gridEnd = addDays(lastDay, 6 - ((new Date(lastDay + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const items = useAsync(() => agenda(view === 'mois' ? gridStart : today, view === 'mois' ? gridEnd : addDays(today, 120)), [gridStart, gridEnd, view]);
  const shown = useMemo(() => (items.data ?? []).filter((x) => !hide.has(x.kind)), [items.data, hide]);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const open = (x: AgendaItem) => (x.event ? setEdit(x.event) : x.link ? nav(x.link) : undefined);
  /** Own events only: the others come from séances, weddings, orders (deleted / changed there). */
  const remove = async (x: AgendaItem) => {
    if (x.event && (await confirm({ title: `Supprimer « ${x.title} » ?`, text: fmtDate(x.date), danger: true, confirm: 'Supprimer' }))) await act(() => deleteEvent(x.event!.id).then(items.reload), 'Événement supprimé');
  };
  const toggleKind = (k: string) => setHide((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <>
      <PageHeader title="Agenda" subtitle="Prestations, séances, mariages, rendez-vous, livraisons (avec rappel), échéances de paiement, devis."
        actions={<><Segmented value={view} onChange={setView} options={[{ id: 'mois', label: 'Mois' }, { id: 'liste', label: 'À venir' }]} />
          <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setEdit({ date: day ?? today, kind: 'rdv' })}>Nouvel événement</Button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === 'mois' && <>
          <IconButton title="Mois précédent" onClick={() => setMonth(addMonth(month, -1))}><ChevronLeft className="size-4" /></IconButton>
          <div className="w-44 text-center font-display text-[22px] font-semibold capitalize">{new Date(month + 'T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</div>
          <IconButton title="Mois suivant" onClick={() => setMonth(addMonth(month, 1))}><ChevronRight className="size-4" /></IconButton>
          <Button size="sm" variant="ghost" onClick={() => { setMonth(monthStart(today)); setDay(today); }}>Aujourd’hui</Button>
        </>}
        <div className="flex-1" />
        {Object.entries(KIND_STYLE).filter(([k]) => k !== 'autre').map(([k, s]) => (
          <button key={k} type="button" onClick={() => toggleKind(k)} className={cx('rounded-full border px-2.5 py-0.5 text-[12px]', hide.has(k) ? 'border-ink-600 text-mist-500 line-through' : s.cls)}>{s.label}</button>
        ))}
      </div>
      {!items.data ? <Loading /> : view === 'liste' ? (
        <Card>
          <div className="divide-y divide-ink-700/50">
            {shown.filter((x) => !x.done).map((x) => <ItemRow key={x.key} x={x} onOpen={() => open(x)} onDone={x.event ? () => act(() => setEventDone(x.event!.id, true).then(items.reload)) : undefined} onDelete={x.event ? () => remove(x) : undefined} withDate />)}
            {!shown.length && <div className="px-5 py-8 text-center text-mist-400">Rien de prévu dans les 4 prochains mois.</div>}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-[1fr_320px] gap-5">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-ink-700 text-center text-[11.5px] tracking-wider text-mist-400 uppercase">{WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}</div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const list = shown.filter((x) => covers(x, d));
                const blocked = list.some((x) => x.blocks);
                return (
                  <button key={d} type="button" onClick={() => setDay(d)} onDoubleClick={() => setEdit({ date: d, kind: 'rdv' })}
                    className={cx('min-h-[104px] border-r border-b border-ink-700/60 p-1.5 text-left align-top transition hover:bg-ink-800/60', d.slice(0, 7) !== month.slice(0, 7) && 'opacity-40', day === d && 'bg-ink-800 ring-1 ring-gold-500/50 ring-inset', blocked && 'bg-rose-500/[0.04]')}>
                    <div className={cx('mb-1 flex size-6 items-center justify-center rounded-full text-[12px]', d === today ? 'bg-gold-400 font-semibold text-ink-950' : 'text-mist-300')}>{Number(d.slice(8))}</div>
                    <div className="space-y-0.5">
                      {list.slice(0, 4).map((x) => <div key={x.key} title={x.event ? 'Cliquer pour modifier ou supprimer' : x.link ? 'Cliquer pour ouvrir' : undefined}
                        onClick={(e) => { if (x.event || x.link) { e.stopPropagation(); setDay(d); open(x); } }}
                        className={cx('truncate rounded border px-1 py-px text-[11px] hover:brightness-125', KIND_STYLE[x.kind]?.cls, x.done && 'line-through opacity-50')}>{x.time ? x.time + ' ' : ''}{x.title}</div>)}
                      {list.length > 4 && <div className="text-[11px] text-mist-400">+ {list.length - 4}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
          <Card className="h-fit">
            <CardHeader title={day ? fmtLongDate(day) : 'Choisissez un jour'} actions={day && <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ date: day, kind: 'rdv' })}>Ajouter</Button>} />
            <div className="divide-y divide-ink-700/50">
              {day && shown.filter((x) => covers(x, day)).map((x) => <ItemRow key={x.key} x={x} onOpen={() => open(x)} onDone={x.event ? () => act(() => setEventDone(x.event!.id, !x.done).then(items.reload)) : undefined} onDelete={x.event ? () => remove(x) : undefined} />)}
              {day && !shown.some((x) => covers(x, day)) && <div className="px-5 py-6 text-[13px] text-mist-400">Rien ce jour-là. Double-cliquez sur un jour pour ajouter un événement.</div>}
            </div>
          </Card>
        </div>
      )}
      {edit && <EventDialog event={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); items.reload(); }} />}
    </>
  );
}

function ItemRow({ x, onOpen, onDone, onDelete, withDate }: { x: AgendaItem; onOpen: () => void; onDone?: () => void; onDelete?: () => void; withDate?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
      <span className={cx('size-2.5 shrink-0 rounded-full border', KIND_STYLE[x.kind]?.cls)} />
      {withDate && <span className="w-24 shrink-0 text-mist-400 tabular">{fmtDate(x.date)}</span>}
      <button type="button" onClick={onOpen} className={cx('min-w-0 flex-1 text-left hover:text-gold-300', x.done && 'line-through opacity-50')}>
        <div className="truncate">{x.time && <span className="text-mist-400">{x.time}{x.end_time ? `–${x.end_time}` : ''} · </span>}{x.title}</div>
        {x.detail && <div className="truncate text-[11.5px] text-mist-400">{x.detail}</div>}
      </button>
      {x.blocks && <Badge tone="neutral">Réservé</Badge>}
      {onDone && <IconButton title={x.done ? 'Rouvrir' : 'Fait'} onClick={onDone}><Check className={cx('size-4', x.done && 'text-emerald-300')} /></IconButton>}
      {onDelete ? <IconButton title="Supprimer l’événement" onClick={onDelete}><Trash2 className="size-4" /></IconButton>
        : x.link && <span className="text-[11px] text-mist-500" title="Se modifie depuis sa page (séance, mariage, commande)">↗</span>}
    </div>
  );
}

/** Own event; warns when the day is already booked (séance, signed wedding, reserved prestation). */
export function EventDialog({ event, onClose, onSaved }: { event: Partial<CalendarEvent>; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const [e, setE] = useState<Partial<CalendarEvent>>({ blocks_day: event.kind === 'prestation' ? 1 : 0, ...event });
  const set = (p: Partial<CalendarEvent>) => setE((x) => ({ ...x, ...p }));
  const booked = useAsync(() => (e.date && e.blocks_day ? bookedOn(e.date) : Promise.resolve([])), [e.date, e.blocks_day]);
  const conflicts = (booked.data ?? []).filter((x) => x.key !== `e:${e.id}`);
  const save = async () => {
    if (conflicts.length && !(await confirm({ title: 'Journée déjà réservée', text: `Le ${fmtDate(e.date)} : ${conflicts.map((x) => x.title).join(', ')}. Enregistrer quand même ?`, confirm: 'Enregistrer quand même' }))) return;
    if (await act(() => saveEvent(e as CalendarEvent), 'Événement enregistré') !== undefined) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={e.id ? 'Modifier l’événement' : 'Nouvel événement'} size="lg"
      footer={<>{e.id && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={async () => (await confirm({ title: 'Supprimer cet événement ?', danger: true, confirm: 'Supprimer' })) && act(() => deleteEvent(e.id!).then(onSaved), 'Événement supprimé')}>Supprimer</Button>}
        <div className="flex-1" /><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={!e.title?.trim() || !e.date} onClick={save}>Enregistrer</Button></>}>
      <div className="grid grid-cols-4 gap-4">
        <Field label="Titre *" className="col-span-3"><Input autoFocus value={e.title ?? ''} placeholder="RDV présentation photos famille Martin" onChange={(x) => set({ title: x.target.value })} /></Field>
        <Field label="Type"><Select value={e.kind ?? 'rdv'} onChange={(x) => set({ kind: x.target.value as EventKind, blocks_day: x.target.value === 'prestation' ? 1 : e.blocks_day })}>{Object.entries(EVENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Date *"><Input type="date" value={e.date ?? ''} onChange={(x) => set({ date: x.target.value })} /></Field>
        <Field label="Jusqu’au (facultatif)"><Input type="date" value={e.end_date ?? ''} onChange={(x) => set({ end_date: x.target.value || null })} /></Field>
        <Field label="Début"><Input type="time" value={e.start_time ?? ''} onChange={(x) => set({ start_time: x.target.value || null })} /></Field>
        <Field label="Fin"><Input type="time" value={e.end_time ?? ''} onChange={(x) => set({ end_time: x.target.value || null })} /></Field>
        <Field label="Lieu" className="col-span-2"><Input value={e.location ?? ''} onChange={(x) => set({ location: x.target.value })} /></Field>
        <Field label="Rappel (jours avant)" hint="Affiché sur le tableau de bord"><Input type="number" min={0} placeholder="—" value={e.remind_days ?? ''} onChange={(x) => set({ remind_days: x.target.value === '' ? null : Math.max(0, Number(x.target.value)) })} /></Field>
        <div className="flex items-end pb-2"><Toggle checked={!!e.blocks_day} onChange={(v) => set({ blocks_day: v ? 1 : 0 })} label="Journée réservée" /></div>
        <Field label="Notes" className="col-span-4"><Textarea rows={3} value={e.notes ?? ''} onChange={(x) => set({ notes: x.target.value })} /></Field>
        {conflicts.length > 0 && <div className="col-span-4 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">Déjà réservé ce jour-là : {conflicts.map((x) => x.title).join(', ')}</div>}
      </div>
    </Modal>
  );
}
