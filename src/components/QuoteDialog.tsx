import { useState } from 'react';
import { Check, FileDown, FileSignature, Mail, RotateCcw, X } from 'lucide-react';
import { Badge, Button, Empty, IconButton, Input, Modal, useAsync } from './ui';
import { issueQuote, markQuoteOnRegistration, quotesOfOrder, setQuoteStatus, QUOTE_STATUS, type QuoteRow } from '../services/quotes';
import { batch } from '../services/base';
import { emailQuote } from '../services/mail';
import { getOrderDetail } from '../services/orders';
import { invoicePdf } from '../lib/pdf';
import { saveFile, PDF_FILTER } from '../lib/files';
import { eur } from '../lib/money';
import { fmtDate, slug } from '../lib/format';
import { todayIso } from '../lib/ids';
import { act } from '../lib/act';

/**
 * Devis of an order: issue (frozen, numbered) → download / e-mail → mark signed or refused.
 * `prepare` saves the current cart first (configurator) and returns the order id.
 */
export function QuoteDialog({ orderId, prepare, onClose }: { orderId: string | null; prepare?: () => Promise<string | null>; onClose: () => void }) {
  const [id, setId] = useState(orderId);
  const quotes = useAsync(() => (id ? quotesOfOrder(id) : Promise.resolve([] as QuoteRow[])), [id]);
  const [signDate, setSignDate] = useState(todayIso());
  const fileName = async (r: QuoteRow, oid: string) => `devis-${r.number}-${slug((await getOrderDetail(oid))?.order.family_name ?? '')}.pdf`;
  const issue = async (send: boolean) => {
    const r = await act(async () => {
      const oid = (prepare ? await prepare() : null) ?? id;
      if (!oid) throw new Error('Le panier est vide : ajoutez au moins une création.');
      setId(oid);
      const q = await issueQuote(oid);
      if (send) {
        const o = (await getOrderDetail(oid))!.order;
        const how = await emailQuote(q.row, { to: o.family_email, firstName: o.contact_first_name, familyName: o.family_name });
        await batch([markQuoteOnRegistration(oid, 'sent')]); // « devis envoyé » ticked in the registrations list
        return { q, how };
      }
      await saveFile(await fileName(q.row, oid), invoicePdf(q.data), PDF_FILTER);
      return { q, how: null };
    }, (x) => `${x.q.created ? `Devis ${x.q.row.number} établi` : `Devis ${x.q.row.number} inchangé (même contenu)`}${x.how === 'mail' ? ' — e-mail prêt dans Mail' : x.how === 'fallback' ? ' — PDF enregistré, joignez-le au message' : ''}`);
    if (r) quotes.reload();
  };
  const latest = quotes.data?.[0];
  return (
    <Modal open onClose={onClose} size="lg" title="Devis" subtitle="Numéroté et figé à l’émission. Le client le retourne daté et signé avec « Bon pour accord ». Un nouveau devis n’est créé que si le panier a changé."
      footer={<><Button variant="ghost" onClick={onClose}>Fermer</Button>
        <Button icon={<FileDown className="size-4" />} onClick={() => issue(false)}>Établir le devis (PDF)</Button>
        <Button variant="gold" icon={<Mail className="size-4" />} onClick={() => issue(true)}>Établir et envoyer par e-mail</Button></>}>
      {!quotes.data?.length ? <Empty icon={<FileSignature className="size-5" />} title="Aucun devis pour cette sélection" text="Établissez-le à partir du panier actuel." /> : (
        <div className="divide-y divide-ink-700/60 rounded-xl border border-ink-700">
          {quotes.data.map((r) => {
            const expired = r.status === 'envoye' && r.valid_until < todayIso();
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                <span className="w-28 font-mono">{r.number}</span>
                <Badge tone={r.status === 'signe' ? 'green' : r.status === 'refuse' ? 'neutral' : expired ? 'amber' : 'gold'}>{expired ? 'Expiré' : QUOTE_STATUS[r.status]}{r.status === 'signe' && r.signed_at ? ` le ${fmtDate(r.signed_at)}` : ''}</Badge>
                <span className="flex-1 text-mist-400">{fmtDate(r.issued_at)} · valable jusqu’au {fmtDate(r.valid_until)}</span>
                <span className="tabular">{eur(r.total_cents)}</span>
                <IconButton title="Télécharger le PDF" onClick={() => act(async () => saveFile(await fileName(r, id!), invoicePdf(JSON.parse(r.data)), PDF_FILTER), 'PDF enregistré')}><FileDown className="size-4" /></IconButton>
                {r.status !== 'envoye'
                  ? <IconButton title="Remettre « envoyé »" onClick={() => act(() => setQuoteStatus(r.id, 'envoye')).then(quotes.reload)}><RotateCcw className="size-4" /></IconButton>
                  : <>
                    <IconButton title="Marquer signé (date ci-dessous)" onClick={() => act(() => setQuoteStatus(r.id, 'signe', signDate), `Devis ${r.number} signé`).then(quotes.reload)}><Check className="size-4 text-green-400" /></IconButton>
                    <IconButton title="Marquer refusé" onClick={() => act(() => setQuoteStatus(r.id, 'refuse')).then(quotes.reload)}><X className="size-4" /></IconButton>
                  </>}
              </div>
            );
          })}
        </div>
      )}
      {latest?.status === 'envoye' && (
        <div className="mt-3 flex items-center gap-2 text-[12.5px] text-mist-400">Date de signature : <Input type="date" className="h-8 w-40" value={signDate} onChange={(e) => setSignDate(e.target.value)} /></div>
      )}
      {latest?.status === 'signe' && <div className="mt-3 text-[12.5px] text-gold-300">Devis signé : validez maintenant la commande pour figer les prix et lancer la production.</div>}
    </Modal>
  );
}
