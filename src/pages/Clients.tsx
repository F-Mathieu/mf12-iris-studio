import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Download, EyeOff, Merge, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Badge, Button, Card, CardHeader, DataTable, Empty, Loading, Modal, PageHeader, SearchInput, useAsync, useConfirm, useDebounced } from '../components/ui';
import { ApptBadge, OrderBadge } from '../components/badges';
import { FamilyForm } from '../components/FamilyForm';
import { anonymizeFamily, deleteFamily, findDuplicateFamilies, getFamily, mergeFamilies, searchFamilies, type FamilyRow } from '../services/families';
import { exportCsv } from '../services/backup';
import { saveFile } from '../lib/files';
import { eur } from '../lib/money';
import { fmtDate } from '../lib/format';
import { todayIso } from '../lib/ids';
import { act } from '../lib/act';

export default function Clients() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 150);
  const list = useAsync(() => searchFamilies(dq, 2000), [dq]);
  const [open, setOpen] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [dups, setDups] = useState(false);
  return (
    <>
      <PageHeader title="Clients" subtitle="Base centralisée des familles, participants et références photo."
        actions={<>
          <Button variant="ghost" icon={<Copy className="size-4" />} onClick={() => setDups(true)}>Doublons</Button>
          <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => act(async () => saveFile(`familles-${todayIso()}.csv`, await exportCsv('familles'), [{ name: 'CSV', extensions: ['csv'] }]), 'Export enregistré')}>Export CSV</Button>
          <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>Nouvelle famille</Button>
        </>} />
      <SearchInput autoFocus value={q} onChange={setQ} className="mb-4 w-96" placeholder="Nom, téléphone, référence inscription ou photo…" />
      <Card>
        <DataTable<FamilyRow> rows={list.data ?? []} rowKey={(r) => r.id} onRowClick={(r) => setOpen(r.id)}
          empty={<Empty icon={<Users className="size-5" />} title={q ? 'Aucun résultat' : 'Aucune famille'} text="Les familles sont créées par import CSV ou manuellement." />}
          columns={[
            { key: 'n', header: 'Famille', sort: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'c', header: 'Contact', cell: (r) => <span className="text-mist-300">{r.contact_first_name}</span> },
            { key: 't', header: 'Téléphone', cell: (r) => <span className="tabular">{r.phone}</span> },
            { key: 'e', header: 'E-mail', cell: (r) => <span className="text-mist-300">{r.email}</span> },
            { key: 'p', header: 'Participants', align: 'right', sort: (r) => r.participants_count, cell: (r) => r.participants_count },
            { key: 's', header: 'Séances', align: 'right', sort: (r) => r.sessions_count, cell: (r) => r.sessions_count },
            { key: 'o', header: 'Commandes', align: 'right', sort: (r) => r.orders_count, cell: (r) => r.orders_count },
          ]} />
      </Card>
      {open && <FamilyDetail id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
      <FamilyForm open={create} onClose={() => setCreate(false)} onSaved={(id) => { setCreate(false); list.reload(); setOpen(id); }} />
      {dups && <DuplicatesDialog onClose={() => { setDups(false); list.reload(); }} />}
    </>
  );
}

function FamilyDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const nav = useNavigate();
  const confirm = useConfirm();
  const d = useAsync(() => getFamily(id), [id]);
  const [edit, setEdit] = useState(false);
  const f = d.data;
  return (
    <Modal open onClose={onClose} size="lg" title={f?.family.name ?? '…'} subtitle={f ? [f.family.contact_first_name, f.family.phone, f.family.email].filter(Boolean).join(' · ') : ''}
      footer={<>
        <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={async () => { if (await confirm({ title: 'Supprimer la famille et ses données personnelles ?', text: 'Action irréversible. Impossible si des commandes existent (utilisez alors l’anonymisation).', danger: true, confirm: 'Supprimer' })) { if (await act(() => deleteFamily(id), 'Famille supprimée') !== undefined) { onChanged(); onClose(); } } }}>Supprimer</Button>
        <Button variant="ghost" size="sm" icon={<EyeOff className="size-3.5" />} onClick={async () => { if (await confirm({ title: 'Anonymiser cette famille ?', text: 'Nom, coordonnées et prénoms sont effacés ; les commandes restent pour la comptabilité.', danger: true, confirm: 'Anonymiser' })) { await act(() => anonymizeFamily(id), 'Données anonymisées'); d.reload(); onChanged(); } }}>Anonymiser</Button>
        <div className="flex-1" />
        <Button icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Modifier</Button>
      </>}>
      {!f ? <Loading /> : (
        <div className="space-y-5">
          {f.family.notes && <div className="rounded-xl bg-ink-800 px-4 py-3 text-[13px] text-mist-200">{f.family.notes}</div>}
          <div>
            <div className="mb-2 text-[13px] font-semibold">Participants</div>
            <div className="flex flex-wrap gap-2">{f.participants.map((p) => (
              <div key={p.id} className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2"><div className="font-medium">{p.first_name}</div><div className="mt-0.5 flex gap-1">{p.refs?.map((r) => <Badge key={r.id} className="font-mono">{r.reference}</Badge>)}{!p.refs?.length && <span className="text-[11.5px] text-mist-400">aucune réf.</span>}</div></div>
            ))}{!f.participants.length && <span className="text-[13px] text-mist-400">Aucun participant.</span>}</div>
          </div>
          <Card><CardHeader title="Séances" />
            <div className="divide-y divide-ink-700/50">{f.sessions.map((s) => <button key={s.reg_id} onClick={() => nav(`/seances/${s.id}?tab=inscrits`)} className="flex w-full justify-between px-5 py-2.5 text-left text-[13px] hover:bg-ink-800"><span>{s.name} <span className="text-mist-400">· {fmtDate(s.date)}</span></span><ApptBadge s={s.appt_status as 'a_venir'} /></button>)}
              {!f.sessions.length && <div className="px-5 py-3 text-[13px] text-mist-400">Aucune séance.</div>}</div>
          </Card>
          <Card><CardHeader title="Commandes" />
            <div className="divide-y divide-ink-700/50">{f.orders.map((o) => <button key={o.id} onClick={() => nav(`/commandes/${o.id}`)} className="flex w-full items-center justify-between px-5 py-2.5 text-left text-[13px] hover:bg-ink-800"><span className="font-mono">{o.number} <span className="font-sans text-mist-400">· {o.session_name}</span></span><span className="flex items-center gap-2"><OrderBadge s={o.status as 'validee'} /><span className="tabular">{eur(o.total_cents)}</span></span></button>)}
              {!f.orders.length && <div className="px-5 py-3 text-[13px] text-mist-400">Aucune commande.</div>}</div>
          </Card>
        </div>
      )}
      <FamilyForm open={edit} familyId={id} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); d.reload(); onChanged(); }} />
    </Modal>
  );
}

function DuplicatesDialog({ onClose }: { onClose: () => void }) {
  const confirm = useConfirm();
  const d = useAsync(() => findDuplicateFamilies(), []);
  return (
    <Modal open onClose={onClose} title="Doublons probables" subtitle="Fusionner déplace inscriptions, participants et commandes vers la fiche conservée." size="lg">
      {!d.data ? <Loading /> : !d.data.length ? <div className="py-8 text-center text-mist-400">Aucun doublon détecté.</div> : (
        <div className="divide-y divide-ink-700">{d.data.map((x) => (
          <div key={x.a + x.b} className="flex items-center gap-3 py-3 text-[13px]">
            <div className="flex-1"><span className="font-medium">{x.a_name}</span> ⇄ <span className="font-medium">{x.b_name}</span> <Badge className="ml-2">{x.reason}</Badge></div>
            <Button size="sm" icon={<Merge className="size-3.5" />} onClick={async () => (await confirm({ title: `Conserver « ${x.a_name} » et fusionner « ${x.b_name} » ?` })) && act(() => mergeFamilies(x.a, x.b).then(d.reload), 'Fiches fusionnées')}>Fusionner</Button>
          </div>
        ))}</div>
      )}
    </Modal>
  );
}
