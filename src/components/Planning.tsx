import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, GripVertical, ShoppingBag, UserCheck, UserRound } from 'lucide-react';
import { Badge, Button, Card, Empty, Segmented, SearchInput, Select, cx } from './ui';
import { ApptBadge, OrderBadge } from './badges';
import { AppointmentDialog } from './Registrations';
import { APPT_STATUS, updateRegistration, type ApptStatus, type RegistrationRow } from '../services/registrations';
import type { Session } from '../services/sessions';
import { addMinutes, toMinutes } from '../lib/format';
import { act } from '../lib/act';

type View = 'jour' | 'liste' | 'creneaux';

export function Planning({ session, regs, reload }: { session: Session; regs: RegistrationRow[]; reload: () => void }) {
  const nav = useNavigate();
  const [view, setView] = useState<View>('jour');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<RegistrationRow | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? regs.filter((r) => `${r.family_name} ${r.external_ref ?? ''} ${r.participant_names ?? ''}`.toLowerCase().includes(s)) : regs;
  }, [regs, q]);
  const active = regs.filter((r) => r.appt_status !== 'annule');
  const remaining = active.filter((r) => r.appt_status === 'a_venir').length;
  const received = active.filter((r) => ['present', 'en_cours', 'termine'].includes(r.appt_status)).length;

  const slots = useMemo(() => {
    const step = session.slot_minutes || 20;
    const times = new Set<string>();
    if (session.start_time && session.end_time)
      for (let t = toMinutes(session.start_time); t < toMinutes(session.end_time); t += step) times.add(addMinutes('00:00', t));
    regs.forEach((r) => r.appt_time && times.add(r.appt_time));
    return [...times].sort();
  }, [session, regs]);
  const at = (t: string) => filtered.filter((r) => r.appt_time === t && r.appt_status !== 'annule');
  const overlapping = (t: string) => regs.filter((r) => r.appt_time === t && r.appt_status !== 'annule').length > (session.slot_capacity || 1);
  const setStatus = (r: RegistrationRow, s: ApptStatus) => act(() => updateRegistration(r.id, { appt_status: s }).then(reload));
  const move = (id: string, t: string) => act(() => updateRegistration(id, { appt_time: t, appt_date: regs.find((r) => r.id === id)?.appt_date ?? session.date }).then(reload), `Rendez-vous déplacé à ${t}`);
  const sell = (r: RegistrationRow) => nav(r.order_id ? (r.order_status === 'validee' ? `/commandes/${r.order_id}` : `/vente/commande/${r.order_id}`) : `/vente/${session.id}/${r.id}`);

  const RegCard = ({ r }: { r: RegistrationRow }) => (
    <div draggable onDragStart={() => setDragId(r.id)} onDragEnd={() => setDragId(null)}
      className={cx('group flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 transition hover:border-ink-500', r.appt_status === 'en_cours' && 'border-gold-500/50 bg-gold-500/5')}>
      <GripVertical className="size-4 shrink-0 cursor-grab text-mist-400/60" />
      <button className="min-w-0 flex-1 text-left" onClick={() => sell(r)}>
        <div className="truncate font-medium">{r.family_name}</div>
        <div className="truncate text-[12px] text-mist-400">{r.nb_participants || r.participants_count || 0} part. · {r.participant_names || '—'}</div>
      </button>
      {r.order_status && <OrderBadge s={r.order_status as 'validee'} />}
      <Select className="h-8 w-[118px] text-[12px]" value={r.appt_status} onChange={(e) => setStatus(r, e.target.value as ApptStatus)}>
        {Object.entries(APPT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      {r.appt_status === 'a_venir' && <Button size="sm" variant="subtle" icon={<UserCheck className="size-3.5" />} onClick={() => setStatus(r, 'present')}>Arrivée</Button>}
      <Button size="sm" variant={r.order_id ? 'subtle' : 'gold'} icon={<ShoppingBag className="size-3.5" />} onClick={() => sell(r)}>{r.order_id ? 'Commande' : 'Vendre'}</Button>
      <button className="text-[12px] text-mist-400 opacity-0 transition group-hover:opacity-100 hover:text-mist-100" onClick={() => setEdit(r)}>Modifier l’inscription</button>
    </div>
  );

  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-3">
        <Card className="px-4 py-3"><div className="text-[11.5px] tracking-wider text-mist-400 uppercase">Inscrits</div><div className="mt-1 text-[22px] font-semibold tabular">{active.length}</div></Card>
        <Card className="px-4 py-3"><div className="text-[11.5px] tracking-wider text-mist-400 uppercase">Reçues</div><div className="mt-1 text-[22px] font-semibold text-emerald-300 tabular">{received}</div></Card>
        <Card className="px-4 py-3"><div className="text-[11.5px] tracking-wider text-mist-400 uppercase">Restant à recevoir</div><div className="mt-1 text-[22px] font-semibold text-gold-400 tabular">{remaining}</div></Card>
        <Card className="px-4 py-3"><div className="text-[11.5px] tracking-wider text-mist-400 uppercase">Absents / annulés</div><div className="mt-1 text-[22px] font-semibold tabular">{regs.filter((r) => ['absent', 'annule'].includes(r.appt_status)).length}</div></Card>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <Segmented value={view} onChange={setView} options={[{ id: 'jour', label: 'Journée' }, { id: 'liste', label: 'Liste chronologique' }, { id: 'creneaux', label: 'Créneaux' }]} />
        <SearchInput value={q} onChange={setQ} className="w-64" placeholder="Rechercher une famille…" />
        <div className="flex-1" />
        <span className="text-[12px] text-mist-400"><Clock className="mr-1 inline size-3.5" />Créneaux de {session.slot_minutes} min · {session.slot_capacity} famille(s) par créneau</span>
      </div>
      {!regs.length ? <Card><Empty icon={<UserRound className="size-5" />} title="Aucun rendez-vous" text="Importez ou ajoutez des familles dans l’onglet Inscrits." /></Card> : null}

      {regs.length > 0 && view === 'jour' && (
        <div className="space-y-1.5">
          {slots.map((t) => (
            <div key={t} onDragOver={(e) => e.preventDefault()} onDrop={() => dragId && move(dragId, t)}
              className={cx('flex gap-4 rounded-xl px-2 py-1.5 transition', dragId && 'hover:bg-gold-500/5 hover:outline hover:outline-dashed hover:outline-gold-500/40')}>
              <div className="w-14 pt-3 text-right text-[13px] font-medium text-mist-300 tabular">{t}</div>
              <div className="flex-1 space-y-1.5 border-l border-ink-700 pl-4">
                {at(t).map((r) => <RegCard key={r.id} r={r} />)}
                {!at(t).length && <div className="py-3 text-[12px] text-mist-400/50">Libre</div>}
                {overlapping(t) && <div className="flex items-center gap-1 text-[12px] text-amber-300"><AlertTriangle className="size-3.5" />Capacité du créneau dépassée</div>}
              </div>
            </div>
          ))}
          {filtered.filter((r) => !r.appt_time).length > 0 && (
            <div onDragOver={(e) => e.preventDefault()} className="mt-4 rounded-xl border border-dashed border-ink-600 p-3">
              <div className="mb-2 text-[12px] font-medium text-mist-400">Sans horaire — glissez vers un créneau</div>
              <div className="space-y-1.5">{filtered.filter((r) => !r.appt_time).map((r) => <RegCard key={r.id} r={r} />)}</div>
            </div>
          )}
        </div>
      )}
      {regs.length > 0 && view === 'liste' && <div className="space-y-1.5">{filtered.map((r) => <div key={r.id} className="flex items-center gap-3"><span className="w-12 text-right text-[13px] text-mist-300 tabular">{r.appt_time ?? '—'}</span><div className="flex-1"><RegCard r={r} /></div></div>)}</div>}
      {regs.length > 0 && view === 'creneaux' && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {slots.map((t) => {
            const n = regs.filter((r) => r.appt_time === t && r.appt_status !== 'annule');
            const full = n.length >= (session.slot_capacity || 1);
            return (
              <Card key={t} className={cx('p-3', n.length > session.slot_capacity && 'border-amber-500/40')}>
                <div className="flex items-center justify-between"><span className="font-semibold tabular">{t}</span><Badge tone={n.length > session.slot_capacity ? 'amber' : full ? 'gold' : 'neutral'}>{n.length}/{session.slot_capacity}</Badge></div>
                <div className="mt-2 space-y-1">{n.map((r) => <div key={r.id} className="flex items-center justify-between text-[12.5px]"><button className="truncate hover:text-gold-300" onClick={() => sell(r)}>{r.family_name}</button><ApptBadge s={r.appt_status} /></div>)}</div>
              </Card>
            );
          })}
        </div>
      )}
      <AppointmentDialog reg={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
    </>
  );
}
