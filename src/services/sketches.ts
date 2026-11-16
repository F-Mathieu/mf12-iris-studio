/** Layout sketches of the creations of a cart (for the quote and the selection recap). */
import type { Cart } from './orders';
import { adviceFor, isPortrait, parseDims } from '../lib/formatsGuide';
import type { CompositionSketch } from '../lib/pdfSketch';

export function compositionSketches(cart: Pick<Cart, 'compositions' | 'items'>): CompositionSketch[] {
  return cart.compositions.map((c) => {
    const n = Math.max(1, c.irisCount);
    const print = cart.items.find((i) => i.compositionKey === c.key && i.category === 'impression' && !i.parentKey && parseDims(i.variantName));
    let dims: [number, number] = print ? parseDims(print.variantName)!
      : c.orientation === 'ligne' ? [n * 20, 25] : c.orientation === 'colonne' ? [n * 20, 25] : adviceFor(n)?.format ?? [60, 40];
    if (isPortrait(c.orientation)) dims = [dims[1], dims[0]];
    const names = (c.participantNames || '').split(', ').map((x) => x.trim()).filter(Boolean);
    return {
      style: c.styleName, iris: n, orientation: c.orientation ?? null,
      names: Array.from({ length: n }, (_, i) => names[i] ?? `Iris ${i + 1}`),
      format: dims, formatLabel: print ? `${print.productName} ${print.variantName}` : null,
    };
  });
}
