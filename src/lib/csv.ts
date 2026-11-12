/** CSV helpers — Excel (FR) compatible: UTF-8 BOM, ';' separator, CRLF. */
import Papa from 'papaparse';

export const REGISTRATION_COLUMNS = [
  'Référence inscription', 'Nom de famille', 'Prénom du contact', 'Téléphone', 'E-mail',
  'Date du rendez-vous', 'Heure du rendez-vous', 'Nombre de participants',
  'Participant 1', 'Participant 2', 'Participant 3', 'Participant 4', 'Participant 5', 'Notes',
] as const;

export const REGISTRATION_HELP =
  'Séparateur point-virgule, encodage UTF-8. Date : JJ/MM/AAAA (ou AAAA-MM-JJ). Heure : HH:MM (ou 14h30). ' +
  'Seul « Nom de famille » est obligatoire. Pour conserver les zéros initiaux dans Excel, formatez les colonnes Téléphone et Référence en « Texte ».';

const BOM = '﻿';
function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** Builds a CSV string (with BOM). */
export function toCsv(headers: readonly string[], rows: unknown[][]): string {
  return BOM + [headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
export const registrationTemplate = () => toCsv(REGISTRATION_COLUMNS, []);

/** Decodes file bytes: UTF-8 (with/without BOM), falling back to Windows-1252 (old Excel exports). */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export const normHeader = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseCsv(text: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { delimiter: '', skipEmptyLines: 'greedy' });
  return res.data.map((r) => r.map((c) => (c ?? '').toString()));
}

/** Removes Excel text artefacts: ="0612", '0612 */
export const cleanCell = (s: string) => s.trim().replace(/^="(.*)"$/, '$1').replace(/^'/, '').trim();

export function normalizePhone(raw: string): { value: string; fixed: boolean } {
  const s = cleanCell(raw);
  if (!s) return { value: '', fixed: false };
  const digits = s.replace(/[^\d+]/g, '');
  // French mobile/landline whose leading zero was eaten by Excel (9 digits).
  if (/^[1-9]\d{8}$/.test(digits)) return { value: '0' + digits, fixed: true };
  return { value: s, fixed: false };
}

export function parseDate(raw: string): string | null {
  const s = cleanCell(raw);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) [d, mo, y] = [+m[1], +m[2], +m[3] < 100 ? 2000 + +m[3] : +m[3]];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseTime(raw: string): string | null {
  const s = cleanCell(raw).toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\s*[:h]\s*(\d{2})?(?::\d{2})?$/);
  if (!m) return null;
  const h = +m[1], mi = +(m[2] ?? 0);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

export interface ImportRow {
  line: number;
  ref: string;
  lastName: string;
  firstName: string;
  phone: string;
  email: string;
  date: string | null;
  time: string | null;
  count: number | null;
  participants: string[];
  notes: string;
  errors: string[];
  warnings: string[];
}
export interface ParsedImport {
  rows: ImportRow[];
  missingColumns: string[];
  fatal: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRegistrationCsv(text: string): ParsedImport {
  const data = parseCsv(text);
  if (!data.length) return { rows: [], missingColumns: [...REGISTRATION_COLUMNS], fatal: 'Le fichier est vide.' };
  const header = data[0].map(normHeader);
  const idx: Record<string, number> = {};
  const missing: string[] = [];
  for (const col of REGISTRATION_COLUMNS) {
    const i = header.indexOf(normHeader(col));
    if (i < 0) missing.push(col);
    else idx[col] = i;
  }
  if (idx['Nom de famille'] === undefined)
    return { rows: [], missingColumns: missing, fatal: 'Colonne obligatoire « Nom de famille » introuvable. Utilisez le modèle CSV fourni.' };
  const get = (r: string[], c: (typeof REGISTRATION_COLUMNS)[number]) => (idx[c] === undefined ? '' : cleanCell(r[idx[c]] ?? ''));

  const rows: ImportRow[] = [];
  const seenRef = new Map<string, number>();
  const seenKey = new Map<string, number>();
  data.slice(1).forEach((r, i) => {
    if (r.every((c) => !cleanCell(c))) return;
    const line = i + 2;
    const errors: string[] = [], warnings: string[] = [];
    const lastName = get(r, 'Nom de famille');
    if (!lastName) errors.push('Nom de famille manquant');
    const ph = normalizePhone(get(r, 'Téléphone'));
    if (ph.fixed) warnings.push(`Zéro initial du téléphone restauré (${ph.value})`);
    const email = get(r, 'E-mail');
    if (email && !EMAIL.test(email)) warnings.push('E-mail invalide (ignoré)');
    const rawDate = get(r, 'Date du rendez-vous');
    const date = parseDate(rawDate);
    if (rawDate && !date) errors.push(`Date invalide « ${rawDate} » (JJ/MM/AAAA attendu)`);
    const rawTime = get(r, 'Heure du rendez-vous');
    const time = parseTime(rawTime);
    if (rawTime && !time) errors.push(`Heure invalide « ${rawTime} » (HH:MM attendu)`);
    const participants = (['Participant 1', 'Participant 2', 'Participant 3', 'Participant 4', 'Participant 5'] as const)
      .map((c) => get(r, c)).filter(Boolean);
    const rawCount = get(r, 'Nombre de participants');
    let count: number | null = null;
    if (rawCount) {
      const n = Number(rawCount);
      if (!Number.isInteger(n) || n < 0 || n > 50) errors.push(`Nombre de participants invalide « ${rawCount} »`);
      else count = n;
    }
    if (count != null && participants.length > count) warnings.push(`${participants.length} prénoms pour ${count} participant(s) annoncé(s)`);
    if (count == null && participants.length) count = participants.length;
    const ref = get(r, 'Référence inscription');
    if (ref) {
      if (seenRef.has(ref)) errors.push(`Référence en double dans le fichier (ligne ${seenRef.get(ref)})`);
      else seenRef.set(ref, line);
    }
    const key = `${lastName.toLowerCase()}|${ph.value.replace(/\D/g, '')}|${email.toLowerCase()}`;
    if (lastName && (ph.value || email) && seenKey.has(key)) warnings.push(`Doublon probable de la ligne ${seenKey.get(key)}`);
    else seenKey.set(key, line);
    rows.push({
      line, ref, lastName, firstName: get(r, 'Prénom du contact'), phone: ph.value,
      email: email && EMAIL.test(email) ? email : '', date, time, count, participants,
      notes: get(r, 'Notes'), errors, warnings,
    });
  });
  return { rows, missingColumns: missing, fatal: rows.length ? null : 'Aucune ligne de données.' };
}
