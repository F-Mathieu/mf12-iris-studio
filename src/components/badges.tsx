import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { Badge, cx, type Tone } from './ui';
import { act } from '../lib/act';
import { SESSION_STATUS, updateSession, type SessionStatus } from '../services/sessions';
import { APPT_STATUS, updateRegistration, type ApptStatus } from '../services/registrations';
import { ORDER_STATUS, PAYMENT_STATUS, type OrderStatus } from '../services/orders';
import { TASK_STATUS, type TaskStatus } from '../services/production';
import { paymentStatus } from '../lib/pricing';

const ST: Record<SessionStatus, Tone> = { preparation: 'blue', active: 'gold', terminee: 'green', archivee: 'neutral' };
export const SessionBadge = ({ s }: { s: SessionStatus }) => <Badge tone={ST[s]}>{SESSION_STATUS[s]}</Badge>;

const AT: Record<ApptStatus, Tone> = { a_venir: 'neutral', present: 'blue', en_cours: 'gold', termine: 'green', absent: 'red', annule: 'red' };
export const ApptBadge = ({ s }: { s: ApptStatus }) => <Badge tone={AT[s]}>{APPT_STATUS[s]}</Badge>;

const OT: Record<OrderStatus, Tone> = { brouillon: 'amber', validee: 'green', annulee: 'red' };
export const OrderBadge = ({ s }: { s: OrderStatus }) => <Badge tone={OT[s]}>{ORDER_STATUS[s]}</Badge>;

export function PayBadge({ total, paid }: { total: number; paid: number }) {
  const s = paymentStatus(total, paid);
  return <Badge tone={s === 'paye' ? 'green' : s === 'partiel' ? 'amber' : 'red'}>{PAYMENT_STATUS[s]}</Badge>;
}
const TT: Record<TaskStatus, Tone> = { a_realiser: 'neutral', en_cours: 'gold', montage_termine: 'blue', fichier_pret: 'violet', impression_a_commander: 'amber', commande_fournisseur: 'blue', recu: 'green', livre: 'green' };
export const TaskBadge = ({ s }: { s: TaskStatus }) => <Badge tone={TT[s]}>{TASK_STATUS[s]}</Badge>;

/**
 * Clickable status badge: a click opens the list of statuses and changes it on the spot (any page).
 * The menu is rendered in a portal so it is never cut by a table or a card.
 */
export function StatusPicker<S extends string>({ value, labels, tones, onChange, disabled }: {
  value: S; labels: Record<S, string>; tones: Record<S, Tone>; onChange: (s: S) => void | Promise<unknown>; disabled?: boolean;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close); window.addEventListener('keydown', k);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', k); };
  }, [pos]);
  if (disabled) return <Badge tone={tones[value]}>{labels[value]}</Badge>;
  return (
    <>
      <button type="button" title="Changer le statut" className="rounded-full transition hover:ring-2 hover:ring-gold-500/40"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setPos(pos ? null : { x: r.left, y: r.bottom + 4 }); }}>
        <Badge tone={tones[value]}>{labels[value]} <ChevronDown className="size-3 opacity-60" /></Badge>
      </button>
      {pos && createPortal(
        <div className="fixed inset-0 z-[70]" onMouseDown={(e) => { e.stopPropagation(); setPos(null); }} onClick={(e) => e.stopPropagation()}>
          <div className="fixed min-w-[170px] rounded-xl border border-ink-600 bg-ink-850 p-1 shadow-2xl animate-pop"
            style={{ left: Math.min(pos.x, window.innerWidth - 190), top: Math.min(pos.y, window.innerHeight - 40 * Object.keys(labels).length) }} onMouseDown={(e) => e.stopPropagation()}>
            {(Object.keys(labels) as S[]).map((s) => (
              <button key={s} type="button" className={cx('flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-ink-700', s === value && 'bg-ink-800')}
                onClick={async (e) => { e.stopPropagation(); setPos(null); if (s !== value) await onChange(s); }}>
                <Badge tone={tones[s]}>{labels[s]}</Badge>{s === value && <Check className="size-3.5 text-gold-300" />}
              </button>
            ))}
          </div>
        </div>, document.body)}
    </>
  );
}

/** Appointment status of a registration, editable in place. */
export const ApptStatusPicker = ({ id, s, onChanged }: { id: string; s: ApptStatus; onChanged?: () => void }) =>
  <StatusPicker value={s} labels={APPT_STATUS} tones={AT} onChange={(v) => act(() => updateRegistration(id, { appt_status: v }).then(() => onChanged?.()), `Statut : ${APPT_STATUS[v]}`)} />;

/** Status of a session, editable in place. */
export const SessionStatusPicker = ({ id, s, onChanged }: { id: string; s: SessionStatus; onChanged?: () => void }) =>
  <StatusPicker value={s} labels={SESSION_STATUS} tones={ST} onChange={(v) => act(() => updateSession(id, { status: v }).then(() => onChanged?.()), `Séance : ${SESSION_STATUS[v]}`)} />;
