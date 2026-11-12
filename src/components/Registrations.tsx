import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Pencil, ShoppingBag, Trash2, Upload, UserPlus, Users } from 'lucide-react';
import { Badge, Button, Card, DataTable, Empty, Field, IconButton, Input, Modal, SearchInput, Select, Textarea, useConfirm, useDebounced, useAsync } from './ui';
import { ApptBadge, OrderBadge, PayBadge } from './badges';
import { FamilyForm } from './FamilyForm';
import { ImportDialog } from './ImportDialog';
import { addRegistration, APPT_STATUS, deleteRegistration, updateRegistration, type ApptStatus, type RegistrationRow } from '../services/registrations';
import { saveFamily, searchFamilies } from '../services/families';
import { registrationTemplate } from '../lib/csv';
import { saveFile } from '../lib/files';
import { eur } from '../lib/money';
import { slug, fmtDate } from '../lib/format';
import { act } from '../lib/act';

export function RegistrationsPanel({ sessionId, sessionName, regs, reload }: { sessionId: string; sessionName: string; regs: RegistrationRow[]; reload: () => void }) {
  const nav = useNavigate();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [existingOpen, setExistingOpen] = useState(false);
  const [editReg, setEditReg] = useState<RegistrationRow | null>(null);
  const [editFamily, setEditFamily] = useState<string | null>(null);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? regs.filter((r) => [r.family_name, r.contact_first_name, r.phone, r.external_ref, r.participant_names].some((x) => x?.toLowerCase().includes(s))) : regs;
  }, [regs, q]);

  const downloadTemplate = () => act(async () => (await saveFile(`modele-inscriptions-${slug(sessionName)}.csv`, registrationTemplate(), [{ name: 'CSV', extensions: ['csv'] }])) && 'ok', 'Modèle CSV enregistré');

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} className="w-72" placeholder="Famille, référence, téléphone…" />
        <div className="flex-1" />
        <Button variant="ghost" icon={<Download className="size-4" />} onClick={downloadTemplate}>Télécharger le modèle CSV</Button>
        <Button variant="outline" icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>Importer les clients CSV</Button>
        <Button variant="outline" icon={<Users className="size-4" />} onClick={() => setExistingOpen(true)}>Famille existante</Button>
        <Button variant="gold" icon={<UserPlus className="size-4" />} onClick={() => setAddOpen(true)}>Ajouter une famille</Button>
      </div>
      <Card>
        <DataTable<RegistrationRow> rows={rows} rowKey={(r) => r.id}
          empty={<Empty icon={<Users className="size-5" />} title="Aucun inscrit" text="Importez votre fichier Excel (CSV) ou ajoutez les familles manuellement." />}
          columns={[
            { key: 'time', header: 'RDV', sort: (r) => `${r.appt_date ?? ''}${r.appt_time ?? ''}`, cell: (r) => <span className="tabular">{r.appt_time ?? '—'}{r.appt_date && <span className="ml-1 text-[11.5px] text-mist-400">{fmtDate(r.appt_date, { day: '2-digit', month: '2-digit' })}</span>}</span> },
            { key: 'ref', header: 'Réf.', sort: (r) => r.external_ref ?? '', cell: (r) => <span className="font-mono text-[12px] text-mist-300">{r.external_ref ?? ''}</span> },
            { key: 'family', header: 'Famille', sort: (r) => r.family_name, cell: (r) => <div><button className="font-medium hover:text-gold-300" onClick={() => setEditFamily(r.family_id)}>{r.family_name}</button><div className="text-[12px] text-mist-400">{[r.contact_first_name, r.phone].filter(Boolean).join(' · ')}</div></div> },
            { key: 'parts', header: 'Participants', cell: (r) => <div className="max-w-[220px] truncate text-mist-300" title={r.participant_names ?? ''}><span className="mr-1.5 tabular text-mist-100">{r.nb_participants || r.participants_count || 0}</span>{r.participant_names}</div> },
            { key: 'status', header: 'Statut', cell: (r) => <ApptBadge s={r.appt_status} /> },
            { key: 'order', header: 'Commande', cell: (r) => r.order_status ? <div className="flex items-center gap-1.5"><OrderBadge s={r.order_status as 'validee'} />{r.order_status === 'validee' && <PayBadge total={r.order_total ?? 0} paid={r.paid_cents ?? 0} />}</div> : <span className="text-mist-400">—</span> },
            { key: 'total', header: 'Montant', align: 'right', sort: (r) => r.order_total ?? 0, cell: (r) => (r.order_total != null ? eur(r.order_total) : '') },
            { key: 'a', header: '', align: 'right', cell: (r) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant={r.order_id ? 'subtle' : 'gold'} icon={<ShoppingBag className="size-3.5" />} onClick={() => nav(r.order_id ? (r.order_status === 'validee' ? `/commandes/${r.order_id}` : `/vente/commande/${r.order_id}`) : `/vente/${sessionId}/${r.id}`)}>{r.order_id ? (r.order_status === 'validee' ? 'Commande' : 'Reprendre') : 'Vendre'}</Button>
                <IconButton title="Modifier l’inscription (nom, prénom, coordonnées, rendez-vous)" onClick={() => setEditReg(r)}><Pencil className="size-4" /></IconButton>
                <IconButton title="Retirer de la séance" onClick={async () => { if (await confirm({ title: 'Retirer cette famille de la séance ?', text: 'La fiche famille est conservée dans la base clients.', danger: true, confirm: 'Retirer' })) await act(() => deleteRegistration(r.id).then(reload), 'Inscription retirée'); }}><Trash2 className="size-4" /></IconButton>
              </div>) },
          ]} />
      </Card>
      <ImportDialog open={importOpen} sessionId={sessionId} onClose={() => setImportOpen(false)} onDone={reload} />
      <FamilyForm open={addOpen} title="Ajouter une famille à la séance" submitLabel="Ajouter" onClose={() => setAddOpen(false)}
        onSubmitNew={async (input) => { await addRegistration(sessionId, { input }); setAddOpen(false); reload(); }} />
      <FamilyForm open={!!editFamily} familyId={editFamily} onClose={() => setEditFamily(null)} onSaved={() => { setEditFamily(null); reload(); }} />
      <ExistingFamilyDialog open={existingOpen} onClose={() => setExistingOpen(false)} onPick={async (id) => { if (await act(() => addRegistration(sessionId, { id }), 'Famille ajoutée')) { setExistingOpen(false); reload(); } }} />
      <AppointmentDialog reg={editReg} onClose={() => setEditReg(null)} onSaved={() => { setEditReg(null); reload(); }} />
    </>
  );
}

function ExistingFamilyDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data } = useAsync(() => (open ? searchFamilies(dq, 30) : Promise.resolve([])), [dq, open]);
  return (
    <Modal open={open} onClose={onClose} title="Inscrire une famille existante" size="md">
      <SearchInput autoFocus value={q} onChange={setQ} placeholder="Nom, téléphone, référence…" />
      <div className="mt-3 max-h-[50vh] divide-y divide-ink-700 overflow-auto">
        {data?.map((f) => (
          <button key={f.id} onClick={() => onPick(f.id)} className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-ink-750">
            <div><div className="font-medium">{f.name}</div><div className="text-[12px] text-mist-400">{[f.contact_first_name, f.phone, f.email].filter(Boolean).join(' · ')}</div></div>
            <Badge>{f.participants_count} part.</Badge>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Edit a registration: family identity & contact (name, first name, phone, e-mail) + appointment. */
export function AppointmentDialog({ reg, onClose, onSaved }: { reg: RegistrationRow | null; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Partial<RegistrationRow>>({});
  const [familyOpen, setFamilyOpen] = useState(false);
  const r = reg ? { ...reg, ...d } : null;
  const close = () => { setD({}); onClose(); };
  return (
    <>
      <Modal open={!!reg && !familyOpen} onClose={close} title={`Modifier l’inscription — ${reg?.family_name ?? ''}`} size="md"
        footer={<><Button variant="ghost" className="mr-auto" onClick={() => setFamilyOpen(true)}>Participants et références photo…</Button><Button variant="ghost" onClick={close}>Annuler</Button><Button variant="gold" disabled={!r?.family_name?.trim()} onClick={() => act(async () => {
          if (['family_name', 'contact_first_name', 'phone', 'email'].some((k) => k in d))
            await saveFamily(reg!.family_id, { name: r!.family_name, contact_first_name: r!.contact_first_name, phone: r!.phone, email: r!.email });
          await updateRegistration(reg!.id, { appt_date: r!.appt_date || null, appt_time: r!.appt_time || null, appt_status: r!.appt_status, external_ref: r!.external_ref || null, notes: r!.notes || null, participants_count: r!.participants_count ?? null });
          setD({}); onSaved();
        }, 'Inscription mise à jour')}>Enregistrer</Button></>}>
        {r && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 text-[12px] font-semibold tracking-wider text-mist-400 uppercase">Famille</div>
            <Field label="Nom de famille *"><Input value={r.family_name} onChange={(e) => setD({ ...d, family_name: e.target.value })} /></Field>
            <Field label="Prénom du contact"><Input value={r.contact_first_name ?? ''} onChange={(e) => setD({ ...d, contact_first_name: e.target.value })} /></Field>
            <Field label="Téléphone"><Input value={r.phone ?? ''} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
            <Field label="E-mail"><Input type="email" value={r.email ?? ''} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
            <div className="col-span-2 mt-2 text-[12px] font-semibold tracking-wider text-mist-400 uppercase">Rendez-vous</div>
            <Field label="Date"><Input type="date" value={r.appt_date ?? ''} onChange={(e) => setD({ ...d, appt_date: e.target.value })} /></Field>
            <Field label="Heure"><Input type="time" value={r.appt_time ?? ''} onChange={(e) => setD({ ...d, appt_time: e.target.value })} /></Field>
            <Field label="Statut"><Select value={r.appt_status} onChange={(e) => setD({ ...d, appt_status: e.target.value as ApptStatus })}>{Object.entries(APPT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Référence inscription"><Input value={r.external_ref ?? ''} onChange={(e) => setD({ ...d, external_ref: e.target.value })} /></Field>
            <Field label="Nombre de participants"><Input type="number" min={0} value={r.participants_count ?? ''} onChange={(e) => setD({ ...d, participants_count: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Notes" className="col-span-2"><Textarea value={r.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <FamilyForm open={familyOpen} familyId={reg?.family_id} onClose={() => setFamilyOpen(false)} onSaved={() => { setFamilyOpen(false); setD({}); onSaved(); }} />
    </>
  );
}
