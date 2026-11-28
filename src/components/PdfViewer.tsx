/** Page of a supplier catalogue (PDF stored in the base), shown in the app — works offline and in client mode. */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { catalogDocBytes } from '../services/catalog';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: object) => { promise: Promise<void> } }> };
const docs = new Map<string, Promise<PdfDoc>>();
async function loadDoc(id: string): Promise<PdfDoc> {
  if (!docs.has(id)) docs.set(id, (async () => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const bytes = await catalogDocBytes(id);
    if (!bytes) throw new Error('Catalogue introuvable');
    return (await pdfjs.getDocument({ data: bytes }).promise) as unknown as PdfDoc;
  })().catch((e) => { docs.delete(id); throw e; }));
  return docs.get(id)!;
}

export function PdfViewer({ docId, page, title, onClose }: { docId: string; page: number; title?: string; onClose: () => void }) {
  const [n, setN] = useState(Math.max(1, page));
  const [total, setTotal] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let off = false;
    setBusy(true);
    loadDoc(docId).then(async (doc) => {
      if (off) return;
      setTotal(doc.numPages);
      const p = await doc.getPage(Math.min(n, doc.numPages));
      const el = canvas.current, b = box.current;
      if (!el || !b || off) return;
      const v1 = p.getViewport({ scale: 1 });
      const fit = Math.min((b.clientWidth - 24) / v1.width, (b.clientHeight - 24) / v1.height);
      const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: fit * dpr });
      el.width = vp.width; el.height = vp.height;
      el.style.width = `${vp.width / dpr}px`; el.style.height = `${vp.height / dpr}px`;
      await p.render({ canvasContext: el.getContext('2d')!, viewport: vp }).promise;
      if (!off) setBusy(false);
    }).catch((e) => { if (!off) { setErr(String(e?.message ?? e)); setBusy(false); } });
    return () => { off = true; };
  }, [docId, n]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setN((x) => (total ? Math.min(total, x + 1) : x + 1));
      if (e.key === 'ArrowLeft') setN((x) => Math.max(1, x - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [total, onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center gap-3 px-5 py-3 text-[13px] text-mist-200" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1 truncate font-medium">{title}</div>
        <button type="button" className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30" disabled={n <= 1} onClick={() => setN(n - 1)}><ChevronLeft className="size-5" /></button>
        <span className="tabular">Page {n}{total ? ` / ${total}` : ''}</span>
        <button type="button" className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30" disabled={!!total && n >= total} onClick={() => setN(n + 1)}><ChevronRight className="size-5" /></button>
        <button type="button" className="ml-3 rounded-lg p-1.5 hover:bg-white/10" onClick={onClose} title="Fermer (Échap)"><X className="size-5" /></button>
      </div>
      <div ref={box} className="relative flex min-h-0 flex-1 items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
        {err ? <div className="text-[13px] text-red-300">Impossible d’ouvrir le catalogue : {err}</div> : <canvas ref={canvas} className="rounded shadow-2xl" />}
        {busy && !err && <Loader2 className="absolute size-7 animate-spin text-gold-400" />}
      </div>
    </div>
  );
}
