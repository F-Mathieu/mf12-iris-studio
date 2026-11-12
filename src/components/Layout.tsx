import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { BadgeEuro, BookOpen, CalendarClock, Camera, FileText, LayoutDashboard, MonitorPlay, Settings, ShoppingBag, Tags, Truck, TrendingUp, Users, Wand2 } from 'lucide-react';
import { Button, Field, Modal, Select, useAsync, cx } from './ui';
import { listSessions } from '../services/sessions';
import { listRegistrations } from '../services/registrations';
import { useApp } from '../store';
import { act } from '../lib/act';

const NAV: { to: string; label: string; icon: typeof Camera }[][] = [
  [
    { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
    { to: '/seances', label: 'Séances', icon: Camera },
    { to: '/planning', label: 'Planning', icon: CalendarClock },
    { to: '/clients', label: 'Clients', icon: Users },
    { to: '/commandes', label: 'Commandes', icon: ShoppingBag },
    { to: '/postproduction', label: 'Postproduction', icon: Wand2 },
  ],
  [
    { to: '/catalogue', label: 'Catalogue', icon: BookOpen },
    { to: '/tarifs', label: 'Templates tarifaires', icon: Tags },
    { to: '/fournisseurs', label: 'Fournisseurs', icon: Truck },
    { to: '/rentabilite', label: 'Rentabilité', icon: TrendingUp },
    { to: '/documents', label: 'Documents PDF', icon: FileText },
    { to: '/parametres', label: 'Paramètres', icon: Settings },
  ],
];

export function Layout({ children }: { children: ReactNode }) {
  const [present, setPresent] = useState(false);
  const { settings } = useApp();
  return (
    <div className="flex h-full">
      <aside className="flex w-[244px] shrink-0 flex-col border-r border-ink-700/70 bg-ink-900">
        <div className="drag-region h-9 shrink-0" />
        <div className="px-6 pb-6">
          <div className="font-display text-[30px] leading-none font-semibold tracking-tight text-gold-400">{settings.business_name || 'MF/1.2'}</div>
          <div className="mt-1 text-[10.5px] font-medium tracking-[0.32em] text-mist-400">IRIS STUDIO</div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3">
          {NAV.map((g, i) => (
            <div key={i} className="space-y-0.5">
              {i === 1 && <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.18em] text-mist-400/70">GESTION</div>}
              {g.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition',
                  isActive ? 'bg-ink-750 text-mist-100 shadow-[inset_2px_0_0_var(--color-gold-500)]' : 'text-mist-300 hover:bg-ink-800 hover:text-mist-100')}>
                  {({ isActive }) => <><n.icon className={cx('size-[17px]', isActive ? 'text-gold-400' : 'text-mist-400 group-hover:text-mist-200')} strokeWidth={1.75} />{n.label}</>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="p-3">
          <Button variant="gold" size="lg" className="w-full" icon={<MonitorPlay className="size-[18px]" />} onClick={() => setPresent(true)}>Mode présentation</Button>
        </div>
      </aside>
      <main className="relative flex-1 overflow-y-auto">
        <div className="drag-region sticky top-0 z-10 h-6" />
        <div className="mx-auto max-w-[1400px] px-10 pb-16">{children}</div>
      </main>
      <PresentDialog open={present} onClose={() => setPresent(false)} />
    </div>
  );
}

/** Starts the client presentation mode for a session (and optionally one family). */
export function PresentDialog({ open, onClose, sessionId: s0, registrationId: r0 }: { open: boolean; onClose: () => void; sessionId?: string; registrationId?: string }) {
  const { enterClient } = useApp();
  const [sessionId, setSessionId] = useState(s0 ?? '');
  const [regId, setRegId] = useState(r0 ?? '');
  const sessions = useAsync(() => listSessions(), [open]);
  const sid = sessionId || s0 || sessions.data?.find((s) => s.status === 'active')?.id || sessions.data?.[0]?.id || '';
  const regs = useAsync(() => (sid ? listRegistrations(sid) : Promise.resolve([])), [sid]);
  const go = () => act(async () => {
    const reg = regs.data?.find((r) => r.id === (regId || r0));
    await enterClient({ sessionId: sid, registrationId: reg?.id ?? null, familyId: reg?.family_id ?? null, orderId: reg?.order_status === 'brouillon' ? reg.order_id : null });
  });
  return (
    <Modal open={open} onClose={onClose} title="Mode présentation client" subtitle="Les prix d’achat, marges, fournisseurs et autres familles sont masqués. Sortie protégée par code PIN." size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={!sid} onClick={go} icon={<MonitorPlay className="size-4" />}>Lancer la présentation</Button></>}>
      <div className="space-y-4">
        <Field label="Séance">
          <Select value={sid} onChange={(e) => { setSessionId(e.target.value); setRegId(''); }}>
            {sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Famille (facultatif)" hint="Sans famille : présentation du catalogue uniquement.">
          <Select value={regId || r0 || ''} onChange={(e) => setRegId(e.target.value)}>
            <option value="">— Catalogue seul —</option>
            {regs.data?.map((r) => <option key={r.id} value={r.id}>{r.family_name}{r.appt_time ? ` · ${r.appt_time}` : ''}</option>)}
          </Select>
        </Field>
        {!sessions.data?.length && <div className="text-[12.5px] text-mist-400"><BadgeEuro className="mr-1 inline size-4" />Créez d’abord une séance.</div>}
      </div>
    </Modal>
  );
}
