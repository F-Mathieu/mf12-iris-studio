import type { ReactNode } from 'react';
import { deleteDraft, deleteOrder, orderDeletionImpact } from '../services/orders';
import { backupNow } from '../services/backup';
import { isTauri } from '../lib/db';
import { eur } from '../lib/money';
import { act } from '../lib/act';

type Confirm = (o: { title: string; text?: ReactNode; confirm?: string; danger?: boolean; input?: { label: string; placeholder?: string; required?: boolean } }) => Promise<string | false>;

/** Asks for confirmation (typed SUPPRIMER for non-drafts), backs up the database, then deletes. Returns true if deleted. */
export async function confirmAndDeleteOrder(confirm: Confirm, o: { id: string; number: string; family_name: string; status: string }): Promise<boolean> {
  if (o.status === 'brouillon') {
    if (!(await confirm({ title: `Supprimer le brouillon ${o.number} — ${o.family_name} ?`, danger: true, confirm: 'Supprimer' }))) return false;
    return !!(await act(() => deleteDraft(o.id), 'Brouillon supprimé'));
  }
  const imp = await orderDeletionImpact(o.id);
  const lost = [
    imp.payments ? `${imp.payments} règlement(s) pour ${eur(imp.paid)} (ils disparaîtront de vos encaissements)` : null,
    imp.tasks ? `${imp.tasks} tâche(s) de postproduction` : null,
    imp.supplier_lines ? `${imp.supplier_lines} ligne(s) de commande fournisseur` : null,
  ].filter(Boolean);
  const r = await confirm({
    title: `Supprimer définitivement la commande ${o.number} — ${o.family_name} ?`, danger: true, confirm: 'Supprimer définitivement',
    text: <>Commande <b>{o.status === 'validee' ? 'validée' : 'annulée'}</b>. Cette action est irréversible{lost.length ? <> et supprime aussi : <ul className="mt-1 list-disc pl-5">{lost.map((l) => <li key={l}>{l}</li>)}</ul></> : '.'}
      <div className="mt-2 text-mist-400">Une sauvegarde de la base est faite juste avant, et le contenu de la commande reste dans le journal. Pour garder une trace comptable, préférez « Annuler ».</div></>,
    input: { label: 'Tapez SUPPRIMER pour confirmer', required: true },
  });
  if (r !== 'SUPPRIMER') return false;
  return !!(await act(async () => {
    if (isTauri()) await backupNow('avant-suppression');
    await deleteOrder(o.id);
  }, `Commande ${o.number} supprimée`));
}
