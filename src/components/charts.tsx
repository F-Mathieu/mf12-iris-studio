import { eur } from '../lib/money';

/** Horizontal bar list (readable, no chart library). */
export function BarList({ data, money }: { data: { label: string; value: number; sub?: string }[]; money?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="py-6 text-center text-[13px] text-mist-400">Aucune donnée</div>;
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex justify-between text-[12.5px]"><span className="text-mist-200">{d.label}</span><span className="text-mist-400 tabular">{money ? eur(d.value) : d.value}{d.sub && ` · ${d.sub}`}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-700/70"><div className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-400" style={{ width: `${(d.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars for a time series. */
export function Columns({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="py-6 text-center text-[13px] text-mist-400">Aucune donnée</div>;
  return (
    <div className="flex h-44 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="group flex flex-1 flex-col items-center gap-1.5">
          <div className="text-[10.5px] text-mist-400 opacity-0 transition group-hover:opacity-100 tabular">{eur(d.value)}</div>
          <div className="w-full rounded-t-md bg-gradient-to-t from-gold-600/60 to-gold-400" style={{ height: `${Math.max(2, (d.value / max) * 130)}px` }} />
          <div className="text-[10.5px] text-mist-400">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
