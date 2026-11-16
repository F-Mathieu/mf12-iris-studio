import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, DataTable, Field, IconButton, Input, Loading, MoneyInput, PageHeader, Select, Stat, useAsync } from '../components/ui';
import { SessionBadge } from '../components/badges';
import { addExpense, deleteExpense, EXPENSE_CATEGORIES, listExpenses, profitability, sessionsComparison, type ExpenseCategory } from '../services/finance';
import { eur, fmtRate } from '../lib/money';
import { fmtDate } from '../lib/format';
import { todayIso } from '../lib/ids';
import { act } from '../lib/act';
import type { SessionStatus } from '../services/sessions';

export default function Profitability() {
  const { data } = useAsync(() => sessionsComparison(), []);
  const [sel, setSel] = useState('');
  return (
    <>
      <PageHeader title="Rentabilité" subtitle="Ce qu’il vous reste : chiffre d’affaires − achats fournisseurs − frais − cotisations URSSAF (micro-entreprise, taux dans Paramètres). Estimation, pas une comptabilité." />
      {data && <YearSummary rows={data} />}
      {!data ? <Loading /> : (
        <Card className="mb-6">
          <CardHeader title="Comparaison des séances" />
          <DataTable rows={data} rowKey={(r) => r.id} onRowClick={(r) => setSel(r.id)} columns={[
            { key: 'n', header: 'Séance', sort: (r) => r.name, cell: (r) => <div><div className="font-medium">{r.name}</div><div className="text-[12px] text-mist-400">{fmtDate(r.date)}</div></div> },
            { key: 's', header: 'Statut', cell: (r) => <SessionBadge s={r.status as SessionStatus} /> },
            { key: 'o', header: 'Cdes', align: 'right', sort: (r) => r.orders, cell: (r) => r.orders },
            { key: 'ca', header: 'CA', align: 'right', sort: (r) => r.sales_cents, cell: (r) => eur(r.sales_cents) },
            { key: 'enc', header: 'Encaissé', align: 'right', sort: (r) => r.collected_cents, cell: (r) => eur(r.collected_cents) },
            { key: 'cf', header: 'Coûts fourn.', align: 'right', cell: (r) => eur(r.sales_cents - r.margin_cents) },
            { key: 'm', header: 'Marge', align: 'right', sort: (r) => r.margin_cents, cell: (r) => eur(r.margin_cents) },
            { key: 'fr', header: 'Frais', align: 'right', cell: (r) => eur(r.expenses_without_time_cents) },
            { key: 'urs', header: 'Cotisations', align: 'right', cell: (r) => eur(r.charges_cents) },
            { key: 'net', header: 'Bénéfice net estimé', align: 'right', sort: (r) => r.net_cents, cell: (r) => <span className={r.net_cents < 0 ? 'text-red-300' : 'font-medium text-gold-300'}>{eur(r.net_cents)}</span> },
          ]} />
        </Card>
      )}
      {sel && <ProfitPanel key={sel} sessionId={sel} />}
    </>
  );
}

function YearSummary({ rows }: { rows: Awaited<ReturnType<typeof sessionsComparison>> }) {
  const y = String(new Date().getFullYear());
  const r = rows.filter((x) => (x.date ?? '').startsWith(y));
  const sum = (f: (x: (typeof r)[number]) => number) => r.reduce((s, x) => s + f(x), 0);
  const ca = sum((x) => x.sales_cents), costs = sum((x) => x.sales_cents - x.margin_cents + x.expenses_without_time_cents), ch = sum((x) => x.charges_cents), net = sum((x) => x.net_cents);
  return (
    <div className="mb-6 grid grid-cols-4 gap-4">
      <Stat label={`Chiffre d’affaires ${y}`} value={eur(ca)} sub={`${r.length} séance(s) datée(s) en ${y}`} />
      <Stat label="Achats & frais" value={eur(costs)} sub="Fournisseurs, livraison, frais de séance" />
      <Stat label="Cotisations URSSAF" value={eur(ch)} sub={ca ? `${fmtRate(ch / ca)} du CA` : '—'} />
      <Stat label={`Bénéfice net estimé ${y}`} value={eur(net)} accent sub={ca ? `${fmtRate(net / ca)} du CA` : '—'} />
    </div>
  );
}

export function ProfitPanel({ sessionId }: { sessionId: string }) {
  const p = useAsync(() => profitability(sessionId), [sessionId]);
  const ex = useAsync(() => listExpenses(sessionId), [sessionId]);
  const [n, setN] = useState<{ category: ExpenseCategory; label: string; amount: number | null; date: string }>({ category: 'location', label: '', amount: null, date: todayIso() });
  if (!p.data || !ex.data) return <Loading />;
  const d = p.data;
  const reload = () => { p.reload(); ex.reload(); };
  const Row = ({ l, v, strong, neg }: { l: string; v: number | null; strong?: boolean; neg?: boolean }) => (
    <div className={`flex justify-between py-1.5 text-[13.5px] ${strong ? 'border-t border-ink-700 pt-2.5 font-semibold' : ''}`}><span className={strong ? '' : 'text-mist-300'}>{l}</span><span className={`tabular ${neg ? 'text-mist-300' : ''}`}>{v == null ? '—' : (neg ? '− ' : '') + eur(v)}</span></div>
  );
  return (
    <div className="space-y-5 animate-fade">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Chiffre d’affaires" value={eur(d.sales_cents)} sub={`${d.orders} commande(s) validée(s)`} />
        <Stat label="Encaissements" value={eur(d.collected_cents)} sub={`Solde à encaisser ${eur(d.balance_cents)}`} />
        <Stat label="Marge commerciale" value={eur(d.margin_cents)} sub={`Taux de marque ${fmtRate(d.sales_cents ? d.margin_cents / d.sales_cents : null)}`} />
        <Stat label="Bénéfice net estimé" value={eur(d.net_cents)} accent sub={`Après cotisations URSSAF${d.time_cents ? ` · après temps de travail : ${eur(d.net_with_time_cents)}` : ''}`} />
      </div>
      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Détail" subtitle="Coûts fournisseurs réels utilisés lorsque toutes les commandes fournisseurs ont un coût saisi." />
          <div className="px-5 py-3">
            <Row l="Ventes avant remises" v={d.gross_cents} />
            <Row l="Remises accordées" v={d.discounts_cents} neg />
            <Row l="Chiffre d’affaires (ventes validées)" v={d.sales_cents} strong />
            <Row l="Coûts fournisseurs prévisionnels" v={d.supplier_estimated_cents} neg />
            <Row l="Coûts fournisseurs réels" v={d.supplier_actual_cents} neg />
            <Row l="Frais de livraison fournisseurs" v={d.supplier_shipping_cents} neg />
            <Row l="Marge commerciale" v={d.margin_cents} strong />
            <Row l="Frais de la séance (hors temps)" v={d.expenses_without_time_cents} neg />
            <Row l="Résultat avant cotisations" v={d.result_cents} strong />
            <Row l={d.ca_sales_cents ? `Cotisations URSSAF (services ${eur(d.ca_services_cents)} · ventes ${eur(d.ca_sales_cents)})` : 'Cotisations URSSAF (sur tout le CA)'} v={d.social_cents} neg />
            {d.tax_cents > 0 && <Row l="Impôt — versement libératoire" v={d.tax_cents} neg />}
            {d.other_charges_cents > 0 && <Row l="Autres contributions" v={d.other_charges_cents} neg />}
            <Row l="Bénéfice net estimé (ce qui vous reste)" v={d.net_cents} strong />
            {d.time_cents > 0 && <Row l="Temps de travail estimé" v={d.time_cents} neg />}
            {d.time_cents > 0 && <Row l="Bénéfice net après temps de travail" v={d.net_with_time_cents} strong />}
            <div className="pt-2 text-[11.5px] text-mist-500">Les cotisations sont dues sur le chiffre d’affaires encaissé, achats compris : une impression achetée 20 € et vendue 60 € compte 60 € de CA.{d.tax_cents ? '' : ' Impôt sur le revenu non déduit (pas de versement libératoire).'}</div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Frais de la séance" />
          <div className="grid grid-cols-[150px_1fr_110px_130px_auto] items-end gap-2 border-b border-ink-700 px-5 py-3">
            <Field label="Catégorie"><Select value={n.category} onChange={(e) => setN({ ...n, category: e.target.value as ExpenseCategory })}>{Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Libellé"><Input value={n.label} onChange={(e) => setN({ ...n, label: e.target.value })} /></Field>
            <Field label="Montant"><MoneyInput value={n.amount} onChange={(v) => setN({ ...n, amount: v })} /></Field>
            <Field label="Date"><Input type="date" value={n.date} onChange={(e) => setN({ ...n, date: e.target.value })} /></Field>
            <Button variant="gold" icon={<Plus className="size-4" />} disabled={n.amount == null} onClick={() => act(() => addExpense({ session_id: sessionId, category: n.category, label: n.label || null, amount_cents: n.amount!, date: n.date }).then(() => { setN({ ...n, label: '', amount: null }); reload(); }), 'Frais ajouté')} />
          </div>
          <div className="divide-y divide-ink-700/50">
            {ex.data.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-2 text-[13px]">
                <span className="w-36 text-mist-300">{EXPENSE_CATEGORIES[e.category]}</span><span className="flex-1 text-mist-400">{e.label}</span>
                <span className="text-mist-400 tabular">{fmtDate(e.date)}</span><span className="w-24 text-right tabular">{eur(e.amount_cents)}</span>
                <IconButton title="Supprimer" onClick={() => act(() => deleteExpense(e.id).then(reload))}><Trash2 className="size-3.5" /></IconButton>
              </div>
            ))}
            {!ex.data.length && <div className="px-5 py-5 text-[13px] text-mist-400">Aucun frais saisi (location, déplacement, publicité, consommables…).</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
