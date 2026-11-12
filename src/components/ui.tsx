import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { centsToInput, parseEuros } from '../lib/money';

export const cx = (...c: (string | number | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------------------------------------------------------------- Button */
type Variant = 'primary' | 'gold' | 'ghost' | 'outline' | 'danger' | 'subtle';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-mist-100 text-ink-950 hover:bg-white',
  gold: 'bg-gold-500 text-ink-950 hover:bg-gold-400 shadow-[0_8px_24px_-10px_rgba(195,162,101,0.7)]',
  ghost: 'text-mist-200 hover:bg-ink-700/60 hover:text-mist-100',
  outline: 'border border-ink-600 text-mist-100 hover:border-ink-500 hover:bg-ink-750',
  danger: 'bg-red-500/10 text-red-300 border border-red-500/25 hover:bg-red-500/20',
  subtle: 'bg-ink-700/70 text-mist-100 hover:bg-ink-600',
};
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; loading?: boolean }
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'outline', size = 'md', icon, loading, className, children, disabled, ...p }, ref) {
  const sz = size === 'sm' ? 'h-8 px-3 text-[13px] gap-1.5' : size === 'lg' ? 'h-12 px-6 text-[15px] gap-2.5' : 'h-9.5 px-4 text-[13.5px] gap-2';
  return (
    <button ref={ref} {...p} disabled={disabled || loading}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 cursor-default', sz, VARIANTS[variant], className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});
export function IconButton({ className, title, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button title={title} aria-label={title} {...p} className={cx('inline-flex size-8 items-center justify-center rounded-lg text-mist-300 transition hover:bg-ink-700 hover:text-mist-100 disabled:opacity-30', className)}>{children}</button>;
}

/* ---------------------------------------------------------------- Inputs */
const field = 'rounded-lg border border-ink-600 bg-ink-850 px-3 text-[13.5px] text-mist-100 placeholder:text-mist-400/70 outline-none transition focus:border-gold-500/70 focus:ring-2 focus:ring-gold-500/15 disabled:opacity-50';
const W = (c?: string) => (/(^|\s)w-/.test(c ?? '') ? '' : 'w-full');
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(field, W(className), 'h-9.5', className)} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} rows={3} {...p} className={cx(field, W(className), 'py-2 leading-relaxed', className)} />;
});
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(field, W(className), 'h-9.5 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 fill=%27none%27 stroke=%27%238d8b86%27 stroke-width=%272%27%3E%3Cpath d=%27M3 4.5l3 3 3-3%27/%3E%3C/svg%3E")] bg-[right_10px_center] bg-no-repeat pr-8', className)}>{children}</select>;
}
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[12px] font-medium tracking-wide text-mist-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-mist-400">{hint}</span>}
    </label>
  );
}
/** Euro input bound to integer cents. Never reformats while the user is typing (only on blur). */
export function MoneyInput({ value, onChange, className, placeholder = '0,00', ...p }: { value: number | null | undefined; onChange: (c: number | null) => void; className?: string; placeholder?: string; autoFocus?: boolean; onBlur?: () => void; onKeyDown?: (e: React.KeyboardEvent) => void }) {
  const [txt, setTxt] = useState(centsToInput(value));
  const [err, setErr] = useState(false);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) { setTxt(centsToInput(value)); setErr(false); } }, [value]);
  return (
    <div className={cx('relative', className)}>
      <input {...p} value={txt} placeholder={placeholder} inputMode="decimal"
        onFocus={(e) => { focused.current = true; e.target.select(); }}
        onChange={(e) => { setTxt(e.target.value); const c = e.target.value.trim() ? parseEuros(e.target.value) : null; setErr(e.target.value.trim() !== '' && c == null); if (c !== null || !e.target.value.trim()) onChange(c); }}
        onBlur={() => { focused.current = false; if (!err) setTxt(centsToInput(txt.trim() ? parseEuros(txt) : null)); p.onBlur?.(); }}
        className={cx(field, 'w-full h-9.5 pr-7 text-right tabular', err && 'border-red-400/70')} />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-mist-400">€</span>
    </div>
  );
}
export function SearchInput({ value, onChange, placeholder = 'Rechercher…', className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mist-400" />
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(field, 'w-full h-9.5 pl-9')} />
      {value && <button onClick={() => onChange('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-mist-400 hover:text-mist-100"><X className="size-3.5" /></button>}
    </div>
  );
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5 text-[13px] text-mist-200">
      <span className={cx('relative h-5 w-9 rounded-full transition', checked ? 'bg-gold-500' : 'bg-ink-600')}>
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}
export function Stepper({ value, onChange, min = 1, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex h-8 items-center rounded-lg border border-ink-600 bg-ink-850">
      <button className="h-full w-8 text-mist-300 hover:text-white disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="w-7 text-center text-[13px] tabular">{value}</span>
      <button className="h-full w-8 text-mist-300 hover:text-white disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

/* ---------------------------------------------------------------- Surfaces */
export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return <div onClick={onClick} className={cx('rounded-2xl border border-ink-700/80 bg-ink-850 shadow-soft', onClick && 'cursor-pointer transition hover:border-ink-600 hover:bg-ink-800', className)}>{children}</div>;
}
export function CardHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 border-b border-ink-700/70 px-5 py-3.5', className)}>
      <div className="min-w-0"><div className="truncate text-[14px] font-semibold">{title}</div>{subtitle && <div className="mt-0.5 text-[12px] text-mist-400">{subtitle}</div>}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
const TONES = {
  neutral: 'bg-ink-700/80 text-mist-200', gold: 'bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/25', green: 'bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-500/20',
  red: 'bg-red-500/12 text-red-300 ring-1 ring-red-500/20', blue: 'bg-sky-500/12 text-sky-300 ring-1 ring-sky-500/20', amber: 'bg-amber-500/12 text-amber-300 ring-1 ring-amber-500/20',
  violet: 'bg-violet-500/12 text-violet-300 ring-1 ring-violet-500/20',
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium', TONES[tone], className)}>{children}</span>;
}
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <button onClick={back} className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-mist-400 hover:text-mist-100"><ChevronLeft className="size-4" />Retour</button>}
        <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight text-mist-100">{title}</h1>
        {subtitle && <div className="mt-2 text-[13px] text-mist-400">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <Card className="px-5 py-4">
      <div className="text-[11.5px] font-medium tracking-wider text-mist-400 uppercase">{label}</div>
      <div className={cx('mt-2 text-[24px] font-semibold tracking-tight tabular', accent && 'text-gold-400')}>{value}</div>
      {sub && <div className="mt-1 text-[12px] text-mist-400">{sub}</div>}
    </Card>
  );
}
export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-ink-750 text-gold-400">{icon}</div>}
      <div className="text-[15px] font-semibold">{title}</div>
      {text && <div className="mt-1.5 max-w-md text-[13px] text-mist-400">{text}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('size-5 animate-spin text-mist-400', className)} />;
export function Loading() { return <div className="flex h-48 items-center justify-center"><Spinner /></div>; }

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto border-b border-ink-700/80', className)}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cx('relative -mb-px whitespace-nowrap px-3.5 py-2.5 text-[13.5px] font-medium transition', value === t.id ? 'text-mist-100' : 'text-mist-400 hover:text-mist-200')}>
          {t.label}{t.count != null && <span className="ml-1.5 text-[11.5px] text-mist-400">{t.count}</span>}
          {value === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gold-500" />}
        </button>
      ))}
    </div>
  );
}
export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-600 bg-ink-850 p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={cx('rounded-md px-3 py-1.5 text-[12.5px] font-medium transition', value === o.id ? 'bg-ink-600 text-mist-100' : 'text-mist-400 hover:text-mist-200')}>{o.label}</button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Modal */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6 backdrop-blur-sm animate-fade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('flex max-h-[90vh] w-full flex-col rounded-2xl border border-ink-600/80 bg-ink-850 shadow-2xl animate-pop', w)}>
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-6 py-4">
          <div><div className="text-[16px] font-semibold">{title}</div>{subtitle && <div className="mt-0.5 text-[12.5px] text-mist-400">{subtitle}</div>}</div>
          <IconButton title="Fermer" onClick={onClose}><X className="size-4" /></IconButton>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-700 px-6 py-3.5">{footer}</div>}
      </div>
    </div>, document.body);
}

/* ---------------------------------------------------------------- Confirm (promise based) */
interface ConfirmOpts { title: string; text?: ReactNode; confirm?: string; danger?: boolean; input?: { label: string; placeholder?: string; required?: boolean } }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<string | false>>(async () => false);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: string | false) => void }) | null>(null);
  const [txt, setTxt] = useState('');
  const ask = useCallback((o: ConfirmOpts) => new Promise<string | false>((resolve) => { setTxt(''); setState({ ...o, resolve }); }), []);
  const close = (v: string | false) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title} size="sm"
        footer={<><Button variant="ghost" onClick={() => close(false)}>Annuler</Button>
          <Button variant={state?.danger ? 'danger' : 'gold'} disabled={!!state?.input?.required && !txt.trim()} onClick={() => close(txt || 'ok')}>{state?.confirm ?? 'Confirmer'}</Button></>}>
        {state?.text && <div className="text-[13.5px] leading-relaxed text-mist-200">{state.text}</div>}
        {state?.input && <Field label={state.input.label} className="mt-4"><Input autoFocus value={txt} placeholder={state.input.placeholder} onChange={(e) => setTxt(e.target.value)} /></Field>}
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

/* ---------------------------------------------------------------- DataTable */
export interface Column<T> { key: string; header: ReactNode; cell: (r: T) => ReactNode; sort?: (r: T) => string | number | null; className?: string; align?: 'right' | 'center' }
export function DataTable<T>({ rows, columns, rowKey, onRowClick, pageSize = 50, empty, initialSort, dense }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; pageSize?: number; empty?: ReactNode; initialSort?: { key: string; dir: 1 | -1 }; dense?: boolean;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows.length]);
  const sorted = useMemo(() => {
    const c = sort && columns.find((x) => x.key === sort.key);
    if (!c?.sort) return rows;
    return [...rows].sort((a, b) => {
      const va = c.sort!(a), vb = c.sort!(b);
      if (va == null) return 1; if (vb == null) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr', { numeric: true })) * sort!.dir;
    });
  }, [rows, sort, columns]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);
  if (!rows.length) return <>{empty ?? <Empty title="Aucun élément" />}</>;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[11.5px] tracking-wider text-mist-400 uppercase">
              {columns.map((c) => (
                <th key={c.key} className={cx('px-4 py-2.5 font-medium whitespace-nowrap', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.sort && 'cursor-pointer hover:text-mist-200', c.className)}
                  onClick={() => c.sort && setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>
                  {c.header}{sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="ml-1 inline size-3" /> : <ArrowDown className="ml-1 inline size-3" />)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={rowKey(r)} onClick={() => onRowClick?.(r)} className={cx('border-b border-ink-700/50 transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-ink-750/70')}>
                {columns.map((c) => <td key={c.key} className={cx('px-4', dense ? 'py-2' : 'py-3', c.align === 'right' && 'text-right tabular', c.align === 'center' && 'text-center', c.className)}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-ink-700/60 px-4 py-2.5 text-[12.5px] text-mist-400">
          <span>{sorted.length} éléments</span>
          <div className="flex items-center gap-2">
            <IconButton title="Précédent" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></IconButton>
            <span className="tabular">{page + 1} / {pages}</span>
            <IconButton title="Suivant" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></IconButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Data hook */
/** Async loader with reload; errors surface as toast by caller. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean; error: Error | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const s = ++seq.current;
    try { const d = await fnRef.current(); if (s === seq.current) { setData(d); setError(null); } }
    catch (e) { if (s === seq.current) setError(e as Error); console.error(e); }
    finally { if (s === seq.current) setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); reload(); }, deps);
  return { data, loading, error, reload };
}
export function useDebounced<T>(v: T, ms = 200) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
export function ErrorBox({ error }: { error: Error | null }) {
  if (!error) return null;
  return <div className="rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-[13px] text-red-200">{error.message}</div>;
}
