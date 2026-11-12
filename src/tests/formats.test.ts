import { describe, expect, it } from 'vitest';
import { adviceFor, arrangement, arrangementFor, parseDims, sameDims, FORMAT_GUIDE } from '../lib/formatsGuide';

describe('formats guide', () => {
  it('parses variant names in any orientation', () => {
    expect(parseDims('40 × 50 cm')).toEqual([50, 40]);
    expect(parseDims('60x40')).toEqual([60, 40]);
    expect(parseDims('Standard')).toBeNull();
    expect(sameDims(parseDims('20 × 30 cm'), [30, 20])).toBe(true);
  });
  it('recommendations from the guide (3 iris adapted to an Onelab format)', () => {
    expect(FORMAT_GUIDE.map((g) => g.iris)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(adviceFor(4)?.format).toEqual([40, 40]);
    expect(adviceFor(4)?.alt).toEqual([30, 30]);
    expect(adviceFor(3)?.format).toEqual([45, 30]);
    expect(adviceFor(7)).toBeNull();
  });
  it('layouts match the sketches: 2×2, 3+2, 3×2, triangle', () => {
    expect(arrangement(1, 20, 20).rows).toEqual([1]);
    expect(arrangement(2, 30, 20).rows).toEqual([2]);
    expect(arrangement(3, 45, 30).rows).toEqual([3]);
    expect(arrangement(3, 30, 30).rows).toEqual([2, 1]);
    expect(arrangement(4, 40, 40).rows).toEqual([2, 2]);
    expect(arrangement(5, 50, 40).rows).toEqual([3, 2]);
    expect(arrangement(6, 60, 40).rows).toEqual([3, 3]);
    const { circles } = arrangement(6, 60, 40);
    for (const c of circles) { expect(c.x - c.r).toBeGreaterThanOrEqual(0); expect(c.x + c.r).toBeLessThanOrEqual(60); expect(c.y + c.r).toBeLessThanOrEqual(40); }
  });
  it('dispositions: vertical = column, diagonal = along the diagonal, always inside the frame', () => {
    const v = arrangementFor(3, 30, 45, 'vertical').circles;
    expect(new Set(v.map((c) => Math.round(c.x))).size).toBe(1); // one column
    expect(v[0].y).toBeLessThan(v[2].y);
    const d = arrangementFor(3, 45, 45, 'diagonale').circles;
    expect(d[0].x).toBeLessThan(d[1].x); expect(d[0].y).toBeLessThan(d[1].y);
    for (const [w, h, cs] of [[30, 45, v], [45, 45, d]] as const)
      for (const c of cs) { expect(c.x - c.r).toBeGreaterThanOrEqual(-1e-9); expect(c.x + c.r).toBeLessThanOrEqual(w + 1e-9); expect(c.y + c.r).toBeLessThanOrEqual(h + 1e-9); }
    expect(arrangementFor(4, 40, 40, 'horizontal').rows).toEqual([2, 2]);
  });
});

import { invoiceMailBody, invoiceMailSubject, mailtoUrl } from '../lib/invoiceMail';
describe('e-mail de facture', () => {
  const d = {
    kind: 'facture', number: 'F2026-0007', date: '2026-11-12', saleDate: '2026-11-10',
    seller: { tradeName: 'MF/1.2', legalName: 'Jean Test', status: 'EI', address: 'x', siret: '1', registration: 'r' },
    client: { name: 'Léa Martin', email: 'lea@example.com' }, order: { number: 'C-1', session: 'Gala TEMPSDANSES' },
    lines: [], discounts: [], subtotal: 12000, discount: 0, total: 12000, paid: 5000, balance: 7000, payments: [],
  } as never;
  it('objet = Facture – séance – MF/1.2', () => expect(invoiceMailSubject(d)).toBe('Facture – Gala TEMPSDANSES – MF/1.2'));
  it('texte par défaut avec prénom, numéro, montant, solde, signature', () => {
    const b = invoiceMailBody(d, 'Léa');
    expect(b.startsWith('Bonjour Léa,')).toBe(true);
    expect(b).toContain('F2026-0007');
    expect(b).toContain('Gala TEMPSDANSES');
    expect(b).toMatch(/120,00\s€/);
    expect(b).toMatch(/Reste à régler : 70,00\s€/);
    expect(b).toContain('Jean Test');
    expect(b).not.toMatch(/\{\w+\}/);
  });
  it('texte personnalisé, sans prénom', () => {
    expect(invoiceMailBody(d, null, '{bonjour} {numero} {inconnu}')).toBe('Bonjour, F2026-0007 {inconnu}');
    expect(invoiceMailBody({ ...(d as object), balance: 0 } as never, '')).toContain('entièrement réglée');
  });
  it('mailto encodé', () => expect(mailtoUrl('a@b.fr', 'Facture – X', 'L1\nL2')).toBe('mailto:a%40b.fr?subject=Facture%20%E2%80%93%20X&body=L1%0AL2'));
});
