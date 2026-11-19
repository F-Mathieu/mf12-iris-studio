import { useEffect, useState } from 'react';
import { Check, FileImage, Mail, MessageSquareWarning, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, IconButton, Modal, useAsync, useConfirm, cx } from './ui';
import { getSetting } from '../services/base';
import { addProofs, ribFile, deleteProof, emailProofs, listProofs, proofImage, PROOF_STATUS, setProofStatus, type Proof, type ProofStatus } from '../services/proofs';
import { pickFiles } from '../lib/files';
import { fmtDate } from '../lib/format';
import { eur } from '../lib/money';
import { act } from '../lib/act';

const TONE: Record<ProofStatus, 'neutral' | 'gold' | 'green' | 'amber'> = { a_envoyer: 'neutral', envoye: 'gold', valide: 'green', corrections: 'amber', remplace: 'neutral' };

function Thumb({ id, className, onClick }: { id: string; className?: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    proofImage(id).then((b) => { if (b) { u = URL.createObjectURL(new Blob([b as BlobPart], { type: 'image/jpeg' })); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <img src={url} alt="" className={cx('cursor-zoom-in object-contain', className)} onClick={onClick} /> : <div className={cx('animate-pulse bg-ink-800', className)} />;
}

/**
 * BAT (bons à tirer) of an order: import the final file (print, montage) → low-definition watermarked copy,
 * e-mail to the client, answer (validated / corrections), new version.
 */
/** unpaid: amount still due on the order (a BAT of an unpaid order can be kept as a digital file: warning before sending). */
export function OrderProofs({ orderId, unpaid = 0, onChange }: { orderId: string; unpaid?: number; onChange?: () => void }) {
  const confirm = useConfirm();
  const list = useAsync(() => listProofs(orderId), [orderId]);
  const [view, setView] = useState<Proof | null>(null);
  const [busy, setBusy] = useState(false);
  const ribAvail = useAsync(async () => !!(await ribFile()) || !!(await getSetting('iban')).trim(), []);
  const [rib, setRib] = useState<boolean | null>(null);
  const withRib = rib ?? (unpaid > 0 && !!ribAvail.data);
  const reload = () => { list.reload(); onChange?.(); };
  const current = (list.data ?? []).filter((p) => p.status !== 'remplace');
  const old = (list.data ?? []).filter((p) => p.status === 'remplace');
  const toSend = current.filter((p) => p.status === 'a_envoyer').length;
  const add = async (label?: string) => {
    const files = await pickFiles([{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }], !label);
    if (!files.length) return;
    setBusy(true);
    await act(() => addProofs(orderId, files, label), (n) => `${n} BAT préparé(s) (filigrane, basse définition)`);
    setBusy(false); reload();
  };
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><FileImage className="size-4 text-mist-400" />BAT (bons à tirer)</span>}
        subtitle="Importez le fichier final (JPEG/PNG) : le client reçoit une copie basse définition filigranée, inutilisable comme fichier numérique."
        actions={<>
          <label className={cx('flex cursor-pointer items-center gap-1.5 text-[12.5px]', ribAvail.data ? 'text-mist-200' : 'text-mist-500')} title={ribAvail.data ? 'Joint le RIB et ajoute une phrase pour régler par virement' : 'Ajoutez votre RIB dans Paramètres → Facturation'}>
            <input type="checkbox" className="size-4 accent-[rgb(212,175,105)]" disabled={!ribAvail.data} checked={withRib} onChange={(e) => setRib(e.target.checked)} />Joindre le RIB</label>
          <Button size="sm" icon={<Plus className="size-3.5" />} loading={busy} onClick={() => add()}>Ajouter</Button>
          <Button size="sm" variant="gold" icon={<Mail className="size-3.5" />} disabled={!toSend} onClick={async () => {
            if (unpaid > 0 && !(await confirm({ title: 'Commande non réglée', text: `Il reste ${eur(unpaid)} à régler. Un BAT envoyé avant paiement peut être gardé comme fichier numérique. Envoyer quand même ?`, confirm: 'Envoyer quand même' }))) return;
            await act(() => emailProofs(orderId, undefined, { rib: withRib }).then((r) => { reload(); return r; }), (r) => `${r.count} BAT ${r.how === 'mail' ? 'prêt(s) dans Mail' : 'enregistré(s) — joignez-les au message'}`);
          }}>Envoyer{toSend ? ` (${toSend})` : ''}</Button>
        </>} />
      {!current.length ? <div className="px-5 py-4 text-[12.5px] text-mist-400">Aucun BAT. Exportez le tirage ou le montage depuis Lightroom / Photoshop puis « Ajouter ».</div> : (
        <div className="divide-y divide-ink-700/50">
          {current.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
              <Thumb id={p.id} className="size-16 rounded bg-ink-900" onClick={() => setView(p)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate font-medium">{p.label}</span><span className="text-mist-400">v{p.version}</span><Badge tone={TONE[p.status]}>{PROOF_STATUS[p.status]}</Badge></div>
                <div className="text-[11.5px] text-mist-400">{p.sent_at ? `envoyé le ${fmtDate(p.sent_at)}` : 'pas encore envoyé'}{p.answered_at && p.status !== 'envoye' ? ` · réponse le ${fmtDate(p.answered_at)}` : ''}</div>
                {p.comment && <div className="mt-0.5 text-[12px] text-amber-200">« {p.comment} »</div>}
              </div>
              {p.status === 'envoye' && <>
                <Button size="sm" variant="subtle" icon={<Check className="size-3.5" />} onClick={() => act(() => setProofStatus(p.id, 'valide').then(reload), 'BAT validé')}>Validé</Button>
                <Button size="sm" variant="ghost" icon={<MessageSquareWarning className="size-3.5" />} onClick={async () => { const c = await confirm({ title: `Corrections demandées — ${p.label}`, input: { label: 'Corrections demandées par le client', required: true }, confirm: 'Enregistrer' }); if (c) await act(() => setProofStatus(p.id, 'corrections', c).then(reload), 'Corrections notées'); }}>Corrections</Button>
              </>}
              {(p.status === 'corrections' || p.status === 'envoye') && <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => add(p.label)}>Nouvelle version</Button>}
              {p.status === 'valide' && <IconButton title="Annuler la validation" onClick={() => act(() => setProofStatus(p.id, 'a_envoyer').then(reload))}><RotateCcw className="size-4" /></IconButton>}
              {p.status === 'a_envoyer' && <IconButton title="Supprimer" onClick={async () => (await confirm({ title: `Supprimer le BAT « ${p.label} » v${p.version} ?`, danger: true, confirm: 'Supprimer' })) && act(() => deleteProof(p.id).then(reload))}><Trash2 className="size-4" /></IconButton>}
            </div>
          ))}
          {old.length > 0 && <div className="px-5 py-2 text-[11.5px] text-mist-500">Versions précédentes : {old.map((p) => `${p.label} v${p.version}`).join(', ')}</div>}
        </div>
      )}
      {view && (
        <Modal open onClose={() => setView(null)} size="xl" title={`BAT — ${view.label} v${view.version}`} subtitle="Ce que reçoit le client (basse définition, filigrane).">
          <Thumb id={view.id} className="mx-auto max-h-[70vh] w-auto" />
        </Modal>
      )}
    </Card>
  );
}
