/** Layout sketches of the creations of a cart (for the quote and the selection recap). */
import type { Cart } from './orders';
import { adviceFor, isPortrait, parseDims, visualIris } from '../lib/formatsGuide';
import type { CompositionSketch } from '../lib/pdfSketch';

export function compositionSketches(cart: Pick<Cart, 'compositions' | 'items'>, singleVisual: Set<string> = new Set()): CompositionSketch[] {
  return cart.compositions.map((c) => {
    const single = !!c.styleId && singleVisual.has(c.styleId);
    const n = Math.max(1, visualIris(c.irisCount, single));
    const print = cart.items.find((i) => i.compositionKey === c.key && i.category === 'impression' && !i.parentKey && parseDims(i.variantName));
    let dims: [number, number] = print ? parseDims(print.variantName)!
      : !single && c.orientation === 'ligne' ? [n * 20, 25] : !single && c.orientation === 'colonne' ? [n * 20, 25] : adviceFor(n)?.format ?? [60, 40];
    if (!single && isPortrait(c.orientation)) dims = [dims[1], dims[0]];
    const names = (c.participantNames || '').split(', ').map((x) => x.trim()).filter(Boolean);
    return {
      style: c.styleName, iris: n, orientation: single ? null : c.orientation ?? null,
      names: single ? [names.join(' · ') || 'Iris'] : Array.from({ length: n }, (_, i) => names[i] ?? `Iris ${i + 1}`),
      format: dims, formatLabel: print ? `${print.productName} ${print.variantName}` : null,
    };
  });
}
