import { useMemo, useState } from 'react';
import { Archive, Globe, History, Link2, Pencil, Plus, Scale, Truck, Upload } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Empty, Field, IconButton, Input, Loading, Modal, MoneyInput, PageHeader, Select, Tabs, Textarea, Toggle, useAsync, cx } from '../components/ui';
import { addSupplierPrice, archiveSupplier, costOf, createCatalogFromSupplierProducts, importSupplierRows, listSupplierProducts, listSuppliers, parseSupplierCsv, priceHistory, saveSupplier, saveSupplierProduct, SUPPLIER_CSV_COLUMNS, type Supplier, type SupplierProduct } from '../services/suppliers';
import { listProducts, listVariants } from '../services/catalog';
import { getPriceItems, listTemplates } from '../services/pricing';
import { getSetting } from '../services/base';
import { bpToPct, eur, fmtCoef, fmtRate, margin, pctToBp } from '../lib/money';
import { decodeCsvBytes, toCsv } from '../lib/csv';
import { CSV_FILTER, pickFiles, saveFile } from '../lib/files';
import { findPrice } from '../lib/pricing';
import { fmtDate } from '../lib/format';
import { act } from '../lib/act';

export default function Suppliers() {
  const [tab, setTab] = useState<'fournisseurs' | 'comparateur'>('fournisseurs');
  return (
    <>
      <PageHeader title="Fournisseurs" subtitle="Tarifs d’achat, historique des prix et comparaison. Les prix manquants ne sont jamais inventés." />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ id: 'fournisseurs', label: 'Fournisseurs & tarifs' }, { id: 'comparateur', label: 'Comparateur' }]} />
      {tab === 'fournisseurs' ? <SupplierList /> : <Comparator />}
    </>
  );
}

function SupplierList() {
  const [archived, setArchived] = useState(false);
  const s = useAsync(() => listSuppliers(archived), [archived]);
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Supplier> | null>(null);
  if (!s.data) return <Loading />;
  const current = s.data.find((x) => x.id === sel) ?? s.data[0];
  return (
    <div className="grid grid-cols-[280px_1fr] gap-5">
      <div className="space-y-2">
        {s.data.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={cx('w-full rounded-xl border px-4 py-3 text-left transition', current?.id === x.id ? 'border-gold-500/50 bg-ink-800' : 'border-ink-700 bg-ink-850 hover:border-ink-500', x.archived && 'opacity-50')}>
            <div className="font-medium">{x.name}</div><div className="text-[12px] text-mist-400">{x.products_count} produit(s){x.archived ? ' · archivé' : ''}</div>
          </button>
        ))}
        <Button className="w-full" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setEdit({ name: '', currency: 'EUR', vat_bp: 2000, discount_bp: 0, shipping_cents: 0 })}>Fournisseur</Button>
        <div className="pt-2"><Toggle checked={archived} onChange={setArchived} label="Afficher les archivés" /></div>
      </div>
      {current ? <SupplierDetail key={current.id} supplier={current} onEdit={() => setEdit(current)} reload={s.reload} /> : <Card><Empty icon={<Truck className="size-5" />} title="Aucun fournisseur" /></Card>}
      {edit && <SupplierDialog s={edit} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setSel(id); s.reload(); }} />}
    </div>
  );
}

function SupplierDetail({ supplier, onEdit, reload }: { supplier: Supplier; onEdit: () => void; reload: () => void }) {
  const d = useAsync(async () => ({ sps: await listSupplierProducts(supplier.id), variants: await listVariants(), products: await listProducts(), vatRec: (await getSetting('vat_recoverable')) === '1' }), [supplier.id]);
  const [edit, setEdit] = useState<Partial<SupplierProduct> | null>(null);
  const [price, setPrice] = useState<SupplierProduct | null>(null);
  const [hist, setHist] = useState<SupplierProduct | null>(null);
  const [imp, setImp] = useState<ReturnType<typeof parseSupplierCsv> | null>(null);
  if (!d.data) return <Loading />;
  const vName = (id: string | null) => { const v = d.data!.variants.find((x) => x.id === id); return v ? `${d.data!.products.find((p) => p.id === v.product_id)?.name} — ${v.name}` : null; };
  const doImport = async () => {
    const [f] = await pickFiles(CSV_FILTER);
    if (!f) return;
    const r = parseSupplierCsv(decodeCsvBytes(f.bytes));
    if (r.fatal) return act(async () => { throw new Error(r.fatal!); });
    setImp(r);
  };
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={<span className="text-[18px]">{supplier.name}</span>} subtitle={[supplier.contact, supplier.email, supplier.phone].filter(Boolean).join(' · ')}
          actions={<><Button size="sm" onClick={onEdit}>Modifier</Button><Button size="sm" variant="ghost" icon={<Archive className="size-3.5" />} onClick={() => act(() => archiveSupplier(supplier.id, !supplier.archived).then(reload))}>{supplier.archived ? 'Restaurer' : 'Archiver'}</Button></>} />
        <div className="grid grid-cols-5 gap-4 px-5 py-4 text-[13px]">
          <div><div className="text-mist-400">TVA par défaut</div>{bpToPct(supplier.vat_bp)} %</div>
          <div><div className="text-mist-400">Remise par défaut</div>{bpToPct(supplier.discount_bp)} %</div>
          <div><div className="text-mist-400">Livraison / unité</div>{eur(supplier.shipping_cents)}</div>
          <div><div className="text-mist-400">Délai indicatif</div>{supplier.lead_time || '—'}</div>
          <div>{supplier.website && <a href={supplier.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-gold-300"><Globe className="size-3.5" />Site web</a>}</div>
          {supplier.notes && <div className="col-span-5 text-mist-300">{supplier.notes}</div>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Produits & tarifs d’achat" subtitle={d.data.vatRec ? 'Coût réel = HT (TVA récupérable).' : 'Coût réel = TTC payé (franchise de TVA : TVA non récupérable).'}
          actions={<>{d.data.sps.some((x) => !x.variant_id) && <Button size="sm" variant="subtle" icon={<Link2 className="size-3.5" />} onClick={() => act(() => createCatalogFromSupplierProducts(d.data!.sps.filter((x) => !x.variant_id).map((x) => x.id)), (r) => `${r.linked} produit(s) liés · ${r.products} produit(s) et ${r.variants} format(s) créés dans le Catalogue`).then(() => { d.reload(); reload(); })}>Ajouter les non liés au catalogue</Button>}<Button size="sm" variant="ghost" onClick={() => act(() => saveFile('modele-tarifs-fournisseur.csv', toCsv(SUPPLIER_CSV_COLUMNS, []), CSV_FILTER))}>Modèle CSV</Button><Button size="sm" icon={<Upload className="size-3.5" />} onClick={doImport}>Import CSV</Button><Button size="sm" variant="gold" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ supplier_id: supplier.id, name: '', equivalence: 'equivalent' })}>Produit</Button></>} />
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] tracking-wider text-mist-400 uppercase"><th className="px-4 py-2">Produit</th><th className="px-4 py-2">Équivalent catalogue</th><th className="px-4 py-2 text-right">Prix catalogue</th><th className="px-4 py-2 text-right">Coût réel</th><th className="px-4 py-2">Depuis</th><th /></tr></thead>
          <tbody>
            {d.data.sps.map((sp) => { const c = costOf(sp, d.data!.vatRec); return (
              <tr key={sp.id} className="cursor-pointer border-t border-ink-700/50 hover:bg-ink-750/60" onClick={() => setEdit(sp)}>
                <td className="px-4 py-2.5"><span className="font-medium">{sp.name}</span><div className="text-[11.5px] text-mist-400">{[sp.sku, sp.support, sp.format, sp.finish].filter(Boolean).join(' · ')}</div></td>
                <td className="px-4 py-2.5">{vName(sp.variant_id) ? <span>{vName(sp.variant_id)} {sp.equivalence === 'proche' && <Badge tone="amber">proche</Badge>}</span> : <span className="text-mist-400">non lié</span>}</td>
                <td className="px-4 py-2.5 text-right tabular">{sp.price_cents != null ? `${eur(sp.price_cents)} ${sp.price_is_ttc ? 'TTC' : 'HT'}` : <span className="text-amber-300">prix manquant</span>}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular">{c ? eur(c.real_cost_cents) : '—'}</td>
                <td className="px-4 py-2.5 text-mist-400">{fmtDate(sp.valid_from)}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}><IconButton title="Modifier" onClick={() => setEdit(sp)}><Pencil className="size-4" /></IconButton><Button size="sm" variant="subtle" onClick={() => setPrice(sp)}>Nouveau prix</Button><Button size="sm" variant="ghost" icon={<History className="size-3.5" />} onClick={() => setHist(sp)} /></td>
              </tr>); })}
          </tbody>
        </table>
        {!d.data.sps.length && <div className="px-5 py-6 text-[13px] text-mist-400">Aucun produit. Saisissez les tarifs manuellement ou importez un CSV.</div>}
      </Card>
      {edit && <SupplierProductDialog sp={edit} groups={d.data.products.map((p) => ({ product: p.name, variants: d.data!.variants.filter((v) => v.product_id === p.id).map((v) => ({ id: v.id, label: v.name })) })).filter((g) => g.variants.length)} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); d.reload(); reload(); }} />}
      {price && <PriceDialog sp={price} supplier={supplier} onClose={() => setPrice(null)} onSaved={() => { setPrice(null); d.reload(); }} />}
      {hist && <HistoryDialog sp={hist} onClose={() => setHist(null)} />}
      {imp && (
        <Modal open onClose={() => setImp(null)} size="lg" title="Import des tarifs fournisseur" footer={<><Button variant="ghost" onClick={() => setImp(null)}>Annuler</Button><Button variant="gold" disabled={!imp.rows.some((r) => !r.errors.length)} onClick={() => act(() => importSupplierRows(supplier.id, imp.rows), (r) => `${r.created} produit(s) créé(s), ${r.priced} prix ajouté(s), ${r.skipped} ignoré(s)`).then(() => { setImp(null); d.reload(); reload(); })}>Importer</Button></>}>
          <div className="max-h-[50vh] overflow-auto text-[12.5px]">{imp.rows.map((r) => (
            <div key={r.line} className={cx('flex justify-between border-b border-ink-700/50 py-1.5', r.errors.length && 'text-red-300')}><span>{r.line}. {r.name} {r.format}</span><span>{r.errors.length ? r.errors.join(', ') : `${eur(r.price_cents)} ${r.price_is_ttc ? 'TTC' : 'HT'}`}</span></div>
          ))}</div>
        </Modal>
      )}
    </div>
  );
}

function SupplierDialog({ s, onClose, onSaved }: { s: Partial<Supplier>; onClose: () => void; onSaved: (id: string) => void }) {
  const [x, setX] = useState(s);
  return (
    <Modal open onClose={onClose} size="lg" title={s.id ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={!x.name?.trim()} onClick={async () => { const id = await act(() => saveSupplier(x as Supplier), 'Fournisseur enregistré'); if (id) onSaved(id); }}>Enregistrer</Button></>}>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Nom *"><Input value={x.name ?? ''} onChange={(e) => setX({ ...x, name: e.target.value })} /></Field>
        <Field label="Contact"><Input value={x.contact ?? ''} onChange={(e) => setX({ ...x, contact: e.target.value })} /></Field>
        <Field label="Site web"><Input value={x.website ?? ''} onChange={(e) => setX({ ...x, website: e.target.value })} /></Field>
        <Field label="E-mail"><Input value={x.email ?? ''} onChange={(e) => setX({ ...x, email: e.target.value })} /></Field>
        <Field label="Téléphone"><Input value={x.phone ?? ''} onChange={(e) => setX({ ...x, phone: e.target.value })} /></Field>
        <Field label="Devise"><Input value={x.currency ?? 'EUR'} onChange={(e) => setX({ ...x, currency: e.target.value })} /></Field>
        <Field label="TVA par défaut (%)"><Input value={bpToPct(x.vat_bp)} onChange={(e) => setX({ ...x, vat_bp: pctToBp(e.target.value) ?? 0 })} /></Field>
        <Field label="Remise par défaut (%)"><Input value={bpToPct(x.discount_bp)} onChange={(e) => setX({ ...x, discount_bp: pctToBp(e.target.value) ?? 0 })} /></Field>
        <Field label="Livraison répartie / unité"><MoneyInput value={x.shipping_cents ?? 0} onChange={(v) => setX({ ...x, shipping_cents: v ?? 0 })} /></Field>
        <Field label="Délai indicatif"><Input value={x.lead_time ?? ''} onChange={(e) => setX({ ...x, lead_time: e.target.value })} placeholder="5 à 7 jours" /></Field>
        <Field label="Notes" className="col-span-2"><Textarea rows={2} value={x.notes ?? ''} onChange={(e) => setX({ ...x, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function SupplierProductDialog({ sp, groups, onClose, onSaved }: { sp: Partial<SupplierProduct>; groups: { product: string; variants: { id: string; label: string }[] }[]; onClose: () => void; onSaved: () => void }) {
  const [x, setX] = useState(sp);
  const [newName, setNewName] = useState(sp.support || sp.name || '');
  const [newCat, setNewCat] = useState<'numerique' | 'impression' | 'option'>('impression');
  const createAndLink = () => act(async () => {
    const id = await saveSupplierProduct({ ...(x as SupplierProduct), variant_id: null });
    return createCatalogFromSupplierProducts([id], { productName: newName, category: newCat });
  }, (r) => (r.products ? `Produit « ${newName} » créé dans le Catalogue et lié` : `Lié au produit « ${newName} » du Catalogue`)).then((r) => r && onSaved());
  return (
    <Modal open onClose={onClose} size="lg" title={sp.id ? 'Produit fournisseur' : 'Nouveau produit fournisseur'}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={!x.name?.trim()} onClick={() => act(() => saveSupplierProduct(x as SupplierProduct), 'Enregistré').then((r) => r && onSaved())}>Enregistrer</Button></>}>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Désignation *" className="col-span-2"><Input value={x.name ?? ''} onChange={(e) => setX({ ...x, name: e.target.value })} /></Field>
        <Field label="Référence"><Input value={x.sku ?? ''} onChange={(e) => setX({ ...x, sku: e.target.value })} /></Field>
        <Field label="Support"><Input value={x.support ?? ''} onChange={(e) => setX({ ...x, support: e.target.value })} /></Field>
        <Field label="Format"><Input value={x.format ?? ''} onChange={(e) => setX({ ...x, format: e.target.value })} /></Field>
        <Field label="Finition"><Input value={x.finish ?? ''} onChange={(e) => setX({ ...x, finish: e.target.value })} /></Field>
        <Field label="Variante du catalogue correspondante" className="col-span-2"><Select value={x.variant_id ?? ''} onChange={(e) => setX({ ...x, variant_id: e.target.value || null })}><option value="">— Non lié —</option>{groups.map((g) => <optgroup key={g.product} label={g.product}>{g.variants.map((v) => <option key={v.id} value={v.id}>{g.product} — {v.label}</option>)}</optgroup>)}</Select></Field>
        <Field label="Équivalence" hint="« Proche » = jamais utilisé automatiquement dans les coûts."><Select value={x.equivalence} onChange={(e) => setX({ ...x, equivalence: e.target.value as 'equivalent' })}><option value="equivalent">Équivalent</option><option value="proche">Proche mais différent</option></Select></Field>
        <Field label="Notes" className="col-span-3"><Textarea rows={2} value={x.notes ?? ''} onChange={(e) => setX({ ...x, notes: e.target.value })} /></Field>
        {!x.variant_id && (
          <div className="col-span-3 rounded-xl border border-dashed border-ink-600 p-3">
            <div className="mb-2 text-[12.5px] text-mist-300">Ce produit n’existe pas encore dans votre Catalogue ? Créez-le (ou ajoutez ce format à un produit existant du même nom) et liez-le en un clic.</div>
            <div className="flex items-end gap-2">
              <Field label="Nom du produit dans le Catalogue" className="flex-1"><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
              <Field label="Catégorie"><Select className="w-40" value={newCat} onChange={(e) => setNewCat(e.target.value as 'impression')}><option value="impression">Impressions</option><option value="numerique">Numérique</option><option value="option">Options</option></Select></Field>
              <Button variant="subtle" icon={<Link2 className="size-4" />} disabled={!newName.trim() || !x.name?.trim()} onClick={createAndLink}>Créer dans le catalogue et lier</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PriceDialog({ sp, supplier, onClose, onSaved }: { sp: SupplierProduct; supplier: Supplier; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState({ price: sp.price_cents, ttc: sp.price_is_ttc == null ? true : !!sp.price_is_ttc, vat: bpToPct(sp.p_vat_bp ?? supplier.vat_bp), disc: bpToPct(sp.p_discount_bp ?? supplier.discount_bp), ship: sp.p_shipping_cents ?? supplier.shipping_cents, from: new Date().toISOString().slice(0, 10) });
  return (
    <Modal open onClose={onClose} title={`Nouveau prix — ${sp.name}`} subtitle="L’ancien prix est conservé dans l’historique." size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={p.price == null} onClick={() => act(() => addSupplierPrice(sp.id, { price_cents: p.price!, price_is_ttc: p.ttc, vat_bp: pctToBp(p.vat), discount_bp: pctToBp(p.disc), shipping_cents: p.ship, valid_from: p.from }), 'Prix enregistré').then((r) => r !== undefined && onSaved())}>Enregistrer</Button></>}>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Prix catalogue"><MoneyInput autoFocus value={p.price} onChange={(v) => setP({ ...p, price: v })} /></Field>
        <Field label="Saisi en"><Select value={p.ttc ? 'ttc' : 'ht'} onChange={(e) => setP({ ...p, ttc: e.target.value === 'ttc' })}><option value="ttc">TTC</option><option value="ht">HT</option></Select></Field>
        <Field label="Valable depuis"><Input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></Field>
        <Field label="TVA (%)"><Input value={p.vat} onChange={(e) => setP({ ...p, vat: e.target.value })} /></Field>
        <Field label="Remise (%)"><Input value={p.disc} onChange={(e) => setP({ ...p, disc: e.target.value })} /></Field>
        <Field label="Livraison / unité"><MoneyInput value={p.ship} onChange={(v) => setP({ ...p, ship: v ?? 0 })} /></Field>
      </div>
    </Modal>
  );
}

function HistoryDialog({ sp, onClose }: { sp: SupplierProduct; onClose: () => void }) {
  const h = useAsync(() => priceHistory(sp.id), [sp.id]);
  return (
    <Modal open onClose={onClose} title={`Historique — ${sp.name}`} size="sm">
      {h.data?.map((x) => <div key={x.id} className="flex justify-between border-b border-ink-700/50 py-2 text-[13px]"><span className="text-mist-400">{fmtDate(x.valid_from)}</span><span className="tabular">{eur(x.price_cents)} {x.price_is_ttc ? 'TTC' : 'HT'}{x.discount_bp ? ` · −${bpToPct(x.discount_bp)} %` : ''}</span></div>)}
    </Modal>
  );
}

function Comparator() {
  const d = useAsync(async () => {
    const [sps, products, variants, templates, vatRec] = await Promise.all([listSupplierProducts(), listProducts(), listVariants(), listTemplates(), getSetting('vat_recoverable')]);
    return { sps, products, variants, templates, vatRec: vatRec === '1' };
  }, []);
  const [variantId, setVariantId] = useState('');
  const [tplId, setTplId] = useState('');
  const sale = useAsync(async () => {
    const t = d.data?.templates.find((x) => x.id === (tplId || d.data?.templates[0]?.id));
    return t && variantId ? findPrice(await getPriceItems(t.price_list_id), 'variant', variantId) : null;
  }, [variantId, tplId, d.data]);
  const opts = useMemo(() => d.data ? d.data.variants.filter((v) => d.data!.sps.some((s) => s.variant_id === v.id)).map((v) => ({ id: v.id, label: `${d.data!.products.find((p) => p.id === v.product_id)?.name} — ${v.name}` })) : [], [d.data]);
  if (!d.data) return <Loading />;
  const rows = d.data.sps.filter((s) => s.variant_id === (variantId || opts[0]?.id));
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Scale className="size-4 text-gold-400" />Comparer les fournisseurs pour un produit</span>}
        actions={<><Select className="w-72" value={variantId || opts[0]?.id || ''} onChange={(e) => setVariantId(e.target.value)}>{opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
          <Select className="w-48" value={tplId || d.data.templates[0]?.id || ''} onChange={(e) => setTplId(e.target.value)}>{d.data.templates.map((t) => <option key={t.id} value={t.id}>Prix : {t.name}</option>)}</Select></>} />
      {!opts.length ? <Empty title="Aucun produit fournisseur lié au catalogue" text="Liez les produits fournisseurs à une variante du catalogue pour les comparer." /> : (
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] tracking-wider text-mist-400 uppercase">{['Fournisseur', 'Prix catalogue', 'Remise', 'Après remise', 'TVA', 'Livraison', 'Coût réel', 'Prix de vente', 'Marge', 'Taux marque', 'Coef.'].map((h) => <th key={h} className="px-3 py-2 text-right first:text-left">{h}</th>)}</tr></thead>
          <tbody>{rows.map((sp) => { const c = costOf(sp, d.data!.vatRec); const m = c && sale.data != null ? margin(sale.data, c.real_cost_cents) : null; return (
            <tr key={sp.id} className="border-t border-ink-700/50 text-right tabular">
              <td className="px-3 py-2.5 text-left"><div className="font-medium">{sp.supplier_name}</div><div className="text-[11.5px] text-mist-400">{sp.name} {sp.equivalence === 'proche' && <Badge tone="amber">proche — non équivalent</Badge>}</div></td>
              <td className="px-3">{c ? eur(c.catalogue_cents) : <span className="text-amber-300">manquant</span>}</td><td className="px-3">{c ? `− ${eur(c.discount_cents)}` : '—'}</td><td className="px-3">{c ? eur(c.after_discount_cents) : '—'}</td>
              <td className="px-3">{c ? eur(c.vat_cents) : '—'}</td><td className="px-3">{c ? eur(c.shipping_cents) : '—'}</td><td className="px-3 font-semibold">{c ? eur(c.real_cost_cents) : '—'}</td>
              <td className="px-3">{eur(sale.data)}</td><td className="px-3">{m ? eur(m.margin_cents) : '—'}</td><td className="px-3">{m ? fmtRate(m.margin_rate) : '—'}</td><td className="px-3">{m ? fmtCoef(m.coefficient) : '—'}</td>
            </tr>); })}</tbody>
        </table>
      )}
    </Card>
  );
}
