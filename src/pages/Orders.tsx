import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2 } from 'lucide-react';
import { Button, Card, DataTable, Empty, IconButton, Input, PageHeader, SearchInput, Select, useAsync, useConfirm, useDebounced } from '../components/ui';
import { OrderBadge, PayBadge } from '../components/badges';
import { deleteDrafts, listOrders, type OrderRow } from '../services/orders';
import { confirmAndDeleteOrder } from '../components/deleteOrder';
import { act } from '../lib/act';
import { listSessions } from '../services/sessions';
import { eur } from '../lib/money';
import { fmtDate } from '../lib/format';

export default function Orders() {
  return (<><PageHeader title="Commandes" subtitle="Toutes les commandes, brouillons et règlements." /><OrdersTable /></>);
}

export function OrdersTable({ sessionId }: { sessionId?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [f, setF] = useState({ sessionId: sessionId ?? '', status: '', payment: '', from: '', to: '' });
  const dq = useDebounced(q);
  const sessions = useAsync(() => (sessionId ? Promise.resolve([]) : listSessions({ includeArchived: true })), []);
  const confirm = useConfirm();
  const { data, reload } = useAsync(() => listOrders({ q: dq, ...f, sessionId: sessionId ?? f.sessionId }), [dq, f.sessionId, f.status, f.payment, f.from, f.to, sessionId]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} className="w-64" placeholder="N°, famille, séance…" />
        {!sessionId && <Select className="w-56" value={f.sessionId} onChange={set('sessionId')}><option value="">Toutes les séances</option>{sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
        <Select className="w-40" value={f.status} onChange={set('status')}><option value="">Tous statuts</option><option value="brouillon">Brouillons</option><option value="validee">Validées</option><option value="annulee">Annulées</option></Select>
        <Select className="w-44" value={f.payment} onChange={set('payment')}><option value="">Tous règlements</option><option value="paye">Payées</option><option value="partiel">Partiellement payées</option><option value="a_payer">À payer</option></Select>
        <Input type="date" className="w-40" value={f.from} onChange={set('from')} title="Du" />
        <Input type="date" className="w-40" value={f.to} onChange={set('to')} title="Au" />
        <div className="flex-1" />
        {(() => {
          const drafts = (data ?? []).filter((r) => r.status === 'brouillon');
          return drafts.length > 0 && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={async () => {
            if (!(await confirm({ title: `Supprimer ${drafts.length} brouillon(s) ?`, text: 'Seuls les brouillons affichés (selon vos filtres) sont supprimés. Les commandes validées ne sont jamais touchées. Un brouillon avec un règlement enregistré est conservé.', danger: true, confirm: 'Supprimer' }))) return;
            await act(() => deleteDrafts(drafts.map((r) => r.id)).then(async (r) => { await reload(); return r; }), (r) => `${r.deleted} brouillon(s) supprimé(s)${r.kept ? ` · ${r.kept} conservé(s) (règlement enregistré)` : ''}`);
          }}>Supprimer les brouillons affichés ({drafts.length})</Button>;
        })()}
      </div>
      <Card>
        <DataTable<OrderRow> rows={data ?? []} rowKey={(r) => r.id} onRowClick={(r) => nav(r.status === 'brouillon' ? `/vente/commande/${r.id}` : `/commandes/${r.id}`)}
          empty={<Empty icon={<ShoppingBag className="size-5" />} title="Aucune commande" text="Les commandes se créent depuis le planning ou la liste des inscrits d’une séance." />}
          columns={[
            { key: 'n', header: 'N°', sort: (r) => r.number, cell: (r) => <span className="font-mono text-[12.5px]">{r.number}</span> },
            { key: 'd', header: 'Date', sort: (r) => r.created_at, cell: (r) => fmtDate(r.validated_at ?? r.created_at) },
            { key: 'f', header: 'Famille', sort: (r) => r.family_name, cell: (r) => <span className="font-medium">{r.family_name}</span> },
            ...(sessionId ? [] : [{ key: 's', header: 'Séance', sort: (r: OrderRow) => r.session_name, cell: (r: OrderRow) => <span className="text-mist-300">{r.session_name}</span> }]),
            { key: 'i', header: 'Articles', align: 'right', cell: (r) => r.items_count },
            { key: 'st', header: 'Statut', cell: (r) => <OrderBadge s={r.status} /> },
            { key: 'p', header: 'Règlement', cell: (r) => (r.status === 'validee' ? <PayBadge total={r.total_cents} paid={r.paid_cents} /> : null) },
            { key: 't', header: 'Total', align: 'right', sort: (r) => r.total_cents, cell: (r) => <span className="font-medium">{eur(r.total_cents)}</span> },
            { key: 'del', header: '', align: 'right', cell: (r) => <span onClick={(e) => e.stopPropagation()}><IconButton title={r.status === 'brouillon' ? 'Supprimer le brouillon' : 'Supprimer la commande'} onClick={async () => { if (await confirmAndDeleteOrder(confirm, r)) reload(); }}><Trash2 className="size-4" /></IconButton></span> },
            { key: 'b', header: 'Solde', align: 'right', sort: (r) => r.total_cents - r.paid_cents, cell: (r) => (r.status === 'validee' && r.total_cents - r.paid_cents > 0 ? <span className="text-amber-300">{eur(r.total_cents - r.paid_cents)}</span> : '') },
          ]} />
      </Card>
    </>
  );
}
