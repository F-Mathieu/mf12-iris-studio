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
      <PageHeader title="Rentabilité" subtitle="Chiffre d’affaires, encaissements, marge commerciale et résultat estimé par séance. La marge n’est pas un bénéfice net comptable." />
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
            { key: 'res', header: 'Résultat estimé', align: 'right', sort: (r) => r.result_cents, cell: (r) => <span className={r.result_cents < 0 ? 'text-red-300' : 'font-medium text-gold-300'}>{eur(r.result_cents)}</span> },
          ]} />
        </Card>
      )}
      {sel && <ProfitPanel key={sel} sessionId={sel} />}
    </>
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
        <Stat label="Résultat estimé" value={eur(d.result_cents)} accent sub={d.time_cents ? `Après temps de travail : ${eur(d.result_with_time_cents)}` : 'Hors temps de travail'} />
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
            <Row l="Résultat estimé" v={d.result_cents} strong />
            {d.time_cents > 0 && <Row l="Temps de travail estimé" v={d.time_cents} neg />}
            {d.time_cents > 0 && <Row l="Résultat après temps de travail" v={d.result_with_time_cents} strong />}
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
