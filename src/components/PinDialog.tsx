import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button, Modal, cx } from './ui';
import { useApp } from '../store';

/** PIN keypad (screen buttons + keyboard / numeric keypad). onCode returns true when the code is accepted. */
export function PinDialog({ open, onClose, onCode, subtitle }: { open: boolean; onClose: () => void; onCode: (pin: string) => Promise<boolean>; subtitle: string }) {
  const { settings } = useApp();
  const len = (settings.client_pin || '1212').length;
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const pinRef = useRef('');
  const busy = useRef(false);
  const set = (v: string) => { pinRef.current = v; setPin(v); };
  const press = async (k: string) => {
    if (busy.current) return;
    if (k === 'del') { set(pinRef.current.slice(0, -1)); return; }
    const n = (pinRef.current + k).slice(0, len);
    set(n); setErr(false);
    if (n.length < len) return;
    busy.current = true;
    try {
      if (await onCode(n)) { set(''); onClose(); }
      else { setErr(true); set(''); }
    } finally { busy.current = false; }
  };
  // Physical keyboard / numeric keypad: digits, Backspace/Delete to correct (Escape closes via the modal).
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Physical position first: numeric keypad works even with Num Lock off (e.code Numpad0..9).
      const digit = /^(?:Numpad|Digit)([0-9])$/.exec(e.code)?.[1] ?? (/^[0-9]$/.test(e.key) ? e.key : null);
      if (digit) { e.preventDefault(); pressRef.current(digit); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); pressRef.current('del'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <Modal open={open} onClose={() => { set(''); onClose(); }} title="Code PIN" subtitle={`${subtitle} · clavier ou pavé numérique`} size="sm">
      <div className="flex flex-col items-center">
        <div className={cx('mb-5 flex h-10 gap-3', err && 'animate-pulse')}>{Array.from({ length: len }, (_, i) => <span key={i} className={cx('mt-3 size-3 rounded-full', i < pin.length ? 'bg-gold-400' : 'bg-ink-600')} />)}</div>
        {err && <div className="mb-3 text-[12.5px] text-red-300">Code incorrect</div>}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) => k === '' ? <span key="e" /> : (
            <Button key={k} variant="subtle" className="size-16 text-[20px]" onClick={() => press(k)}>{k === 'del' ? <X className="size-5" /> : k}</Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
