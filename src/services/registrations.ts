import { auditStmt, batch, insertStmt, nowIso, one, sel, uid, updateStmt } from './base';
import { familyStmts, type FamilyInput } from './families';
import type { Stmt } from '../lib/db/types';
import type { ImportRow } from '../lib/csv';

export type ApptStatus = 'a_venir' | 'present' | 'en_cours' | 'termine' | 'absent' | 'annule';
export const APPT_STATUS: Record<ApptStatus, string> = {
  a_venir: 'À venir', present: 'Présent', en_cours: 'En cours', termine: 'Terminé', absent: 'Absent', annule: 'Annulé',
};
export interface RegistrationRow {
  id: string; session_id: string; family_id: string; external_ref: string | null; participants_count: number | null;
  notes: string | null; appt_date: string | null; appt_time: string | null; appt_duration: number | null; appt_status: ApptStatus;
  family_name: string; contact_first_name: string | null; phone: string | null; email: string | null;
  participant_names: string | null; nb_participants: number;
  order_id: string | null; order_status: string | null; order_total: number | null; paid_cents: number | null;
}

export async function listRegistrations(sessionId: string): Promise<RegistrationRow[]> {
  return sel<RegistrationRow>(
    `SELECT r.*, f.name family_name, f.contact_first_name, f.phone, f.email,
       (SELECT group_concat(first_name, ', ') FROM (SELECT first_name FROM participants p WHERE p.family_id=f.id ORDER BY sort)) participant_names,
       (SELECT count(*) FROM participants p WHERE p.family_id=f.id) nb_participants,
       o.id order_id, o.status order_status, o.total_cents order_total,
       (SELECT COALESCE(sum(amount_cents),0) FROM payments pa WHERE pa.order_id=o.id) paid_cents
     FROM session_registrations r JOIN families f ON f.id=r.family_id
     LEFT JOIN orders o ON o.id = (SELECT id FROM orders o2 WHERE o2.session_id=r.session_id AND o2.family_id=r.family_id AND o2.status<>'annulee' ORDER BY (o2.status='validee') DESC, o2.updated_at DESC LIMIT 1)
     WHERE r.session_id=? ORDER BY COALESCE(r.appt_date,''), COALESCE(r.appt_time,'99:99'), f.name COLLATE NOCASE`, [sessionId]);
}

export interface RegistrationInput {
  external_ref?: string | null; participants_count?: number | null; notes?: string | null;
  appt_date?: string | null; appt_time?: string | null; appt_duration?: number | null; appt_status?: ApptStatus;
}

/** Adds a family (new or existing) to a session. */
export async function addRegistration(sessionId: string, family: { id?: string; input?: FamilyInput }, reg: RegistrationInput = {}) {
  const stmts: Stmt[] = [];
  let familyId = family.id;
  if (!familyId) {
    if (!family.input?.name.trim()) throw new Error('Le nom de famille est obligatoire.');
    const f = familyStmts(null, family.input); familyId = f.id; stmts.push(...f.stmts);
  } else {
    const dup = await one('SELECT id FROM session_registrations WHERE session_id=? AND family_id=?', [sessionId, familyId]);
    if (dup) throw new Error('Cette famille est déjà inscrite à la séance.');
  }
  const id = uid(), now = nowIso();
  stmts.push(insertStmt('session_registrations', { id, session_id: sessionId, family_id: familyId, ...reg, appt_status: reg.appt_status ?? 'a_venir', created_at: now, updated_at: now }));
  stmts.push(auditStmt('registration', id, 'create', { sessionId, familyId }));
  await batch(stmts);
  return { id, familyId };
}

export const updateRegistration = (id: string, data: RegistrationInput) =>
  batch([updateStmt('session_registrations', id, { ...data, updated_at: nowIso() }), auditStmt('registration', id, 'update', data)]);

export async function deleteRegistration(id: string) {
  const r = await one<{ session_id: string; family_id: string }>('SELECT session_id, family_id FROM session_registrations WHERE id=?', [id]);
  if (!r) return;
  const o = await one<{ n: number }>("SELECT count(*) n FROM orders WHERE session_id=? AND family_id=? AND status<>'annulee'", [r.session_id, r.family_id]);
  if (o && o.n > 0) throw new Error('Cette inscription possède une commande : annulez-la avant de retirer la famille.');
  await batch([{ sql: 'DELETE FROM session_registrations WHERE id=?', params: [id] }, auditStmt('registration', id, 'delete', r)]);
}

/* ------------------------------------------------------------------ CSV import */

export type ConflictAction = 'ignore' | 'update' | 'create';
export interface ImportPlanRow {
  row: ImportRow;
  /** new: brand new family+registration; link: existing family (other session) gets a registration;
   *  conflict: already registered in this session (same ref or same family) */
  kind: 'new' | 'link' | 'conflict' | 'error';
  familyId?: string; registrationId?: string; existingLabel?: string;
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export async function planImport(sessionId: string, rows: ImportRow[]): Promise<ImportPlanRow[]> {
  const regs = await sel<{ id: string; family_id: string; external_ref: string | null; name: string; phone: string | null; email: string | null }>(
    `SELECT r.id, r.family_id, r.external_ref, f.name, f.phone, f.email FROM session_registrations r JOIN families f ON f.id=r.family_id WHERE r.session_id=?`, [sessionId]);
  const fams = await sel<{ id: string; name: string; phone: string | null; email: string | null }>('SELECT id, name, phone, email FROM families');
  const same = (a: { name: string; phone: string | null; email: string | null }, r: ImportRow) =>
    a.name.trim().toLowerCase() === r.lastName.trim().toLowerCase() &&
    ((!!r.phone && digits(a.phone) === digits(r.phone)) || (!!r.email && (a.email ?? '').toLowerCase() === r.email.toLowerCase()));
  return rows.map((row) => {
    if (row.errors.length) return { row, kind: 'error' };
    const reg = regs.find((g) => (row.ref && g.external_ref === row.ref)) ?? regs.find((g) => same(g, row));
    if (reg) return { row, kind: 'conflict', familyId: reg.family_id, registrationId: reg.id, existingLabel: `${reg.name}${reg.external_ref ? ' · ' + reg.external_ref : ''}` };
    const fam = fams.find((f) => same(f, row));
    if (fam) return { row, kind: 'link', familyId: fam.id, existingLabel: fam.name };
    return { row, kind: 'new' };
  });
}

/** Applies the plan in ONE transaction. Never touches orders. */
export async function applyImport(sessionId: string, plan: ImportPlanRow[], decisions: Record<number, ConflictAction>) {
  const stmts: Stmt[] = [];
  const now = nowIso();
  const stats = { created: 0, linked: 0, updated: 0, ignored: 0, errors: 0 };
  const regFields = (r: ImportRow, withRef = true) => ({
    external_ref: withRef ? r.ref || null : null, participants_count: r.count, notes: r.notes || null,
    appt_date: r.date, appt_time: r.time,
  });
  const familyInput = (r: ImportRow): FamilyInput => ({
    name: r.lastName, contact_first_name: r.firstName, phone: r.phone, email: r.email,
    participants: r.participants.map((p) => ({ first_name: p })),
  });
  for (const p of plan) {
    const r = p.row;
    if (p.kind === 'error') { stats.errors++; continue; }
    const action: ConflictAction = p.kind === 'conflict' ? decisions[r.line] ?? 'ignore' : 'create';
    if (p.kind === 'conflict' && action === 'ignore') { stats.ignored++; continue; }
    if (p.kind === 'conflict' && action === 'update') {
      // Update contact & appointment; add missing participants by first name; never delete anything.
      const fam: Record<string, string | null> = { updated_at: now };
      if (r.firstName) fam.contact_first_name = r.firstName;
      if (r.phone) fam.phone = r.phone;
      if (r.email) fam.email = r.email;
      stmts.push(updateStmt('families', p.familyId!, fam));
      r.participants.forEach((name, i) => stmts.push({
        sql: `INSERT INTO participants (id, family_id, first_name, sort) SELECT ?,?,?,? WHERE NOT EXISTS
              (SELECT 1 FROM participants WHERE family_id=? AND lower(first_name)=lower(?))`,
        params: [uid(), p.familyId!, name, 100 + i, p.familyId!, name],
      }));
      const reg: Record<string, string | number | null> = { updated_at: now };
      const f = regFields(r);
      for (const [k, v] of Object.entries(f)) if (v != null && v !== '') reg[k] = v as string | number;
      stmts.push(updateStmt('session_registrations', p.registrationId!, reg));
      stats.updated++;
      continue;
    }
    // 'new' | 'link' | conflict→'create' (explicit confirmation: new family + registration, ref suffixed if taken)
    let familyId = p.kind === 'link' ? p.familyId! : undefined;
    if (!familyId) { const f = familyStmts(null, familyInput(r)); familyId = f.id; stmts.push(...f.stmts); }
    else r.participants.forEach((name, i) => stmts.push({
      sql: `INSERT INTO participants (id, family_id, first_name, sort) SELECT ?,?,?,? WHERE NOT EXISTS
            (SELECT 1 FROM participants WHERE family_id=? AND lower(first_name)=lower(?))`,
      params: [uid(), familyId!, name, 100 + i, familyId!, name],
    }));
    const refTaken = p.kind === 'conflict' && !!r.ref;
    stmts.push(insertStmt('session_registrations', {
      id: uid(), session_id: sessionId, family_id: familyId, ...regFields(r),
      external_ref: refTaken ? `${r.ref}-bis-${r.line}` : r.ref || null, appt_status: 'a_venir', created_at: now, updated_at: now,
    }));
    if (p.kind === 'link') stats.linked++; else stats.created++;
  }
  stmts.push(auditStmt('session', sessionId, 'csv_import', stats));
  await batch(stmts);
  return stats;
}
