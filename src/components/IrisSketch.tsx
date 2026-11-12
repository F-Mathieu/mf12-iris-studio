import { useMemo, useState } from 'react';
import { Badge, Button, Modal, Segmented, cx } from './ui';
import { FORMAT_GUIDE, arrangementFor, dimsLabel, parseDims, type FormatAdvice, type Orientation } from '../lib/formatsGuide';

const COLORS = ['#d39b4a', '#6fa3c4', '#8fae62', '#b07fb8', '#e0956b', '#8aa6d6', '#c9b25a', '#6fb5a3'];

/** Schematic (not a reproduction) of n iris laid out in a w × h frame. */
export function IrisSketch({ n, w, h, width = 160, frame = true, className, orientation }: { n: number; w: number; h: number; width?: number; frame?: boolean; className?: string; orientation?: Orientation | null }) {
  const { circles } = useMemo(() => arrangementFor(Math.max(1, n), w, h, orientation), [n, w, h, orientation]);
  const rays = Array.from({ length: 28 }, (_, i) => (i * Math.PI * 2) / 28);
  const stroke = Math.max(w, h) * 0.012;
  return (
    <svg viewBox={`${-stroke} ${-stroke} ${w + stroke * 2} ${h + stroke * 2}`} width={width} height={(width * (h + stroke * 2)) / (w + stroke * 2)} className={className} role="img" aria-label={`Croquis ${n} iris, ${w} × ${h} cm`}>
      <rect x={0} y={0} width={w} height={h} fill="#10161f" stroke={frame ? '#a8875a' : 'none'} strokeWidth={stroke} rx={stroke * 0.6} />
      {circles.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={c.r} fill={COLORS[i % COLORS.length]} />
          {rays.map((a, k) => (
            <line key={k} x1={c.x + Math.cos(a) * c.r * 0.42} y1={c.y + Math.sin(a) * c.r * 0.42} x2={c.x + Math.cos(a) * c.r * 0.97} y2={c.y + Math.sin(a) * c.r * 0.97}
              stroke="#ffffff" strokeOpacity={0.35} strokeWidth={c.r * 0.035} />
          ))}
          <circle cx={c.x} cy={c.y} r={c.r * 0.34} fill="#0b0b0c" />
        </g>
      ))}
    </svg>
  );
}

/** The six cards of the formats guide (1 to 6 iris). */
export function FormatGuideDialog({ open, onClose, current }: { open: boolean; onClose: () => void; current?: number | null }) {
  return (
    <Modal open={open} onClose={onClose} size="xl" title="Choisir le bon format selon le nombre d’iris" subtitle="Schémas indicatifs : proportions et disposition, non reproductions exactes.">
      <div className="grid grid-cols-3 gap-4">
        {FORMAT_GUIDE.map((g) => <GuideCard key={g.iris} g={g} active={g.iris === current} />)}
      </div>
      <div className="mt-4 text-[12.5px] text-mist-400">Vertical : inverser largeur et hauteur pour une composition en colonne.</div>
    </Modal>
  );
}

function GuideCard({ g, active }: { g: FormatAdvice; active: boolean }) {
  return (
    <div className={cx('rounded-2xl border p-4', active ? 'border-gold-500/70 bg-gold-500/[0.06]' : 'border-ink-700 bg-ink-850')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold tracking-wider text-gold-400">{g.iris} IRIS</div>
          <div className="text-[20px] font-semibold">{dimsLabel(g.format)}</div>
          <div className="text-[12px] text-mist-400">{g.shape}</div>
        </div>
        <IrisSketch n={g.iris} w={g.format[0]} h={g.format[1]} width={130} />
      </div>
      <div className="mt-3 text-[13px] text-mist-100">{g.layout}</div>
      {g.altText && <div className="mt-1 text-[12px] text-mist-400">{g.altText}</div>}
      {g.highlight && <div className="mt-2 text-[11px] font-semibold tracking-wider text-gold-400 uppercase">{g.highlight}</div>}
    </div>
  );
}

/**
 * Size viewer: the print drawn to scale on a wall above a 3-seat sofa (≈ 200 × 85 cm),
 * with an A4 sheet for reference. Helps clients picture the real size.
 */
export function SizeViewer({ open, onClose, formats, initial, n, orientation }: { open: boolean; onClose: () => void; formats: { label: string; dims: [number, number]; tag?: string }[]; initial?: string; n: number; orientation?: Orientation | null }) {
  const [sel, setSel] = useState(initial ?? formats[0]?.label);
  const [orient, setOrient] = useState<'h' | 'v'>(orientation === 'vertical' ? 'v' : 'h');
  const f = formats.find((x) => x.label === sel) ?? formats[0];
  if (!f) return null;
  const [W, H] = orient === 'h' ? f.dims : [f.dims[1], f.dims[0]];
  // Scene in cm: wall 260 × 170, sofa 200 × 85 at the bottom, print centred 25 cm above the sofa back.
  const SW = 300, SH = 175, sofaW = 200, sofaH = 82, sofaX = (SW - sofaW) / 2, sofaY = SH - sofaH;
  const px = (SW - W) / 2, py = Math.max(6, sofaY - 22 - H);
  const a4 = [21, 29.7];
  return (
    <Modal open={open} onClose={onClose} size="xl" title="Visualiser la taille" subtitle="Dessin à l’échelle : le tableau au-dessus d’un canapé 3 places (≈ 2 m) — feuille A4 pour comparaison.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {formats.map((x) => (
          <Button key={x.label} size="sm" variant={x.label === f.label ? 'gold' : 'subtle'} onClick={() => setSel(x.label)}>
            {x.label}{x.tag && <Badge tone={x.label === f.label ? 'neutral' : 'gold'} className="ml-1">{x.tag}</Badge>}
          </Button>
        ))}
        <div className="flex-1" />
        {f.dims[0] !== f.dims[1] && <Segmented value={orient} onChange={setOrient} options={[{ id: 'h', label: 'Horizontal' }, { id: 'v', label: 'Vertical' }]} />}
      </div>
      <div className="overflow-hidden rounded-2xl border border-ink-700">
        <svg viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="xMidYMid meet" className="mx-auto block max-h-[52vh] w-full" style={{ background: 'linear-gradient(#ece6dc, #ddd5c8)' }}>
          <line x1={0} y1={SH - 2} x2={SW} y2={SH - 2} stroke="#bfb5a6" strokeWidth={1} />
          {/* sofa */}
          <g fill="#6d6a66">
            <rect x={sofaX} y={sofaY + 8} width={sofaW} height={sofaH - 22} rx={6} />
            <rect x={sofaX - 6} y={sofaY + 24} width={16} height={sofaH - 32} rx={5} />
            <rect x={sofaX + sofaW - 10} y={sofaY + 24} width={16} height={sofaH - 32} rx={5} />
            <rect x={sofaX + 8} y={sofaY + 36} width={sofaW - 16} height={sofaH - 50} rx={4} fill="#7d7a75" />
            <rect x={sofaX + 12} y={SH - 14} width={4} height={12} fill="#4a4743" />
            <rect x={sofaX + sofaW - 16} y={SH - 14} width={4} height={12} fill="#4a4743" />
          </g>
          {/* A4 reference */}
          <g>
            <rect x={sofaX + sofaW + 16} y={sofaY - a4[1] - 10} width={a4[0]} height={a4[1]} fill="#ffffff" stroke="#a49b8e" strokeWidth={0.4} />
            <text x={sofaX + sofaW + 16 + a4[0] / 2} y={sofaY - 4} fontSize={4.2} textAnchor="middle" fill="#7d7468">A4</text>
          </g>
          {/* print, to scale */}
          <g transform={`translate(${px} ${py})`}>
            <rect x={0.8} y={1.2} width={W} height={H} fill="#000" opacity={0.18} />
            <foreignObject x={0} y={0} width={W} height={H}>
              <IrisSketch n={n} w={W} h={H} width={W} orientation={orientation === 'diagonale' ? 'diagonale' : null} />
            </foreignObject>
          </g>
          <text x={SW / 2} y={py + H + 6} fontSize={4.6} textAnchor="middle" fill="#5d564d">{W} × {H} cm</text>
        </svg>
      </div>
      <div className="mt-3 text-[12.5px] text-mist-400">Repère : une feuille A4 mesure 21 × 29,7 cm. {f.dims[0] * f.dims[1] > 0 && `Ce format représente environ ${((f.dims[0] * f.dims[1]) / (21 * 29.7)).toFixed(1).replace('.', ',')} feuilles A4.`}</div>
    </Modal>
  );
}

export const variantDims = (name: string | null | undefined, format?: string | null) => parseDims(format) ?? parseDims(name);
