import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, MapPin, Plus } from 'lucide-react';
import { Button, Card, DataTable, Field, Input, Modal, PageHeader, SearchInput, Segmented, Select, Textarea, useAsync, useDebounced } from '../components/ui';
import { SessionBadge } from '../components/badges';
import { createSession, listSessions, type SessionInput, type SessionRow } from '../services/sessions';
import { listTemplates } from '../services/pricing';
import { listUniverses } from '../services/universes';
import { bookedOn } from '../services/agenda';
import { eur } from '../lib/money';
import { fmtDate } from '../lib/format';
import { act } from '../lib/act';

export default function Sessions() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'preparation' | 'active' | 'terminee' | 'archivee'>('');
  const dq = useDebounced(q);
  const [universe, setUniverse] = useState('');
  const universes = useAsync(() => listUniverses(), []);
  const { data } = useAsync(() => listSessions({ q: dq, status: status || undefined, universeId: universe || undefined }), [dq, status, universe]);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Séances" subtitle="Préparation, inscriptions, ventes et suivi de chaque séance."
        actions={<Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Nouvelle séance</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} className="w-80" placeholder="Nom, lieu, organisateur…" />
        <Segmented value={status} onChange={setStatus} options={[{ id: '', label: 'En cours' }, { id: 'preparation', label: 'Préparation' }, { id: 'active', label: 'Actives' }, { id: 'terminee', label: 'Terminées' }, { id: 'archivee', label: 'Archives' }]} />
        {(universes.data?.length ?? 0) > 1 && <Select className="w-48" value={universe} onChange={(e) => setUniverse(e.target.value)}><option value="">Tous les univers</option>{universes.data!.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}
      </div>
      <Card>
        <DataTable<SessionRow> rows={data ?? []} rowKey={(r) => r.id} onRowClick={(r) => nav(`/seances/${r.id}`)}
          empty={<div className="py-16 text-center text-mist-400"><Camera className="mx-auto mb-3 size-8 text-gold-500" />Aucune séance. Créez votre première séance pour commencer.</div>}
          columns={[
            { key: 'name', header: 'Séance', sort: (r) => r.name, cell: (r) => <div><div className="font-medium">{r.name}</div>{r.location && <div className="mt-0.5 flex items-center gap-1 text-[12px] text-mist-400"><MapPin className="size-3" />{r.location}</div>}</div> },
            { key: 'date', header: 'Date', sort: (r) => r.date ?? '', cell: (r) => <span className="tabular">{fmtDate(r.date)}{r.start_time && <span className="text-mist-400"> · {r.start_time}</span>}</span> },
            { key: 'universe', header: 'Univers', sort: (r) => r.universe_name ?? '', cell: (r) => <span className="text-mist-300">{r.universe_name ?? '—'}</span> },
            { key: 'status', header: 'Statut', cell: (r) => <SessionBadge s={r.status} /> },
            { key: 'tpl', header: 'Grille tarifaire', cell: (r) => <span className="text-mist-300">{r.price_list_name ?? <span className="text-amber-300">Aucune</span>}</span> },
            { key: 'reg', header: 'Inscrits', align: 'right', sort: (r) => r.registrations, cell: (r) => r.registrations },
            { key: 'orders', header: 'Commandes', align: 'right', sort: (r) => r.orders, cell: (r) => r.orders },
            { key: 'sales', header: 'Ventes', align: 'right', sort: (r) => r.sales_cents, cell: (r) => eur(r.sales_cents) },
          ]} />
      </Card>
      <SessionForm open={open} onClose={() => setOpen(false)} onSaved={(id) => nav(`/seances/${id}`)} />
    </>
  );
}

export function SessionForm({ open, onClose, onSaved, initial, onSubmit }: { open: boolean; onClose: () => void; onSaved?: (id: string) => void; initial?: Partial<SessionInput>; onSubmit?: (d: SessionInput) => Promise<void> }) {
  const [d, setD] = useState<SessionInput>({ name: '', ...initial });
  const universes = useAsync(() => listUniverses(), [open]);
  const universeId = d.universe_id === undefined ? (onSubmit ? null : universes.data?.[0]?.id ?? null) : d.universe_id;
  const tpls = useAsync(() => listTemplates(false, universeId), [open, universeId]);
  const booked = useAsync(() => (d.date && !onSubmit ? bookedOn(d.date) : Promise.resolve([])), [d.date]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof SessionInput, v: string | number | null) => setD((x) => ({ ...x, [k]: v }));
  const defaultTpl = universes.data?.find((u) => u.id === universeId)?.default_template_id;
  const tplId = d.template_id === undefined ? (tpls.data?.find((t) => t.id === defaultTpl) ?? tpls.data?.[0])?.id ?? null : d.template_id;
  const submit = async () => {
    setBusy(true);
    if (onSubmit) await act(() => onSubmit(d), 'Séance mise à jour');
    else { const id = await act(() => createSession({ ...d, universe_id: universeId, template_id: tplId }), 'Séance créée'); if (id) { onClose(); onSaved?.(id); } }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={onSubmit ? 'Modifier la séance' : 'Nouvelle séance'} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" loading={busy} disabled={!d.name?.trim()} onClick={submit}>Enregistrer</Button></>}>
      <div className="grid grid-cols-6 gap-4">
        <Field label="Nom de la séance *" className="col-span-6"><Input autoFocus placeholder="TEMPSDANSES — Iris novembre 2026" value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Date" className="col-span-2"><Input type="date" value={d.date ?? ''} onChange={(e) => set('date', e.target.value || null)} /></Field>
        <Field label="Début" className="col-span-2"><Input type="time" value={d.start_time ?? ''} onChange={(e) => set('start_time', e.target.value || null)} /></Field>
        <Field label="Fin" className="col-span-2"><Input type="time" value={d.end_time ?? ''} onChange={(e) => set('end_time', e.target.value || null)} /></Field>
        <Field label="Lieu" className="col-span-3"><Input value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Organisateur" className="col-span-3"><Input value={d.organizer ?? ''} onChange={(e) => set('organizer', e.target.value)} /></Field>
        <Field label="Univers" className="col-span-2" hint={onSubmit ? 'Catalogue et textes (brochure, e-mails) de la séance.' : 'Propose son template par défaut.'}>
          <Select value={universeId ?? ''} onChange={(e) => setD((x) => ({ ...x, universe_id: e.target.value || null, template_id: undefined }))}>
            <option value="">— Aucun (commun) —</option>
            {universes.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Durée d’un créneau (min)" className="col-span-2"><Input type="number" min={5} step={5} value={d.slot_minutes ?? 20} onChange={(e) => set('slot_minutes', Number(e.target.value) || 20)} /></Field>
        <Field label="Familles par créneau" className="col-span-2"><Input type="number" min={1} value={d.slot_capacity ?? 1} onChange={(e) => set('slot_capacity', Math.max(1, Number(e.target.value) || 1))} /></Field>
        {!onSubmit && (
          <Field label="Template tarifaire" className="col-span-2" hint="Une copie propre à la séance sera créée.">
            <Select value={tplId ?? ''} onChange={(e) => set('template_id', e.target.value || null)}>
              <option value="">— Aucun —</option>
              {tpls.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        )}
        {onSubmit && (
          <Field label="Statut" className="col-span-2">
            <Select value={d.status ?? 'preparation'} onChange={(e) => set('status', e.target.value)}>
              <option value="preparation">En préparation</option><option value="active">Active</option><option value="terminee">Terminée</option><option value="archivee">Archivée</option>
            </Select>
          </Field>
        )}
        <Field label="Description" className="col-span-6"><Textarea value={d.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Field>
        {!!booked.data?.length && <div className="col-span-6 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">⚠ Date déjà réservée : {booked.data.map((x) => x.title).join(', ')}</div>}
      </div>
    </Modal>
  );
}
