import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, ImageOff, Star, X } from 'lucide-react';
import { cx } from './ui';
import { photoUrl, type SessionPhoto } from '../services/photos';
import { fmtPhoto, matchRating, type RatingFilter } from '../lib/photos';

/** Lazily loaded image of a session photo (thumbnail or preview, files outside the database). */
export function PhotoImg({ photo, thumb = true, className }: { photo: SessionPhoto; thumb?: boolean; className?: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => { let on = true; photoUrl(photo, thumb).then((u) => on && setUrl(u)); return () => { on = false; }; }, [photo.id, thumb]);
  if (url === undefined) return <div className={cx('animate-pulse bg-ink-800', className)} />;
  if (!url) return <div className={cx('flex items-center justify-center bg-ink-800 text-mist-500', className)} title="Aperçu absent : ré-importez la photo"><ImageOff className="size-5" /></div>;
  return <img src={url} alt={fmtPhoto(photo.number)} className={className} draggable={false} />;
}

/** 0–5 stars as in Lightroom; clicking the current rating removes it. Read-only without onRate. */
export function Stars({ value, onRate, size = 'size-4' }: { value: number; onRate?: (n: number) => void; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star className={cx(size, n <= value ? 'fill-gold-400 text-gold-400' : onRate ? 'text-mist-600 hover:text-gold-300' : 'text-mist-700')} />;
        return onRate
          ? <button key={n} type="button" title={n === value ? 'Retirer la note' : `${n} étoile${n > 1 ? 's' : ''}`} onClick={() => onRate(n === value ? 0 : n)}>{icon}</button>
          : <span key={n}>{icon}</span>;
      })}
    </span>
  );
}

/**
 * Grid of a family's photos: ratings 1–5 stars, filter (all / rated / exactly N stars), full-screen viewer (← →, 1–5 / 0 keys),
 * optional selection of numbers (to put photos on a cart line). Thumbnails 400 px, previews 1600 px loaded on demand.
 */
export function PhotoGallery({ photos, onRate, selected, onSelect, max, big, filter: filterProp, onFilter }: {
  photos: SessionPhoto[]; onRate?: (p: SessionPhoto, stars: number) => void;
  selected?: string[]; onSelect?: (numbers: string[]) => void; max?: number; big?: boolean;
  filter?: RatingFilter; onFilter?: (f: RatingFilter) => void;
}) {
  const [view, setView] = useState<number | null>(null);
  const [ownFilter, setOwnFilter] = useState<RatingFilter>(0);
  const filter = filterProp ?? ownFilter, setFilter = onFilter ?? setOwnFilter;
  const list = photos.filter((p) => matchRating(p.rating, filter));
  const toggleSel = (n: string) => {
    if (!onSelect || !selected) return;
    if (selected.includes(n)) onSelect(selected.filter((x) => x !== n));
    else if (!max || selected.length < max) onSelect([...selected, n]);
    else if (max === 1) onSelect([n]);
  };
  const rated = photos.some((p) => p.rating > 0);
  return (
    <div>
      {rated && (
        <div className="mb-3 flex flex-wrap gap-2 text-[12.5px]">
          {([0, 'rated', 1, 2, 3, 4, 5] as RatingFilter[]).map((f) => {
            const c = photos.filter((p) => matchRating(p.rating, f)).length;
            if (typeof f === 'number' && f > 0 && !c) return null;
            return (
              <button key={String(f)} type="button" onClick={() => setFilter(f)} className={cx('flex items-center gap-1 rounded-full border px-3 py-1', filter === f ? 'border-gold-500/70 text-gold-200' : 'border-ink-600 text-mist-400')}>
                {f === 0 ? 'Toutes' : f === 'rated' ? 'Notées' : '★'.repeat(f)} ({c})
              </button>
            );
          })}
        </div>
      )}
      <div className={cx('grid gap-2.5', big ? 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(140px,1fr))]')}>
        {list.map((p, i) => {
          const sel = selected?.includes(p.number);
          return (
            <div key={p.id} className={cx('group relative overflow-hidden rounded-lg border bg-ink-900', sel ? 'border-gold-400 ring-2 ring-gold-400/60' : 'border-ink-700')}>
              <button type="button" className="block w-full" onClick={() => (onSelect ? toggleSel(p.number) : setView(i))} onDoubleClick={() => setView(i)}>
                <PhotoImg photo={p} className="aspect-[3/2] w-full object-contain" />
              </button>
              <div className={cx('flex items-center justify-between gap-1 px-2 py-1 text-[12px]', onSelect && 'cursor-pointer')} onClick={() => onSelect && toggleSel(p.number)}>
                <span className="font-mono text-mist-300">{fmtPhoto(p.number)}</span>
                <span className="flex items-center gap-1.5">
                  {(onRate || p.rating > 0) && <Stars value={p.rating} onRate={onRate && ((n) => onRate(p, n))} size={big ? 'size-5' : 'size-3.5'} />}
                  {onSelect && <button type="button" title="Agrandir" className="text-mist-500 hover:text-mist-200" onClick={(e) => { e.stopPropagation(); setView(i); }}>⤢</button>}
                </span>
              </div>
              {sel && <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-gold-400 text-ink-950"><Check className="size-4" /></span>}
            </div>
          );
        })}
      </div>
      {view != null && list[view] && (
        <Viewer photos={list} index={view} onIndex={setView} onClose={() => setView(null)} onRate={onRate}
          selected={selected} onToggle={onSelect ? toggleSel : undefined} />
      )}
    </div>
  );
}

function Viewer({ photos, index, onIndex, onClose, onRate, selected, onToggle }: {
  photos: SessionPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void;
  onRate?: (p: SessionPhoto, stars: number) => void; selected?: string[]; onToggle?: (n: string) => void;
}) {
  const p = photos[index];
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIndex(Math.min(photos.length - 1, index + 1));
      else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
      else if (/^[0-5]$/.test(e.key) && onRate) onRate(p, Number(e.key)); // as in Lightroom: 1–5 stars, 0 = none
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [index, photos.length, p, onClose, onIndex, onRate]);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black animate-fade">
      <div className="flex items-center justify-between px-5 py-3 text-mist-200">
        <span className="font-mono text-[15px]">{fmtPhoto(p.number)} <span className="text-mist-500">· {index + 1} / {photos.length}</span></span>
        <div className="flex items-center gap-4">
          {(onRate || p.rating > 0) && <span title="Note : touches 1 à 5, 0 pour retirer"><Stars value={p.rating} onRate={onRate && ((n) => onRate(p, n))} size="size-7" /></span>}
          {onToggle && <button type="button" className={cx('flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]', selected?.includes(p.number) ? 'border-gold-400 bg-gold-400 text-ink-950' : 'border-ink-500')} onClick={() => onToggle(p.number)}><Check className="size-4" />{selected?.includes(p.number) ? 'Choisie' : 'Choisir'}</button>}
          <button type="button" title="Fermer (Échap)" onClick={onClose}><X className="size-6" /></button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6">
        <PhotoImg key={p.id} photo={p} thumb={false} className="max-h-full max-w-full object-contain" />
        {index > 0 && <button type="button" className="absolute left-3 rounded-full bg-white/10 p-2 hover:bg-white/20" onClick={() => onIndex(index - 1)}><ChevronLeft className="size-6" /></button>}
        {index < photos.length - 1 && <button type="button" className="absolute right-3 rounded-full bg-white/10 p-2 hover:bg-white/20" onClick={() => onIndex(index + 1)}><ChevronRight className="size-6" /></button>}
      </div>
    </div>, document.body);
}
