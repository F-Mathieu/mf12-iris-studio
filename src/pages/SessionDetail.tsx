import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, CalendarDays, Copy, FileDown, MapPin, MonitorPlay, Pencil, Tags, Trash2, User } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ErrorBox, Field, Loading, PageHeader, Select, Stat, Tabs, useAsync, useConfirm } from '../components/ui';
import { SessionBadge } from '../components/badges';
import { RegistrationsPanel } from '../components/Registrations';
import { Planning } from '../components/Planning';
import { PriceListEditor } from '../components/PriceListEditor';
import { PresentDialog } from '../components/Layout';
import { SessionForm } from './Sessions';
import { OrdersTable } from './Orders';
import { ProductionBoard } from './Production';
import { ProfitPanel } from './Profitability';
import { applyTemplateToSession, deleteSession, duplicateSession, getSession, updateSession } from '../services/sessions';
import { listRegistrations } from '../services/registrations';
import { listTemplates } from '../services/pricing';
import { dashboard } from '../services/finance';
import { sessionCatalogPdf } from '../services/documents';
import { saveFile, PDF_FILTER } from '../lib/files';
import { eur } from '../lib/money';
import { fmtLongDate, slug } from '../lib/format';
import { act } from '../lib/act';

type Tab = 'general' | 'inscrits' | 'planning' | 'commandes' | 'production' | 'finances' | 'parametres';

export default function SessionDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'general';
  const setTab = (t: Tab) => setSp({ tab: t }, { replace: true });
  const s = useAsync(() => getSession(id), [id]);
  const regs = useAsync(() => listRegistrations(id), [id]);
  const kpi = useAsync(() => dashboard({ sessionId: id }), [id, tab]);
  const [present, setPresent] = useState(false);
  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <Loading />;
  const session = s.data;
  const reload = () => { s.reload(); regs.reload(); kpi.reload(); };

  return (
    <>
      <PageHeader back={() => nav('/seances')} title={session.name}
        subtitle={<div className="flex flex-wrap items-center gap-x-4 gap-y-1"><SessionBadge s={session.status} />
          {session.date && <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{fmtLongDate(session.date)}{session.start_time && ` · ${session.start_time}${session.end_time ? '–' + session.end_time : ''}`}</span>}
          {session.location && <span className="flex items-center gap-1.5"><MapPin className="size-3.5" />{session.location}</span>}
          {session.organizer && <span className="flex items-center gap-1.5"><User className="size-3.5" />{session.organizer}</span>}
          <span className="flex items-center gap-1.5"><Tags className="size-3.5" />{session.price_list_name ?? 'Aucune grille'}</span></div>}
        actions={<Button variant="gold" icon={<MonitorPlay className="size-4" />} onClick={() => setPresent(true)}>Présentation client</Button>} />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[
        { id: 'general', label: 'Vue générale' }, { id: 'inscrits', label: 'Inscrits', count: regs.data?.length }, { id: 'planning', label: 'Planning' },
        { id: 'commandes', label: 'Commandes', count: kpi.data?.orders }, { id: 'production', label: 'Postproduction' }, { id: 'finances', label: 'Finances' }, { id: 'parametres', label: 'Paramètres' },
      ]} />
      {tab === 'general' && kpi.data && (
        <div className="space-y-5 animate-fade">
          <div className="grid grid-cols-4 gap-4">
            <Stat label="Familles inscrites" value={kpi.data.families} sub={`${kpi.data.present} reçue(s)`} />
            <Stat label="Commandes validées" value={kpi.data.orders} sub={`Panier moyen ${eur(kpi.data.avgBasket)}`} />
            <Stat label="Ventes" value={eur(kpi.data.sales)} accent sub={`Remises ${eur(kpi.data.discounts)}`} />
            <Stat label="Encaissé" value={eur(kpi.data.collected)} sub={`Reste à encaisser ${eur(kpi.data.balance)}`} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card className="col-span-2">
              <CardHeader title="Description" />
              <div className="px-5 py-4 text-[13.5px] whitespace-pre-wrap text-mist-200">{session.description || <span className="text-mist-400">Aucune description.</span>}</div>
            </Card>
            <Card>
              <CardHeader title="Production" />
              <div className="space-y-2 px-5 py-4 text-[13.5px]">
                <div className="flex justify-between"><span className="text-mist-400">Créations / tâches à produire</span><span className="tabular">{kpi.data.toProduce}</span></div>
                <div className="flex justify-between"><span className="text-mist-400">Livrées</span><span className="tabular">{kpi.data.delivered}</span></div>
                <div className="flex justify-between"><span className="text-mist-400">Produits vendus</span><span className="tabular">{kpi.data.itemsSold}</span></div>
                <div className="pt-2"><Button size="sm" variant="subtle" icon={<FileDown className="size-3.5" />} onClick={() => act(async () => { const b = await sessionCatalogPdf(id); return saveFile(`brochure-${slug(session.name)}.pdf`, b, PDF_FILTER); }, 'Brochure PDF enregistrée')}>Brochure des offres (PDF)</Button></div>
              </div>
            </Card>
          </div>
        </div>
      )}
      {tab === 'inscrits' && <RegistrationsPanel sessionId={id} sessionName={session.name} regs={regs.data ?? []} reload={reload} />}
      {tab === 'planning' && <Planning session={session} regs={regs.data ?? []} reload={reload} />}
      {tab === 'commandes' && <OrdersTable sessionId={id} />}
      {tab === 'production' && <ProductionBoard sessionId={id} />}
      {tab === 'finances' && <ProfitPanel sessionId={id} />}
      {tab === 'parametres' && <SessionSettings session={session} reload={reload} />}
      <PresentDialog open={present} onClose={() => setPresent(false)} sessionId={id} />
    </>
  );
}

function SessionSettings({ session, reload }: { session: NonNullable<Awaited<ReturnType<typeof getSession>>>; reload: () => void }) {
  const nav = useNavigate();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const tpls = useAsync(() => listTemplates(), []);
  const [tpl, setTpl] = useState('');
  return (
    <div className="space-y-5 animate-fade">
      <Card>
        <CardHeader title="Informations & actions" actions={<>
          <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEdit(true)}>Modifier</Button>
          <Button size="sm" icon={<Copy className="size-3.5" />} onClick={async () => { const nid = await act(() => duplicateSession(session.id), 'Séance dupliquée'); if (nid) nav(`/seances/${nid}`); }}>Dupliquer</Button>
          {session.status !== 'archivee'
            ? <Button size="sm" icon={<Archive className="size-3.5" />} onClick={async () => (await confirm({ title: 'Archiver la séance ?', text: 'Elle restera consultable dans les archives avec toutes ses données.' })) && act(() => updateSession(session.id, { status: 'archivee' }).then(reload), 'Séance archivée')}>Archiver</Button>
            : <Button size="sm" onClick={() => act(() => updateSession(session.id, { status: 'terminee' }).then(reload), 'Séance désarchivée')}>Désarchiver</Button>}
          <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={async () => {
            if (await confirm({ title: 'Supprimer définitivement la séance ?', text: 'Les inscriptions seront supprimées (les fiches familles sont conservées). Impossible si des commandes existent.', danger: true, confirm: 'Supprimer', input: { label: 'Tapez SUPPRIMER pour confirmer', required: true } }) === 'SUPPRIMER')
              { if (await act(() => deleteSession(session.id), 'Séance supprimée') !== undefined) nav('/seances'); }
          }}>Supprimer</Button>
        </>} />
        <div className="flex flex-wrap items-end gap-4 px-5 py-4">
          <div className="text-[13px] text-mist-300">Grille de la séance : <span className="font-medium text-mist-100">{session.price_list_name ?? 'aucune'}</span>
            {session.source_template_name && <Badge className="ml-2">issue de « {session.source_template_name} »</Badge>}</div>
          <div className="flex-1" />
          <Field label="Appliquer un template (nouvelle copie)"><Select className="w-64" value={tpl} onChange={(e) => setTpl(e.target.value)}><option value="">Choisir…</option>{tpls.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Button disabled={!tpl} onClick={async () => (await confirm({ title: 'Remplacer la grille de la séance ?', text: 'Les commandes déjà enregistrées conservent leurs prix. Les modifications faites sur la grille actuelle de la séance seront remplacées.' })) && act(() => applyTemplateToSession(session.id, tpl).then(reload), 'Template appliqué')}>Appliquer</Button>
        </div>
      </Card>
      {session.price_list_id
        ? <><div className="text-[13px] text-mist-400">Tarifs propres à cette séance — modifier le template d’origine ne change pas cette grille.</div><PriceListEditor priceListId={session.price_list_id} /></>
        : <Card className="px-5 py-6 text-[13.5px] text-amber-200">Aucune grille tarifaire : appliquez un template pour pouvoir vendre.</Card>}
      <SessionForm open={edit} onClose={() => setEdit(false)} initial={session} onSubmit={async (d) => { await updateSession(session.id, d); setEdit(false); reload(); }} />
    </div>
  );
}
