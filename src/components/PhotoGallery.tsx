import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, ImageOff, Star, X } from 'lucide-react';
import { cx } from './ui';
import { photoUrl, type SessionPhoto } from '../services/photos';
import { fmtPhoto } from '../lib/photos';

/** Lazily loaded image of a session photo (thumbnail or preview, files outside the database). */
export function PhotoImg({ photo, thumb = true, className }: { photo: SessionPhoto; thumb?: boolean; className?: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => { let on = true; photoUrl(photo, thumb).then((u) => on && setUrl(u)); return () => { on = false; }; }, [photo.id, thumb]);
  if (url === undefined) return <div className={cx('animate-pulse bg-ink-800', className)} />;
  if (!url) return <div className={cx('flex items-center justify-center bg-ink-800 text-mist-500', className)} title="Aperçu absent : ré-importez la photo"><ImageOff className="size-5" /></div>;
  return <img src={url} alt={fmtPhoto(photo.number)} className={className} draggable={false} />;
}

/**
 * Grid of a family's photos: favorites (star), full-screen viewer (← → keys), optional selection of numbers
 * (to put photos on a cart line). Fluid with 30 photos: thumbnails 400 px, previews 1600 px loaded on demand.
 */
export function PhotoGallery({ photos, onFavorite, selected, onSelect, max, big }: {
  photos: SessionPhoto[]; onFavorite?: (p: SessionPhoto, on: boolean) => void;
  selected?: string[]; onSelect?: (numbers: string[]) => void; max?: number; big?: boolean;
}) {
  const [view, setView] = useState<number | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const list = favOnly ? photos.filter((p) => p.favorite) : photos;
  const toggleSel = (n: string) => {
    if (!onSelect || !selected) return;
    if (selected.includes(n)) onSelect(selected.filter((x) => x !== n));
    else if (!max || selected.length < max) onSelect([...selected, n]);
    else if (max === 1) onSelect([n]);
  };
  const favs = photos.filter((p) => p.favorite).length;
  return (
    <div>
      {favs > 0 && (
        <div className="mb-3 flex gap-2 text-[12.5px]">
          <button type="button" className={cx('rounded-full border px-3 py-1', !favOnly ? 'border-gold-500/70 text-gold-200' : 'border-ink-600 text-mist-400')} onClick={() => setFavOnly(false)}>Toutes ({photos.length})</button>
          <button type="button" className={cx('flex items-center gap-1 rounded-full border px-3 py-1', favOnly ? 'border-gold-500/70 text-gold-200' : 'border-ink-600 text-mist-400')} onClick={() => setFavOnly(true)}><Star className="size-3.5" />Favoris ({favs})</button>
        </div>
      )}
      <div className={cx('grid gap-2.5', big ? 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(130px,1fr))]')}>
        {list.map((p, i) => {
          const sel = selected?.includes(p.number);
          return (
            <div key={p.id} className={cx('group relative overflow-hidden rounded-lg border bg-ink-900', sel ? 'border-gold-400 ring-2 ring-gold-400/60' : 'border-ink-700')}>
              <button type="button" className="block w-full" onClick={() => (onSelect ? toggleSel(p.number) : setView(i))} onDoubleClick={() => setView(i)}>
                <PhotoImg photo={p} className="aspect-[3/2] w-full object-contain" />
              </button>
              <div className={cx('flex items-center justify-between px-2 py-1 text-[12px]', onSelect && 'cursor-pointer')} onClick={() => onSelect && toggleSel(p.number)}>
                <span className="font-mono text-mist-300">{fmtPhoto(p.number)}</span>
                <span className="flex items-center gap-1">
                  {onSelect && <button type="button" title="Agrandir" className="text-mist-500 hover:text-mist-200" onClick={(e) => { e.stopPropagation(); setView(i); }}>⤢</button>}
                  {onFavorite ? <button type="button" title={p.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={(e) => { e.stopPropagation(); onFavorite(p, !p.favorite); }}><Star className={cx(big ? 'size-6' : 'size-4', p.favorite ? 'fill-gold-400 text-gold-400' : 'text-mist-500 hover:text-gold-300')} /></button>
                    : p.favorite ? <Star className="size-3.5 fill-gold-400 text-gold-400" /> : null}
                </span>
              </div>
              {sel && <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-gold-400 text-ink-950"><Check className="size-4" /></span>}
            </div>
          );
        })}
      </div>
      {view != null && list[view] && (
        <Viewer photos={list} index={view} onIndex={setView} onClose={() => setView(null)} onFavorite={onFavorite}
          selected={selected} onToggle={onSelect ? toggleSel : undefined} />
      )}
    </div>
  );
}

function Viewer({ photos, index, onIndex, onClose, onFavorite, selected, onToggle }: {
  photos: SessionPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void;
  onFavorite?: (p: SessionPhoto, on: boolean) => void; selected?: string[]; onToggle?: (n: string) => void;
}) {
  const p = photos[index];
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIndex(Math.min(photos.length - 1, index + 1));
      else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
      else if ((e.key === ' ' || e.key === 'f') && onFavorite) { e.preventDefault(); onFavorite(p, !p.favorite); }
      // as in Lightroom: 1–5 = star, 0 = no star
      else if (/^[1-5]$/.test(e.key) && onFavorite && !p.favorite) onFavorite(p, true);
      else if (e.key === '0' && onFavorite && p.favorite) onFavorite(p, false);
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [index, photos.length, p, onClose, onIndex, onFavorite]);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black animate-fade">
      <div className="flex items-center justify-between px-5 py-3 text-mist-200">
        <span className="font-mono text-[15px]">{fmtPhoto(p.number)} <span className="text-mist-500">· {index + 1} / {photos.length}</span></span>
        <div className="flex items-center gap-3">
          {onToggle && <button type="button" className={cx('flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]', selected?.includes(p.number) ? 'border-gold-400 bg-gold-400 text-ink-950' : 'border-ink-500')} onClick={() => onToggle(p.number)}><Check className="size-4" />{selected?.includes(p.number) ? 'Choisie' : 'Choisir'}</button>}
          {onFavorite && <button type="button" title="Favori (espace, ou 1 à 5 / 0 comme dans Lightroom)" className="flex items-center gap-1.5 rounded-full border border-ink-500 px-3 py-1 text-[13px]" onClick={() => onFavorite(p, !p.favorite)}><Star className={cx('size-6', p.favorite ? 'fill-gold-400 text-gold-400' : 'text-mist-400')} />{p.favorite ? 'J’aime' : 'J’aime ?'}</button>}
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
