import { auditStmt, batch, insertStmt, like, nowIso, one, sel, uid, updateStmt } from './base';
import type { Stmt } from '../lib/db/types';

export interface Participant { id: string; family_id: string; first_name: string; notes: string | null; sort: number; refs?: FileRef[] }
export interface FileRef { id: string; participant_id: string; session_id: string | null; reference: string; file_path: string | null; notes: string | null }
export interface Family {
  id: string; name: string; contact_first_name: string | null; phone: string | null; email: string | null;
  notes: string | null; created_at: string; updated_at: string;
}
export interface FamilyRow extends Family { participants_count: number; sessions_count: number; orders_count: number }

export async function searchFamilies(q = '', limit = 200): Promise<FamilyRow[]> {
  const where = q.trim()
    ? `WHERE f.name LIKE ? OR f.contact_first_name LIKE ? OR replace(f.phone,' ','') LIKE ? OR f.email LIKE ?
       OR EXISTS (SELECT 1 FROM session_registrations r WHERE r.family_id=f.id AND r.external_ref LIKE ?)
       OR EXISTS (SELECT 1 FROM participants p JOIN file_references fr ON fr.participant_id=p.id WHERE p.family_id=f.id AND (fr.reference LIKE ? OR p.first_name LIKE ?))`
    : '';
  const l = like(q), lp = like(q.replace(/\s/g, ''));
  return sel<FamilyRow>(
    `SELECT f.*, (SELECT count(*) FROM participants p WHERE p.family_id=f.id) participants_count,
       (SELECT count(*) FROM session_registrations r WHERE r.family_id=f.id) sessions_count,
       (SELECT count(*) FROM orders o WHERE o.family_id=f.id AND o.status<>'annulee') orders_count
     FROM families f ${where} ORDER BY f.name COLLATE NOCASE LIMIT ${limit}`,
    q.trim() ? [l, l, lp, l, l, l, l] : [],
  );
}

export async function getFamily(id: string) {
  const f = await one<Family>('SELECT * FROM families WHERE id=?', [id]);
  if (!f) return null;
  const participants = await sel<Participant>('SELECT * FROM participants WHERE family_id=? ORDER BY sort, first_name', [id]);
  const refs = await sel<FileRef>(
    'SELECT fr.* FROM file_references fr JOIN participants p ON p.id=fr.participant_id WHERE p.family_id=? ORDER BY fr.reference', [id]);
  participants.forEach((p) => (p.refs = refs.filter((r) => r.participant_id === p.id)));
  const sessions = await sel<{ id: string; name: string; date: string; reg_id: string; appt_status: string; external_ref: string | null }>(
    `SELECT s.id, s.name, s.date, r.id reg_id, r.appt_status, r.external_ref FROM session_registrations r JOIN sessions s ON s.id=r.session_id
     WHERE r.family_id=? ORDER BY s.date DESC`, [id]);
  const orders = await sel<{ id: string; number: string; status: string; total_cents: number; session_name: string; created_at: string; paid_cents: number }>(
    `SELECT o.id, o.number, o.status, o.total_cents, o.created_at, s.name session_name,
       COALESCE((SELECT sum(amount_cents) FROM payments p WHERE p.order_id=o.id),0) paid_cents
     FROM orders o JOIN sessions s ON s.id=o.session_id WHERE o.family_id=? ORDER BY o.created_at DESC`, [id]);
  return { family: f, participants, sessions, orders };
}

export interface FamilyInput {
  name: string; contact_first_name?: string | null; phone?: string | null; email?: string | null; notes?: string | null;
  participants?: { id?: string; first_name: string; notes?: string | null; refs?: { id?: string; reference: string; file_path?: string | null; session_id?: string | null }[] }[];
}

/** Statements to create or update a family with its participants (participants not listed are removed). */
export function familyStmts(id: string | null, input: FamilyInput, existingParticipantIds: string[] = []): { id: string; stmts: Stmt[] } {
  const now = nowIso();
  const fid = id ?? uid();
  const base = {
    name: input.name.trim(), contact_first_name: input.contact_first_name?.trim() || null,
    phone: input.phone?.trim() || null, email: input.email?.trim() || null, notes: input.notes?.trim() || null, updated_at: now,
  };
  const stmts: Stmt[] = [id ? updateStmt('families', fid, base) : insertStmt('families', { id: fid, ...base, created_at: now })];
  if (input.participants) {
    const keep = new Set(input.participants.map((p) => p.id).filter(Boolean));
    for (const pid of existingParticipantIds) if (!keep.has(pid)) stmts.push({ sql: 'DELETE FROM participants WHERE id=?', params: [pid] });
    input.participants.forEach((p, i) => {
      const pid = p.id ?? uid();
      if (p.id) stmts.push(updateStmt('participants', pid, { first_name: p.first_name.trim(), notes: p.notes ?? null, sort: i }));
      else stmts.push(insertStmt('participants', { id: pid, family_id: fid, first_name: p.first_name.trim(), notes: p.notes ?? null, sort: i }));
      if (p.refs) {
        stmts.push({ sql: `DELETE FROM file_references WHERE participant_id=? AND id NOT IN (${p.refs.filter((r) => r.id).map(() => '?').join(',') || "''"})`, params: [pid, ...p.refs.filter((r) => r.id).map((r) => r.id!)] });
        for (const r of p.refs) {
          if (!r.reference.trim()) continue;
          if (r.id) stmts.push(updateStmt('file_references', r.id, { reference: r.reference.trim(), file_path: r.file_path ?? null }));
          else stmts.push(insertStmt('file_references', { id: uid(), participant_id: pid, session_id: r.session_id ?? null, reference: r.reference.trim(), file_path: r.file_path ?? null, created_at: now }));
        }
      }
    });
  }
  return { id: fid, stmts };
}

export async function saveFamily(id: string | null, input: FamilyInput): Promise<string> {
  if (!input.name.trim()) throw new Error('Le nom de famille est obligatoire.');
  const existing = id ? (await sel<{ id: string }>('SELECT id FROM participants WHERE family_id=?', [id])).map((r) => r.id) : [];
  const { id: fid, stmts } = familyStmts(id, input, existing);
  stmts.push(auditStmt('family', fid, id ? 'update' : 'create', { name: input.name }));
  await batch(stmts);
  return fid;
}

/** Deletes a family and all personal data, refused if orders exist (they are business records). */
export async function deleteFamily(id: string) {
  const o = await one<{ n: number }>('SELECT count(*) n FROM orders WHERE family_id=?', [id]);
  if (o && o.n > 0) throw new Error(`Cette famille possède ${o.n} commande(s) : suppression impossible. Vous pouvez anonymiser ses coordonnées.`);
  await batch([{ sql: 'DELETE FROM families WHERE id=?', params: [id] }, auditStmt('family', id, 'delete')]);
}

/** Removes personal contact data while keeping orders (droit à l'effacement compatible with accounting). */
export async function anonymizeFamily(id: string) {
  await batch([
    { sql: "UPDATE families SET name='Famille anonymisée', contact_first_name=NULL, phone=NULL, email=NULL, notes=NULL, updated_at=? WHERE id=?", params: [nowIso(), id] },
    { sql: "UPDATE participants SET first_name='—', notes=NULL WHERE family_id=?", params: [id] },
    auditStmt('family', id, 'anonymize'),
  ]);
}

/** Potential duplicates: same name with same phone or email, or same phone. */
export async function findDuplicateFamilies() {
  return sel<{ a: string; b: string; a_name: string; b_name: string; reason: string }>(
    `SELECT f1.id a, f2.id b, f1.name a_name, f2.name b_name,
       CASE WHEN f1.phone IS NOT NULL AND replace(f1.phone,' ','')=replace(f2.phone,' ','') THEN 'Même téléphone' ELSE 'Même nom et e-mail' END reason
     FROM families f1 JOIN families f2 ON f1.id < f2.id
     WHERE (f1.phone IS NOT NULL AND f1.phone<>'' AND replace(f1.phone,' ','')=replace(f2.phone,' ',''))
        OR (lower(f1.name)=lower(f2.name) AND f1.email IS NOT NULL AND lower(f1.email)=lower(f2.email))
     LIMIT 100`);
}

/** Merges family `drop` into `keep` (registrations, orders, participants move). */
export async function mergeFamilies(keep: string, drop: string) {
  await batch([
    { sql: 'UPDATE OR IGNORE session_registrations SET family_id=? WHERE family_id=?', params: [keep, drop] },
    { sql: 'UPDATE orders SET family_id=? WHERE family_id=?', params: [keep, drop] },
    { sql: 'UPDATE participants SET family_id=? WHERE family_id=?', params: [keep, drop] },
    { sql: 'DELETE FROM families WHERE id=?', params: [drop] },
    auditStmt('family', keep, 'merge', { merged: drop }),
  ]);
}
