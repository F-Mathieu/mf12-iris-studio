import { Badge, type Tone } from './ui';
import { SESSION_STATUS, type SessionStatus } from '../services/sessions';
import { APPT_STATUS, type ApptStatus } from '../services/registrations';
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
