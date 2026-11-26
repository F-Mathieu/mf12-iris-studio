/**
 * Tableau de bord — « Actions requises » : ce qui attend une action de votre part depuis trop longtemps
 * (complète « À faire » — dates à venir — et « Relances & avis » — e-mails aux clients, sans les répéter).
 * Délais réglables dans Paramètres ; chaque action peut être reportée ou ignorée (réglage `actions_snoozed`).
 */
import { getSettings, sel, setSetting } from './base';
import { addDays } from '../lib/compta';
import { todayIso } from '../lib/ids';

export type ActionKind = 'brouillon' | 'livraison' | 'urgent' | 'fournisseur' | 'seance' | 'sauvegarde';
export interface RequiredAction { key: string; kind: ActionKind; title: string; detail: string | null; since: string; days: number; late: boolean; link: string | null }

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  urgent: 'Tâche urgente', livraison: 'À livrer', brouillon: 'Panier non validé', fournisseur: 'Commande fournisseur', seance: 'Séance sans suite', sauvegarde: 'Sauvegarde',
};

/** Delays (days) and their settings keys. */
export const ACTION_DELAYS = {
  brouillon: { key: 'action_draft_days', def: 3, label: 'Panier en brouillon non validé depuis' },
  livraison: { key: 'action_delivery_days', def: 21, label: 'Commande validée non livrée depuis' },
  fournisseur: { key: 'action_supplier_days', def: 10, label: 'Commande fournisseur non reçue depuis' },
  seance: { key: 'action_session_days', def: 7, label: 'Séance passée avec familles sans commande depuis' },
  sauvegarde: { key: 'action_backup_days', def: 7, label: 'Aucune sauvegarde depuis' },
} as const;

const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86400000));

type Snoozed = Record<string, string>; // key → hidden until (YYYY-MM-DD), '9999-12-31' = ignored
const readSnoozed = (s: Record<string, string>): Snoozed => { try { return JSON.parse(s.actions_snoozed || '{}'); } catch { return {}; } };

export async function requiredActions(today = todayIso()): Promise<{ list: RequiredAction[]; hidden: number }> {
  const s = await getSettings();
  const d = (k: keyof typeof ACTION_DELAYS) => { const n = Number(s[ACTION_DELAYS[k].key]); return Number.isFinite(n) && n > 0 ? n : ACTION_DELAYS[k].def; };
  const out: RequiredAction[] = [];
  const push = (a: Omit<RequiredAction, 'days' | 'late'>, delay: number) => {
    const days = daysBetween(a.since, today);
    out.push({ ...a, days, late: a.kind === 'urgent' || a.kind === 'sauvegarde' || days >= delay * 2 });
  };
  const notWedding = 'NOT EXISTS (SELECT 1 FROM weddings w WHERE w.order_id=o.id)';

  // carts left as drafts (weddings have their own quote flow)
  for (const o of await sel<{ id: string; number: string; family: string; session: string; updated_at: string; total_cents: number }>(
    `SELECT o.id, o.number, f.name family, s.name session, o.updated_at, o.total_cents FROM orders o JOIN families f ON f.id=o.family_id JOIN sessions s ON s.id=o.session_id
     WHERE o.status='brouillon' AND substr(o.updated_at,1,10) <= ? AND ${notWedding}`, [addDays(today, -d('brouillon'))]))
    push({ key: `brouillon:${o.id}`, kind: 'brouillon', title: `${o.family} — panier ${o.number} non validé`, detail: `${o.session}${o.total_cents ? ` · ${(o.total_cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}` : ''}`, since: o.updated_at, link: `/vente/commande/${o.id}` }, d('brouillon'));

  // validated orders still not delivered (some production left)
  for (const o of await sel<{ id: string; number: string; family: string; validated_at: string; open: number }>(
    `SELECT o.id, o.number, f.name family, o.validated_at,
       (SELECT count(*) FROM production_tasks t WHERE t.order_id=o.id AND t.deleted_at IS NULL AND t.status<>'livre') open
     FROM orders o JOIN families f ON f.id=o.family_id
     WHERE o.status='validee' AND o.delivered_at IS NULL AND substr(o.validated_at,1,10) <= ? AND ${notWedding}`, [addDays(today, -d('livraison'))]))
    if (o.open > 0) push({ key: `livraison:${o.id}`, kind: 'livraison', title: `${o.family} — commande ${o.number} pas encore livrée`, detail: `${o.open} tâche(s) en cours`, since: o.validated_at, link: `/commandes/${o.id}` }, d('livraison'));

  // tasks marked « Urgent » in postproduction
  for (const t of await sel<{ id: string; order_id: string; family: string; what: string | null; updated_at: string }>(
    `SELECT t.id, t.order_id, f.name family, COALESCE(c.style_name, i.product_name) what, t.updated_at
     FROM production_tasks t JOIN orders o ON o.id=t.order_id JOIN families f ON f.id=o.family_id
     LEFT JOIN order_compositions c ON c.id=t.composition_id LEFT JOIN order_items i ON i.id=t.order_item_id
     WHERE t.priority=2 AND t.deleted_at IS NULL AND t.status<>'livre' AND o.status='validee'`))
    push({ key: `urgent:${t.id}`, kind: 'urgent', title: `${t.family} — ${t.what ?? 'tâche'} (urgent)`, detail: 'Postproduction', since: t.updated_at, link: '/postproduction' }, 0);

  // supplier orders placed but not received
  for (const so of await sel<{ id: string; supplier: string; reference: string | null; ordered_at: string }>(
    `SELECT so.id, su.name supplier, so.reference, so.ordered_at FROM supplier_orders so JOIN suppliers su ON su.id=so.supplier_id
     WHERE so.status='commandee' AND so.ordered_at IS NOT NULL AND substr(so.ordered_at,1,10) <= ?`, [addDays(today, -d('fournisseur'))]))
    push({ key: `fournisseur:${so.id}`, kind: 'fournisseur', title: `${so.supplier}${so.reference ? ` (${so.reference})` : ''} — commande non reçue`, detail: 'Postproduction → Impressions & fournisseurs', since: so.ordered_at, link: '/postproduction' }, d('fournisseur'));

  // past sessions (last 90 days) with families received but no order and not marked « traité »
  for (const se of await sel<{ id: string; name: string; date: string; n: number }>(
    `SELECT s.id, s.name, s.date, count(*) n FROM sessions s JOIN session_registrations r ON r.session_id=s.id
     WHERE s.date BETWEEN ? AND ? AND NOT EXISTS (SELECT 1 FROM weddings w WHERE w.session_id=s.id)
       AND r.appt_status NOT IN ('absent','annule') AND r.done_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.registration_id=r.id AND o.status<>'annulee')
     GROUP BY s.id`, [addDays(today, -90), addDays(today, -d('seance'))]))
    push({ key: `seance:${se.id}`, kind: 'seance', title: `Séance « ${se.name} » — ${se.n} famille(s) sans commande`, detail: 'Rendez-vous de vente à planifier, ou cochez « commande traitée »', since: se.date, link: `/seances/${se.id}` }, d('seance'));

  // backups (the data lives only on this Mac)
  const last = s.last_backup?.slice(0, 10);
  if (!last || last <= addDays(today, -d('sauvegarde')))
    out.push({ key: `sauvegarde:${last ?? 'jamais'}`, kind: 'sauvegarde', title: last ? `Aucune sauvegarde depuis le ${last.split('-').reverse().join('/')}` : 'Aucune sauvegarde enregistrée', detail: 'Paramètres → Sauvegardes (copie sur un disque externe ou iCloud conseillée)', since: last ?? today, days: last ? daysBetween(last, today) : 0, late: true, link: '/parametres' });

  const snoozed = readSnoozed(s);
  const visible = out.filter((a) => !(snoozed[a.key] && snoozed[a.key] > today));
  visible.sort((a, b) => Number(b.late) - Number(a.late) || b.days - a.days);
  return { list: visible, hidden: out.length - visible.length };
}

/** Hides an action for `days` days (null = ignore it for good). Expired entries are pruned. */
export async function snoozeAction(key: string, days: number | null, today = todayIso()) {
  const s = await getSettings();
  const snoozed = Object.fromEntries(Object.entries(readSnoozed(s)).filter(([, until]) => until > today));
  snoozed[key] = days == null ? '9999-12-31' : addDays(today, days);
  await setSetting('actions_snoozed', JSON.stringify(snoozed));
}
export const showAllActions = () => setSetting('actions_snoozed', '{}');
