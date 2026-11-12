import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Field, IconButton, Input, Modal, Textarea } from './ui';
import { getFamily, saveFamily, type FamilyInput } from '../services/families';
import { act } from '../lib/act';

type P = NonNullable<FamilyInput['participants']>[number];

/** Create / edit a family with participants and photo references. */
export function FamilyForm({ open, familyId, onClose, onSaved, title, extra, submitLabel, onSubmitNew }: {
  open: boolean; familyId?: string | null; onClose: () => void; onSaved?: (id: string) => void; title?: string;
  extra?: React.ReactNode; submitLabel?: string; onSubmitNew?: (input: FamilyInput) => Promise<void>;
}) {
  const [f, setF] = useState<FamilyInput>({ name: '', participants: [] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (!familyId) { setF({ name: '', contact_first_name: '', phone: '', email: '', notes: '', participants: [{ first_name: '', refs: [] }] }); return; }
    getFamily(familyId).then((d) => d && setF({
      ...d.family, participants: d.participants.map((p) => ({ id: p.id, first_name: p.first_name, notes: p.notes, refs: (p.refs ?? []).map((r) => ({ id: r.id, reference: r.reference, file_path: r.file_path })) })),
    }));
  }, [open, familyId]);
  const setP = (i: number, p: Partial<P>) => setF((x) => ({ ...x, participants: x.participants!.map((q, j) => (j === i ? { ...q, ...p } : q)) }));
  const submit = async () => {
    setBusy(true);
    const clean = { ...f, participants: f.participants!.filter((p) => p.first_name.trim()) };
    if (onSubmitNew && !familyId) await act(() => onSubmitNew(clean));
    else { const id = await act(() => saveFamily(familyId ?? null, clean), 'Fiche enregistrée'); if (id) onSaved?.(id); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={title ?? (familyId ? 'Modifier la famille' : 'Nouvelle famille')} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" loading={busy} disabled={!f.name.trim()} onClick={submit}>{submitLabel ?? 'Enregistrer'}</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom de famille *"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Prénom du contact"><Input value={f.contact_first_name ?? ''} onChange={(e) => setF({ ...f, contact_first_name: e.target.value })} /></Field>
        <Field label="Téléphone"><Input value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="E-mail"><Input type="email" value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Notes" className="col-span-2"><Textarea rows={2} value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {extra}
      <div className="mt-6 mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold">Participants & références photo</div>
        <Button size="sm" variant="subtle" icon={<Plus className="size-3.5" />} onClick={() => setF({ ...f, participants: [...(f.participants ?? []), { first_name: '', refs: [] }] })}>Participant</Button>
      </div>
      <div className="space-y-2">
        {f.participants?.map((p, i) => (
          <div key={p.id ?? i} className="rounded-xl border border-ink-700 bg-ink-900/60 p-3">
            <div className="flex items-center gap-2">
              <Input placeholder="Prénom" value={p.first_name} onChange={(e) => setP(i, { first_name: e.target.value })} className="max-w-[200px]" />
              <Input placeholder="Note (facultatif)" value={p.notes ?? ''} onChange={(e) => setP(i, { notes: e.target.value })} />
              <IconButton title="Retirer" onClick={() => setF({ ...f, participants: f.participants!.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></IconButton>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {p.refs?.map((r, k) => (
                <div key={r.id ?? k} className="flex items-center gap-1">
                  <Input className="h-8 w-[140px] font-mono text-[12.5px]" placeholder="IRIS_0001" value={r.reference}
                    onChange={(e) => setP(i, { refs: p.refs!.map((x, j) => (j === k ? { ...x, reference: e.target.value } : x)) })} />
                  <IconButton title="Retirer la référence" onClick={() => setP(i, { refs: p.refs!.filter((_, j) => j !== k) })}><Trash2 className="size-3.5" /></IconButton>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setP(i, { refs: [...(p.refs ?? []), { reference: '' }] })}>Référence photo</Button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
