import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Download, Send, Pencil, ShoppingBag, Trash2, Upload, UserPlus, Users } from 'lucide-react';
import { Badge, Button, Card, DataTable, Empty, Field, IconButton, Input, Modal, SearchInput, Select, Textarea, cx, useConfirm, useDebounced, useAsync } from './ui';
import { ApptBadge, OrderBadge, PayBadge } from './badges';
import { FamilyForm } from './FamilyForm';
import { ImportDialog } from './ImportDialog';
import { addRegistration, APPT_STATUS, deleteRegistration, setRegistrationQuote, updateRegistration, type ApptStatus, type RegistrationRow } from '../services/registrations';
import { saveFamily, searchFamilies } from '../services/families';
import { registrationTemplate } from '../lib/csv';
import { saveFile } from '../lib/files';
import { eur } from '../lib/money';
import { slug, fmtDate } from '../lib/format';
import { act } from '../lib/act';
import { emailSessionOffers } from '../services/mail';

export function RegistrationsPanel({ sessionId, sessionName, regs, reload }: { sessionId: string; sessionName: string; regs: RegistrationRow[]; reload: () => void }) {
  const nav = useNavigate();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [existingOpen, setExistingOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
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
        <Button variant="outline" icon={<Send className="size-4" />} disabled={!regs.length} onClick={() => setBulkOpen(true)}>Offres à toutes les familles</Button>
        <Button variant="outline" icon={<Users className="size-4" />} onClick={() => setExistingOpen(true)}>Famille existante</Button>
        <Button variant="gold" icon={<UserPlus className="size-4" />} onClick={() => setAddOpen(true)}>Ajouter une famille</Button>
      </div>
      <Card>
        <DataTable<RegistrationRow> rows={rows} rowKey={(r) => r.id}
          empty={<Empty icon={<Users className="size-5" />} title="Aucun inscrit" text="Importez votre fichier Excel (CSV) ou ajoutez les familles manuellement." />}
          rowClassName={(r) => (r.done_at ? 'bg-white/[0.015] opacity-55 shadow-[inset_3px_0_0_rgb(148,163,184)]' : r.appt_status === 'absent' ? 'bg-red-500/[0.10] shadow-[inset_3px_0_0_rgb(248,113,113)] text-mist-300' : r.quote_signed_at ? 'bg-gold-500/[0.15] shadow-[inset_3px_0_0_rgb(212,175,105)]' : r.quote_sent_at ? 'bg-green-500/[0.08] shadow-[inset_3px_0_0_rgb(74,222,128)]' : r.awaiting_reply_at ? 'bg-sky-500/[0.10] shadow-[inset_3px_0_0_rgb(56,189,248)]' : null)}
          columns={[
            { key: 'time', header: 'RDV', sort: (r) => `${r.appt_date ?? ''}${r.appt_time ?? ''}`, cell: (r) => <span className="tabular">{r.appt_time ?? '—'}{r.appt_date && <span className="ml-1 text-[11.5px] text-mist-400">{fmtDate(r.appt_date, { day: '2-digit', month: '2-digit' })}</span>}</span> },
            { key: 'ref', header: 'Réf.', sort: (r) => r.external_ref ?? '', cell: (r) => <span className="font-mono text-[12px] text-mist-300">{r.external_ref ?? ''}</span> },
            { key: 'family', header: 'Famille', sort: (r) => r.family_name, cell: (r) => <div><button className="font-medium hover:text-gold-300" onClick={() => setEditFamily(r.family_id)}>{r.family_name}</button><div className="text-[12px] text-mist-400">{[r.contact_first_name, r.phone].filter(Boolean).join(' · ')}</div></div> },
            { key: 'parts', header: 'Participants', cell: (r) => <div className="max-w-[220px] truncate text-mist-300" title={r.participant_names ?? ''}><span className="mr-1.5 tabular text-mist-100">{r.nb_participants || r.participants_count || 0}</span>{r.participant_names}</div> },
            { key: 'status', header: 'Statut', cell: (r) => <ApptBadge s={r.appt_status} /> },
            { key: 'order', header: 'Commande', cell: (r) => r.order_status ? <div className="flex items-center gap-1.5"><OrderBadge s={r.order_status as 'validee'} />{r.order_status === 'validee' && <PayBadge total={r.order_total ?? 0} paid={r.paid_cents ?? 0} />}</div> : <span className="text-mist-400">—</span> },
            { key: 'quote', header: 'Suivi', sort: (r) => (r.done_at ? 4 : r.quote_signed_at ? 3 : r.quote_sent_at ? 2 : r.awaiting_reply_at ? 1 : 0), cell: (r) => (
              <div className="flex flex-col gap-1 text-[12px]">
                <QuoteTick checked={!!r.awaiting_reply_at} tone="blue" label="En attente" date={r.awaiting_reply_at} onChange={(on) => act(() => setRegistrationQuote(r.id, 'waiting', on).then(reload))} />
                <QuoteTick checked={!!r.quote_sent_at} tone="green" label="Devis envoyé" date={r.quote_sent_at} onChange={(on) => act(() => setRegistrationQuote(r.id, 'sent', on).then(reload))} />
                <QuoteTick checked={!!r.quote_signed_at} tone="gold" label="Devis validé" date={r.quote_signed_at} onChange={(on) => act(() => setRegistrationQuote(r.id, 'signed', on).then(reload))} />
                <QuoteTick checked={!!r.done_at} tone="grey" label="Traitée" date={r.done_at} onChange={(on) => act(() => setRegistrationQuote(r.id, 'done', on).then(reload))} />
              </div>) },
            { key: 'total', header: 'Montant', align: 'right', sort: (r) => r.order_total ?? 0, cell: (r) => (r.order_total != null ? eur(r.order_total) : '') },
            { key: 'a', header: '', align: 'right', cell: (r) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant={r.order_id ? 'subtle' : 'gold'} icon={<ShoppingBag className="size-3.5" />} onClick={() => nav(r.order_id ? (r.order_status === 'validee' ? `/commandes/${r.order_id}` : `/vente/commande/${r.order_id}`) : `/vente/${sessionId}/${r.id}`)}>{r.order_id ? (r.order_status === 'validee' ? 'Commande' : 'Reprendre') : 'Vendre'}</Button>
                <IconButton title={r.email ? `Envoyer les offres de la séance par e-mail (${r.email})` : 'Envoyer les offres de la séance par e-mail (aucune adresse : à saisir dans Mail)'}
                  onClick={() => act(() => emailSessionOffers({ sessionId, sessionName, familyName: r.family_name, firstName: r.contact_first_name, email: r.email }),
                    (how) => (how === 'mail' ? `E-mail prêt dans Mail : offres pour ${r.family_name}${r.email ? '' : ' — aucune adresse e-mail'}` : 'Brochure enregistrée — joignez-la au message ouvert'))}><BookOpen className="size-4" /></IconButton>
                <IconButton title="Modifier l’inscription (nom, prénom, coordonnées, rendez-vous)" onClick={() => setEditReg(r)}><Pencil className="size-4" /></IconButton>
                <IconButton title="Retirer de la séance" onClick={async () => { if (await confirm({ title: 'Retirer cette famille de la séance ?', text: 'La fiche famille est conservée dans la base clients.', danger: true, confirm: 'Retirer' })) await act(() => deleteRegistration(r.id).then(reload), 'Inscription retirée'); }}><Trash2 className="size-4" /></IconButton>
              </div>) },
          ]} />
      </Card>
      {bulkOpen && <BulkOffersDialog sessionId={sessionId} sessionName={sessionName} regs={regs} onClose={() => setBulkOpen(false)} />}
      <ImportDialog open={importOpen} sessionId={sessionId} onClose={() => setImportOpen(false)} onDone={reload} />
      <FamilyForm open={addOpen} title="Ajouter une famille à la séance" submitLabel="Ajouter" onClose={() => setAddOpen(false)}
        onSubmitNew={async (input) => { await addRegistration(sessionId, { input }); setAddOpen(false); reload(); }} />
      <FamilyForm open={!!editFamily} familyId={editFamily} onClose={() => setEditFamily(null)} onSaved={() => { setEditFamily(null); reload(); }} />
      <ExistingFamilyDialog open={existingOpen} onClose={() => setExistingOpen(false)} onPick={async (id) => { if (await act(() => addRegistration(sessionId, { id }), 'Famille ajoutée')) { setExistingOpen(false); reload(); } }} />
      <AppointmentDialog reg={editReg} onClose={() => setEditReg(null)} onSaved={() => { setEditReg(null); reload(); }} />
    </>
  );
}

/** Prepares the « offres de la séance » e-mail (personalised brochure) for several families at once: one message each in Mail. */
function BulkOffersDialog({ sessionId, sessionName, regs, onClose }: { sessionId: string; sessionName: string; regs: RegistrationRow[]; onClose: () => void }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(regs.filter((r) => r.email && r.order_status !== 'validee').map((r) => r.id)));
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const send = async () => {
    const list = regs.filter((r) => sel.has(r.id));
    const failed: string[] = [];
    setProgress({ done: 0, total: list.length, failed });
    for (const [i, r] of list.entries()) {
      try { await emailSessionOffers({ sessionId, sessionName, familyName: r.family_name, firstName: r.contact_first_name, email: r.email }); }
      catch { failed.push(r.family_name); }
      setProgress({ done: i + 1, total: list.length, failed: [...failed] });
    }
  };
  const finished = progress && progress.done === progress.total;
  return (
    <Modal open onClose={onClose} size="lg" title="Envoyer les offres à plusieurs familles"
      subtitle="Un e-mail personnalisé (brochure à son nom) est préparé dans Mail pour chaque famille cochée ; vous cliquez Envoyer sur chacun."
      footer={finished ? <Button variant="gold" onClick={onClose}>Fermer</Button> : <><Button variant="ghost" onClick={onClose} disabled={!!progress}>Annuler</Button>
        <Button variant="gold" icon={<Send className="size-4" />} loading={!!progress} disabled={!sel.size} onClick={send}>Préparer {sel.size} e-mail(s)</Button></>}>
      {progress ? (
        <div className="space-y-2 py-4 text-[13.5px]">
          <div>{progress.done} / {progress.total} e-mail(s) préparé(s){finished ? ' — vérifiez-les dans Mail puis envoyez-les.' : '…'}</div>
          {progress.failed.length > 0 && <div className="text-red-300">Échec pour : {progress.failed.join(', ')}</div>}
        </div>
      ) : (
        <>
          <div className="mb-2 flex gap-3 text-[12.5px]">
            <button type="button" className="text-gold-300 hover:underline" onClick={() => setSel(new Set(regs.filter((r) => r.email).map((r) => r.id)))}>Toutes avec e-mail</button>
            <button type="button" className="text-gold-300 hover:underline" onClick={() => setSel(new Set())}>Aucune</button>
            <span className="text-mist-400">Cochées par défaut : familles avec e-mail et sans commande validée.</span>
          </div>
          <div className="max-h-[55vh] divide-y divide-ink-700/50 overflow-y-auto rounded-lg border border-ink-700/60">
            {regs.map((r) => (
              <label key={r.id} className={cx('flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px]', !r.email && 'opacity-60')}>
                <input type="checkbox" className="size-4 accent-[rgb(212,175,105)]" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                <span className="flex-1">{[r.contact_first_name, r.family_name].filter(Boolean).join(' ')}</span>
                <span className="text-[12px] text-mist-400">{r.email ?? 'pas d’e-mail (à saisir dans Mail)'}</span>
                {r.order_status === 'validee' && <Badge tone="green">Commande validée</Badge>}
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
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

/** Small checkbox of the « Devis » column (the row is highlighted when ticked). */
const TICK_TONE = { blue: ['text-sky-300', 'accent-sky-500'], green: ['text-green-300', 'accent-green-500'], gold: ['text-gold-300', 'accent-gold-500'], grey: ['text-mist-200', 'accent-slate-400'] } as const;
function QuoteTick({ checked, label, tone, date, onChange }: { checked: boolean; label: string; tone: keyof typeof TICK_TONE; date: string | null; onChange: (on: boolean) => void }) {
  return (
    <label className={cx('flex cursor-pointer items-center gap-1.5 whitespace-nowrap', checked ? TICK_TONE[tone][0] : 'text-mist-400 hover:text-mist-200')} title={checked && date ? `${label} le ${fmtDate(date)}` : undefined} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" className={cx('size-3.5', TICK_TONE[tone][1])} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
