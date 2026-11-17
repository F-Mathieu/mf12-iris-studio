import { useState } from 'react';
import { AlertTriangle, Check, Download, FileDown, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, DataTable, Field, IconButton, Input, Loading, MoneyInput, PageHeader, Select, Stat, Tabs, useAsync, useConfirm } from '../components/ui';
import { addGeneralExpense, declarationFor, deleteDeclaration, deleteGeneralExpense, GENERAL_EXPENSE_CATEGORIES, listDeclarations, nextDeclaration, purchases, receipts, recordDeclaration, setDeclarationPaid, yearSummary, type GeneralExpenseCategory } from '../services/compta';
import { brand } from '../services/documents';
import { receiptsBookPdf } from '../lib/pdf';
import { toCsv } from '../lib/csv';
import { dueDateOf, toEuros } from '../lib/compta';
import { saveFile, CSV_FILTER, PDF_FILTER } from '../lib/files';
import { eur, fmtRate } from '../lib/money';
import { fmtDate } from '../lib/format';
import { todayIso } from '../lib/ids';
import { act } from '../lib/act';
import { useApp } from '../store';
import { useNavigate } from 'react-router-dom';

type Tab = 'declaration' | 'recettes' | 'depenses' | 'annee';

export default function Compta() {
  const [tab, setTab] = useState<Tab>('declaration');
  return (
    <>
      <PageHeader title="Compta" subtitle="Micro-entreprise : ce que vous encaissez, ce que vous déclarez à l’URSSAF, ce que vous dépensez. Estimations — à vérifier sur autoentrepreneur.urssaf.fr." />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[{ id: 'declaration', label: 'Déclaration URSSAF' }, { id: 'recettes', label: 'Livre des recettes' }, { id: 'depenses', label: 'Dépenses' }, { id: 'annee', label: 'Année & seuils' }]} />
      {tab === 'declaration' && <DeclarationTab />}
      {tab === 'recettes' && <ReceiptsTab />}
      {tab === 'depenses' && <ExpensesTab />}
      {tab === 'annee' && <YearTab />}
    </>
  );
}

function DeclarationTab() {
  const nav = useNavigate();
  const confirm = useConfirm();
  const next = useAsync(() => nextDeclaration(todayIso()), []);
  const history = useAsync(() => listDeclarations(), []);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [declaredOn, setDeclaredOn] = useState(todayIso());
  const p = period ?? (next.data ? { from: next.data.start, to: next.data.end } : null);
  const calc = useAsync(() => (p ? declarationFor(p.from, p.to) : Promise.resolve(null)), [p?.from, p?.to]);
  const reload = () => { next.reload(); history.reload(); setPeriod(null); };
  if (!next.data || !p) return <Loading />;
  const d = calc.data;
  return (
    <div className="space-y-5">
      {!next.data.configured && (
        <Card className="flex items-center justify-between gap-4 border-amber-500/40 px-5 py-3 text-[13px]"><span className="text-amber-200">Indiquez votre date de début d’activité et la fréquence de déclaration (Paramètres → Micro-entreprise) pour que les périodes soient proposées automatiquement.</span><Button size="sm" onClick={() => nav('/parametres')}>Paramètres</Button></Card>
      )}
      <Card>
        <CardHeader title="Prochaine déclaration" subtitle={`À déclarer avant le ${fmtDate(dueDateOf(p.to))} sur autoentrepreneur.urssaf.fr — chiffre d’affaires ENCAISSÉ pendant la période (acomptes compris, à leur date).`} />
        <div className="grid grid-cols-[180px_180px_1fr] items-end gap-4 border-b border-ink-700 px-5 py-4">
          <Field label="Du"><Input type="date" value={p.from} onChange={(e) => setPeriod({ ...p, from: e.target.value })} /></Field>
          <Field label="Au"><Input type="date" value={p.to} onChange={(e) => setPeriod({ ...p, to: e.target.value })} /></Field>
          <div className="pb-2 text-[12.5px] text-mist-400">{d ? `${d.count} encaissement(s) sur la période` : ''}</div>
        </div>
        {!d ? <Loading /> : (
          <div className="grid grid-cols-[1fr_340px] gap-6 px-5 py-5">
            <div>
              <div className="text-[12px] tracking-wider text-mist-400 uppercase">À saisir sur le site de l’URSSAF</div>
              <div className="mt-2 rounded-xl border border-gold-500/40 bg-gold-500/[0.06] px-4 py-3">
                <div className="flex items-baseline justify-between"><span className="text-[14px]">Prestations de services (BIC)</span><span className="text-[26px] font-semibold text-gold-300 tabular">{toEuros(d.ca_services_cents).toLocaleString('fr-FR')} €</span></div>
                {d.ca_sales_cents > 0 && <div className="mt-1 flex items-baseline justify-between"><span className="text-[14px]">Ventes de marchandises</span><span className="text-[22px] font-semibold text-gold-300 tabular">{toEuros(d.ca_sales_cents).toLocaleString('fr-FR')} €</span></div>}
              </div>
              <div className="mt-2 text-[12px] text-mist-400">Montants arrondis à l’euro, comme sur le formulaire. Si vous n’avez rien encaissé, déclarez 0 € (la déclaration reste obligatoire).</div>
            </div>
            <div className="space-y-1.5 text-[13.5px]">
              <div className="flex justify-between"><span className="text-mist-300">Encaissé sur la période</span><span className="tabular">{eur(d.total_cents)}</span></div>
              <div className="flex justify-between"><span className="text-mist-300">Cotisations sociales (estimation)</span><span className="tabular">{eur(d.social_cents)}</span></div>
              {d.tax_cents > 0 && <div className="flex justify-between"><span className="text-mist-300">Versement libératoire (impôt)</span><span className="tabular">{eur(d.tax_cents)}</span></div>}
              {d.other_cents > 0 && <div className="flex justify-between"><span className="text-mist-300">Autres contributions</span><span className="tabular">{eur(d.other_cents)}</span></div>}
              <div className="flex justify-between border-t border-ink-700 pt-2 font-semibold"><span>Total à payer (estimation)</span><span className="tabular">{eur(d.charges_cents)}</span></div>
              <Field label="Déclarée le" className="mt-3"><Input type="date" value={declaredOn} onChange={(e) => setDeclaredOn(e.target.value)} /></Field>
              <Button className="mt-2 w-full" variant="gold" icon={<Check className="size-4" />} onClick={async () => {
                if (!(await confirm({ title: 'Déclaration faite ?', text: `Enregistre la déclaration du ${fmtDate(p.from)} au ${fmtDate(p.to)}, faite le ${fmtDate(declaredOn)} : ${toEuros(d.ca_services_cents)} € de prestations${d.ca_sales_cents ? ` et ${toEuros(d.ca_sales_cents)} € de ventes` : ''}. Les montants sont figés.`, confirm: 'Enregistrer' }))) return;
                await act(() => recordDeclaration(p.from, p.to, declaredOn), 'Déclaration enregistrée').then(reload);
              }}>J’ai fait cette déclaration</Button>
            </div>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Déclarations enregistrées" subtitle="Montants figés au moment de la déclaration. Un écart signale un encaissement ajouté ou supprimé après coup." />
        <DataTable rows={history.data ?? []} rowKey={(r) => r.id} empty={<div className="px-5 py-6 text-[13px] text-mist-400">Aucune déclaration enregistrée.</div>} columns={[
          { key: 'p', header: 'Période', cell: (r) => `${fmtDate(r.period_start)} → ${fmtDate(r.period_end)}` },
          { key: 'ca', header: 'CA déclaré', align: 'right', cell: (r) => `${toEuros(r.ca_services_cents + r.ca_sales_cents).toLocaleString('fr-FR')} €` },
          { key: 'c', header: 'Cotisations + impôt', align: 'right', cell: (r) => eur(r.social_cents + r.tax_cents + r.other_cents) },
          { key: 'd', header: 'Déclarée le', cell: (r) => fmtDate(r.declared_at) },
          { key: 'gap', header: '', cell: (r) => <GapCheck from={r.period_start} to={r.period_end} declared={r.ca_services_cents + r.ca_sales_cents} /> },
          { key: 'paid', header: 'Payée', cell: (r) => (
            <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" className="accent-green-500" checked={!!r.paid_at} onChange={(e) => act(() => setDeclarationPaid(r.id, e.target.checked ? todayIso() : null)).then(history.reload)} />{r.paid_at ? fmtDate(r.paid_at) : 'non'}</label>) },
          { key: 'x', header: '', align: 'right', cell: (r) => <IconButton title="Supprimer cet enregistrement (pas la déclaration URSSAF)" onClick={async () => (await confirm({ title: 'Supprimer cet enregistrement ?', text: 'Cela ne change rien sur le site de l’URSSAF.', danger: true, confirm: 'Supprimer' })) && act(() => deleteDeclaration(r.id)).then(reload)}><Trash2 className="size-4" /></IconButton> },
        ]} />
      </Card>
    </div>
  );
}

function GapCheck({ from, to, declared }: { from: string; to: string; declared: number }) {
  const now = useAsync(() => declarationFor(from, to), [from, to]);
  if (!now.data || toEuros(now.data.total_cents) === toEuros(declared)) return null;
  return <Badge tone="amber"><AlertTriangle className="mr-1 inline size-3" />Encaissé aujourd’hui : {eur(now.data.total_cents)}</Badge>;
}

const yearStart = () => `${todayIso().slice(0, 4)}-01-01`;

function ReceiptsTab() {
  const [f, setF] = useState({ from: yearStart(), to: todayIso() });
  const rows = useAsync(() => receipts(f.from, f.to), [f.from, f.to]);
  const total = (rows.data ?? []).reduce((s, r) => s + r.amount_cents, 0);
  const csv = () => act(() => saveFile(`livre-des-recettes-${f.from}-${f.to}.csv`, toCsv(['Date', 'Client', 'Référence (facture / commande)', 'Nature', 'Mode de règlement', 'Montant'],
    (rows.data ?? []).map((r) => [r.date, r.client, r.invoice ?? `Commande ${r.order_number}`, r.sales_cents ? 'Prestation + vente' : 'Prestation de services', r.method, (r.amount_cents / 100).toFixed(2).replace('.', ',')])), CSV_FILTER), 'Livre des recettes exporté');
  const pdf = () => act(async () => saveFile(`livre-des-recettes-${f.from}-${f.to}.pdf`, receiptsBookPdf(await brand(), f.from, f.to, rows.data ?? []), PDF_FILTER), 'Livre des recettes enregistré');
  return (
    <Card>
      <CardHeader title="Livre des recettes" subtitle="Obligatoire en micro-entreprise : chaque encaissement, dans l’ordre chronologique (rempli automatiquement depuis les règlements des commandes)."
        actions={<><Button size="sm" icon={<Download className="size-3.5" />} onClick={csv}>CSV</Button><Button size="sm" icon={<FileDown className="size-3.5" />} onClick={pdf}>PDF</Button></>} />
      <div className="flex items-end gap-4 border-b border-ink-700 px-5 py-3">
        <Field label="Du"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Au"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <div className="ml-auto pb-2 text-[14px]">Total encaissé : <span className="font-semibold text-gold-300 tabular">{eur(total)}</span></div>
      </div>
      {!rows.data ? <Loading /> : <DataTable rows={rows.data} rowKey={(r) => r.id} empty={<div className="px-5 py-6 text-[13px] text-mist-400">Aucun encaissement sur la période.</div>} columns={[
        { key: 'd', header: 'Date', sort: (r) => r.date, cell: (r) => fmtDate(r.date) },
        { key: 'c', header: 'Client', sort: (r) => r.client, cell: (r) => <div><div>{r.client}</div><div className="text-[12px] text-mist-400">{r.session}</div></div> },
        { key: 'ref', header: 'Référence', cell: (r) => <span className="font-mono text-[12px]">{r.invoice ?? `Cde ${r.order_number}`}</span> },
        { key: 'm', header: 'Mode', cell: (r) => r.method },
        { key: 'a', header: 'Montant', align: 'right', sort: (r) => r.amount_cents, cell: (r) => eur(r.amount_cents) },
      ]} />}
    </Card>
  );
}

function ExpensesTab() {
  const [f, setF] = useState({ from: yearStart(), to: todayIso() });
  const p = useAsync(() => purchases(f.from, f.to), [f.from, f.to]);
  const [n, setN] = useState<{ date: string; category: GeneralExpenseCategory; label: string; supplier: string; amount: number | null }>({ date: todayIso(), category: 'materiel', label: '', supplier: '', amount: null });
  const confirm = useConfirm();
  return (
    <div className="space-y-5">
      <div className="flex items-end gap-4">
        <Field label="Du"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Au"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
      </div>
      {p.data && <div className="grid grid-cols-4 gap-4">
        <Stat label="Achats fournisseurs" value={eur(p.data.supplier_cents)} sub="Commandes fournisseurs (coût réel si saisi)" />
        <Stat label="Frais de séances" value={eur(p.data.session_cents)} sub="Saisis dans Rentabilité / Finances" />
        <Stat label="Frais généraux" value={eur(p.data.general_cents)} sub="Matériel, logiciels, assurance…" />
        <Stat label="Total des dépenses" value={eur(p.data.total_cents)} accent />
      </div>}
      <Card>
        <CardHeader title="Frais généraux" subtitle="Dépenses non liées à une séance. En micro-entreprise elles ne réduisent pas les cotisations, mais elles comptent pour savoir ce qui vous reste." />
        <div className="grid grid-cols-[150px_200px_1fr_170px_130px_auto] items-end gap-2 border-b border-ink-700 px-5 py-3">
          <Field label="Date"><Input type="date" value={n.date} onChange={(e) => setN({ ...n, date: e.target.value })} /></Field>
          <Field label="Catégorie"><Select value={n.category} onChange={(e) => setN({ ...n, category: e.target.value as GeneralExpenseCategory })}>{Object.entries(GENERAL_EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Libellé"><Input value={n.label} onChange={(e) => setN({ ...n, label: e.target.value })} placeholder="Abonnement Lightroom…" /></Field>
          <Field label="Fournisseur"><Input value={n.supplier} onChange={(e) => setN({ ...n, supplier: e.target.value })} /></Field>
          <Field label="Montant TTC"><MoneyInput value={n.amount} onChange={(v) => setN({ ...n, amount: v })} /></Field>
          <Button variant="gold" icon={<Plus className="size-4" />} disabled={n.amount == null} onClick={() => act(() => addGeneralExpense({ date: n.date, category: n.category, label: n.label || null, supplier: n.supplier || null, amount_cents: n.amount!, method: null, note: null }).then(() => { setN({ ...n, label: '', supplier: '', amount: null }); p.reload(); }), 'Dépense ajoutée')} />
        </div>
        <DataTable rows={p.data?.general ?? []} rowKey={(r) => r.id} empty={<div className="px-5 py-6 text-[13px] text-mist-400">Aucun frais général sur la période.</div>} columns={[
          { key: 'd', header: 'Date', sort: (r) => r.date, cell: (r) => fmtDate(r.date) },
          { key: 'c', header: 'Catégorie', cell: (r) => GENERAL_EXPENSE_CATEGORIES[r.category] ?? r.category },
          { key: 'l', header: 'Libellé', cell: (r) => <div>{r.label}<div className="text-[12px] text-mist-400">{r.supplier}</div></div> },
          { key: 'a', header: 'Montant', align: 'right', cell: (r) => eur(r.amount_cents) },
          { key: 'x', header: '', align: 'right', cell: (r) => <IconButton title="Supprimer" onClick={async () => (await confirm({ title: 'Supprimer cette dépense ?', danger: true, confirm: 'Supprimer' })) && act(() => deleteGeneralExpense(r.id)).then(p.reload)}><Trash2 className="size-4" /></IconButton> },
        ]} />
      </Card>
      <Card>
        <CardHeader title="Achats fournisseurs et frais de séances" subtitle="Repris automatiquement (registre des achats)." />
        <DataTable rows={[...(p.data?.supplier ?? []).map((x) => ({ id: x.id, date: x.date, what: `${x.supplier}${x.reference ? ` · réf. ${x.reference}` : ''}`, kind: x.real ? 'Achat fournisseur' : 'Achat fournisseur (estimé)', amount: x.amount_cents })),
          ...(p.data?.session ?? []).map((x) => ({ id: x.id, date: x.date, what: `${x.session}${x.label ? ` · ${x.label}` : ''}`, kind: 'Frais de séance', amount: x.amount_cents }))].sort((a, b) => b.date.localeCompare(a.date))}
          rowKey={(r) => r.id} empty={<div className="px-5 py-6 text-[13px] text-mist-400">Rien sur la période.</div>} columns={[
            { key: 'd', header: 'Date', cell: (r) => fmtDate(r.date) },
            { key: 'k', header: 'Type', cell: (r) => r.kind },
            { key: 'w', header: 'Détail', cell: (r) => r.what },
            { key: 'a', header: 'Montant', align: 'right', cell: (r) => eur(r.amount) },
          ]} />
      </Card>
    </div>
  );
}

function YearTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const y = useAsync(() => yearSummary(year), [year]);
  const { settings } = useApp();
  if (!y.data) return <Loading />;
  const d = y.data;
  const gauge = (label: string, value: number, ceiling: number, hint: string, warnAt = 0.8) => {
    const r = ceiling ? value / ceiling : 0;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-[13px]"><span>{label}</span><span className="tabular">{eur(value)} / {eur(ceiling)} <span className="text-mist-400">({fmtRate(r)})</span></span></div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-700"><div className={r >= 1 ? 'h-full bg-red-400' : r >= warnAt ? 'h-full bg-amber-400' : 'h-full bg-green-500'} style={{ width: `${Math.min(100, r * 100)}%` }} /></div>
        <div className="text-[11.5px] text-mist-500">{hint}</div>
      </div>
    );
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3"><span className="text-[13px] text-mist-400">Année</span><Select className="w-28" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2].map((k) => { const v = new Date().getFullYear() - k; return <option key={v} value={v}>{v}</option>; })}</Select></div>
      <div className="grid grid-cols-4 gap-4">
        <Stat label={`Encaissé ${year}`} value={eur(d.total_cents)} sub={`${d.count} encaissement(s)`} />
        <Stat label="Dépenses" value={eur(d.purchases.total_cents)} sub="Achats, frais de séances, frais généraux" />
        <Stat label="Cotisations + impôt (estim.)" value={eur(d.charges_cents)} sub={d.total_cents ? `${fmtRate(d.charges_cents / d.total_cents)} de l’encaissé` : '—'} />
        <Stat label={`Ce qui vous reste ${year}`} value={eur(d.net_cents)} accent sub="Encaissé − dépenses − cotisations" />
      </div>
      <Card>
        <CardHeader title="Seuils de l’année" subtitle={`Sur l’encaissé. ${settings.activity_start?.startsWith(String(year)) ? `Année de création : seuils calculés au prorata depuis le ${fmtDate(settings.activity_start)}. ` : ''}Valeurs 2026 par défaut, modifiables dans Paramètres.`} />
        <div className="space-y-5 px-5 py-5">
          {gauge('Franchise de TVA (prestations de services)', d.total_cents, d.vatCeiling, `Au-delà de ${eur(d.vatCeiling)}, la franchise de TVA s’arrête au 1er janvier suivant ; au-delà de ${eur(d.vatMajor)} (seuil majoré), la TVA est due dès le jour du dépassement.`)}
          {gauge('Plafond micro-entreprise (prestations de services)', d.total_cents, d.microCeiling, 'Au-delà deux années de suite, sortie du régime micro.')}
        </div>
      </Card>
    </div>
  );
}
