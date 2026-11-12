import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { Badge, Button, Modal, Select, cx } from './ui';
import { decodeCsvBytes, parseRegistrationCsv, REGISTRATION_HELP } from '../lib/csv';
import { applyImport, planImport, type ConflictAction, type ImportPlanRow } from '../services/registrations';
import { CSV_FILTER, pickFiles } from '../lib/files';
import { act } from '../lib/act';

export function ImportDialog({ open, sessionId, onClose, onDone }: { open: boolean; sessionId: string; onClose: () => void; onDone: () => void }) {
  const [plan, setPlan] = useState<ImportPlanRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<number, ConflictAction>>({});
  const [busy, setBusy] = useState(false);
  const reset = () => { setPlan(null); setFileName(''); setMissing([]); setDecisions({}); };
  const close = () => { reset(); onClose(); };

  const choose = () => act(async () => {
    const [f] = await pickFiles(CSV_FILTER);
    if (!f) return;
    setBusy(true);
    try {
      const parsed = parseRegistrationCsv(decodeCsvBytes(f.bytes));
      if (parsed.fatal) throw new Error(parsed.fatal);
      setFileName(f.name); setMissing(parsed.missingColumns);
      setPlan(await planImport(sessionId, parsed.rows));
    } finally { setBusy(false); }
  });
  const confirm = async () => {
    if (!plan) return;
    setBusy(true);
    const r = await act(() => applyImport(sessionId, plan, decisions),
      (s) => `Import terminé : ${s.created} créée(s), ${s.linked} rattachée(s), ${s.updated} mise(s) à jour, ${s.ignored} ignorée(s)`);
    setBusy(false);
    if (r) { onDone(); close(); }
  };
  const counts = plan ? { new: plan.filter((p) => p.kind === 'new').length, link: plan.filter((p) => p.kind === 'link').length, conflict: plan.filter((p) => p.kind === 'conflict').length, error: plan.filter((p) => p.kind === 'error').length } : null;
  const importable = plan ? plan.filter((p) => p.kind === 'new' || p.kind === 'link' || (p.kind === 'conflict' && (decisions[p.row.line] ?? 'ignore') !== 'ignore')).length : 0;

  return (
    <Modal open={open} onClose={close} size="xl" title="Importer les clients (CSV)" subtitle={fileName || 'Les familles seront rattachées à cette séance. Les commandes existantes ne sont jamais modifiées.'}
      footer={plan ? <><Button variant="ghost" onClick={reset}>Choisir un autre fichier</Button><Button variant="gold" loading={busy} disabled={!importable} onClick={confirm}>Importer {importable} ligne(s)</Button></> : undefined}>
      {!plan ? (
        <div className="py-8 text-center">
          <FileSpreadsheet className="mx-auto size-10 text-gold-400" strokeWidth={1.5} />
          <p className="mx-auto mt-4 max-w-xl text-[13px] text-mist-300">{REGISTRATION_HELP}</p>
          <Button variant="gold" className="mt-6" icon={<Upload className="size-4" />} loading={busy} onClick={choose}>Sélectionner le fichier CSV</Button>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone="green">{counts!.new} nouvelle(s)</Badge>
            <Badge tone="blue">{counts!.link} famille(s) déjà connue(s)</Badge>
            <Badge tone="amber">{counts!.conflict} déjà inscrite(s)</Badge>
            <Badge tone="red">{counts!.error} en erreur</Badge>
            {missing.length > 0 && <Badge tone="neutral">Colonnes absentes : {missing.join(', ')}</Badge>}
          </div>
          {counts!.conflict > 0 && (
            <div className="mb-3 flex items-center gap-3 text-[12.5px] text-mist-300">
              Pour toutes les inscriptions existantes :
              {(['ignore', 'update'] as const).map((a) => <Button key={a} size="sm" variant="subtle" onClick={() => setDecisions(Object.fromEntries(plan.filter((p) => p.kind === 'conflict').map((p) => [p.row.line, a])))}>{a === 'ignore' ? 'Ignorer' : 'Mettre à jour'}</Button>)}
            </div>
          )}
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-ink-700">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-ink-800 text-left text-[11px] tracking-wider text-mist-400 uppercase">
                <tr><th className="px-3 py-2">Ligne</th><th className="px-3 py-2">Réf.</th><th className="px-3 py-2">Famille</th><th className="px-3 py-2">Téléphone</th><th className="px-3 py-2">RDV</th><th className="px-3 py-2">Participants</th><th className="px-3 py-2">Contrôle</th><th className="px-3 py-2">Action</th></tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.row.line} className={cx('border-t border-ink-700/60', p.kind === 'error' && 'bg-red-500/5')}>
                    <td className="px-3 py-2 text-mist-400 tabular">{p.row.line}</td>
                    <td className="px-3 py-2 font-mono">{p.row.ref}</td>
                    <td className="px-3 py-2 font-medium">{p.row.lastName} <span className="font-normal text-mist-400">{p.row.firstName}</span></td>
                    <td className="px-3 py-2 tabular">{p.row.phone}</td>
                    <td className="px-3 py-2 tabular">{p.row.date ?? ''} {p.row.time ?? ''}</td>
                    <td className="px-3 py-2">{p.row.participants.join(', ')}{p.row.count != null && <span className="text-mist-400"> ({p.row.count})</span>}</td>
                    <td className="px-3 py-2">
                      {p.row.errors.map((e) => <div key={e} className="flex items-center gap-1 text-red-300"><AlertTriangle className="size-3" />{e}</div>)}
                      {p.row.warnings.map((e) => <div key={e} className="text-amber-300">{e}</div>)}
                      {!p.row.errors.length && !p.row.warnings.length && <CheckCircle2 className="size-4 text-emerald-400" />}
                    </td>
                    <td className="px-3 py-2">
                      {p.kind === 'new' && <Badge tone="green">Créer</Badge>}
                      {p.kind === 'link' && <Badge tone="blue">Rattacher à {p.existingLabel}</Badge>}
                      {p.kind === 'error' && <Badge tone="red">Non importée</Badge>}
                      {p.kind === 'conflict' && (
                        <Select className="h-8 w-48 text-[12px]" value={decisions[p.row.line] ?? 'ignore'} onChange={(e) => setDecisions({ ...decisions, [p.row.line]: e.target.value as ConflictAction })}>
                          <option value="ignore">Ignorer ({p.existingLabel})</option>
                          <option value="update">Mettre à jour</option>
                          <option value="create">Créer une nouvelle inscription</option>
                        </Select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
