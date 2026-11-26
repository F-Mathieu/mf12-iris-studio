import { useState } from 'react';
import { irisSource } from '../services/backup';
import { nextDeclaration } from '../services/compta';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Camera } from 'lucide-react';
import { Button, Card, CardHeader, Empty, Input, Loading, PageHeader, Select, Stat, useAsync } from '../components/ui';
import { BarList, Columns } from '../components/charts';
import { SessionBadge } from '../components/badges';
import { dashboard } from '../services/finance';
import { listSessions } from '../services/sessions';
import { eur } from '../lib/money';
import { fmtDate } from '../lib/format';
import { todayIso } from '../lib/ids';
import { reminders, type Reminder } from '../services/agenda';
import { dismissFollowUp, followUps, sendFollowUp, type FollowUp } from '../services/followups';
import { act } from '../lib/act';
import { CheckCircle2, Clock, Mail, X } from 'lucide-react';
import { ACTION_KIND_LABEL, requiredActions, showAllActions, snoozeAction, type RequiredAction } from '../services/actions';
import { Badge } from '../components/ui';
import { cx } from '../components/ui';

export default function Dashboard() {
  const nav = useNavigate();
  const [f, setF] = useState({ from: '', to: '', sessionId: '' });
  const sessions = useAsync(() => listSessions({ includeArchived: true }), []);
  const iris = useAsync(() => irisSource(), []);
  const decl = useAsync(() => nextDeclaration(todayIso()), []);
  const rem = useAsync(() => reminders(), []);
  const fu = useAsync(() => followUps(), []);
  const acts = useAsync(() => requiredActions(), []);
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
        <Card><Empty icon={<Camera className="size-5" />} title="Bienvenue dans MF/1.2 Studio" text={iris.data ? 'Vos données de MF12 Iris Studio ont été trouvées sur ce Mac : importez-en une copie pour retrouver séances, clients, catalogue et tarifs (Iris Studio reste intacte).' : 'Commencez par compléter votre catalogue et vos tarifs, puis créez votre première séance.'} action={<div className="flex gap-2">{iris.data && <Button variant="gold" onClick={() => nav('/parametres')}>Importer les données d’Iris Studio</Button>}<Button onClick={() => nav('/catalogue')}>Catalogue</Button><Button onClick={() => nav('/tarifs')}>Tarifs</Button><Button variant="gold" onClick={() => nav('/seances')}>Créer une séance</Button></div>} /></Card>
      ) : (
        <div className="space-y-5">
          {decl.data?.configured && decl.data.ready && (
            <Card className="flex items-center justify-between gap-4 border-gold-500/40 px-5 py-3 text-[13.5px]">
              <span>Déclaration URSSAF du <b>{fmtDate(decl.data.start)}</b> au <b>{fmtDate(decl.data.end)}</b> à faire avant le <b className="text-gold-300">{fmtDate(decl.data.due)}</b>.</span>
              <Button size="sm" variant="gold" onClick={() => nav('/compta')}>Préparer la déclaration</Button>
            </Card>
          )}
          {acts.data && <ActionsCard data={acts.data} onOpen={(l) => nav(l)} reload={acts.reload} />}
          {!!fu.data?.length && <FollowUpsCard list={fu.data} onOpen={(l) => nav(l)} reload={fu.reload} />}
          {!!rem.data?.filter((r) => r.group !== 'devis').length && <RemindersCard list={rem.data.filter((r) => r.group !== 'devis')} onOpen={(l) => nav(l)} onAgenda={() => nav('/agenda')} />}
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

const GROUPS: Record<Reminder['group'], string> = { livraison: 'Livraisons', fiche: 'Fiches jour J', echeance: 'Échéances de paiement', devis: 'Devis expirés', bat: 'BAT en attente de validation', rappel: 'Rappels d’agenda' };

const KIND_TONE: Record<RequiredAction['kind'], 'red' | 'amber' | 'blue' | 'violet' | 'neutral' | 'gold'> = {
  urgent: 'red', sauvegarde: 'red', livraison: 'amber', brouillon: 'gold', fournisseur: 'blue', seance: 'violet',
};

/** « Actions requises » : what has been waiting too long for you (delays in Paramètres), most urgent first. */
function ActionsCard({ data, onOpen, reload }: { data: { list: RequiredAction[]; hidden: number }; onOpen: (link: string) => void; reload: () => void }) {
  const [all, setAll] = useState(false);
  const { list, hidden } = data;
  const late = list.filter((a) => a.late).length;
  const shown = all ? list : list.slice(0, 8);
  return (
    <Card className={cx(late > 0 && 'border-red-400/40')}>
      <CardHeader title={list.length ? `Actions requises — ${list.length}${late ? ` dont ${late} prioritaire(s)` : ''}` : 'Actions requises'}
        subtitle="Ce qui attend une action de votre part depuis trop longtemps. Délais réglables dans Paramètres → Tableau de bord."
        actions={hidden > 0 && <Button size="sm" variant="ghost" onClick={() => act(() => showAllActions().then(reload))}>{hidden} masquée(s) · Réafficher</Button>} />
      {!list.length ? (
        <div className="flex items-center gap-2 px-5 py-4 text-[13px] text-emerald-300"><CheckCircle2 className="size-4" />Rien en attente.</div>
      ) : (
        <div className="divide-y divide-ink-700/50">
          {shown.map((a) => (
            <div key={a.key} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
              <Badge tone={KIND_TONE[a.kind]} className="w-36 shrink-0 justify-center">{ACTION_KIND_LABEL[a.kind]}</Badge>
              <button type="button" disabled={!a.link} onClick={() => a.link && onOpen(a.link)} className="min-w-0 flex-1 text-left hover:text-gold-300 disabled:hover:text-inherit">
                <div className="truncate font-medium">{a.title}</div>
                {a.detail && <div className="truncate text-[11.5px] text-mist-400">{a.detail}</div>}
              </button>
              {a.days > 0 && <span className={cx('shrink-0 tabular text-[12px]', a.late ? 'text-red-300' : 'text-amber-300')}>depuis {a.days} j</span>}
              <button type="button" title="Reporter de 7 jours" className="flex shrink-0 items-center gap-1 text-[12px] text-mist-400 hover:text-mist-100" onClick={() => act(() => snoozeAction(a.key, 7).then(reload), 'Reporté de 7 jours')}><Clock className="size-3.5" />7 j</button>
              <button type="button" title="Ignorer cette action" className="shrink-0 text-mist-500 hover:text-mist-200" onClick={() => act(() => snoozeAction(a.key, null).then(reload), 'Action ignorée')}><X className="size-4" /></button>
            </div>
          ))}
          {list.length > 8 && <button type="button" className="w-full px-5 py-2 text-left text-[12.5px] text-gold-300 hover:text-gold-200" onClick={() => setAll(!all)}>{all ? 'Réduire' : `Tout voir (${list.length})`}</button>}
        </div>
      )}
    </Card>
  );
}

/** « À faire » : overdue first (amber), then what is coming soon. */
function RemindersCard({ list, onOpen, onAgenda }: { list: Reminder[]; onOpen: (link: string) => void; onAgenda: () => void }) {
  const late = list.filter((r) => r.late).length;
  return (
    <Card className={cx(late > 0 && 'border-amber-400/40')}>
      <CardHeader title={`À faire${late ? ` — ${late} en retard` : ''}`} subtitle="Livraisons, fiches du jour J, échéances de paiement, devis expirés, rappels de l’agenda."
        actions={<Button size="sm" variant="ghost" onClick={onAgenda}>Agenda<ArrowRight className="size-3.5" /></Button>} />
      <div className="grid grid-cols-2 gap-x-6 px-5 py-3">
        {(Object.keys(GROUPS) as Reminder['group'][]).filter((g) => list.some((r) => r.group === g)).map((g) => (
          <div key={g} className="py-2">
            <div className="mb-1 text-[11.5px] font-medium tracking-wider text-mist-400 uppercase">{GROUPS[g]}</div>
            {list.filter((r) => r.group === g).slice(0, 6).map((r) => (
              <button key={r.key} type="button" disabled={!r.link} onClick={() => r.link && onOpen(r.link)}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[13px] hover:bg-ink-800 disabled:cursor-default disabled:hover:bg-transparent">
                <span className={cx('w-20 shrink-0 tabular', r.late ? 'text-amber-300' : 'text-mist-400')}>{fmtDate(r.date)}</span>
                <span className="min-w-0 flex-1 truncate">{r.title}{r.detail && <span className="text-mist-500"> · {r.detail}</span>}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

const FU_LABEL: Record<FollowUp['kind'], { title: string; button: string }> = {
  quote: { title: 'Devis sans réponse', button: 'Relancer' }, payment: { title: 'Échéances impayées', button: 'Relancer' }, review: { title: 'Demandes d’avis', button: 'Demander un avis' },
};

/** Follow-ups in one click: the e-mail is prepared in Mail (text in Paramètres → Relances & avis), noted in the history. */
function FollowUpsCard({ list, onOpen, reload }: { list: FollowUp[]; onOpen: (link: string) => void; reload: () => void }) {
  return (
    <Card>
      <CardHeader title="Relances & avis" subtitle="Un clic prépare l’e-mail dans Mail ; il est noté dans l’historique de la commande. ✕ = ne pas relancer." />
      <div className="grid grid-cols-3 gap-x-6 px-5 py-3">
        {(Object.keys(FU_LABEL) as FollowUp['kind'][]).filter((k) => list.some((f) => f.kind === k)).map((k) => (
          <div key={k} className="py-2">
            <div className="mb-1 text-[11.5px] font-medium tracking-wider text-mist-400 uppercase">{FU_LABEL[k].title}</div>
            {list.filter((f) => f.kind === k).slice(0, 8).map((f) => (
              <div key={f.kind + f.id} className="flex items-center gap-2 py-1 text-[13px]">
                <button type="button" onClick={() => onOpen(f.link)} className="min-w-0 flex-1 text-left hover:text-gold-300">
                  <div className="truncate">{f.title}</div>
                  <div className={cx('truncate text-[11.5px]', f.late ? 'text-amber-300' : 'text-mist-400')}>{f.detail}{f.last && ` · relancé le ${fmtDate(f.last)}`}</div>
                </button>
                <Button size="sm" variant="subtle" icon={<Mail className="size-3.5" />} onClick={() => act(() => sendFollowUp(f.kind, f.id).then((h) => { reload(); return h; }), (h) => (h === 'mail' ? 'E-mail prêt dans Mail' : 'Message ouvert dans votre messagerie'))}>{FU_LABEL[k].button}</Button>
                <button type="button" title={k === 'review' ? 'Ne pas demander d’avis' : 'Ne pas relancer (7 jours)'} className="text-mist-500 hover:text-mist-200" onClick={() => act(() => dismissFollowUp(f.kind, f.id).then(reload))}><X className="size-4" /></button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
