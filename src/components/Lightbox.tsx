import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getMediaFull } from '../services/catalog';
import { Spinner } from './ui';

export interface LightItem { mediaId: string; thumb: string; caption?: string }

/** Full-screen viewer; loads the full-size image lazily from SQLite. */
export function Lightbox({ items, index, onClose }: { items: LightItem[]; index: number | null; onClose: () => void }) {
  const [i, setI] = useState(index ?? 0);
  const [full, setFull] = useState<Record<string, string>>({});
  useEffect(() => { if (index != null) setI(index); }, [index]);
  const cur = index != null ? items[i] : null;
  useEffect(() => {
    if (cur && !full[cur.mediaId]) getMediaFull(cur.mediaId).then((f) => f && setFull((x) => ({ ...x, [cur.mediaId]: f })));
  }, [cur, full]);
  useEffect(() => {
    if (index == null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => (x + 1) % items.length);
      if (e.key === 'ArrowLeft') setI((x) => (x - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [index, items.length, onClose]);
  if (!cur) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 animate-fade" onClick={onClose}>
      <div className="flex justify-end p-4"><button className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="size-6" /></button></div>
      <div className="relative flex flex-1 items-center justify-center px-20 pb-6" onClick={(e) => e.stopPropagation()}>
        {items.length > 1 && <button className="absolute left-6 rounded-full p-3 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setI((i - 1 + items.length) % items.length)}><ChevronLeft className="size-8" /></button>}
        <div className="relative flex h-full max-h-[82vh] items-center justify-center">
          <img src={full[cur.mediaId] ?? cur.thumb} className="max-h-[82vh] max-w-full rounded-lg object-contain shadow-2xl" alt="" />
          {!full[cur.mediaId] && <Spinner className="absolute" />}
        </div>
        {items.length > 1 && <button className="absolute right-6 rounded-full p-3 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setI((i + 1) % items.length)}><ChevronRight className="size-8" /></button>}
      </div>
      <div className="pb-6 text-center text-[13px] text-white/60" onClick={(e) => e.stopPropagation()}>
        {cur.caption && <div className="mb-1 text-white/85">{cur.caption}</div>}
        Exemple de réalisation — votre création sera réalisée à partir de vos propres iris.
      </div>
    </div>, document.body);
}
