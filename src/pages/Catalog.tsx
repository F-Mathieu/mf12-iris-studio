import { useState } from 'react';
import { Copy, ImageOff, ImagePlus, Plus, Star, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Field, IconButton, Input, Loading, Modal, MoneyInput, PageHeader, Select, Tabs, Textarea, Toggle, useAsync, useConfirm, cx } from '../components/ui';
import { addExamples, addMedia, CATEGORY_LABEL, deleteExample, duplicateProduct, removeProduct, setCoverExample, listExamples, listProducts, listStyles, listVariants, removeVariant, saveProduct, saveStyle, saveVariant, updateExample, type Category, type Product, type Style } from '../services/catalog';
import { listSupplierProducts } from '../services/suppliers';
import { listUniverses, saveUniverse, type Universe } from '../services/universes';
import { listTemplates } from '../services/pricing';
import { DEFAULT_OFFERS_MAIL, DEFAULT_RECAP_MAIL } from '../lib/invoiceMail';
import { IMAGE_FILTER, pickFiles, type PickedFile } from '../lib/files';
import { mimeOf } from '../lib/images';
import { act } from '../lib/act';

const toBlob = (f: PickedFile) => new Blob([f.bytes as BlobPart], { type: mimeOf(f.name) });

export default function Catalog() {
  const [tab, setTab] = useState<'styles' | 'produits' | 'univers'>('styles');
  const [archived, setArchived] = useState(false);
  const [universe, setUniverse] = useState('');
  const universes = useAsync(() => listUniverses(true), [tab]);
  return (
    <>
      <PageHeader title="Catalogue" subtitle="Univers de séance, styles de montages présentés en exemple et produits vendus. Rien n’est codé en dur."
        actions={<>{tab !== 'univers' && <Select className="w-48" value={universe} onChange={(e) => setUniverse(e.target.value)} title="Commun + univers choisi"><option value="">Tous les univers</option>{universes.data?.filter((u) => !u.archived).map((u) => <option key={u.id} value={u.id}>{u.name} (+ commun)</option>)}</Select>}<Toggle checked={archived} onChange={setArchived} label="Afficher les archives" /></>} />
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ id: 'styles', label: 'Styles de montages' }, { id: 'produits', label: 'Produits & variantes' }, { id: 'univers', label: 'Univers de séance' }]} />
      {tab === 'styles' ? <StylesView archived={archived} universe={universe} universes={universes.data ?? []} />
        : tab === 'produits' ? <ProductsView archived={archived} universe={universe} universes={universes.data ?? []} />
        : <UniversesView archived={archived} />}
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
  const s = useAsync(() => listStyles(archived, universe || null), [archived, universe]);
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
        <button onClick={() => setEdit({ name: '', min_iris: 1, max_iris: 1, active: 1, universe_id: universe || null })} className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 text-mist-400 transition hover:border-gold-500/60 hover:text-gold-300"><Plus className="mb-2 size-6" />Nouveau style</button>
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
  const d = useAsync(async () => ({ products: await listProducts(archived, universe || null), variants: await listVariants(archived) }), [archived, universe]);
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  if (!d.data) return <Loading />;
  return (
    <>
      {(['numerique', 'impression', 'option'] as Category[]).map((cat) => (
        <div key={cat} className="mb-7">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[16px] font-semibold">{CATEGORY_LABEL[cat]}</h2><Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ category: cat, name: '', active: 1, needs_composition: cat === 'option' ? 0 : 1, universe_ids: universe ? [universe] : [] })}>Produit</Button></div>
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

function ProductEditor({ product, universes, onClose, onDuplicated }: { product: Partial<Product>; universes: Universe[]; onClose: () => void; onDuplicated?: (id: string) => void }) {
  const confirm = useConfirm();
  const [p, setP] = useState(product);
  const styles = useAsync(() => listStyles(), []);
  const vs = useAsync(() => (p.id ? listVariants(true).then((v) => v.filter((x) => x.product_id === p.id)) : Promise.resolve([])), [p.id]);
  const sps = useAsync(() => listSupplierProducts(), []);
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
        </div>
      </div>
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
