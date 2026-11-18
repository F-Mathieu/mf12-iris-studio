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

describe('dispositions en ligne / en colonne', () => {
  it('4 iris côte à côte : une seule rangée, même hauteur, sans chevauchement', () => {
    const { circles } = arrangementFor(4, 60, 20, 'ligne');
    expect(new Set(circles.map((c) => c.y)).size).toBe(1);
    for (let i = 1; i < 4; i++) expect(circles[i].x - circles[i - 1].x).toBeGreaterThanOrEqual(circles[i].r * 2);
    expect(circles.every((c) => c.x - c.r >= 0 && c.x + c.r <= 60 && c.y - c.r >= 0 && c.y + c.r <= 20)).toBe(true);
  });
  it('en colonne : une seule colonne ; groupée horizontale reste en 2 + 2', () => {
    expect(new Set(arrangementFor(3, 20, 60, 'colonne').circles.map((c) => c.x)).size).toBe(1);
    expect(arrangementFor(4, 40, 40, 'horizontal').rows).toEqual([2, 2]);
  });
});

import { offersMailBody, offersMailSubject } from '../lib/invoiceMail';
describe('e-mail « offres de la séance »', () => {
  it('objet, prénom, séance, pas de variable restante', () => {
    expect(offersMailSubject('Tempsdanses')).toBe('Vos créations iris – Tempsdanses – MF/1.2');
    const b = offersMailBody({ firstName: 'Pauline', client: 'Pauline Bischoff', session: 'Tempsdanses', signature: 'MF/1.2' });
    expect(b.startsWith('Bonjour Pauline,')).toBe(true);
    expect(b).toContain('« Tempsdanses »');
    expect(b).toContain('devis');
    expect(b).not.toMatch(/\{\w+\}/);
  });
});

import { microCharges, microFromSettings, MICRO_DEFAULTS } from '../lib/micro';
describe('micro-entreprise : cotisations sur le CA', () => {
  it('tout en prestations : 21,2 % de tout le CA, achats compris', () => {
    const c = microCharges(100000, 30000, 100000, MICRO_DEFAULTS); // 1 000 € de CA dont 300 € d’impressions revendues
    expect(c).toMatchObject({ caServices: 100000, caSales: 0, social: 21200, tax: 0, total: 21200 });
  });
  it('mixte : impressions revendues à 12,3 %, le reste à 21,2 %, remises réparties ; versement libératoire', () => {
    const m = microFromSettings({ micro_mode: 'mixte', micro_vl: '1' });
    const c = microCharges(90000, 30000, 100000, m); // 100 € de remise sur 1 000 €
    expect(c.caSales).toBe(27000);
    expect(c.caServices).toBe(63000);
    expect(c.social).toBe(Math.round(63000 * 0.212) + Math.round(27000 * 0.123));
    expect(c.tax).toBe(Math.round(63000 * 0.017) + Math.round(27000 * 0.01));
  });
  it('taux saisis en % avec virgule ; valeur invalide → défaut', () => {
    expect(microFromSettings({ micro_services_rate: '25,6', micro_other_rate: '0,3' })).toMatchObject({ servicesBp: 2560, otherBp: 30 });
    expect(microFromSettings({ micro_services_rate: 'abc' }).servicesBp).toBe(2120);
  });
});

import { dueDateOf, proratedCeiling, suggestPeriod, toEuros } from '../lib/compta';
describe('compta : périodes URSSAF et seuils', () => {
  it('1re déclaration : du début d’activité à la fin du mois précédent ; ensuite mois par mois', () => {
    expect(suggestPeriod(null, '2026-09-15', '2026-12-05', 'mensuelle')).toEqual({ start: '2026-09-15', end: '2026-11-30', due: '2026-12-31' });
    expect(suggestPeriod('2026-11-30', '2026-09-15', '2027-01-03', 'mensuelle')).toEqual({ start: '2026-12-01', end: '2026-12-31', due: '2027-01-31' });
    expect(suggestPeriod('2026-12-31', '2026-09-15', '2027-04-02', 'trimestrielle').end).toBe('2027-03-31');
  });
  it('échéance = dernier jour du mois suivant ; montants à l’euro', () => {
    expect(dueDateOf('2027-01-31')).toBe('2027-02-28');
    expect(toEuros(123449)).toBe(1234);
    expect(toEuros(123450)).toBe(1235);
  });
  it('seuils au prorata l’année de création', () => {
    expect(proratedCeiling(3750000, 2026, '2026-07-02')).toBe(Math.round(3750000 * 183 / 365));
    expect(proratedCeiling(3750000, 2027, '2026-07-02')).toBe(3750000);
  });
});

describe('numéros de photos', async () => {
  const { photoNumber, parsePhotoNumbers, fmtPhoto, photosMissing, normName } = await import('../lib/photos');
  it('lit le n° dans le nom de fichier Lightroom', () => {
    expect(photoNumber('012.jpg')).toBe('12');
    expect(photoNumber('Martin-021.JPG')).toBe('21');
    expect(photoNumber('/Users/x/Séance 2026/Martin/IMG_0045.jpeg')).toBe('45');
    expect(photoNumber('couverture.jpg')).toBeNull();
    expect(fmtPhoto('7')).toBe('007');
  });
  it('liste saisie ou copiée depuis Lightroom / Pic-Time', () => {
    expect(parsePhotoNumbers('12, 15 18-20\n012.jpg;Martin-021.jpg')).toEqual(['12', '15', '18', '19', '20', '21']);
    expect(parsePhotoNumbers('"001.jpg","002.jpg"')).toEqual(['1', '2']);
    expect(parsePhotoNumbers('')).toEqual([]);
  });
  it('photos à choisir', () => {
    expect(photosMissing({ qty: 5, photosPerUnit: 1, photos: ['1', '2'] })).toBe(3);
    expect(photosMissing({ qty: 2, photosPerUnit: 5, photos: ['1'] })).toBe(9); // 2 packs of 5 photos
    expect(photosMissing({ qty: 1, photosPerUnit: 0, photos: null })).toBe(0); // all the photos
    expect(photosMissing({ qty: 3, photosPerUnit: null })).toBe(0);
    expect(normName('Dupont-Martin Élodie')).toBe('dupont martin elodie');
  });
});

describe('export Lightroom', async () => {
  const { lightroomText, photosText } = await import('../lib/photos');
  it('noms de fichiers sans extension, séparés par des virgules', () => {
    expect(lightroomText([{ number: '1234', file_name: '_DSC1234.jpg' }, { number: '7', file_name: null }])).toBe('_DSC1234, 007');
  });
  it('orientation du tirage dans le texte des documents', () => {
    expect(photosText({ qty: 1, photosPerUnit: 1, photos: ['12'], printOrientation: 'vertical' })).toBe('photos 012 · format vertical');
    expect(photosText({ qty: 1, photosPerUnit: null, printOrientation: 'horizontal' })).toBe('format horizontal');
  });
});
