import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../lib/db';
import { getSetting, setSetting, sel } from './base';
import { toCsv } from '../lib/csv';

export interface BackupInfo { path: string; name: string; size: number; modified: number }

const need = () => { if (!isTauri()) throw new Error('Disponible uniquement dans l’application macOS.'); };

export async function backupNow(prefix = 'manuel', dest?: string): Promise<string> {
  need();
  const p = await invoke<string>('db_backup', { dest: dest ?? null, prefix });
  if (prefix === 'auto') await setSetting('last_auto_backup', new Date().toISOString());
  await setSetting('last_backup', new Date().toISOString());
  return p;
}
export const listBackups = () => (isTauri() ? invoke<BackupInfo[]>('list_backups') : Promise.resolve([]));
export const integrityCheck = () => (isTauri() ? invoke<string>('db_integrity') : Promise.resolve('ok'));
export const restoreBackup = (source: string) => { need(); return invoke<string>('db_restore', { source }); };
export const appPaths = () => (isTauri() ? invoke<{ dataDir: string; dbPath: string; backupsDir: string }>('app_paths') : Promise.resolve(null));

/** Automatic backup if the last one is older than `hours`; keeps the N most recent automatic backups. */
export async function autoBackupIfDue(hours = 12) {
  if (!isTauri() || (await getSetting('auto_backup', '1')) !== '1') return null;
  const last = await getSetting('last_auto_backup');
  if (last && Date.now() - new Date(last).getTime() < hours * 3600e3) return null;
  const p = await backupNow('auto');
  await invoke('prune_backups', { prefix: 'auto-', keep: Number(await getSetting('backup_keep', '20')) || 20 });
  return p;
}

/** CSV exports of the main data (personal data portability, accounting). */
export async function exportCsv(kind: 'familles' | 'commandes' | 'lignes' | 'paiements' | 'inscriptions'): Promise<string> {
  switch (kind) {
    case 'familles': {
      const r = await sel<Record<string, string>>(`SELECT f.name, f.contact_first_name, f.phone, f.email, f.notes,
        (SELECT group_concat(first_name, ', ') FROM participants p WHERE p.family_id=f.id) participants,
        (SELECT group_concat(fr.reference, ', ') FROM file_references fr JOIN participants p ON p.id=fr.participant_id WHERE p.family_id=f.id) refs, f.created_at
        FROM families f ORDER BY f.name`);
      return toCsv(['Nom', 'Prénom contact', 'Téléphone', 'E-mail', 'Notes', 'Participants', 'Références photos', 'Créée le'], r.map((x) => Object.values(x)));
    }
    case 'commandes': {
      const r = await sel<Record<string, string | number>>(`SELECT o.number, s.name, f.name fam, o.status, substr(o.created_at,1,10), o.subtotal_cents/100.0, o.discount_cents/100.0, o.total_cents/100.0,
        COALESCE((SELECT sum(amount_cents) FROM payments p WHERE p.order_id=o.id),0)/100.0 FROM orders o JOIN sessions s ON s.id=o.session_id JOIN families f ON f.id=o.family_id ORDER BY o.number`);
      return toCsv(['Numéro', 'Séance', 'Famille', 'Statut', 'Date', 'Sous-total €', 'Remises €', 'Total €', 'Encaissé €'], r.map((x) => Object.values(x).map(frNum)));
    }
    case 'lignes': {
      const r = await sel<Record<string, string | number>>(`SELECT o.number, f.name, i.product_name, i.variant_name, c.style_name, i.qty, i.unit_price_cents/100.0, i.line_total_cents/100.0
        FROM order_items i JOIN orders o ON o.id=i.order_id JOIN families f ON f.id=o.family_id LEFT JOIN order_compositions c ON c.id=i.composition_id WHERE o.status<>'annulee' ORDER BY o.number, i.sort`);
      return toCsv(['Commande', 'Famille', 'Produit', 'Variante', 'Création', 'Quantité', 'Prix unitaire €', 'Total €'], r.map((x) => Object.values(x).map(frNum)));
    }
    case 'paiements': {
      const r = await sel<Record<string, string | number>>(`SELECT o.number, f.name, p.paid_at, p.method, p.amount_cents/100.0, p.note FROM payments p JOIN orders o ON o.id=p.order_id JOIN families f ON f.id=o.family_id ORDER BY p.paid_at`);
      return toCsv(['Commande', 'Famille', 'Date', 'Mode', 'Montant €', 'Note'], r.map((x) => Object.values(x).map(frNum)));
    }
    case 'inscriptions': {
      const r = await sel<Record<string, string | number>>(`SELECT s.name, r.external_ref, f.name, f.contact_first_name, f.phone, f.email, r.appt_date, r.appt_time, r.appt_status FROM session_registrations r JOIN sessions s ON s.id=r.session_id JOIN families f ON f.id=r.family_id ORDER BY s.date, r.appt_time`);
      return toCsv(['Séance', 'Référence', 'Nom', 'Prénom', 'Téléphone', 'E-mail', 'Date RDV', 'Heure RDV', 'Statut'], r.map((x) => Object.values(x)));
    }
  }
}
const frNum = (v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2).replace('.', ',') : v);
