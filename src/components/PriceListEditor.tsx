import { useMemo, useState } from 'react';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, Loading, Modal, MoneyInput, Select, Textarea, Toggle, useAsync, useConfirm, cx } from './ui';
import { listStyles, listProducts, listVariants, CATEGORY_LABEL, type Product, type Variant } from '../services/catalog';
import { deletePromotion, getPriceItems, parseCoefInput, setPricesFromCoef, listPromotions, savePromotion, setPrice, setPromotionActive, toPromotion, type PriceListItem } from '../services/pricing';
import { variantCosts } from '../services/suppliers';
import { eur, fmtCoef, fmtRate, margin, pctToBp, bpToPct, priceFromCoef, priceFromMarginRate } from '../lib/money';
import type { Promotion, PromoConfig, Selector } from '../lib/pricing';
import { act } from '../lib/act';

/** Simple table editor for a price list (template master list or session copy). */
export function PriceListEditor({ priceListId }: { priceListId: string }) {
  const data = useAsync(async () => {
    const [items, styles, products, variants, costs, promos] = await Promise.all([getPriceItems(priceListId), listStyles(), listProducts(), listVariants(), variantCosts(), listPromotions(priceListId)]);
    return { items, styles, products, variants, costs, promos };
  }, [priceListId]);
  const confirmBulk = useConfirm();
  if (!data.data) return <Loading />;
  const { items, styles, products, variants, costs, promos } = data.data;
  const bulkCoef = async (p: Product) => {
    const vs = variants.filter((v) => v.product_id === p.id && v.active);
    const rows = vs.map((v) => ({ variantId: v.id, cost: costs.get(v.id)?.cost })).filter((r): r is { variantId: string; cost: number } => r.cost != null);
    const raw = await confirmBulk({ title: `Prix de vente de « ${p.name} »`, confirm: 'Appliquer',
      text: `Prix = coût de revient × coefficient, pour ${rows.length} format(s) sur ${vs.length}${rows.length < vs.length ? ' (les formats sans coût connu ne sont pas modifiés)' : ''}. Les prix existants de ces formats sont remplacés.`,
      input: { label: 'Coefficient (ex. 1,07) ou pourcentage (ex. +7 %)', placeholder: '+7 %', required: true } });
    if (!raw) return;
    const coef = parseCoefInput(raw);
    if (coef == null) return act(async () => { throw new Error('Valeur invalide : tapez par exemple 1,07 ou +7 %.'); });
    await act(async () => { const n = await setPricesFromCoef(priceListId, rows, coef); await data.reload(); return n; }, (n) => `${n} prix calculés (× ${coef.toFixed(2).replace('.', ',')})`);
  };
  const item = (kind: 'variant' | 'style', ref: string, iris = 0) => items.find((i) => i.kind === kind && i.ref_id === ref && i.iris_count === iris);
  const save = (kind: 'variant' | 'style', ref: string, iris: number, price: number | null, mode: PriceListItem['pricing_mode'] = 'manual', param: number | null = null) =>
    act(() => setPrice(priceListId, kind, ref, iris, price, mode, param).then(data.reload));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Créations photographiques" subtitle="Frais de création facturés une seule fois par création, quel que soit le nombre de produits. « Tous » s’applique si aucun prix spécifique au nombre d’iris n’est défini." />
        <div className="overflow-x-auto p-2">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] tracking-wider text-mist-400 uppercase"><th className="px-3 py-2">Style</th><th className="px-2 py-2">Tous</th>{Array.from({ length: 6 }, (_, i) => <th key={i} className="px-2 py-2">{i + 1} iris</th>)}</tr></thead>
            <tbody>
              {styles.map((s) => (
                <tr key={s.id} className="border-t border-ink-700/50">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{s.name} <span className="text-[11.5px] text-mist-400">{s.min_iris}–{s.max_iris}</span></td>
                  <td className="w-28 px-2 py-1.5"><PriceCell value={item('style', s.id)?.price_cents} onSave={(v) => save('style', s.id, 0, v)} /></td>
                  {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
                    <td key={n} className="w-28 px-2 py-1.5">{n >= s.min_iris && n <= s.max_iris ? <PriceCell value={item('style', s.id, n)?.price_cents} onSave={(v) => save('style', s.id, n, v)} /> : <span className="block text-center text-mist-400/40">—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {(['numerique', 'impression', 'option'] as const).map((cat) => {
        const prods = products.filter((p) => p.category === cat && p.active);
        if (!prods.length) return null;
        return (
          <Card key={cat}>
            <CardHeader title={CATEGORY_LABEL[cat]} subtitle={cat === 'impression' ? 'Coût de revient issu du fournisseur préféré (TTC si TVA non récupérable). Mode coefficient / marge : prix recalculé depuis le coût.' : undefined} />
            <div className="overflow-x-auto p-2">
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[11px] tracking-wider text-mist-400 uppercase"><th className="px-3 py-2">Produit</th><th className="px-3 py-2">Variante</th><th className="px-2 py-2">Prix de vente</th><th className="px-2 py-2">Mode</th><th className="px-3 py-2 text-right">Coût revient</th><th className="px-3 py-2 text-right">Marge</th><th className="px-3 py-2 text-right">Taux marque</th><th className="px-3 py-2 text-right">Coef.</th></tr></thead>
                <tbody>
                  {prods.flatMap((p) => variants.filter((v) => v.product_id === p.id && v.active).map((v, i) => (
                    <VariantRow key={`${v.id}-${item('variant', v.id)?.pricing_mode}-${item('variant', v.id)?.pricing_param}`} p={p} v={v} first={i === 0} it={item('variant', v.id)} cost={costs.get(v.id)?.cost ?? null} onSave={(price, mode, param) => save('variant', v.id, 0, price, mode, param)} onBulk={() => bulkCoef(p)} />
                  )))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
      <PromotionsEditor priceListId={priceListId} rows={promos} reload={data.reload} styles={styles} products={products} />
    </div>
  );
}

function PriceCell({ value, onSave }: { value: number | null | undefined; onSave: (v: number | null) => void }) {
  const [v, setV] = useState<number | null | undefined>(undefined);
  const cur = v === undefined ? value : v;
  return <MoneyInput value={cur ?? null} placeholder="—" onChange={setV} onBlur={() => { if (v !== undefined && v !== value) onSave(v); setV(undefined); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

function VariantRow({ p, v, first, it, cost, onSave, onBulk }: { p: Product; v: Variant; first: boolean; it?: PriceListItem; cost: number | null; onSave: (price: number | null, mode?: PriceListItem['pricing_mode'], param?: number | null) => void; onBulk: () => void }) {
  const mode = it?.pricing_mode ?? 'manual';
  const [param, setParam] = useState<string>(it?.pricing_param != null ? String(mode === 'margin' ? it.pricing_param * 100 : it.pricing_param).replace('.', ',') : '');
  const m = it && cost != null ? margin(it.price_cents, cost) : null;
  const applyParam = (md: PriceListItem['pricing_mode'], raw: string) => {
    const n = Number(raw.replace(',', '.'));
    if (md === 'manual' || cost == null || !Number.isFinite(n) || n <= 0) return;
    if (md === 'coef') onSave(priceFromCoef(cost, n), 'coef', n);
    else if (n < 100) onSave(priceFromMarginRate(cost, n / 100), 'margin', n / 100);
  };
  return (
    <tr className={cx('border-t border-ink-700/50', first && 'border-ink-600')}>
      <td className="px-3 py-2 font-medium">{first && <>{p.name}<button className="mt-0.5 block text-[11.5px] font-normal text-gold-300/90 hover:text-gold-200" onClick={onBulk}>Coefficient sur tous les formats…</button></>}</td>
      <td className="px-3 py-2 text-mist-300">{v.name}</td>
      <td className="w-32 px-2 py-1.5">{mode === 'manual' ? <PriceCell value={it?.price_cents} onSave={(x) => onSave(x, 'manual', null)} /> : <span className="block pr-2 text-right font-medium tabular">{eur(it?.price_cents)}</span>}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Select className="h-8 w-[132px] text-[12px]" value={mode} disabled={!it && cost == null} onChange={(e) => {
            const md = e.target.value as PriceListItem['pricing_mode'];
            if (md === 'manual') onSave(it?.price_cents ?? null, 'manual', null);
            else { const def = md === 'coef' ? '2,5' : '60'; setParam(def); applyParam(md, def); }
          }}>
            <option value="manual">Manuel</option><option value="coef" disabled={cost == null}>Coefficient</option><option value="margin" disabled={cost == null}>Taux de marque</option>
          </Select>
          {mode !== 'manual' && <Input className="h-8 w-16 text-right text-[12px]" value={param} onChange={(e) => setParam(e.target.value)} onBlur={() => applyParam(mode, param)} placeholder={mode === 'coef' ? '×' : '%'} />}
          {mode === 'margin' && <span className="text-[12px] text-mist-400">%</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-right text-mist-300 tabular">{cost != null ? eur(cost) : <span className="text-mist-400/60">non renseigné</span>}</td>
      <td className={cx('px-3 py-2 text-right tabular', m && m.margin_cents < 0 && 'text-red-300')}>{m ? eur(m.margin_cents) : '—'}</td>
      <td className="px-3 py-2 text-right tabular">{m ? fmtRate(m.margin_rate) : '—'}</td>
      <td className="px-3 py-2 text-right tabular">{m ? fmtCoef(m.coefficient) : '—'}</td>
    </tr>
  );
}

/* ------------------------------------------------------------------ promotions */
const TYPE_LABEL: Record<Promotion['type'], string> = { pack: 'Pack', percent: 'Remise %', amount: 'Remise €', quantity: 'Remise quantité' };

function PromotionsEditor({ priceListId, rows, reload, styles, products }: { priceListId: string; rows: Awaited<ReturnType<typeof listPromotions>>; reload: () => void; styles: { id: string; name: string }[]; products: Product[] }) {
  const confirm = useConfirm();
  const [edit, setEdit] = useState<(Partial<Promotion> & { description?: string | null }) | null>(null);
  const describe = (p: Promotion) => {
    const c = p.config as PromoConfig & Record<string, unknown>;
    const th = [c.min_subtotal_cents ? `dès ${eur(c.min_subtotal_cents as number)}` : '', c.max_subtotal_cents ? `jusqu’à ${eur(c.max_subtotal_cents as number)}` : ''].filter(Boolean).join(' ');
    const on = c.threshold_category ? ({ impression: ' d’impressions', numerique: ' de fichiers numériques', option: ' d’options', creation: ' de créations' } as Record<string, string>)[c.threshold_category as string] ?? '' : '';
    const lim = c.max_units ? ` · limité à ${c.max_units} article${(c.max_units as number) > 1 ? 's' : ''}` : '';
    return describeBody(p, c) + lim + (th ? ` · ${on ? 'achats' : 'commande'} ${th}${on}` : '');
  };
  const describeBody = (p: Promotion, c: PromoConfig & Record<string, unknown>) => {
    if (p.type === 'pack') return `${(c.items as { qty: number; selector: Selector }[]).map((i) => `${i.qty} × ${selLabel(i.selector, styles, products)}`).join(' + ')} → ${c.mode === 'price' ? `prix du pack ${eur(c.value_cents as number)}` : `− ${eur(c.value_cents as number)}`}${c.repeat ? ' (répétable)' : ''}`;
    if (p.type === 'percent') return `− ${bpToPct(c.pct_bp as number)} % sur ${c.scope === 'order' ? 'la commande' : c.scope === 'category' ? CATEGORY_LABEL[c.target as 'numerique'] : c.scope === 'style' ? styles.find((s) => s.id === c.target)?.name : products.find((x) => x.id === c.target)?.name}`;
    if (p.type === 'amount') return `− ${eur(c.amount_cents as number)} sur ${!c.scope || c.scope === 'order' ? 'la commande' : c.scope === 'category' ? CATEGORY_LABEL[c.target as 'numerique'] : c.scope === 'style' ? styles.find((s) => s.id === c.target)?.name : products.find((x) => x.id === c.target)?.name}`;
    return `− ${bpToPct(c.pct_bp as number)} % dès ${c.min_qty} ${c.scope === 'category' ? CATEGORY_LABEL[c.target as 'numerique'] : products.find((x) => x.id === c.target)?.name}`;
  };
  return (
    <Card>
      <CardHeader title="Packs & promotions" subtitle="Évaluées par priorité croissante. Une offre non cumulable ne s’applique que seule. Jamais deux fois la même remise, jamais de total négatif."
        actions={<Button size="sm" variant="gold" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ type: 'pack', priority: 10, stackable: true, active: true, name: '', config: { items: [{ selector: { category: 'numerique' }, qty: 1 }, { selector: { category: 'impression' }, qty: 1 }], mode: 'price', value_cents: 0 } })}>Ajouter</Button>} />
      <div className="divide-y divide-ink-700/60">
        {!rows.length && <div className="px-5 py-6 text-[13px] text-mist-400">Aucune offre. Exemples : « Fichier HD + tirage », « Fusion familiale + tableau », « 2 impressions achetées ».</div>}
        {rows.map((r) => { const p = toPromotion(r); return (
          <div key={r.id} className="flex items-center gap-4 px-5 py-3">
            <Gift className="size-4 text-gold-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">{p.name}<Badge>{TYPE_LABEL[p.type]}</Badge>{!p.stackable && <Badge tone="amber">Non cumulable</Badge>}<span className="text-[11.5px] text-mist-400">priorité {p.priority}</span></div>
              <div className="mt-0.5 truncate text-[12.5px] text-mist-400">{describe(p)}</div>
            </div>
            <Toggle checked={p.active} onChange={(v) => act(() => setPromotionActive(r.id, v).then(reload))} label={p.active ? 'Active' : 'Inactive'} />
            <IconButton title="Modifier" onClick={() => setEdit({ ...p, description: r.description })}><Pencil className="size-4" /></IconButton>
            <IconButton title="Supprimer" onClick={async () => (await confirm({ title: `Supprimer « ${p.name} » ?`, danger: true, confirm: 'Supprimer' })) && act(() => deletePromotion(r.id).then(reload))}><Trash2 className="size-4" /></IconButton>
          </div>); })}
      </div>
      {edit && <PromotionDialog promo={edit} styles={styles} products={products} onClose={() => setEdit(null)} onSave={async (p) => { if (await act(() => savePromotion(priceListId, p as Promotion), 'Offre enregistrée') !== undefined) { setEdit(null); reload(); } }} />}
    </Card>
  );
}

const selLabel = (s: Selector, styles: { id: string; name: string }[], products: Product[]) =>
  s.productId ? products.find((p) => p.id === s.productId)?.name ?? 'Produit' : s.styleId ? `Création ${styles.find((x) => x.id === s.styleId)?.name ?? ''}` : s.category ? CATEGORY_LABEL[s.category as 'numerique'] : '?';
const selValue = (s: Selector) => (s.productId ? `p:${s.productId}` : s.styleId ? `s:${s.styleId}` : `c:${s.category}`);
const parseSel = (v: string): Selector => { const [k, id] = v.split(':'); return k === 'p' ? { productId: id } : k === 's' ? { category: 'creation', styleId: id } : { category: id }; };

function PromotionDialog({ promo, styles, products, onClose, onSave }: { promo: Partial<Promotion> & { description?: string | null }; styles: { id: string; name: string }[]; products: Product[]; onClose: () => void; onSave: (p: Partial<Promotion> & { description?: string | null }) => void }) {
  const [p, setP] = useState(promo);
  const c = p.config as unknown as Record<string, unknown>;
  const setC = (patch: Record<string, unknown>) => setP({ ...p, config: { ...c, ...patch } as unknown as PromoConfig });
  const selectorOptions = useMemo(() => [
    ...(['numerique', 'impression', 'option'] as const).map((k) => ({ v: `c:${k}`, l: `Catégorie — ${CATEGORY_LABEL[k]}` })),
    { v: 'c:creation', l: 'Toute création' },
    ...styles.map((s) => ({ v: `s:${s.id}`, l: `Création — ${s.name}` })),
    ...products.filter((x) => x.active).map((x) => ({ v: `p:${x.id}`, l: `Produit — ${x.name}` })),
  ], [styles, products]);
  const changeType = (t: Promotion['type']) => setP({ ...p, type: t, config: (t === 'pack' ? { items: [{ selector: { category: 'numerique' }, qty: 1 }], mode: 'price', value_cents: 0 } : t === 'percent' ? { pct_bp: 1000, scope: 'order' } : t === 'amount' ? { amount_cents: 0 } : { scope: 'category', target: 'impression', min_qty: 2, pct_bp: 1000 }) as PromoConfig });
  const items = (c.items as { selector: Selector; qty: number }[]) ?? [];
  return (
    <Modal open onClose={onClose} title={p.id ? 'Modifier l’offre' : 'Nouvelle offre'} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={!p.name?.trim()} onClick={() => onSave(p)}>Enregistrer</Button></>}>
      <div className="grid grid-cols-4 gap-4">
        <Field label="Nom affiché au client *" className="col-span-2"><Input autoFocus value={p.name ?? ''} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Fusion familiale + tableau" /></Field>
        <Field label="Type"><Select value={p.type} onChange={(e) => changeType(e.target.value as Promotion['type'])}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Priorité" hint="Plus petit = évalué en premier"><Input type="number" value={p.priority ?? 100} onChange={(e) => setP({ ...p, priority: Number(e.target.value) })} /></Field>
        <Field label="Description (catalogue client)" className="col-span-4"><Textarea rows={2} value={p.description ?? ''} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
        {p.type === 'pack' && (
          <div className="col-span-4 space-y-2 rounded-xl border border-ink-700 p-3">
            <div className="text-[12px] font-medium text-mist-300">Contenu du pack (détecté automatiquement dans le panier)</div>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="number" min={1} className="w-20" value={it.qty} onChange={(e) => setC({ items: items.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)) })} />
                <span className="text-mist-400">×</span>
                <Select value={selValue(it.selector)} onChange={(e) => setC({ items: items.map((x, j) => (j === i ? { ...x, selector: parseSel(e.target.value) } : x)) })}>{selectorOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</Select>
                <IconButton title="Retirer" onClick={() => setC({ items: items.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></IconButton>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setC({ items: [...items, { selector: { category: 'impression' }, qty: 1 }] })}>Élément</Button>
            <div className="flex flex-wrap items-end gap-3 pt-2">
              <Field label="Calcul"><Select value={c.mode as string} onChange={(e) => setC({ mode: e.target.value })}><option value="price">Prix fixe du pack</option><option value="discount">Remise en €</option></Select></Field>
              <Field label={c.mode === 'price' ? 'Prix du pack' : 'Montant de la remise'}><MoneyInput className="w-36" value={c.value_cents as number} onChange={(v) => setC({ value_cents: v ?? 0 })} /></Field>
              <div className="pb-2"><Toggle checked={!!c.repeat} onChange={(v) => setC({ repeat: v })} label="Applicable plusieurs fois" /></div>
            </div>
          </div>
        )}
        {p.type === 'percent' && (<>
          <Field label="Remise (%)"><Input value={bpToPct(c.pct_bp as number)} onChange={(e) => setC({ pct_bp: pctToBp(e.target.value) ?? 0 })} /></Field>
          <Field label="Portée"><Select value={c.scope as string} onChange={(e) => setC({ scope: e.target.value, target: e.target.value === 'category' ? 'impression' : e.target.value === 'style' ? styles[0]?.id : e.target.value === 'product' ? products[0]?.id : undefined })}><option value="order">Toute la commande</option><option value="category">Une catégorie</option><option value="style">Un style de création</option><option value="product">Un produit</option></Select></Field>
          {c.scope !== 'order' && <Field label="Limiter à (articles)" hint="Vide = tous. 1 = un seul offert (le moins cher)."><Input type="number" min={1} value={(c.max_units as number) ?? ''} placeholder="Tous" onChange={(e) => setC({ max_units: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })} /></Field>}
          {c.scope !== 'order' && <Field label="Cible"><Select value={c.target as string} onChange={(e) => setC({ target: e.target.value })}>
            {c.scope === 'category' && (['numerique', 'impression', 'option', 'creation'] as const).map((k) => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}
            {c.scope === 'style' && styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {c.scope === 'product' && products.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select></Field>}
        </>)}
        {p.type === 'amount' && (<>
          <Field label="Montant de la remise"><MoneyInput value={c.amount_cents as number} onChange={(v) => setC({ amount_cents: v ?? 0 })} /></Field>
          <Field label="Sur"><Select value={(c.scope as string) ?? 'order'} onChange={(e) => setC({ scope: e.target.value, target: e.target.value === 'category' ? 'numerique' : e.target.value === 'style' ? styles[0]?.id : e.target.value === 'product' ? products[0]?.id : undefined })}><option value="order">Toute la commande</option><option value="category">Une catégorie</option><option value="style">Un style de création</option><option value="product">Un produit</option></Select></Field>
          {c.scope && c.scope !== 'order' && <Field label="Cible" hint="La remise ne dépasse jamais le prix des articles ciblés."><Select value={c.target as string} onChange={(e) => setC({ target: e.target.value })}>
            {c.scope === 'category' && (['numerique', 'impression', 'option', 'creation'] as const).map((k) => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}
            {c.scope === 'style' && styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {c.scope === 'product' && products.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select></Field>}
          {c.scope && c.scope !== 'order' && <Field label="Limiter à (articles)" hint="Vide = tous. 1 = un seul article."><Input type="number" min={1} value={(c.max_units as number) ?? ''} placeholder="Tous" onChange={(e) => setC({ max_units: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })} /></Field>}
        </>)}
        {p.type === 'quantity' && (<>
          <Field label="Quantité minimum"><Input type="number" min={2} value={c.min_qty as number} onChange={(e) => setC({ min_qty: Math.max(1, Number(e.target.value)) })} /></Field>
          <Field label="Remise (%)"><Input value={bpToPct(c.pct_bp as number)} onChange={(e) => setC({ pct_bp: pctToBp(e.target.value) ?? 0 })} /></Field>
          <Field label="Sur" className="col-span-2"><Select value={`${c.scope}:${c.target}`} onChange={(e) => { const [scope, target] = e.target.value.split(':'); setC({ scope, target }); }}>
            {(['numerique', 'impression', 'option'] as const).map((k) => <option key={k} value={`category:${k}`}>Catégorie — {CATEGORY_LABEL[k]}</option>)}
            {products.map((x) => <option key={x.id} value={`product:${x.id}`}>Produit — {x.name}</option>)}
          </Select></Field>
        </>)}
        <div className="col-span-4 grid grid-cols-4 gap-4 rounded-xl border border-ink-700 p-3">
          <div className="col-span-4 text-[12px] font-medium text-mist-300">Condition sur le montant de la commande (facultatif) — prix normal, avant remises</div>
          <Field label="Dès (inclus)"><MoneyInput value={(c.min_subtotal_cents as number) ?? null} placeholder="—" onChange={(v) => setC({ min_subtotal_cents: v ?? undefined })} /></Field>
          <Field label="Jusqu’à (inclus)"><MoneyInput value={(c.max_subtotal_cents as number) ?? null} placeholder="—" onChange={(v) => setC({ max_subtotal_cents: v ?? undefined })} /></Field>
          <Field label="Montant calculé sur" className="col-span-2"><Select value={(c.threshold_category as string) ?? ''} onChange={(e) => setC({ threshold_category: e.target.value || undefined })}>
            <option value="">Toute la commande</option><option value="impression">Impressions seulement</option><option value="numerique">Numérique seulement</option><option value="option">Options seulement</option><option value="creation">Créations seulement</option>
          </Select></Field>
          <div className="col-span-4 text-[11.5px] text-mist-400">Ex. « Fichier HD offert » : Remise % de 100 % sur Numérique, limité à 1 article, dès 200 € d’impressions.</div>
        </div>
        <div className="col-span-4 flex gap-6 pt-1">
          <Toggle checked={p.stackable ?? true} onChange={(v) => setP({ ...p, stackable: v })} label="Cumulable avec d’autres offres" />
          <Toggle checked={p.active ?? true} onChange={(v) => setP({ ...p, active: v })} label="Active" />
        </div>
      </div>
    </Modal>
  );
}
