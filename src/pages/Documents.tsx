import { useEffect, useState } from 'react';
import { BookOpen, ClipboardList, Download, FileDown, FileText, Mail, Receipt, Table2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Empty, Field, IconButton, PageHeader, Select, Spinner, useAsync, cx } from '../components/ui';
import { listSessions } from '../services/sessions';
import { listOrders } from '../services/orders';
import { invoicePdfOf, orderRecapPdf, productionPdf, sessionCatalogPdf } from '../services/documents';
import { listInvoices } from '../services/invoices';
import { emailInvoiceRow } from '../services/mail';
import { toCsv } from '../lib/csv';
import { eur } from '../lib/money';
import { fmtDate } from '../lib/format';
import { saveFile, PDF_FILTER } from '../lib/files';
import { slug } from '../lib/format';
import { act } from '../lib/act';

type Kind = 'catalogue' | 'grille' | 'recap' | 'production';
const KINDS: { id: Kind; label: string; text: string; icon: typeof FileText; client: boolean }[] = [
  { id: 'catalogue', label: 'Brochure des offres', text: 'Illustrée : créations et exemples, guide des formats, supports et tarifs de la séance, packs.', icon: BookOpen, client: true },
  { id: 'grille', label: 'Grille tarifaire', text: 'Version compacte imprimable.', icon: Table2, client: true },
  { id: 'recap', label: 'Récapitulatif client', text: 'Commande, remises, règlement, solde.', icon: Receipt, client: true },
  { id: 'production', label: 'Fiche de production', text: 'Usage interne : références iris, styles, produits.', icon: ClipboardList, client: false },
];

export default function Documents() {
  const [kind, setKind] = useState<Kind>('catalogue');
  const sessions = useAsync(() => listSessions({ includeArchived: true }), []);
  const [sid, setSid] = useState('');
  const session = sid || sessions.data?.[0]?.id || '';
  const orders = useAsync(() => (session ? listOrders({ sessionId: session }) : Promise.resolve([])), [session]);
  const [oid, setOid] = useState('');
  const order = oid || orders.data?.find((o) => o.status !== 'annulee')?.id || '';
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);
  const sName = sessions.data?.find((s) => s.id === session)?.name ?? '';
  const generate = async () => {
    setBusy(true);
    const r = await act(async () => {
      const bytes = kind === 'catalogue' ? await sessionCatalogPdf(session) : kind === 'grille' ? await sessionCatalogPdf(session, true)
        : kind === 'recap' ? await orderRecapPdf(order) : await productionPdf({ sessionId: session }, sName);
      const o = orders.data?.find((x) => x.id === order);
      const name = kind === 'recap' ? `commande-${o?.number}-${slug(o?.family_name ?? '')}.pdf` : `${kind === 'catalogue' ? 'brochure' : kind}-${slug(sName)}.pdf`;
      return { bytes, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })), name };
    });
    setBusy(false);
    if (r) setPdf(r);
  };
  return (
    <>
      <PageHeader title="Documents PDF" subtitle="Génération locale. Les documents clients n’affichent jamais les coûts, fournisseurs ni marges." />
      <div className="grid grid-cols-[340px_1fr] gap-5">
        <div className="space-y-3">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => { setKind(k.id); setPdf(null); }} className={cx('flex w-full gap-3 rounded-xl border p-4 text-left transition', kind === k.id ? 'border-gold-500/60 bg-ink-800' : 'border-ink-700 bg-ink-850 hover:border-ink-500')}>
              <k.icon className="mt-0.5 size-5 text-gold-400" /><div><div className="font-medium">{k.label}</div><div className="text-[12px] text-mist-400">{k.text}</div></div>
            </button>
          ))}
          <Card className="space-y-3 p-4">
            <Field label="Séance"><Select value={session} onChange={(e) => { setSid(e.target.value); setOid(''); setPdf(null); }}>{sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            {kind === 'recap' && <Field label="Commande"><Select value={order} onChange={(e) => { setOid(e.target.value); setPdf(null); }}>{orders.data?.filter((o) => o.status !== 'annulee').map((o) => <option key={o.id} value={o.id}>{o.number} — {o.family_name}</option>)}</Select></Field>}
            <Button variant="gold" className="w-full" loading={busy} disabled={!session || (kind === 'recap' && !order)} onClick={generate} icon={<FileText className="size-4" />}>Générer l’aperçu</Button>
            {pdf && <Button className="w-full" icon={<FileDown className="size-4" />} onClick={() => act(() => saveFile(pdf.name, pdf.bytes, PDF_FILTER), 'PDF enregistré')}>Enregistrer le PDF</Button>}
          </Card>
        </div>
        <Card className="min-h-[70vh] overflow-hidden">
          {busy ? <div className="flex h-full items-center justify-center"><Spinner /></div> : pdf ? <iframe title="Aperçu" src={pdf.url} className="h-[78vh] w-full bg-white" /> : <Empty icon={<FileText className="size-5" />} title="Aperçu" text="Choisissez un document puis générez l’aperçu." />}
        </Card>
      </div>
      <InvoiceRegister />
    </>
  );
}

/** Register of issued invoices and credit notes (for accounting / livre des recettes). */
function InvoiceRegister() {
  const { data } = useAsync(() => listInvoices(), []);
  if (!data?.length) return null;
  const exportCsv = () => act(() => saveFile(`registre-factures-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(['Numéro', 'Type', 'Date', 'Client', 'Commande', 'Montant €', 'Statut'],
    data.map((r) => { const d = JSON.parse(r.data); return [r.number, r.kind === 'avoir' ? 'Avoir' : 'Facture', r.issued_at.slice(0, 10), r.client, d.order?.number ?? '', (r.total_cents / 100).toFixed(2).replace('.', ','), r.kind === 'facture' && r.cancelled_by ? 'Annulée par avoir' : '']; })),
    [{ name: 'CSV', extensions: ['csv'] }]), 'Registre exporté');
  return (
    <Card className="mt-6">
      <CardHeader title="Registre des factures et avoirs" subtitle="Numérotation continue. Chaque document est réimprimé à l’identique." actions={<Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={exportCsv}>Export CSV</Button>} />
      <div className="max-h-96 divide-y divide-ink-700/50 overflow-y-auto">
        {data.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
            <span className="w-28 font-mono">{r.number}</span>
            <Badge tone={r.kind === 'avoir' ? 'amber' : r.cancelled_by ? 'neutral' : 'green'}>{r.kind === 'avoir' ? 'Avoir' : r.cancelled_by ? 'Annulée' : 'Facture'}</Badge>
            <span className="w-24 text-mist-400 tabular">{fmtDate(r.issued_at)}</span>
            <span className="flex-1">{r.client}</span>
            <span className="tabular">{eur(r.total_cents)}</span>
            {!r.cancelled_by && <IconButton title="Envoyer par e-mail" onClick={() => act(() => emailInvoiceRow(r), (how) => (how === 'mail' ? `E-mail prêt dans Mail (${r.number})` : `PDF ${r.number} enregistré — joignez-le au message ouvert`))}><Mail className="size-4" /></IconButton>}
            <IconButton title="Télécharger le PDF" onClick={() => act(() => saveFile(`${r.kind}-${r.number}.pdf`, invoicePdfOf(r), PDF_FILTER), 'PDF enregistré')}><FileDown className="size-4" /></IconButton>
          </div>
        ))}
      </div>
    </Card>
  );
}
