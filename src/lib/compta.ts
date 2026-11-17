/**
 * Micro-entreprise bookkeeping helpers (pure): declaration periods, due dates, prorated ceilings.
 * URSSAF: the CA to declare is the CA ENCAISSÉ during the period (deposits included, on their date).
 */
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00Z');

export const lastDayOfMonth = (iso: string) => { const d = parse(iso); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))); };
export const addDays = (iso: string, n: number) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
/** Declaration (monthly or quarterly) due by the last day of the month following the period. */
export const dueDateOf = (periodEnd: string) => { const d = parse(periodEnd); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0, 12))); };

/**
 * Next period to declare: starts the day after the last declared period (or at the activity start),
 * ends at the end of the last complete month (monthly) or quarter (quarterly) before `today`.
 */
export function suggestPeriod(lastEnd: string | null, activityStart: string, today: string, frequency: 'mensuelle' | 'trimestrielle') {
  const start = lastEnd ? addDays(lastEnd, 1) : activityStart;
  const t = parse(today);
  let end = ymd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0, 12))); // end of previous month
  if (frequency === 'trimestrielle') { const q = Math.floor(t.getUTCMonth() / 3) * 3; end = ymd(new Date(Date.UTC(t.getUTCFullYear(), q, 0, 12))); }
  if (end < start) end = lastDayOfMonth(start);
  return { start, end, due: dueDateOf(end) };
}

/** A yearly ceiling is prorated in the year the activity started (days of activity / days of the year). */
export function proratedCeiling(ceiling: number, year: number, activityStart?: string | null) {
  if (!activityStart || !activityStart.startsWith(String(year))) return ceiling;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const days = (Date.UTC(year + 1, 0, 1) - parse(activityStart).getTime()) / 86400000 + 0.5;
  return Math.round((ceiling * Math.min(daysInYear, Math.max(0, Math.round(days)))) / daysInYear);
}

/** URSSAF asks for amounts in whole euros. */
export const toEuros = (cents: number) => Math.round(cents / 100);
