import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MonitorPlay, Trash2 } from 'lucide-react';
import { Button, ErrorBox, Loading, useAsync, useConfirm } from '../components/ui';
import { deleteDraft } from '../services/orders';
import { Configurator, type ConfiguratorApi } from '../components/Configurator';
import { one } from '../services/base';
import { useApp } from '../store';
import { act } from '../lib/act';

/** Admin sales screen: /vente/:sessionId/:registrationId or /vente/commande/:orderId */
export default function Sale() {
  const { sessionId, registrationId, orderId } = useParams();
  const nav = useNavigate();
  const { enterClient } = useApp();
  const [savedId, setSavedId] = useState<string | null>(null);
  const api = useRef<ConfiguratorApi | null>(null);
  const confirm = useConfirm();
  const [draftStatus, setDraftStatus] = useState<'brouillon' | 'validee' | null>(null);
  const ctx = useAsync(async () => {
    if (orderId) {
      const o = await one<{ session_id: string; family_id: string; registration_id: string | null; session_name: string; family_name: string; status: string }>(
        'SELECT o.session_id, o.family_id, o.registration_id, o.status, s.name session_name, f.name family_name FROM orders o JOIN sessions s ON s.id=o.session_id JOIN families f ON f.id=o.family_id WHERE o.id=?', [orderId]);
      if (!o) throw new Error('Commande introuvable');
      return { ...o, order_id: orderId };
    }
    const r = await one<{ session_id: string; family_id: string; id: string; session_name: string; family_name: string }>(
      'SELECT r.id, r.session_id, r.family_id, s.name session_name, f.name family_name FROM session_registrations r JOIN sessions s ON s.id=r.session_id JOIN families f ON f.id=r.family_id WHERE r.id=?', [registrationId!]);
    if (!r) throw new Error('Inscription introuvable');
    const draft = await one<{ id: string }>("SELECT id FROM orders WHERE session_id=? AND family_id=? AND status='brouillon' ORDER BY updated_at DESC LIMIT 1", [r.session_id, r.family_id]);
    return { session_id: r.session_id, family_id: r.family_id, registration_id: r.id, session_name: r.session_name, family_name: r.family_name, order_id: draft?.id ?? null, status: draft ? 'brouillon' : null };
  }, [sessionId, registrationId, orderId]);
  if (ctx.error) return <ErrorBox error={ctx.error} />;
  if (!ctx.data) return <Loading />;
  const c = ctx.data;
  const oid = savedId ?? c.order_id;
  return (
    <div className="flex h-[calc(100vh-24px)] flex-col pb-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <button onClick={() => nav(`/seances/${c.session_id}?tab=planning`)} className="text-[12.5px] text-mist-400 hover:text-mist-100">← {c.session_name}</button>
          <h1 className="font-display text-[30px] leading-tight font-semibold">Configurateur de vente</h1>
        </div>
        <div className="flex gap-2">
        {oid && (draftStatus ?? c.status) === 'brouillon' && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => {
          if (!(await confirm({ title: 'Supprimer ce brouillon ?', text: 'La sélection en cours de cette famille sera effacée.', danger: true, confirm: 'Supprimer' }))) return;
          if (await act(() => deleteDraft(oid), 'Brouillon supprimé')) nav(`/seances/${c.session_id}?tab=planning`);
        }}>Supprimer le brouillon</Button>}
        <Button variant="outline" icon={<MonitorPlay className="size-4" />} onClick={() => act(async () => {
          const id = (await api.current?.saveDraft()) ?? oid; // keep the cart built so far
          await enterClient({ sessionId: c.session_id, familyId: c.family_id, registrationId: c.registration_id, orderId: id });
        })}>Montrer au client</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Configurator key={oid ?? 'new'} apiRef={api} mode="admin" sessionId={c.session_id} familyId={c.family_id} registrationId={c.registration_id} orderId={oid}
          onSaved={(r) => { setDraftStatus(r.status); if (r.status === 'validee') nav(`/commandes/${r.id}`); else setSavedId(r.id); }} />
      </div>
    </div>
  );
}
