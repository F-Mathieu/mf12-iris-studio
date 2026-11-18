import { useState } from 'react';
import { Button, Field, Input, Modal, Select, useAsync } from './ui';
import { PhotoGallery } from './PhotoGallery';
import { familyPhotoSessions, listPhotos } from '../services/photos';
import { fmtPhoto, parsePhotoNumbers, photosNeeded } from '../lib/photos';

/**
 * Photos of a cart line: picked in the family's gallery (any of its sessions) or typed (n° from the Lightroom stars,
 * when no preview was imported). Fewer than needed = the rest is « à choisir » later.
 */
export function PhotoPicker({ familyId, sessionId, line, onClose, onSave }: {
  familyId: string; sessionId: string;
  line: { productName: string; variantName?: string | null; qty: number; photosPerUnit?: number | null; photos?: string[] | null; photoSessionId?: string | null };
  onClose: () => void; onSave: (photos: string[], photoSessionId: string | null) => void;
}) {
  const needed = photosNeeded(line);
  const sessions = useAsync(() => familyPhotoSessions(familyId), [familyId]);
  const [src, setSrc] = useState<string>(line.photoSessionId ?? sessionId);
  const [sel, setSel] = useState<string[]>(line.photos ?? []);
  const [text, setText] = useState((line.photos ?? []).map(fmtPhoto).join(', '));
  const reg = sessions.data?.find((s) => s.session_id === src);
  const photos = useAsync(() => (reg?.n ? listPhotos(reg.registration_id) : Promise.resolve([])), [reg?.registration_id, reg?.n]);
  const setBoth = (nums: string[]) => { setSel(nums); setText(nums.map(fmtPhoto).join(', ')); };
  return (
    <Modal open onClose={onClose} size="xl" title={`Photos — ${line.productName}${line.variantName ? ' · ' + line.variantName : ''}`}
      subtitle={needed ? `${sel.length} / ${needed} photo(s) choisie(s)${sel.length < needed ? ` — ${needed - sel.length} restera(ont) « à choisir »` : ''}` : 'Choisissez les photos.'}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" onClick={() => onSave(sel, src === sessionId ? null : src)}>Enregistrer</Button></>}>
      <div className="mb-4 grid grid-cols-[260px_1fr] gap-4">
        <Field label="Photos de la séance">
          <Select value={src} onChange={(e) => setSrc(e.target.value)}>
            {!sessions.data?.some((s) => s.session_id === sessionId) && <option value={sessionId}>Cette séance</option>}
            {sessions.data?.map((s) => <option key={s.session_id} value={s.session_id}>{s.session_name}{s.n ? ` (${s.n} photos)` : ' (sans aperçus)'}</option>)}
          </Select>
        </Field>
        <Field label="N° des photos (saisis ou copiés depuis Lightroom : 12, 15, 18-20)">
          <Input value={text} onChange={(e) => { setText(e.target.value); setSel(parsePhotoNumbers(e.target.value, false)); }} placeholder="ex. 12, 15, 18-20" />
        </Field>
      </div>
      {!!photos.data?.some((p) => p.favorite) && (
        <div className="mb-3"><Button size="sm" variant="subtle" onClick={() => setBoth(photos.data!.filter((p) => p.favorite).map((p) => p.number).slice(0, needed || undefined))}>
          Prendre les favoris ({photos.data!.filter((p) => p.favorite).length}){needed && photos.data!.filter((p) => p.favorite).length > needed ? ` — les ${needed} premiers` : ''}</Button></div>
      )}
      {photos.data?.length
        ? <PhotoGallery photos={photos.data} selected={sel} onSelect={setBoth} max={needed || undefined} />
        : <div className="rounded-lg bg-ink-800 px-4 py-6 text-center text-[13px] text-mist-400">Aucun aperçu importé pour cette séance : saisissez les n° (étoiles mises dans Lightroom), ou importez les photos dans Séance → Photos.</div>}
    </Modal>
  );
}
