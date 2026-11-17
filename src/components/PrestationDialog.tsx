import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Field, IconButton, Input, Modal, MoneyInput, Select, Textarea, Toggle, useAsync, cx } from './ui';
import { createPrestation, PRESTATION_KINDS, type PrestationKind } from '../services/prestations';
import { searchFamilies } from '../services/families';
import { PAYMENT_METHODS, type PaymentMethod } from '../services/orders';
import { eur } from '../lib/money';
import { todayIso } from '../lib/ids';
import { act } from '../lib/act';

type Line = { label: string; qty: number; unit: number | null };
type Pay = { date: string; amount: number | null; method: PaymentMethod };

/** Records a prestation signed before the software (or outside the catalogue), with deposits already received. */
export function PrestationDialog({ onClose, onDone }: { onClose: () => void; onDone: (r: { orderId: string; number: string }) => void }) {
  const [q, setQ] = useState('');
  const fams = useAsync(() => (q.trim().length >= 2 ? searchFamilies(q, 8) : Promise.resolve([])), [q]);
  const [fam, setFam] = useState<{ id?: string; name: string; first: string; email: string; phone: string }>({ name: '', first: '', email: '', phone: '' });
  const [kind, setKind] = useState<PrestationKind>('mariage');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [lines, setLines] = useState<Line[]>([{ label: '', qty: 1, unit: null }]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [delivered, setDelivered] = useState(false);
  const [notes, setNotes] = useState('');
  const total = lines.reduce((s, l) => s + l.qty * (l.unit ?? 0), 0);
  const paid = pays.reduce((s, p) => s + (p.amount ?? 0), 0);
  const save = async () => {
    const r = await act(() => createPrestation({
      family: { id: fam.id, name: fam.name, first: fam.first || null, email: fam.email || null, phone: fam.phone || null },
      kind, title, date: date || null, signedAt: signedAt || null, delivered, notes: notes || null,
      lines: lines.map((l) => ({ label: l.label, qty: l.qty, unit_cents: l.unit ?? -1 })).filter((l) => l.label.trim()),
      payments: pays.filter((p) => p.amount).map((p) => ({ date: p.date, amount_cents: p.amount!, method: p.method })),
    }), (x) => `Prestation enregistrée — commande ${x.number}`);
    if (r) onDone(r);
  };
  return (
    <Modal open onClose={onClose} size="xl" title="Prestation déjà signée" subtitle="Pour une prestation signée avant le logiciel ou hors catalogue (mariage, séance…). Les acomptes déjà reçus sont enregistrés à leur vraie date : ils entrent dans le livre des recettes et les déclarations URSSAF."
      footer={<><div className="mr-auto text-[13px] text-mist-300">Total <b className="text-gold-300 tabular">{eur(total)}</b> · déjà encaissé <span className="tabular">{eur(paid)}</span> · reste <span className="tabular">{eur(total - paid)}</span></div>
        <Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={!total || (!fam.id && !fam.name.trim())} onClick={save}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="text-[13px] font-semibold">Client</div>
          {fam.id ? (
            <div className="flex items-center justify-between rounded-xl border border-gold-500/40 px-3 py-2 text-[13.5px]"><span>{[fam.first, fam.name].filter(Boolean).join(' ')} <span className="text-mist-400">(client existant)</span></span><Button size="sm" variant="ghost" onClick={() => setFam({ name: '', first: '', email: '', phone: '' })}>Changer</Button></div>
          ) : (<>
            <Field label="Rechercher un client existant"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, téléphone, e-mail…" /></Field>
            {!!fams.data?.length && <div className="max-h-36 overflow-y-auto rounded-xl border border-ink-700">{fams.data.map((f) => (
              <button key={f.id} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-ink-750" onClick={() => { setFam({ id: f.id, name: f.name, first: f.contact_first_name ?? '', email: f.email ?? '', phone: f.phone ?? '' }); setQ(''); }}>{[f.contact_first_name, f.name].filter(Boolean).join(' ')} <span className="text-mist-400">{f.email ?? f.phone ?? ''}</span></button>
            ))}</div>}
            <div className="text-[12px] text-mist-400">… ou nouveau client :</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom *"><Input value={fam.name} onChange={(e) => setFam({ ...fam, name: e.target.value })} /></Field>
              <Field label="Prénom(s)"><Input value={fam.first} onChange={(e) => setFam({ ...fam, first: e.target.value })} placeholder="Julie & Tom" /></Field>
              <Field label="E-mail"><Input value={fam.email} onChange={(e) => setFam({ ...fam, email: e.target.value })} /></Field>
              <Field label="Téléphone"><Input value={fam.phone} onChange={(e) => setFam({ ...fam, phone: e.target.value })} /></Field>
            </div>
          </>)}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as PrestationKind)}>{Object.entries(PRESTATION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Intitulé" hint="Vide : « Mariage Julie & Tom Martin »"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Date de la prestation"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Signée le"><Input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} /></Field>
          </div>
          <Toggle checked={delivered} onChange={setDelivered} label="Déjà réalisée et livrée (rien à produire)" />
          <Field label="Notes (facultatif)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-[13px] font-semibold">Ce qui est vendu</div>
            <div className="space-y-2">{lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_110px_auto] gap-2">
                <Input value={l.label} placeholder={i === 0 ? 'Forfait mariage journée complète' : 'Album 30 × 30'} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input type="number" min={1} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))} />
                <MoneyInput value={l.unit} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, unit: v } : x)))} />
                <IconButton title="Retirer" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
              </div>))}
            </div>
            <Button size="sm" variant="ghost" className="mt-1" icon={<Plus className="size-3.5" />} onClick={() => setLines([...lines, { label: '', qty: 1, unit: null }])}>Ligne</Button>
          </div>
          <div>
            <div className="mb-2 text-[13px] font-semibold">Acomptes / règlements déjà reçus</div>
            <div className="space-y-2">{pays.map((p, i) => (
              <div key={i} className="grid grid-cols-[150px_120px_1fr_auto] gap-2">
                <Input type="date" value={p.date} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                <MoneyInput value={p.amount} onChange={(v) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                <Select value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value as PaymentMethod } : x)))}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <IconButton title="Retirer" onClick={() => setPays(pays.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
              </div>))}
            </div>
            <Button size="sm" variant="ghost" className="mt-1" icon={<Plus className="size-3.5" />} onClick={() => setPays([...pays, { date: todayIso(), amount: null, method: 'virement' }])}>Règlement reçu</Button>
            <div className={cx('mt-2 text-[12px]', paid > total ? 'text-red-300' : 'text-mist-400')}>{paid > total ? 'Les règlements dépassent le total.' : 'Date = jour où l’argent a été reçu (c’est elle qui compte pour l’URSSAF). Les règlements suivants se saisissent ensuite dans la commande.'}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
