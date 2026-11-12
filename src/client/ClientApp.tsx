import { useMemo, useState } from 'react';
import { Lock, Users } from 'lucide-react';
import { Button, ErrorBox, Loading, Modal, SearchInput, useAsync, cx } from '../components/ui';
import { ApptBadge, OrderBadge } from '../components/badges';
import { PinDialog } from '../components/PinDialog';
import { listRegistrations, type RegistrationRow } from '../services/registrations';
import { Configurator } from '../components/Configurator';
import { Lightbox, type LightItem } from '../components/Lightbox';
import { useApp } from '../store';
import { getSession } from '../services/sessions';
import { listExamples, listStyles } from '../services/catalog';
import { act } from '../lib/act';

/**
 * Client presentation mode. Only this component tree is mounted while active:
 * no admin route, no cost/margin/supplier, no other family is reachable.
 */
export default function ClientApp() {
  const { client, settings, updateClient, exitClient, leaveClientTo } = useApp();
  const [pinFor, setPinFor] = useState<'exit' | 'switch' | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const pin = settings.client_pin || '1212';
  const s = useAsync(() => getSession(client!.sessionId), [client?.sessionId]);
  if (!client) return null;
  return (
    <div className="flex h-full flex-col bg-ink-950">
      <header className="drag-region flex h-16 shrink-0 items-center justify-between border-b border-ink-800 pr-6 pl-24">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-[28px] font-semibold text-gold-400">{settings.business_name || 'MF/1.2'}</span>
          <span className="text-[11px] tracking-[0.3em] text-mist-400">IRIS STUDIO</span>
          {s.data && <span className="ml-4 text-[13px] text-mist-300">{s.data.name}</span>}
        </div>
        <div className="no-drag flex items-center gap-1">
          <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-mist-400 hover:bg-ink-800 hover:text-mist-100" onClick={() => setPinFor('switch')}><Users className="size-4" />Changer de client</button>
          <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-mist-400 hover:bg-ink-800 hover:text-mist-100" onClick={() => setPinFor('exit')}><Lock className="size-4" />Quitter la présentation</button>
        </div>
      </header>
      <div className="min-h-0 flex-1 p-6">
        {s.error ? <ErrorBox error={s.error} /> : !s.data ? <Loading /> : client.familyId ? (
          <Configurator key={`${client.familyId}-${client.orderId ?? 'new'}`} mode="client" sessionId={client.sessionId} familyId={client.familyId} registrationId={client.registrationId ?? null} orderId={client.orderId}
            onSaved={(r) => act(() => (r.status === 'validee' ? leaveClientTo(`/commandes/${r.id}`) : updateClient({ orderId: r.id })))} />
        ) : <Showcase />}
      </div>
      <PinDialog open={!!pinFor} onClose={() => setPinFor(null)}
        subtitle={pinFor === 'switch' ? 'Réservé au photographe — liste des familles' : 'Réservé au photographe'}
        onCode={async (c) => {
          if (pinFor === 'exit') return exitClient(c);
          if (c !== pin) return false;
          setSwitchOpen(true); return true;
        }} />
      {switchOpen && <SwitchFamilyDialog sessionId={client.sessionId} currentId={client.registrationId ?? null} onClose={() => setSwitchOpen(false)}
        onPick={(r) => act(async () => {
          await updateClient({ registrationId: r?.id ?? null, familyId: r?.family_id ?? null, orderId: r && r.order_status && r.order_status !== 'annulee' ? r.order_id : null });
          setSwitchOpen(false);
        })} />}
    </div>
  );
}

/** Catalogue-only presentation (no family selected). */
function Showcase() {
  const data = useAsync(async () => ({ styles: (await listStyles()).filter((s) => s.active), examples: await listExamples() }), []);
  const [light, setLight] = useState<{ items: LightItem[]; i: number } | null>(null);
  if (!data.data) return <Loading />;
  return (
    <div className="h-full overflow-y-auto">
      <h1 className="mb-8 text-center font-display text-[56px] font-semibold">Nos créations</h1>
      <div className="mx-auto grid max-w-[1500px] grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-6 pb-10">
        {data.data.styles.map((s) => {
          const ex = data.data!.examples.filter((e) => e.style_id === s.id);
          const items = ex.map((e) => ({ mediaId: e.media_id, thumb: e.thumb, caption: `${s.name}${e.iris_count ? ` — ${e.iris_count} iris` : ''}` }));
          return (
            <button key={s.id} disabled={!ex.length} onClick={() => setLight({ items, i: 0 })} className="group overflow-hidden rounded-3xl border border-ink-700 bg-ink-850 text-left">
              <div className="aspect-square overflow-hidden bg-ink-800">{ex[0] && <img src={ex[0].thumb} alt="" className="size-full object-cover transition duration-700 group-hover:scale-105" />}</div>
              <div className="p-6"><div className="font-display text-[34px] font-semibold">{s.name}</div><div className="mt-1 text-[14px] text-mist-400">{s.description}</div></div>
            </button>
          );
        })}
      </div>
      <p className="pb-6 text-center text-[13px] text-mist-400">Exemples de réalisations — chaque création est réalisée à partir de vos propres iris.</p>
      <Lightbox items={light?.items ?? []} index={light?.i ?? null} onClose={() => setLight(null)} />
    </div>
  );
}

/** Photographer-only list of the session's families (shown after the PIN). */
function SwitchFamilyDialog({ sessionId, currentId, onClose, onPick }: { sessionId: string; currentId: string | null; onClose: () => void; onPick: (r: RegistrationRow | null) => void }) {
  const regs = useAsync(() => listRegistrations(sessionId), [sessionId]);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (regs.data ?? []).filter((r) => r.appt_status !== 'annule' && (!t || `${r.family_name} ${r.contact_first_name ?? ''} ${r.participant_names ?? ''} ${r.external_ref ?? ''}`.toLowerCase().includes(t)));
  }, [regs.data, q]);
  return (
    <Modal open onClose={onClose} size="lg" title="Changer de client" subtitle="Choisissez la famille suivante. Sa sélection en cours est reprise automatiquement.">
      <div className="mb-3 flex gap-2">
        <SearchInput autoFocus value={q} onChange={setQ} className="flex-1" placeholder="Nom, prénom, référence…" />
        <Button variant="ghost" onClick={() => onPick(null)}>Catalogue seul</Button>
      </div>
      {!regs.data ? <Loading /> : (
        <div className="max-h-[58vh] divide-y divide-ink-700/60 overflow-y-auto rounded-xl border border-ink-700">
          {rows.map((r) => (
            <button key={r.id} onClick={() => onPick(r)} className={cx('flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-ink-750', r.id === currentId && 'bg-gold-500/10')}>
              <span className="w-12 text-[13px] text-mist-300 tabular">{r.appt_time ?? '—'}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{r.family_name}{r.id === currentId && <span className="ml-2 text-[12px] text-gold-300">(en cours)</span>}</span>
                <span className="block truncate text-[12px] text-mist-400">{r.participant_names || '—'}</span>
              </span>
              <ApptBadge s={r.appt_status} />
              {r.order_status ? <OrderBadge s={r.order_status as 'validee'} /> : <span className="w-[70px]" />}
            </button>
          ))}
          {!rows.length && <div className="px-4 py-8 text-center text-[13px] text-mist-400">Aucune famille.</div>}
        </div>
      )}
    </Modal>
  );
}
