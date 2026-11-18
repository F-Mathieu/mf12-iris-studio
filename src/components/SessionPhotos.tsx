import { useState } from 'react';
import { FolderOpen, Images, ImagePlus, Star, Trash2 } from 'lucide-react';
import { Badge, Button, Card, DataTable, Empty, IconButton, Modal, Textarea, useAsync, useConfirm } from './ui';
import { PhotoGallery } from './PhotoGallery';
import { deletePreviews, importFavorites, importPhotos, listPhotos, matchFolders, photoCounts, PHOTO_EXT, setFavorite, type PhotoFile } from '../services/photos';
import type { RegistrationRow } from '../services/registrations';
import { decodeCsvBytes } from '../lib/csv';
import { pickFiles, pickPhotoFolder } from '../lib/files';
import { act } from '../lib/act';

const famName = (r: RegistrationRow) => [r.contact_first_name, r.family_name].filter(Boolean).join(' ');

/**
 * Séance → Photos : aperçus de l'export Lightroom (un dossier par famille, n° = nom du fichier), favoris,
 * favoris Pic-Time (CSV), suppression des aperçus (les commandes gardent leurs n°).
 */
export function SessionPhotos({ sessionId, regs }: { sessionId: string; regs: RegistrationRow[] }) {
  const confirm = useConfirm();
  const counts = useAsync(() => photoCounts(sessionId), [sessionId]);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [gallery, setGallery] = useState<RegistrationRow | null>(null);
  const [favFor, setFavFor] = useState<RegistrationRow | null>(null);
  const [plan, setPlan] = useState<{ matched: { folder: string; reg: RegistrationRow; files: PhotoFile[] }[]; unmatched: string[] } | null>(null);
  const count = (id: string) => counts.data?.find((c) => c.registration_id === id);
  const total = counts.data?.reduce((s, c) => s + c.n, 0) ?? 0;

  const run = async (jobs: { reg: RegistrationRow; files: PhotoFile[] }[]) => {
    const all = jobs.reduce((s, j) => s + j.files.length, 0);
    let done = 0, imported = 0;
    const skipped: string[] = [];
    try {
      for (const j of jobs) {
        setProgress({ label: famName(j.reg), done, total: all });
        const r = await importPhotos(sessionId, j.reg.id, j.files, (d) => setProgress({ label: famName(j.reg), done: done + d, total: all }));
        done += j.files.length; imported += r.imported; skipped.push(...r.skipped);
      }
      await act(async () => imported, `${imported} photo(s) importée(s)${skipped.length ? ` — ${skipped.length} fichier(s) sans n° ignoré(s)` : ''}`);
    } catch (e) { await act(() => Promise.reject(e)); }
    setProgress(null); counts.reload();
  };

  const importFamily = async (r: RegistrationRow) => {
    const files = await pickFiles([{ name: 'Images', extensions: PHOTO_EXT }], true);
    if (files.length) await run([{ reg: r, files }]);
  };
  const importFolder = async () => {
    const m = await pickPhotoFolder(PHOTO_EXT);
    if (!m) return;
    const folders = [...m.keys()].filter(Boolean);
    const res = matchFolders(folders, regs);
    setPlan({
      matched: res.matched.map((x) => ({ folder: x.folder, reg: regs.find((r) => r.id === x.registrationId)!, files: m.get(x.folder)! })),
      unmatched: [...res.unmatched, ...(m.has('') ? ['(photos à la racine du dossier)'] : [])],
    });
  };

  return (
    <div className="space-y-4 animate-fade">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[13px] text-mist-400">Export Lightroom (Classic ou Cloud) : JPEG, <b>un dossier par famille</b>, fichiers numérotés (001.jpg…). Les aperçus sont gardés à côté de la base, pas dans les sauvegardes.</div>
        <div className="flex-1" />
        <Button variant="gold" icon={<FolderOpen className="size-4" />} disabled={!!progress || !regs.length} onClick={importFolder}>Importer le dossier de la séance</Button>
        <Button variant="danger" icon={<Trash2 className="size-4" />} disabled={!total || !!progress} onClick={async () => {
          if (await confirm({ title: `Supprimer les ${total} aperçus de la séance ?`, text: 'Libère la place sur le disque. Les commandes gardent les n° des photos ; les aperçus pourront être ré-importés depuis Lightroom.', danger: true, confirm: 'Supprimer les aperçus' }))
            await act(() => deletePreviews(sessionId).then(counts.reload), 'Aperçus supprimés');
        }}>Supprimer tous les aperçus</Button>
      </div>
      {progress && (
        <Card className="px-5 py-4 text-[13px]">
          <div className="mb-2">Import… {progress.label} — {progress.done} / {progress.total}</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-800"><div className="h-full bg-gold-400 transition-all" style={{ width: `${progress.total ? (100 * progress.done) / progress.total : 0}%` }} /></div>
        </Card>
      )}
      <Card>
        <DataTable<RegistrationRow> rows={regs} rowKey={(r) => r.id}
          empty={<Empty icon={<Images className="size-5" />} title="Aucun inscrit" text="Ajoutez les familles dans l’onglet Inscrits avant d’importer leurs photos." />}
          columns={[
            { key: 'f', header: 'Famille', sort: (r) => r.family_name, cell: (r) => <span className="font-medium">{famName(r)}</span> },
            { key: 'n', header: 'Photos', align: 'right', sort: (r) => count(r.id)?.n ?? 0, cell: (r) => count(r.id)?.n ?? <span className="text-mist-500">—</span> },
            { key: 'fav', header: 'Favoris', align: 'right', sort: (r) => count(r.id)?.fav ?? 0, cell: (r) => (count(r.id)?.fav ? <Badge tone="gold"><Star className="size-3" />{count(r.id)!.fav}</Badge> : '') },
            { key: 'a', header: '', align: 'right', cell: (r) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="subtle" icon={<Images className="size-3.5" />} disabled={!count(r.id)?.n} onClick={() => setGallery(r)}>Voir</Button>
                <IconButton title="Importer les photos de la famille (sélectionnez les fichiers du dossier, ⌘A)" disabled={!!progress} onClick={() => importFamily(r)}><ImagePlus className="size-4" /></IconButton>
                <IconButton title="Favoris Pic-Time (CSV) ou liste de n°" disabled={!count(r.id)?.n} onClick={() => setFavFor(r)}><Star className="size-4" /></IconButton>
                <IconButton title="Supprimer les aperçus de la famille" disabled={!count(r.id)?.n} onClick={async () => (await confirm({ title: `Supprimer les aperçus de ${famName(r)} ?`, text: 'Les commandes gardent les n° des photos.', danger: true, confirm: 'Supprimer' })) && act(() => deletePreviews(sessionId, r.id).then(counts.reload), 'Aperçus supprimés')}><Trash2 className="size-4" /></IconButton>
              </div>) },
          ]} />
      </Card>
      {gallery && <GalleryDialog reg={gallery} onClose={() => { setGallery(null); counts.reload(); }} />}
      {favFor && <FavoritesDialog reg={favFor} onClose={() => { setFavFor(null); counts.reload(); }} />}
      {plan && (
        <Modal open onClose={() => setPlan(null)} size="lg" title="Importer le dossier de la séance" subtitle="Chaque sous-dossier est rattaché à la famille du même nom (ou à sa référence)."
          footer={<><Button variant="ghost" onClick={() => setPlan(null)}>Annuler</Button><Button variant="gold" disabled={!plan.matched.length} onClick={() => { const p = plan; setPlan(null); void run(p.matched); }}>Importer {plan.matched.reduce((s, m) => s + m.files.length, 0)} photo(s)</Button></>}>
          <div className="space-y-1.5 text-[13px]">
            {plan.matched.map((m) => <div key={m.folder} className="flex justify-between"><span>📁 {m.folder} → <b>{famName(m.reg)}</b></span><span className="text-mist-400">{m.files.length} photo(s)</span></div>)}
            {plan.unmatched.length > 0 && <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">Non rattachés (renommez le dossier comme la famille, ou importez depuis la ligne de la famille) : {plan.unmatched.join(', ')}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}

function GalleryDialog({ reg, onClose }: { reg: RegistrationRow; onClose: () => void }) {
  const p = useAsync(() => listPhotos(reg.id), [reg.id]);
  return (
    <Modal open onClose={onClose} size="xl" title={`Photos — ${famName(reg)}`} subtitle="Étoile = favori (espace dans la visionneuse). Double-clic pour agrandir, flèches pour naviguer.">
      <PhotoGallery photos={p.data ?? []} onFavorite={(x, on) => act(() => setFavorite(x.id, on).then(p.reload))} />
    </Modal>
  );
}

function FavoritesDialog({ reg, onClose }: { reg: RegistrationRow; onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <Modal open onClose={onClose} title={`Favoris — ${famName(reg)}`} subtitle="Pic-Time : Favoris du client → télécharger la liste CSV. Ou collez les n° / noms de fichiers (12, 15, 18-20…)."
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={!text.trim()} onClick={async () => {
        const r = await act(() => importFavorites(reg.id, text), (x) => `${x.marked} favori(s)${x.unknown.length ? ` — introuvables : ${x.unknown.join(', ')}` : ''}`);
        if (r) onClose();
      }}>Remplacer les favoris</Button></>}>
      <div className="space-y-3">
        <Button size="sm" variant="subtle" onClick={async () => { const [f] = await pickFiles([{ name: 'CSV', extensions: ['csv', 'txt'] }]); if (f) setText(decodeCsvBytes(f.bytes)); }}>Choisir le fichier CSV Pic-Time…</Button>
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'012.jpg, 015.jpg\nou : 12 15 18-20'} />
      </div>
    </Modal>
  );
}
