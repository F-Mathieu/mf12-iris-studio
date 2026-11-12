import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Camera } from 'lucide-react';
import { Button, Card, CardHeader, Empty, Input, Loading, PageHeader, Select, Stat, useAsync } from '../components/ui';
import { BarList, Columns } from '../components/charts';
import { SessionBadge } from '../components/badges';
import { dashboard } from '../services/finance';
import { listSessions } from '../services/sessions';
import { eur } from '../lib/money';
import { fmtDate } from '../lib/format';

export default function Dashboard() {
  const nav = useNavigate();
  const [f, setF] = useState({ from: '', to: '', sessionId: '' });
  const sessions = useAsync(() => listSessions({ includeArchived: true }), []);
  const { data } = useAsync(() => dashboard(f), [f.from, f.to, f.sessionId]);
  const upcoming = (sessions.data ?? []).filter((s) => s.status === 'preparation' || s.status === 'active').slice(0, 5);
  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={<>
          <Select className="w-56" value={f.sessionId} onChange={(e) => setF({ ...f, sessionId: e.target.value })}><option value="">Toutes les séances</option>{sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Input type="date" className="w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} title="Du" />
          <Input type="date" className="w-40" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} title="Au" />
        </>} />
      {!data ? <Loading /> : !sessions.data?.length ? (
        <Card><Empty icon={<Camera className="size-5" />} title="Bienvenue dans MF/1.2 Iris Studio" text="Commencez par compléter votre catalogue et vos tarifs, puis créez votre première séance." action={<div className="flex gap-2"><Button onClick={() => nav('/catalogue')}>Catalogue</Button><Button onClick={() => nav('/tarifs')}>Tarifs</Button><Button variant="gold" onClick={() => nav('/seances')}>Créer une séance</Button></div>} /></Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-4">
            <Stat label="Ventes validées" value={eur(data.sales)} accent sub={`${data.orders} commande(s) · panier moyen ${eur(data.avgBasket)}`} />
            <Stat label="Encaissé" value={eur(data.collected)} sub={`Reste à encaisser ${eur(data.balance)}`} />
            <Stat label="Marge commerciale" value={eur(data.margin)} sub={data.sales > 0 && data.margin === data.sales ? '⚠ Coûts fournisseurs non renseignés' : `Résultat estimé ${eur(data.result)}`} />
            <Stat label="Familles" value={data.families} sub={`${data.present} reçue(s) · ${data.sessions} séance(s)`} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Stat label="Produits vendus" value={data.itemsSold} />
            <Stat label="Remises accordées" value={eur(data.discounts)} />
            <Stat label="À produire" value={data.toProduce} sub="tâches non livrées" />
            <Stat label="Livrées" value={data.delivered} />
          </div>
          <div className="grid grid-cols-3 gap-5">
            <Card className="col-span-2"><CardHeader title="Ventes par mois" /><div className="px-5 py-5"><Columns data={data.monthly.map((m) => ({ label: m.month.slice(5) + '/' + m.month.slice(2, 4), value: m.sales }))} /></div></Card>
            <Card><CardHeader title="Prochaines séances" actions={<Button size="sm" variant="ghost" onClick={() => nav('/seances')}>Toutes<ArrowRight className="size-3.5" /></Button>} />
              <div className="divide-y divide-ink-700/50">{upcoming.map((s) => (
                <button key={s.id} onClick={() => nav(`/seances/${s.id}`)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-ink-800"><div><div className="font-medium">{s.name}</div><div className="text-[12px] text-mist-400">{fmtDate(s.date)} · {s.registrations} inscrit(s)</div></div><SessionBadge s={s.status} /></button>
              ))}{!upcoming.length && <div className="px-5 py-6 text-[13px] text-mist-400">Aucune séance à venir.</div>}</div>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <Card><CardHeader title="Répartition des montages" /><div className="px-5 py-4"><BarList data={data.styles.map((s) => ({ label: s.label, value: s.n }))} /></div></Card>
            <Card><CardHeader title="Répartition des supports" /><div className="px-5 py-4"><BarList data={data.supports.map((s) => ({ label: s.label, value: s.n, sub: eur(s.amount) }))} /></div></Card>
          </div>
        </div>
      )}
    </>
  );
}
