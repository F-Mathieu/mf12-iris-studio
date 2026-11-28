import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpenText, LayoutGrid, Settings2, Copy, Eye, FileUp, ImageOff, ImagePlus, Plus, Star, Trash2 } from 'lucide-react';
import { PdfViewer } from '../components/PdfViewer';
import { Badge, Button, Card, Field, IconButton, Input, Loading, Modal, MoneyInput, PageHeader, Select, Tabs, Textarea, Toggle, useAsync, useConfirm, cx } from '../components/ui';
import { addCatalogDoc, addProductPhotos, deleteCatalogDoc, listCatalogDocs, listProductPhotos, removeProductPhoto, renameCatalogDoc, setProductCover, addExamples, addMedia, CATEGORY_LABEL, deleteExample, duplicateProduct, frameFor, removeProduct, setCoverExample, listExamples, listProducts, listStyles, listVariants, removeVariant, saveProduct, saveStyle, saveVariant, updateExample, type Category, type Product, type Style } from '../services/catalog';
import { listSupplierProducts } from '../services/suppliers';
import { listUniverses, saveUniverse, type Universe } from '../services/universes';
import { listTemplates } from '../services/pricing';
import { DEFAULT_OFFERS_MAIL, DEFAULT_RECAP_MAIL } from '../lib/invoiceMail';
import { IMAGE_FILTER, PDF_FILTER, pickFiles, type PickedFile } from '../lib/files';
import { mimeOf } from '../lib/images';
import { act } from '../lib/act';

const toBlob = (f: PickedFile) => new Blob([f.bytes as BlobPart], { type: mimeOf(f.name) });

export default function Catalog() {
  const { key } = useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState<'styles' | 'produits'>('produits');
  const [archived, setArchived] = useState(false);
  const universes = useAsync(() => listUniverses(true), [key]);
  const back = () => nav('/catalogue');
  const archToggle = <Toggle checked={archived} onChange={setArchived} label="Afficher les archives" />;
  if (!key) return <CatalogHome onOpen={(k) => nav(`/catalogue/${k}`)} />;
  if (key === 'univers') return <><PageHeader title="Univers de séance" back={back} actions={archToggle} /><UniversesView archived={archived} /></>;
  if (key === 'pdf') return <><PageHeader title="Catalogues PDF" back={back} /><CatalogDocsView /></>;
  const u = universes.data?.find((x) => x.id === key);
  const title = key === 'commun' ? 'Catalogue commun' : key === 'tout' ? 'Tout le catalogue' : u?.name ?? '…';
  const subtitle = key === 'commun' ? 'Styles et produits proposés dans toutes les séances, quel que soit l’univers.'
    : key === 'tout' ? 'Tous les styles et produits, tous univers confondus.' : `Styles et produits de l’univers ${u?.name ?? ''}, avec ceux du catalogue commun (badge « Commun »).`;
  const universe = key === 'tout' ? '' : key;
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} back={back} actions={archToggle} />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ id: 'produits', label: 'Produits & variantes' }, { id: 'styles', label: 'Styles de montages' }]} />
      {tab === 'styles' ? <StylesView archived={archived} universe={universe} universes={universes.data ?? []} />
        : <ProductsView archived={archived} universe={universe} universes={universes.data ?? []} />}
    </>
  );
}

/** First page: one big card per universe (plus the common catalogue), then the PDF catalogues and the universes settings. */
function CatalogHome({ onOpen }: { onOpen: (key: string) => void }) {
  const [archived, setArchived] = useState(false);
  const [edit, setEdit] = useState<Partial<Universe> | null>(null);
  const d = useAsync(async () => {
    const [us, styles, products, docs] = await Promise.all([listUniverses(archived), listStyles(), listProducts(), listCatalogDocs()]);
    return { us, styles, products, docs };
  }, [archived]);
  if (!d.data) return <Loading />;
  const { us, styles, products, docs } = d.data;
  const card = (k: string, name: string, desc: string | null, inU: (p: Product) => boolean, inS: (s: Style) => boolean, archivedU = false) => {
    const ps = products.filter(inU), ss = styles.filter(inS);
    const thumbs = [...ps.map((p) => p.thumb), ...ss.map((x) => x.cover_thumb)].filter((t): t is string => !!t).slice(0, 4);
    return (
      <button key={k} type="button" onClick={() => onOpen(k)} className={cx('group relative h-56 overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 text-left transition hover:border-gold-500/60', archivedU && 'opacity-55')}>
        {thumbs.length ? (
          <div className={cx('absolute inset-0 grid gap-0.5', thumbs.length === 1 ? 'grid-cols-1' : 'grid-cols-2', thumbs.length > 2 && 'grid-rows-2')}>
            {thumbs.map((t, i) => <img key={i} src={t} alt="" className={cx('size-full object-cover transition duration-500 group-hover:scale-[1.04]', thumbs.length === 3 && i === 0 && 'row-span-2')} />)}
          </div>
        ) : <div className="absolute inset-0 bg-gradient-to-br from-ink-750 via-ink-850 to-ink-900" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/5" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="flex items-end justify-between gap-2"><div className="font-display text-[32px] leading-none font-semibold text-white">{name}</div>{archivedU && <Badge>Archivé</Badge>}</div>
          {desc && <div className="mt-1.5 line-clamp-1 text-[12.5px] text-mist-200/80">{desc}</div>}
          <div className="mt-2 text-[12px] text-gold-300">{ps.length} produit(s) · {ss.length} style(s)</div>
        </div>
      </button>
    );
  };
  return (
    <>
      <PageHeader title="Catalogue" subtitle="Choisissez un catalogue. Chaque univers regroupe ses produits et ses styles ; le catalogue commun est proposé dans toutes les séances."
        actions={<Toggle checked={archived} onChange={setArchived} label="Univers archivés" />} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
        {us.map((u) => card(u.id, u.name, u.description, (p) => p.universe_ids.includes(u.id), (x) => x.universe_id === u.id, !!u.archived))}
        {card('commun', 'Commun', 'Proposé dans toutes les séances', (p) => !p.universe_ids.length, (x) => !x.universe_id)}
        <button type="button" onClick={() => setEdit({ name: '' })} className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 text-mist-400 transition hover:border-gold-500/60 hover:text-gold-300"><Plus className="mb-2 size-6" />Nouvel univers</button>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Card onClick={() => onOpen('pdf')} className="flex items-center gap-3 p-4"><BookOpenText className="size-6 text-gold-400" /><div><div className="font-medium">Catalogues PDF</div><div className="text-[12px] text-mist-400">{docs.length} catalogue(s) fournisseur</div></div></Card>
        <Card onClick={() => onOpen('univers')} className="flex items-center gap-3 p-4"><Settings2 className="size-6 text-gold-400" /><div><div className="font-medium">Réglages des univers</div><div className="text-[12px] text-mist-400">Template par défaut, textes de brochure et d’e-mails</div></div></Card>
        <Card onClick={() => onOpen('tout')} className="flex items-center gap-3 p-4"><LayoutGrid className="size-6 text-gold-400" /><div><div className="font-medium">Tout le catalogue</div><div className="text-[12px] text-mist-400">{products.length} produit(s) · {styles.length} style(s), tous univers</div></div></Card>
      </div>
      {edit && <UniverseEditor universe={edit} onClose={() => { setEdit(null); d.reload(); }} />}
    </>
  );
}

const universeName = (universes: Universe[], id: string | null | undefined) => (id ? universes.find((u) => u.id === id)?.name ?? '?' : 'Commun');

function UniverseSelect({ value, onChange, universes }: { value: string | null | undefined; onChange: (v: string | null) => void; universes: Universe[] }) {
  return (
    <Field label="Univers" hint="Commun : proposé dans toutes les séances.">
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}><option value="">Commun (tous les univers)</option>{universes.filter((u) => !u.archived || u.id === value).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
    </Field>
  );
}

/** Multi-choice of universes (none = common / as the product). */
function UniverseChips({ value, onChange, universes, none = 'Commun' }: { value: string[]; onChange: (v: string[]) => void; universes: Universe[]; none?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {universes.filter((u) => !u.archived || value.includes(u.id)).map((u) => {
        const on = value.includes(u.id);
        return <button key={u.id} type="button" onClick={() => onChange(on ? value.filter((x) => x !== u.id) : [...value, u.id])}
          className={cx('rounded-full border px-2.5 py-0.5 text-[12px] transition', on ? 'border-gold-500/70 bg-gold-500/15 text-gold-200' : 'border-ink-600 text-mist-400 hover:border-gold-500/50')}>{u.name}</button>;
      })}
      {!value.length && <span className="text-[11.5px] text-mist-400">{none}</span>}
    </div>
  );
}

function UniversesView({ archived }: { archived: boolean }) {
  const u = useAsync(() => listUniverses(archived), [archived]);
  const [edit, setEdit] = useState<Partial<Universe> | null>(null);
  if (!u.data) return <Loading />;
  return (
    <>
      <div className="mb-4 text-[13px] text-mist-400">Un univers (Iris, Back to school, Noël, Halloween, Fête des mères…) regroupe ses styles, produits et templates — en plus du catalogue commun — ainsi que ses textes de brochure et d’e-mails. Chaque séance choisit son univers.</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {u.data.map((x) => (
          <Card key={x.id} onClick={() => setEdit(x)} className={cx('p-5', x.archived && 'opacity-55')}>
            <div className="flex items-start justify-between"><span className="font-display text-[22px] font-semibold">{x.name}</span>{!!x.archived && <Badge>Archivé</Badge>}</div>
            <div className="mt-1 min-h-[18px] text-[12.5px] text-mist-400">{x.description}</div>
            <div className="mt-3 text-[12.5px] text-mist-300">Template par défaut : {x.default_template_name ?? <span className="text-amber-300">aucun</span>}</div>
            <div className="mt-1 text-[12px] text-mist-400">{x.styles_count} style(s) · {x.products_count} produit(s) propres · {x.sessions_count} séance(s)</div>
          </Card>
        ))}
        <button onClick={() => setEdit({ name: '' })} className="flex min-h-[150px] flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 text-mist-400 transition hover:border-gold-500/60 hover:text-gold-300"><Plus className="mb-2 size-6" />Nouvel univers</button>
      </div>
      {edit && <UniverseEditor universe={edit} onClose={() => { setEdit(null); u.reload(); }} />}
    </>
  );
}

function UniverseEditor({ universe, onClose }: { universe: Partial<Universe>; onClose: () => void }) {
  const [x, setX] = useState(universe);
  const tpls = useAsync(() => listTemplates(false, x.id ?? null), [x.id]);
  const save = async () => { if (await act(() => saveUniverse(x as Universe), 'Univers enregistré')) onClose(); };
  return (
    <Modal open onClose={onClose} size="lg" title={x.id ? `Univers — ${universe.name}` : 'Nouvel univers'}
      footer={<><Button variant="ghost" onClick={onClose}>Fermer</Button><Button variant="gold" disabled={!x.name?.trim()} onClick={save}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom *"><Input autoFocus value={x.name ?? ''} placeholder="Noël" onChange={(e) => setX({ ...x, name: e.target.value })} /></Field>
        <Field label="Template tarifaire par défaut" hint="Proposé à la création d’une séance de cet univers.">
          <Select value={x.default_template_id ?? ''} onChange={(e) => setX({ ...x, default_template_id: e.target.value || null })}><option value="">— Aucun —</option>{tpls.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.universe_name ? '' : ' (commun)'}</option>)}</Select>
        </Field>
        <Field label="Description" className="col-span-2"><Input value={x.description ?? ''} onChange={(e) => setX({ ...x, description: e.target.value })} /></Field>
        <div className="col-span-2 text-[12.5px] text-mist-400">Textes propres à l’univers — laissés vides, les textes de Paramètres → Facturation s’appliquent.</div>
        <Field label="Brochure : texte d’introduction" className="col-span-2"><Textarea rows={3} value={x.brochure_intro ?? ''} onChange={(e) => setX({ ...x, brochure_intro: e.target.value })} /></Field>
        <Field label="E-mail « offres de la séance »" className="col-span-2"><Textarea rows={6} value={x.offers_mail_body ?? ''} placeholder={DEFAULT_OFFERS_MAIL} onChange={(e) => setX({ ...x, offers_mail_body: e.target.value })} /></Field>
        <Field label="E-mail « récap de la sélection + brochure »" className="col-span-2"><Textarea rows={6} value={x.recap_mail_body ?? ''} placeholder={DEFAULT_RECAP_MAIL} onChange={(e) => setX({ ...x, recap_mail_body: e.target.value })} /></Field>
        {x.id && <Toggle checked={!!x.archived} onChange={(v) => setX({ ...x, archived: v ? 1 : 0 })} label="Archivé (plus proposé pour les nouvelles séances)" />}
      </div>
    </Modal>
  );
}

function StylesView({ archived, universe, universes }: { archived: boolean; universe: string; universes: Universe[] }) {
  const common = universe === 'commun';
  const s = useAsync(async () => { const l = await listStyles(archived, common ? null : universe || null); return common ? l.filter((x) => !x.universe_id) : l; }, [archived, universe]);
  const [edit, setEdit] = useState<Partial<Style> | null>(null);
  if (!s.data) return <Loading />;
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5">
        {s.data.map((st) => (
          <Card key={st.id} onClick={() => setEdit(st)} className={cx('overflow-hidden', (!st.active || st.archived) && 'opacity-55')}>
            <div className="aspect-[4/3] bg-ink-800">{st.cover_thumb ? <img src={st.cover_thumb} className="size-full object-cover" alt="" /> : <div className="flex size-full items-center justify-center text-mist-400/50"><ImageOff className="size-8" strokeWidth={1} /></div>}</div>
            <div className="p-4">
              <div className="flex items-center justify-between"><span className="font-display text-[22px] font-semibold">{st.name}</span>{st.archived ? <Badge>Archivé</Badge> : !st.active && <Badge tone="amber">Inactif</Badge>}</div>
              <Badge tone={st.universe_id ? 'gold' : undefined} className="mt-1">{universeName(universes, st.universe_id)}</Badge>
              <div className="mt-1 text-[12.5px] text-mist-400">{st.min_iris === st.max_iris ? `${st.min_iris} iris` : `${st.min_iris} à ${st.max_iris} iris`} · {st.examples_count} exemple(s)</div>
            </div>
          </Card>
        ))}
        <button onClick={() => setEdit({ name: '', min_iris: 1, max_iris: 1, active: 1, universe_id: (!common && universe) || null })} className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 text-mist-400 transition hover:border-gold-500/60 hover:text-gold-300"><Plus className="mb-2 size-6" />Nouveau style</button>
      </div>
      {edit && <StyleEditor style={edit} universes={universes} onClose={() => { setEdit(null); s.reload(); }} />}
    </>
  );
}

function StyleEditor({ style, universes, onClose }: { style: Partial<Style>; universes: Universe[]; onClose: () => void }) {
  const [st, setSt] = useState(style);
  const [busy, setBusy] = useState(false);
  const [uploadIris, setUploadIris] = useState<string>('');
  const ex = useAsync(() => (st.id ? listExamples(st.id) : Promise.resolve([])), [st.id]);
  const save = async (close = true) => {
    const id = await act(() => saveStyle(st as Style & { name: string }), 'Style enregistré');
    if (id) { setSt({ ...st, id }); if (close) onClose(); }
    return id;
  };
  const upload = async () => {
    const id = st.id ?? (await save(false));
    if (!id) return;
    const files = await pickFiles(IMAGE_FILTER, true);
    if (!files.length) return;
    setBusy(true);
    await act(() => addExamples(id, files.map(toBlob), uploadIris ? Number(uploadIris) : null), `${files.length} image(s) ajoutée(s)`);
    setBusy(false); ex.reload();
  };
  return (
    <Modal open onClose={onClose} size="xl" title={st.id ? `Style — ${st.name}` : 'Nouveau style'}
      footer={<><Button variant="ghost" onClick={onClose}>Fermer</Button><Button variant="gold" disabled={!st.name?.trim()} onClick={() => save()}>Enregistrer</Button></>}>
      <div className="grid grid-cols-[320px_1fr] gap-6">
        <div className="space-y-4">
          <Field label="Nom *"><Input value={st.name ?? ''} onChange={(e) => setSt({ ...st, name: e.target.value })} /></Field>
          <UniverseSelect value={st.universe_id} universes={universes} onChange={(v) => setSt({ ...st, universe_id: v })} />
          <Field label="Description (visible par le client)"><Textarea rows={4} value={st.description ?? ''} onChange={(e) => setSt({ ...st, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Iris minimum"><Input type="number" min={1} value={st.min_iris ?? 1} onChange={(e) => setSt({ ...st, min_iris: Number(e.target.value) })} /></Field>
            <Field label="Iris maximum"><Input type="number" min={1} value={st.max_iris ?? 1} onChange={(e) => setSt({ ...st, max_iris: Number(e.target.value) })} /></Field>
          </div>
          <div className="space-y-2.5 pt-1">
            <div><Toggle checked={!!st.single_visual} onChange={(v) => setSt({ ...st, single_visual: v ? 1 : 0 })} label="Un seul visuel (puzzle)" />
              <div className="mt-1 text-[11.5px] text-mist-400">Les iris forment un seul iris : format conseillé comme pour 1 iris (20 × 20 cm).</div></div>
            <Toggle checked={!!st.active} onChange={(v) => setSt({ ...st, active: v ? 1 : 0 })} label="Actif (proposé à la vente)" />
            <Toggle checked={!!st.archived} onChange={(v) => setSt({ ...st, archived: v ? 1 : 0, active: v ? 0 : st.active })} label="Archivé" />
          </div>
          <div className="text-[12px] text-mist-400">Le tarif de chaque style se règle dans les Templates tarifaires (prix par nombre d’iris).</div>
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex-1 text-[13px] font-semibold">Images d’exemple</div>
            <Select className="h-8 w-40 text-[12px]" value={uploadIris} onChange={(e) => setUploadIris(e.target.value)}><option value="">Nb d’iris : tous</option>{Array.from({ length: Math.max(1, st.max_iris ?? 1) }, (_, i) => <option key={i} value={i + 1}>{i + 1} iris</option>)}</Select>
            <Button size="sm" variant="gold" loading={busy} icon={<ImagePlus className="size-3.5" />} onClick={upload}>Importer des images</Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {ex.data?.map((e, idx) => (
              <div key={e.id} className={cx('group relative overflow-hidden rounded-xl border bg-ink-800', idx === 0 ? 'border-gold-500/70' : 'border-ink-700')}>
                <img src={e.thumb} className="aspect-square w-full object-cover" alt="" />
                {idx === 0 ? (
                  <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-gold-500 px-2 py-0.5 text-[11px] font-semibold text-ink-950"><Star className="size-3 fill-current" />À la une</span>
                ) : (
                  <button title="Mettre à la une (vignette du style)" onClick={() => act(() => setCoverExample(e.id).then(ex.reload), 'Photo mise à la une')}
                    className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-mist-100 opacity-80 backdrop-blur transition hover:opacity-100 group-hover:opacity-100"><Star className="size-3" />Mettre à la une</button>
                )}
                <div className="flex items-center gap-1 p-2">
                  <Select className="h-7 text-[11.5px]" value={e.iris_count ?? ''} onChange={(x) => act(() => updateExample(e.id, { iris_count: x.target.value ? Number(x.target.value) : null }).then(ex.reload))}>
                    <option value="">Tous</option>{Array.from({ length: Math.max(1, st.max_iris ?? 1) }, (_, i) => <option key={i} value={i + 1}>{i + 1} iris</option>)}
                  </Select>
                  <IconButton title="Supprimer" onClick={() => act(() => deleteExample(e.id).then(ex.reload))}><Trash2 className="size-3.5" /></IconButton>
                </div>
              </div>
            ))}
          </div>
          {!ex.data?.length && <div className="rounded-xl border border-dashed border-ink-600 py-10 text-center text-[13px] text-mist-400">Ajoutez des exemples de réalisations (JPEG/PNG). Des miniatures sont générées automatiquement.</div>}
        </div>
      </div>
    </Modal>
  );
}

function ProductsView({ archived, universe, universes }: { archived: boolean; universe: string; universes: Universe[] }) {
  const common = universe === 'commun';
  const d = useAsync(async () => { const ps = await listProducts(archived, common ? null : universe || null); return { products: common ? ps.filter((p) => !p.universe_ids.length) : ps, variants: await listVariants(archived) }; }, [archived, universe]);
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  if (!d.data) return <Loading />;
  return (
    <>
      {(['numerique', 'impression', 'option'] as Category[]).map((cat) => (
        <div key={cat} className="mb-7">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[16px] font-semibold">{CATEGORY_LABEL[cat]}</h2><Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ category: cat, name: '', active: 1, needs_composition: cat === 'option' ? 0 : 1, universe_ids: universe && !common ? [universe] : [] })}>Produit</Button></div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {d.data!.products.filter((p) => p.category === cat).map((p) => (
              <Card key={p.id} onClick={() => setEdit(p)} className={cx('flex gap-3 p-3.5', (!p.active || p.archived) && 'opacity-55')}>
                {p.thumb ? <img src={p.thumb} className="size-14 rounded-lg object-cover" alt="" /> : <div className="size-14 rounded-lg bg-ink-800" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">{p.name}{p.archived ? <Badge>Archivé</Badge> : !p.active && <Badge tone="amber">Inactif</Badge>}</div>
                  <div className="mt-0.5 truncate text-[12px] text-mist-400">{d.data!.variants.filter((v) => v.product_id === p.id).map((v) => v.name).join(' · ')}</div>
                  <div className="mt-1 flex gap-1.5"><Badge tone={p.universe_ids.length ? 'gold' : undefined}>{p.universe_ids.length ? p.universe_ids.map((id) => universeName(universes, id)).join(' · ') : 'Commun'}</Badge>{p.style_name && <Badge tone="gold">{p.style_name}</Badge>}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
      {edit && <ProductEditor key={edit.id ?? 'new'} product={edit} universes={universes} onClose={() => { setEdit(null); d.reload(); }}
        onDuplicated={async (id) => { const np = (await listProducts(true)).find((x) => x.id === id); d.reload(); if (np) setEdit(np); }} />}
    </>
  );
}

/** Supplier catalogues (PDF) stored in the base: a product can open « its » page in the sale screen. */
function CatalogDocsView() {
  const confirm = useConfirm();
  const docs = useAsync(() => listCatalogDocs(), []);
  const [view, setView] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const files = await pickFiles(PDF_FILTER, true);
    if (!files.length) return;
    setBusy(true);
    await act(async () => { for (const f of files) await addCatalogDoc(f.name.replace(/\.pdf$/i, ''), f.name, f.bytes); return files.length; }, (n) => `${n} catalogue(s) importé(s)`);
    setBusy(false); docs.reload();
  };
  if (!docs.data) return <Loading />;
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[13px] text-mist-400">Catalogues de vos fournisseurs (PDF). Dans la fiche d’un produit, choisissez le catalogue et la page : un bouton l’ouvre directement pendant la vente. Stockés dans la base, donc inclus dans les sauvegardes.</div>
        <Button variant="gold" icon={<FileUp className="size-4" />} loading={busy} onClick={add}>Importer un PDF</Button>
      </div>
      {!docs.data.length && <Card className="p-8 text-center text-[13px] text-mist-400">Aucun catalogue. Importez par exemple le catalogue PDF de Noël de votre laboratoire.</Card>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {docs.data.map((d) => (
          <Card key={d.id} className="flex items-center gap-3 p-3.5">
            <BookOpenText className="size-8 shrink-0 text-gold-400" />
            <div className="min-w-0 flex-1">
              <Input defaultValue={d.name} className="h-8" onBlur={(e) => e.target.value.trim() && e.target.value !== d.name && act(() => renameCatalogDoc(d.id, e.target.value).then(docs.reload))} />
              <div className="mt-1 text-[11.5px] text-mist-400">{(d.size / 1048576).toFixed(1).replace('.', ',')} Mo · {d.products ?? 0} produit(s) lié(s)</div>
            </div>
            <IconButton title="Ouvrir" onClick={() => setView({ id: d.id, name: d.name })}><Eye className="size-4" /></IconButton>
            <IconButton title="Supprimer" onClick={async () => (await confirm({ title: `Supprimer « ${d.name} » ?`, danger: true, confirm: 'Supprimer', text: d.products ? `${d.products} produit(s) perdront leur lien vers ce catalogue.` : undefined }))
              && act(() => deleteCatalogDoc(d.id).then(docs.reload), 'Catalogue supprimé')}><Trash2 className="size-4" /></IconButton>
          </Card>
        ))}
      </div>
      {view && <PdfViewer docId={view.id} page={1} title={view.name} onClose={() => setView(null)} />}
    </>
  );
}

/** Extra photos of a product (slideshow in the sale screen) and its supplier catalogue page. */
function ProductExtras({ p, setP }: { p: Partial<Product>; setP: (p: Partial<Product>) => void }) {
  const photos = useAsync(() => (p.id ? listProductPhotos(p.id) : Promise.resolve([])), [p.id]);
  const docs = useAsync(() => listCatalogDocs(), []);
  const [view, setView] = useState(false);
  // keep the editor's cover in sync (saving the product writes media_id)
  const sync = async () => { const list = await listProductPhotos(p.id!); const c = list.find((x) => x.cover); setP({ ...p, media_id: c?.media_id ?? null, thumb: c?.thumb ?? null }); photos.reload(); };
  if (!p.id) return <div className="mt-5 text-[12.5px] text-mist-400">Enregistrez le produit pour ajouter plusieurs photos et un lien vers un catalogue.</div>;
  return (
    <div className="mt-5 grid grid-cols-[1fr_300px] gap-5">
      <div>
        <div className="mb-2 flex items-center justify-between"><div className="text-[13px] font-semibold">Photos du produit <span className="font-normal text-mist-400">(défilé pendant la vente ; ★ = photo principale)</span></div>
          <Button size="sm" variant="subtle" icon={<ImagePlus className="size-3.5" />} onClick={async () => { const fs = await pickFiles(IMAGE_FILTER, true); if (fs.length && await act(() => addProductPhotos(p.id!, fs.map(toBlob)), (n) => `${n} photo(s) ajoutée(s)`)) sync(); }}>Ajouter des photos</Button></div>
        <div className="flex flex-wrap gap-2">
          {(photos.data ?? []).map((x) => (
            <div key={x.id} className="group relative size-20 overflow-hidden rounded-lg bg-ink-800">
              <img src={x.thumb} className="size-full object-cover" alt="" />
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
                <button type="button" title={x.cover ? 'Photo principale' : 'Mettre en photo principale'} disabled={x.cover} onClick={() => act(() => setProductCover(p.id!, x.id)).then(sync)}><Star className={cx('size-3.5', x.cover ? 'fill-gold-400 text-gold-400' : 'text-mist-200')} /></button>
                <button type="button" title="Retirer" onClick={() => act(() => removeProductPhoto(p.id!, x.id)).then(sync)}><Trash2 className="size-3.5 text-mist-200" /></button>
              </div>
              {x.cover && <Star className="absolute top-1 left-1 size-3.5 fill-gold-400 text-gold-400" />}
            </div>
          ))}
          {!photos.data?.length && <div className="text-[12px] text-mist-400">Aucune photo.</div>}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[13px] font-semibold">Catalogue fournisseur</div>
        <div className="flex gap-2">
          <Select value={p.catalog_doc_id ?? ''} onChange={(e) => setP({ ...p, catalog_doc_id: e.target.value || null, catalog_page: e.target.value ? p.catalog_page ?? 1 : null })}>
            <option value="">— Aucun —</option>{docs.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          {p.catalog_doc_id && <Input type="number" min={1} className="w-20" title="Page" value={p.catalog_page ?? 1} onChange={(e) => setP({ ...p, catalog_page: Math.max(1, Number(e.target.value) || 1) })} />}
        </div>
        {p.catalog_doc_id ? <button type="button" className="mt-2 flex items-center gap-1.5 text-[12.5px] text-gold-300 hover:text-gold-200" onClick={() => setView(true)}><Eye className="size-3.5" />Voir la page {p.catalog_page ?? 1}</button>
          : !docs.data?.length && <div className="mt-1 text-[11.5px] text-mist-400">Importez d’abord un PDF dans l’onglet « Catalogues PDF ».</div>}
      </div>
      {view && p.catalog_doc_id && <PdfViewer docId={p.catalog_doc_id} page={p.catalog_page ?? 1} title={`${p.name} — catalogue`} onClose={() => setView(false)} />}
    </div>
  );
}

function ProductEditor({ product, universes, onClose, onDuplicated }: { product: Partial<Product>; universes: Universe[]; onClose: () => void; onDuplicated?: (id: string) => void }) {
  const confirm = useConfirm();
  const [p, setP] = useState(product);
  const styles = useAsync(() => listStyles(), []);
  const vs = useAsync(() => (p.id ? listVariants(true).then((v) => v.filter((x) => x.product_id === p.id)) : Promise.resolve([])), [p.id]);
  const sps = useAsync(() => listSupplierProducts(), []);
  const prints = useAsync(async () => (await listProducts()).filter((x) => x.category === 'impression'), []);
  const [nv, setNv] = useState('');
  const save = async () => { const id = await act(() => saveProduct(p as Product), 'Produit enregistré'); if (id) setP({ ...p, id }); return id; };
  return (
    <Modal open onClose={onClose} size="lg" title={p.id ? p.name : 'Nouveau produit'}
      footer={<>
        {p.id && <Button variant="ghost" className="text-red-300 hover:text-red-200" icon={<Trash2 className="size-4" />}
          onClick={async () => { if (!(await confirm({ title: `Supprimer « ${p.name} » ?`, danger: true, confirm: 'Supprimer', text: 'Le produit, ses variantes et ses prix dans les templates sont supprimés. S’il a déjà été vendu, il est seulement archivé (les commandes passées restent intactes). Les tarifs fournisseurs sont conservés.' }))) return;
            const r = await act(() => removeProduct(p.id!), (x) => (x === 'deleted' ? 'Produit supprimé' : 'Produit déjà vendu : archivé')); if (r) onClose(); }}>Supprimer</Button>}
        {p.id && onDuplicated && <Button variant="subtle" className="mr-auto" icon={<Copy className="size-4" />} title="Copie avec la même description, les mêmes variantes et les mêmes coûts fournisseur (partagés)"
          onClick={async () => { if (!(await save())) return; const nid = await act(() => duplicateProduct(p.id!), 'Produit dupliqué — réglez l’univers, les photos à choisir et le nom'); if (nid) onDuplicated(nid); }}>Dupliquer</Button>}
        <Button variant="ghost" onClick={onClose}>Fermer</Button><Button variant="gold" disabled={!p.name?.trim()} onClick={async () => (await save()) && onClose()}>Enregistrer</Button></>}>
      <div className="grid grid-cols-[120px_1fr] gap-5">
        <button onClick={async () => { const [f] = await pickFiles(IMAGE_FILTER); if (f) { const mid = await act(() => addMedia(toBlob(f))); if (mid) setP({ ...p, media_id: mid, thumb: null }); } }} className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink-600 text-mist-400 hover:border-gold-500/60">
          {p.thumb ? <img src={p.thumb} className="size-full object-cover" alt="" /> : p.media_id ? <Badge tone="green">Image ✓</Badge> : <ImagePlus className="size-6" />}
        </button>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom *"><Input value={p.name ?? ''} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="Catégorie"><Select value={p.category} onChange={(e) => setP({ ...p, category: e.target.value as Category })}>{(['numerique', 'impression', 'option'] as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select></Field>
          <Field label="Description" className="col-span-2"><Textarea rows={2} value={p.description ?? ''} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
          <Field label="Univers" hint="Aucun coché : commun à tous les univers."><UniverseChips value={p.universe_ids ?? []} universes={universes} onChange={(v) => setP({ ...p, universe_ids: v })} /></Field>
          <Field label="Style associé (fichiers numériques)"><Select value={p.style_id ?? ''} onChange={(e) => setP({ ...p, style_id: e.target.value || null })}><option value="">— Aucun —</option>{styles.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Photos à choisir" hint={p.photos_per_unit && p.photos_per_unit > 1 ? `Pack : ${p.photos_per_unit} photos par unité vendue.` : 'Photo à l’unité, tirage, pack de N photos…'}>
            <div className="flex gap-2">
              <Select value={p.photos_per_unit == null ? '' : p.photos_per_unit === 0 ? 'all' : p.photos_per_unit === 1 ? '1' : 'pack'}
                onChange={(e) => setP({ ...p, photos_per_unit: e.target.value === '' ? null : e.target.value === 'all' ? 0 : e.target.value === '1' ? 1 : Math.max(2, p.photos_per_unit ?? 5) })}>
                <option value="">Aucune (création iris, goodies…)</option><option value="1">1 photo par unité</option><option value="pack">Pack de plusieurs photos</option><option value="all">Toutes les photos</option>
              </Select>
              {(p.photos_per_unit ?? 0) > 1 && <Input type="number" min={2} className="w-20" value={p.photos_per_unit ?? 5} onChange={(e) => setP({ ...p, photos_per_unit: Math.max(2, Number(e.target.value) || 2) })} />}
            </div>
          </Field>
          <div className="space-y-2 pt-6">
            <Toggle checked={!!p.needs_composition} onChange={(v) => setP({ ...p, needs_composition: v ? 1 : 0 })} label="Rattaché à une création" />
            <Toggle checked={!!p.active} onChange={(v) => setP({ ...p, active: v ? 1 : 0 })} label="Actif" />
            <Toggle checked={!!p.archived} onChange={(v) => setP({ ...p, archived: v ? 1 : 0, active: v ? 0 : p.active })} label="Archivé (reste visible dans l’historique)" />
          </div>
          {p.category === 'option' && (
            <Field label="Cadre proposé automatiquement sous ces impressions" className="col-span-2"
              hint="Impressions du même univers que ce cadre (et du catalogue commun). Dans le panier, « + Ajouter un cadre » apparaît sous un tirage de ces produits quand ce cadre a une variante du même nom (ex. « 20 × 20 cm »). Quantité liée au tirage.">
              <div className="flex flex-wrap gap-1.5">
                {(prints.data ?? []).filter((x) => frameFor(p).includes(x.id) || !(p.universe_ids ?? []).length || !x.universe_ids.length || x.universe_ids.some((u) => (p.universe_ids ?? []).includes(u)))
                  .map((x) => { const on = frameFor(p).includes(x.id); return (
                  <button key={x.id} type="button" onClick={() => setP({ ...p, frame_for: JSON.stringify(on ? frameFor(p).filter((id) => id !== x.id) : [...frameFor(p), x.id]) })}
                    className={cx('rounded-full border px-2.5 py-1 text-[12px] transition', on ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-ink-600 text-mist-300 hover:border-ink-500')}>{x.name}</button>
                ); })}
                {!prints.data?.length && <span className="text-[12px] text-mist-400">Aucun produit dans « Impressions ».</span>}
              </div>
            </Field>
          )}
        </div>
      </div>
      <ProductExtras p={p} setP={setP} />
      <div className="mt-6">
        <div className="mb-2 text-[13px] font-semibold">Variantes (formats, supports, finitions)</div>
        {!p.id && <div className="text-[12.5px] text-mist-400">Enregistrez le produit pour gérer ses variantes.</div>}
        {p.id && (
          <div className="space-y-2">
            <div className="rounded-lg bg-ink-800 px-3 py-2 text-[12px] text-mist-300">Les <b>prix de vente</b> ne se saisissent pas ici : <b>Templates tarifaires</b> (ou Séance → Paramètres). Le montant ci-dessous est un <b>coût interne</b>, jamais montré au client.</div>
            <div className="grid grid-cols-[1.2fr_1fr_1fr_110px_1.4fr_auto_auto] gap-2 px-1 text-[11px] font-medium tracking-wider text-mist-400 uppercase">
              <span>Variante</span><span>Format</span><span>Finition</span><span title="Coût interne ajouté au coût fournisseur">Coût interne +</span><span>Fournisseur</span><span>Actif</span><span />
            </div>
            {vs.data?.map((v) => (
              <div key={v.id} className={cx('border-b border-ink-700/40 pb-2', v.archived && 'opacity-50')}>
              <div className="grid grid-cols-[1.2fr_1fr_1fr_110px_1.4fr_auto_auto] items-center gap-2">
                <Input defaultValue={v.name} onBlur={(e) => e.target.value !== v.name && act(() => saveVariant({ ...v, name: e.target.value }).then(vs.reload))} />
                <Input placeholder="Format" defaultValue={v.format ?? ''} onBlur={(e) => act(() => saveVariant({ ...v, format: e.target.value || null }))} />
                <Input placeholder="Finition" defaultValue={v.finish ?? ''} onBlur={(e) => act(() => saveVariant({ ...v, finish: e.target.value || null }))} />
                <MoneyInput placeholder="0,00" value={v.extra_cost_cents} onChange={(c) => act(() => saveVariant({ ...v, extra_cost_cents: c ?? 0 }).then(vs.reload))} />
                <Select value={v.preferred_supplier_product_id ?? ''} onChange={(e) => act(() => saveVariant({ ...v, preferred_supplier_product_id: e.target.value || null }).then(vs.reload))} title="Fournisseur préféré">
                  <option value="">{sps.data?.some((s) => s.variant_id === v.id) ? 'Fournisseur : le moins cher' : 'Fournisseur : aucun (choisir un tarif)'}</option>
                  {sps.data?.some((s) => s.variant_id === v.id) && <optgroup label="Liés à cette variante">{sps.data.filter((s) => s.variant_id === v.id).map((s) => <option key={s.id} value={s.id}>{s.supplier_name} — {s.name}</option>)}</optgroup>}
                  {[...new Set((sps.data ?? []).filter((s) => s.variant_id !== v.id && !s.archived).map((s) => s.supplier_name))].map((sup) => (
                    <optgroup key={sup} label={`${sup} — tous les tarifs`}>{sps.data!.filter((s) => s.supplier_name === sup && s.variant_id !== v.id && !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}{s.format ? ` · ${s.format}` : ''}{s.price_cents != null ? ` · ${(s.price_cents / 100).toFixed(2).replace('.', ',')} €` : ''}</option>)}</optgroup>
                  ))}
                </Select>
                <Toggle checked={!!v.active} onChange={(x) => act(() => saveVariant({ ...v, active: x ? 1 : 0 }).then(vs.reload))} />
                <IconButton title="Supprimer / archiver" onClick={async () => (await confirm({ title: `Retirer la variante « ${v.name} » ?`, text: 'Si elle a déjà été vendue, elle est archivée (historique conservé).' })) && act(() => removeVariant(v.id).then(vs.reload))}><Trash2 className="size-4" /></IconButton>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-1"><span className="text-[11px] tracking-wider text-mist-400 uppercase">Univers</span>
                <UniverseChips value={v.universe_ids} universes={universes} none="comme le produit" onChange={(ids) => act(() => saveVariant({ ...v, universe_ids: ids }).then(vs.reload))} /></div>
              </div>
            ))}
            <div className="flex gap-2 pt-1"><Input placeholder="Nouvelle variante (ex. 50 × 50 cm)" value={nv} onChange={(e) => setNv(e.target.value)} className="max-w-xs" />
              <Button icon={<Plus className="size-4" />} disabled={!nv.trim()} onClick={() => act(() => saveVariant({ product_id: p.id!, name: nv, format: p.category === 'impression' ? nv : null }).then(() => { setNv(''); vs.reload(); }))}>Ajouter</Button></div>
            <div className="text-[11.5px] text-mist-400">« Coût interne + » : coût complémentaire par unité (fixation, emballage, consommables), ajouté au coût d’achat pour calculer vos marges. Ce n’est pas un prix de vente.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
