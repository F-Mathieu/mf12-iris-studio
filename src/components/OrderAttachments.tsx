import { useEffect, useState } from 'react';
import { ClipboardPaste, FileDown, FileText, Image as ImageIcon, Mail, Paperclip, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, IconButton, Input, Modal, Select, useAsync, useConfirm } from './ui';
import { addAttachment, ATTACHMENT_KINDS, deleteAttachment, getAttachmentBytes, listAttachments, updateAttachment, type Attachment, type AttachmentKind } from '../services/attachments';
import { pickFiles, saveFile } from '../lib/files';
import { fmtDate } from '../lib/format';
import { act } from '../lib/act';

const sizeLabel = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);
const iconOf = (a: Attachment) => a.mime.startsWith('image/') ? <ImageIcon className="size-4" /> : a.mime === 'message/rfc822' ? <Mail className="size-4" /> : <FileText className="size-4" />;
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', 'h');

/** Order file: signed quote, e-mail screenshots… Paste (⌘V) a screenshot anywhere on the page to add it. */
export function OrderAttachments({ orderId, onChange }: { orderId: string; onChange?: () => void }) {
  const confirm = useConfirm();
  const list = useAsync(() => listAttachments(orderId), [orderId]);
  const [view, setView] = useState<{ a: Attachment; url: string; text?: string } | null>(null);
  const reload = () => { list.reload(); onChange?.(); };

  const add = async (files: { name: string; bytes: Uint8Array; mime?: string }[]) => {
    if (!files.length) return;
    await act(async () => { for (const f of files) await addAttachment(orderId, f); }, files.length > 1 ? `${files.length} pièces jointes ajoutées` : 'Pièce jointe ajoutée');
    reload();
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      void Promise.all(files.map(async (f) => ({
        name: f.name && f.name !== 'image.png' ? f.name : `capture-${stamp()}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`,
        mime: f.type || undefined, bytes: new Uint8Array(await f.arrayBuffer()),
      }))).then(add);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const open = async (a: Attachment) => {
    const f = await getAttachmentBytes(a.id);
    if (!f) return;
    const url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mime }));
    setView({ a, url, text: f.mime.startsWith('text/') || f.mime === 'message/rfc822' ? new TextDecoder().decode(f.bytes) : undefined });
  };
  const close = () => { if (view) URL.revokeObjectURL(view.url); setView(null); };
  const download = async (a: Attachment) => { const f = await getAttachmentBytes(a.id); if (f) await act(() => saveFile(f.name, f.bytes), 'Fichier enregistré'); };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Paperclip className="size-4 text-mist-400" />Pièces jointes</span>}
        subtitle="Devis signé, captures d’e-mails, bons de commande… Collez une capture avec ⌘V."
        actions={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={async () => add(await pickFiles([], true))}>Ajouter</Button>} />
      {!list.data?.length
        ? <div className="flex items-center gap-2 px-5 py-4 text-[12.5px] text-mist-400"><ClipboardPaste className="size-4" />Aucune pièce jointe.</div>
        : <div className="divide-y divide-ink-700/50">
          {list.data.map((a) => (
            <div key={a.id} className="space-y-1.5 px-5 py-2.5 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="text-mist-400">{iconOf(a)}</span>
                <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-gold-300" title="Aperçu" onClick={() => open(a)}>{a.name}</button>
                <span className="text-[11.5px] text-mist-400">{fmtDate(a.created_at)} · {sizeLabel(a.size)}</span>
                <IconButton title="Enregistrer une copie" onClick={() => download(a)}><FileDown className="size-4" /></IconButton>
                <IconButton title="Supprimer" onClick={async () => (await confirm({ title: `Supprimer « ${a.name} » ?`, danger: true, confirm: 'Supprimer' })) && act(() => deleteAttachment(a.id).then(reload), 'Pièce jointe supprimée')}><Trash2 className="size-4" /></IconButton>
              </div>
              <div className="flex gap-2 pl-6">
                <Select className="h-8 w-52 text-[12px]" value={a.kind} onChange={(e) => act(() => updateAttachment(a.id, { kind: e.target.value as AttachmentKind }).then(reload))}>
                  {Object.entries(ATTACHMENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
                <Input className="h-8 flex-1 text-[12px]" placeholder="Note (ex. signé le 12/11, reçu par mail)" defaultValue={a.note ?? ''} onBlur={(e) => e.target.value !== (a.note ?? '') && act(() => updateAttachment(a.id, { note: e.target.value || null }))} />
              </div>
            </div>
          ))}
        </div>}
      {view && (
        <Modal open onClose={close} size="xl" title={view.a.name} subtitle={ATTACHMENT_KINDS[view.a.kind]}
          footer={<><Button variant="ghost" onClick={close}>Fermer</Button><Button icon={<FileDown className="size-4" />} onClick={() => download(view.a)}>Enregistrer une copie</Button></>}>
          {view.a.mime.startsWith('image/') ? <img src={view.url} alt={view.a.name} className="mx-auto max-h-[70vh] rounded-lg" />
            : view.a.mime === 'application/pdf' ? <iframe title={view.a.name} src={view.url} className="h-[70vh] w-full rounded-lg bg-white" />
            : view.text != null ? <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg bg-ink-800 p-4 text-[12px]">{view.text}</pre>
            : <div className="py-10 text-center text-mist-400">Pas d’aperçu pour ce type de fichier : enregistrez une copie pour l’ouvrir.</div>}
        </Modal>
      )}
    </Card>
  );
}
