import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgePercent, CalendarClock, Check, Eye, Gift, ImageOff, Minus, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Field, IconButton, Input, Loading, Modal, MoneyInput, Stepper, Textarea, useAsync, useConfirm, cx } from './ui';
import { Lightbox, type LightItem } from './Lightbox';
import { PinDialog } from './PinDialog';
import { FormatGuideDialog, IrisSketch, SizeViewer, variantDims } from './IrisSketch';
import { adviceFor, dimsLabel, sameDims, ORIENTATION_LABEL, type Orientation } from '../lib/formatsGuide';
import { useApp } from '../store';
import { listExamples, listProducts, listStyles, listVariants, type Example, type Product, type Style, type Variant } from '../services/catalog';
import { getFamily } from '../services/families';
import { getSession } from '../services/sessions';
import { variantCosts } from '../services/suppliers';
import { emptyCart, loadCart, pricingContext, saveCart, totalsOf, type Cart, type CartComp } from '../services/orders';
import { findPrice, schedule, type ManualDiscount, type PaymentPlan } from '../lib/pricing';
import { fmtDate } from '../lib/format';
import { todayIso } from '../lib/ids';
import { eur, pctToBp } from '../lib/money';
import { uid } from '../lib/ids';
import { act } from '../lib/act';

type Mode = 'admin' | 'client';
type LeftTab = 'creations' | 'numerique' | 'impression' | 'option';

/**
 * Sales configurator. Shows SALE prices only (no cost, margin or supplier) in both modes.
 * A composition (création) is billed once; products are attached to it.
 */
export interface ConfiguratorApi { saveDraft: () => Promise<string | null> }

export function Configurator({ mode, sessionId, familyId, registrationId, orderId, onSaved, apiRef }: {
  mode: Mode; sessionId: string; familyId: string; registrationId: string | null; orderId?: string | null;
  onSaved: (r: { id: string; number: string; status: 'brouillon' | 'validee' }) => void;
  /** Lets the parent save the current cart as a draft (e.g. before switching to the client presentation). */
  apiRef?: React.MutableRefObject<ConfiguratorApi | null>;
}) {
  const confirm = useConfirm();
  const data = useAsync(async () => {
    const [session, family, styles, examples, products, variants, ctx, costs] = await Promise.all([
      getSession(sessionId), getFamily(familyId), listStyles(), listExamples(), listProducts(), listVariants(), pricingContext(sessionId), variantCosts(),
    ]);
    const cart = orderId ? await loadCart(orderId) : emptyCart(sessionId, familyId, registrationId);
    return { session, family, styles: styles.filter((s) => s.active), examples, products: products.filter((p) => p.active), variants: variants.filter((v) => v.active), ctx, costs, cart };
  }, [sessionId, familyId, orderId]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [activeComp, setActiveComp] = useState<string | null>(null);
  const [tab, setTab] = useState<LeftTab>('creations');
  const [styleOpen, setStyleOpen] = useState<Style | null>(null);
  const [light, setLight] = useState<{ items: LightItem[]; i: number } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [pinFor, setPinFor] = useState<'discount' | 'validate' | null>(null);
  const [savedSnap, setSavedSnap] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [sizeFor, setSizeFor] = useState<{ productId: string; initial?: string } | null>(null);
  const { settings } = useApp();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data.data) { setCart(data.data.cart); setSavedSnap(data.data.cart.orderId ? snap(data.data.cart) : null); setActiveComp(data.data.cart.compositions.at(-1)?.key ?? null); } }, [data.data]);
  const cartRef = useRef<Cart | null>(null);
  cartRef.current = cart;
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      saveDraft: async () => {
        const c = cartRef.current;
        if (!c) return null;
        if (c.status !== 'brouillon' || (!c.compositions.length && !c.items.length)) return c.orderId;
        const r = await saveCart(c, 'brouillon');
        setCart({ ...c, orderId: r.id, number: r.number });
        return r.id;
      },
    };
    return () => { apiRef.current = null; };
  }, [apiRef]);

  const d = data.data;
  const totals = useMemo(() => (cart && d ? totalsOf(cart, d.ctx.promotions) : null), [cart, d]);
  if (!d || !cart || !totals) return <Loading />;
  const { styles, examples, products, variants, ctx, costs, family } = d;
  const participants = family?.participants ?? [];
  // Cancelled orders are read-only; in the client presentation a validated order is read-only too.
  const locked = cart.status === 'annulee' || (mode === 'client' && cart.status === 'validee');
  const isValidated = cart.status === 'validee';

  const stylePrice = (s: Style, iris: number) => findPrice(ctx.rows, 'style', s.id, iris);
  const minStylePrice = (s: Style) => {
    const ps = ctx.rows.filter((r) => r.kind === 'style' && r.ref_id === s.id && r.enabled).map((r) => r.price_cents);
    return ps.length ? Math.min(...ps) : null;
  };
  const comp = cart.compositions.find((c) => c.key === activeComp) ?? null;
  const variantPrice = (v: Variant, iris = comp?.irisCount ?? 0) => findPrice(ctx.rows, 'variant', v.id, iris);
  const exOf = (styleId: string) => examples.filter((e) => e.style_id === styleId);

  const update = (fn: (c: Cart) => Cart) => setCart((c) => (c ? fn(c) : c));
  const addComposition = (c: CartComp, stay = false) => {
    update((x) => ({ ...x, compositions: [...x.compositions, c] })); setActiveComp(c.key);
    if (!stay) { setTab('numerique'); toast.success(`Création ${c.styleName} ajoutée — choisissez maintenant les produits`); }
    else toast.success(`${c.styleName} · ${c.irisCount} iris ajoutée${c.participantNames ? ` (${c.participantNames})` : ''}`);
  };
  /** Quick add from the card checkbox: default iris = family participants (up to the style maximum). */
  const quickToggle = (st: Style) => {
    const existing = cart.compositions.filter((c) => c.styleId === st.id);
    if (existing.length) { removeComposition(existing[existing.length - 1].key); return; }
    const sel = defaultIris(st, participants);
    const count = participants.length ? sel.length : st.min_iris;
    if (count < st.min_iris || count > st.max_iris) { toast.info(`${st.name} : ${st.min_iris} à ${st.max_iris} iris — choisissez les iris.`); setStyleOpen(st); return; }
    const price = stylePrice(st, count);
    if (price == null) { toast.error(`Prix non défini pour ${st.name} (${count} iris).`); return; }
    addComposition({ key: uid(), styleId: st.id, styleName: st.name, irisCount: count, feeCents: price, participantIds: sel,
      participantNames: participants.filter((x) => sel.includes(x.id)).map((x) => x.first_name).join(', '), instructions: '', orientation: count > 1 ? 'horizontal' : null }, true);
  };
  const removeComposition = async (key: string) => {
    const n = cart.items.filter((i) => i.compositionKey === key).length;
    if (n && !(await confirm({ title: 'Retirer cette création ?', text: `Les ${n} produit(s) associés seront aussi retirés.`, danger: true, confirm: 'Retirer' }))) return;
    update((x) => ({ ...x, compositions: x.compositions.filter((c) => c.key !== key), items: x.items.filter((i) => i.compositionKey !== key) }));
    if (activeComp === key) setActiveComp(null);
  };
  const addItem = (p: Product, v: Variant) => {
    if (p.needs_composition && !comp) { toast.error('Sélectionnez ou ajoutez d’abord une création dans le panier.'); setTab('creations'); return; }
    const compKey = p.needs_composition ? comp!.key : null;
    const price = variantPrice(v, compKey ? comp!.irisCount : 0);
    if (price == null) { toast.error('Prix non défini pour ce produit dans la grille de la séance.'); return; }
    update((x) => {
      const ex = x.items.find((i) => i.variantId === v.id && i.compositionKey === compKey);
      if (ex) return { ...x, items: x.items.map((i) => (i === ex ? { ...i, qty: i.qty + 1 } : i)) };
      return { ...x, items: [...x.items, { key: uid(), variantId: v.id, productId: p.id, category: p.category, productName: p.name, variantName: v.name, compositionKey: compKey, qty: 1, unitPriceCents: price, unitCostCents: costs.get(v.id)?.cost ?? 0 }] };
    });
  };
  const save = async (target: 'brouillon' | 'validee') => {
    let reason: string | undefined;
    if (isValidated) {
      const r = await confirm({ title: 'Corriger une commande validée', text: 'La version précédente est conservée dans l’historique. Les lignes existantes gardent leurs prix.', input: { label: 'Motif de la correction', required: true } });
      if (!r) return;
      reason = r;
    } else if (target === 'validee' && !(await confirm({ title: `Valider la commande — ${eur(totals.total_cents)}`, text: 'Les prix appliqués seront figés et les tâches de postproduction créées.', confirm: 'Valider' }))) return;
    setBusy(true);
    const r = await act(() => saveCart(cart, target, reason), target === 'validee' ? 'Commande validée' : 'Sélection enregistrée');
    setBusy(false);
    if (r) {
      const next: Cart = { ...cart, orderId: r.id, number: r.number, status: isValidated || target === 'validee' ? 'validee' : 'brouillon' };
      setCart(next); setSavedSnap(snap(next));
      onSaved({ ...r, status: next.status as 'brouillon' | 'validee' });
    }
  };

  const productsOf = (cat: LeftTab) => products.filter((p) => p.category === cat && (!p.style_id || !comp || p.style_id === comp.styleId || cat !== 'numerique'));
  const big = mode === 'client';

  return (
    <div className="flex h-full min-h-0 gap-6">
      {/* ------------------------------------------------ left: catalogue */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-4 flex items-center gap-1 rounded-xl border border-ink-700 bg-ink-850 p-1">
          {([['creations', 'Créations'], ['numerique', 'Numérique'], ['impression', 'Impressions'], ['option', 'Options']] as const).map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} className={cx('flex-1 rounded-lg py-2.5 text-[14px] font-medium transition', tab === id ? 'bg-ink-650 bg-ink-600 text-white' : 'text-mist-400 hover:text-mist-100')}>{l}</button>
          ))}
        </div>
        {tab !== 'creations' && (
          <div className="mb-3 text-[13px] text-mist-300">
            {comp ? <>Produits ajoutés à : <span className="font-semibold text-gold-300">{comp.styleName} · {comp.irisCount} iris</span>{comp.participantNames && <span className="text-mist-400"> ({comp.participantNames})</span>}</>
              : <span className="text-amber-200">Aucune création sélectionnée — ajoutez une création pour les produits qui en dépendent.</span>}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === 'impression' && (() => {
            const adv = adviceFor(comp?.irisCount);
            return (
              <div className="mb-4 flex items-center gap-5 rounded-2xl border border-gold-500/30 bg-gold-500/[0.05] p-4">
                {adv ? <IrisSketch n={adv.iris} w={comp?.orientation === 'vertical' ? adv.format[1] : adv.format[0]} h={comp?.orientation === 'vertical' ? adv.format[0] : adv.format[1]} width={comp?.orientation === 'vertical' ? (big ? 115 : 95) : big ? 170 : 140} orientation={comp?.orientation === 'diagonale' ? 'diagonale' : null} /> : comp && <IrisSketch n={comp.irisCount} w={60} h={40} width={big ? 170 : 140} orientation={comp.orientation} />}
                <div className="min-w-0 flex-1">
                  {adv ? (<>
                    <div className="text-[11.5px] font-semibold tracking-[0.18em] text-gold-400">CONSEILLÉ POUR {adv.iris} IRIS</div>
                    <div className={cx('mt-0.5 font-semibold', big ? 'text-[22px]' : 'text-[18px]')}>{dimsLabel(adv.format)} <span className="text-[14px] font-normal text-mist-400">· {adv.shape}</span></div>
                    <div className="mt-1 text-[13.5px] text-mist-200">{adv.layout}</div>
                    {adv.altText && <div className="text-[12.5px] text-mist-400">{adv.altText}</div>}
                  </>) : (
                    <div className="text-[13.5px] text-mist-300">{comp ? `${comp.irisCount} iris : choisissez un grand format pour préserver les détails de chaque iris.` : 'Sélectionnez une création pour voir le format conseillé.'}</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="subtle" onClick={() => setGuideOpen(true)}>Guide des formats</Button>
                  </div>
                </div>
              </div>
            );
          })()}
          {tab === 'creations' && (
            <div className={cx('grid gap-5', big ? 'grid-cols-[repeat(auto-fill,minmax(300px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(240px,1fr))]')}>
              {styles.map((s) => {
                const ex = exOf(s.id); const from = minStylePrice(s);
                return (
                  <div key={s.id} className="relative">
                    <button disabled={locked} onClick={() => setStyleOpen(s)} className="group block w-full overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 text-left transition hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-[0_20px_50px_-20px_rgba(195,162,101,0.35)]">
                      <div className="relative aspect-square bg-ink-800">
                        {ex[0] ? <img src={ex[0].thumb} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <div className="flex size-full items-center justify-center text-mist-400/50"><ImageOff className="size-10" strokeWidth={1} /></div>}
                        {ex.length > 1 && <Badge className="absolute top-3 right-3 bg-black/60 backdrop-blur">{ex.length} exemples</Badge>}
                      </div>
                      <div className="p-4">
                        <div className={cx('font-display font-semibold', big ? 'text-[28px]' : 'text-[23px]')}>{s.name}</div>
                        {s.description && <div className="mt-1 line-clamp-2 text-[12.5px] text-mist-400">{s.description}</div>}
                        <div className="mt-3 flex items-center justify-between text-[13px]">
                          <span className="text-mist-400">{s.min_iris === s.max_iris ? `${s.min_iris} iris` : `${s.min_iris} à ${s.max_iris} iris`}</span>
                          <span className="font-semibold text-gold-300">{from != null ? (from === 0 ? 'Inclus' : `dès ${eur(from)}`) : <span className="font-normal text-mist-400">prix non défini</span>}</span>
                        </div>
                      </div>
                    </button>
                    {!locked && (() => {
                      const n = cart.compositions.filter((c) => c.styleId === s.id).length;
                      return (
                        <button onClick={() => quickToggle(s)} title={n ? 'Retirer cette création du panier' : 'Ajouter directement (iris de la famille)'}
                          className={cx('absolute top-3 left-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium backdrop-blur transition', n ? 'bg-gold-500 text-ink-950' : 'bg-black/60 text-mist-100 hover:bg-black/75')}>
                          <span className={cx('flex size-4 items-center justify-center rounded border', n ? 'border-ink-950 bg-ink-950 text-gold-400' : 'border-mist-300')}>{n > 0 && <Check className="size-3" strokeWidth={3} />}</span>
                          {n ? (n > 1 ? `Ajoutée × ${n}` : 'Ajoutée') : 'Ajouter'}
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
              {!styles.length && <div className="text-mist-400">Aucun style actif dans le catalogue.</div>}
            </div>
          )}
          {tab !== 'creations' && (
            <div className="space-y-3">
              {productsOf(tab).map((p) => {
                const vs = variants.filter((v) => v.product_id === p.id);
                return (
                  <div key={p.id} className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
                    <div className="flex gap-4">
                      {p.thumb && <img src={p.thumb} className="size-20 rounded-xl object-cover" alt="" />}
                      <div className="min-w-0 flex-1">
                        <div className={cx('font-semibold', big ? 'text-[18px]' : 'text-[15px]')}>{p.name}</div>
                        {p.description && <div className="mt-0.5 text-[12.5px] text-mist-400">{p.description}</div>}
                        {p.category === 'impression' && vs.some((v) => variantDims(v.name, v.format)) && (
                          <button className="mt-1 text-[12.5px] text-gold-300 hover:text-gold-200" onClick={() => {
                            const adv = adviceFor(comp?.irisCount);
                            const rec = vs.find((v) => sameDims(variantDims(v.name, v.format), adv?.format));
                            setSizeFor({ productId: p.id, initial: rec?.name });
                          }}>Visualiser la taille et la disposition →</button>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {vs.map((v) => {
                            const price = variantPrice(v, p.needs_composition ? comp?.irisCount ?? 0 : 0);
                            const inCart = cart.items.find((i) => i.variantId === v.id && i.compositionKey === (p.needs_composition ? comp?.key ?? null : null));
                            return (
                              <button key={v.id} disabled={price == null || locked} onClick={() => addItem(p, v)}
                                className={cx('flex items-center gap-3 rounded-xl border px-3.5 py-2 text-[13.5px] transition disabled:opacity-35', inCart ? 'border-gold-500/60 bg-gold-500/10' : 'border-ink-600 hover:border-gold-500/50 hover:bg-ink-750')}>
                                <span>{v.name}</span>
                                {p.category === 'impression' && (() => { const adv = adviceFor(comp?.irisCount); const d = variantDims(v.name, v.format);
                                  return sameDims(d, adv?.format) ? <Badge tone="gold">Conseillé</Badge> : sameDims(d, adv?.alt) ? <Badge>Alternative</Badge> : null; })()}
                                <span className="font-semibold text-gold-300 tabular">{price != null ? eur(price) : '—'}</span>
                                {inCart ? <Badge tone="gold">{inCart.qty}</Badge> : <Plus className="size-3.5 text-mist-400" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!productsOf(tab).length && <div className="py-10 text-center text-mist-400">Aucun produit dans cette catégorie.</div>}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ right: cart */}
      <aside className={cx('flex shrink-0 flex-col rounded-2xl border border-ink-700 bg-ink-900', big ? 'w-[440px]' : 'w-[400px]')}>
        <div className="border-b border-ink-700 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.2em] text-mist-400">{mode === 'client' ? 'VOTRE SÉLECTION' : 'PANIER'}</div>
              <div className="font-display text-[24px] font-semibold">{family?.family.name}</div>
            </div>
            {cart.number && <Badge tone={isValidated ? 'green' : 'amber'}>{cart.number}{isValidated ? ' · validée' : ' · brouillon'}</Badge>}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {!cart.compositions.length && !cart.items.length && (
            <div className="py-12 text-center text-[13px] text-mist-400"><Sparkles className="mx-auto mb-3 size-6 text-gold-400" />Choisissez une création pour commencer.</div>
          )}
          {cart.compositions.map((c) => {
            const its = cart.items.filter((i) => i.compositionKey === c.key);
            return (
              <div key={c.key} onClick={() => setActiveComp(c.key)} className={cx('cursor-pointer rounded-xl border p-3 transition', activeComp === c.key ? 'border-gold-500/60 bg-gold-500/[0.06]' : 'border-ink-700 bg-ink-850 hover:border-ink-500')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{c.styleName} <span className="font-normal text-mist-400">· {c.irisCount} iris</span></div>
                    {c.participantNames && <div className="truncate text-[12px] text-mist-400">{c.participantNames}</div>}
                    {c.irisCount > 1 && (locked ? (c.orientation && <div className="text-[12px] text-mist-400">Disposition {ORIENTATION_LABEL[c.orientation].toLowerCase()}</div>) : (
                      <select onClick={(e) => e.stopPropagation()} value={c.orientation ?? ''} onChange={(e) => { const v = (e.target.value || null) as Orientation | null; update((x) => ({ ...x, compositions: x.compositions.map((k) => (k.key === c.key ? { ...k, orientation: v } : k)) })); }}
                        className="mt-0.5 rounded-md border border-ink-600 bg-ink-850 px-1.5 py-0.5 text-[11.5px] text-mist-300 outline-none">
                        <option value="">Disposition : au choix</option>
                        {(['horizontal', 'vertical', 'diagonale'] as Orientation[]).map((o) => <option key={o} value={o}>Disposition {ORIENTATION_LABEL[o].toLowerCase()}</option>)}
                      </select>
                    ))}
                    {c.instructions && <div className="mt-0.5 line-clamp-2 text-[11.5px] text-mist-400 italic">« {c.instructions} »</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[13px] font-medium tabular">{c.feeCents ? eur(c.feeCents) : 'Inclus'}</span>
                    {!locked && <IconButton title="Retirer" onClick={(e) => { e.stopPropagation(); removeComposition(c.key); }}><X className="size-3.5" /></IconButton>}
                  </div>
                </div>
                {its.length > 0 && <div className="mt-2 space-y-1.5 border-t border-ink-700/70 pt-2">{its.map((i) => <ItemLine key={i.key} i={i} locked={locked} update={update} />)}</div>}
                {activeComp === c.key && !its.length && !locked && <div className="mt-2 text-[12px] text-gold-300/80">Ajoutez un fichier numérique ou une impression →</div>}
              </div>
            );
          })}
          {cart.items.filter((i) => !i.compositionKey).length > 0 && (
            <div className="rounded-xl border border-ink-700 bg-ink-850 p-3"><div className="mb-1.5 text-[12px] font-medium text-mist-400">Autres articles</div>
              <div className="space-y-1.5">{cart.items.filter((i) => !i.compositionKey).map((i) => <ItemLine key={i.key} i={i} locked={locked} update={update} />)}</div></div>
          )}
        </div>
        <div className="border-t border-ink-700 px-5 py-4">
          <div className="space-y-1.5 text-[13.5px]">
            <div className="flex justify-between text-mist-300"><span>Prix normal</span><span className="tabular">{eur(totals.subtotal_cents)}</span></div>
            {totals.discounts.map((x, n) => (
              <div key={n} className="flex items-center justify-between text-emerald-300">
                <span className="flex items-center gap-1.5"><Gift className="size-3.5" />{x.label}{x.count ? <span className="rounded-md bg-emerald-500/15 px-1.5 text-[11.5px] font-semibold tabular">×{x.count}</span> : null}</span>
                <span className="flex items-center gap-1 tabular">− {eur(x.amount_cents)}
                  {x.kind === 'manual' && !locked && !(mode === 'client' && isValidated) && <button className="text-mist-400 hover:text-red-300" onClick={() => update((c) => ({ ...c, manual: c.manual.filter((_, i) => i !== x.manualIndex) }))}><Trash2 className="size-3" /></button>}</span>
              </div>
            ))}
            {totals.discount_cents > 0 && <div className="flex justify-between text-[12.5px] text-emerald-300/80"><span>Économie réalisée</span><span className="tabular">{eur(totals.discount_cents)}</span></div>}
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-ink-700 pt-3">
            <span className="text-[12px] font-semibold tracking-[0.2em] text-mist-400">TOTAL</span>
            <span className={cx('font-semibold text-gold-400 tabular', big ? 'text-[38px]' : 'text-[32px]')}>{eur(totals.total_cents)}</span>
          </div>
          {cart.paymentPlan && cart.paymentPlan.count > 1 && totals.total_cents > 0 && (() => {
            const sch = schedule(totals.total_cents, cart.paymentPlan);
            const same = sch.every((x) => x.amount_cents === sch[0].amount_cents);
            return (
              <div className="mt-2 rounded-lg bg-ink-800 px-3 py-2 text-[12.5px]">
                <div className="flex items-center justify-between font-medium text-mist-100">
                  <span>Payable en {sch.length} fois</span>
                  <span className="tabular">{same ? `${sch.length} × ${eur(sch[0].amount_cents)}` : `${eur(sch[0].amount_cents)} puis ${sch.length - 1} × ${eur(sch[1].amount_cents)}`}</span>
                </div>
                <div className="mt-1 text-mist-400">{sch.map((x) => `${fmtDate(x.date, { day: '2-digit', month: '2-digit' })} : ${eur(x.amount_cents)}`).join(' · ')}</div>
              </div>
            );
          })()}
          {!locked && !(mode === 'client' && isValidated) && (cart.compositions.length > 0 || cart.items.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="subtle" icon={<BadgePercent className="size-3.5" />}
                onClick={() => (mode === 'client' ? setPinFor('discount') : setManualOpen(true))}>Remise commerciale</Button>
              <Button size="sm" variant="subtle" icon={<CalendarClock className="size-3.5" />} onClick={() => setPlanOpen(true)}>
                {cart.paymentPlan && cart.paymentPlan.count > 1 ? `Paiement en ${cart.paymentPlan.count} fois` : 'Payer en plusieurs fois'}</Button>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            {mode === 'admin' ? (<>
              {!isValidated && <Button className="flex-1" variant="subtle" loading={busy} icon={<Save className="size-4" />} disabled={locked} onClick={() => save('brouillon')}>Brouillon</Button>}
              <Button className="flex-[1.4]" variant="gold" size="lg" loading={busy} icon={<Check className="size-4" />} disabled={locked || (!cart.compositions.length && !cart.items.length)} onClick={() => save('validee')}>{isValidated ? 'Enregistrer la correction' : 'Valider la commande'}</Button>
            </>) : (
              isValidated ? <Button className="flex-1" variant="subtle" size="lg" disabled icon={<Check className="size-4" />}>Commande validée</Button> : (<>
                {(() => { const empty = !cart.compositions.length && !cart.items.length; const saved = !!cart.orderId && savedSnap === snap(cart);
                  return <Button className="flex-1" variant="subtle" size="lg" loading={busy} icon={saved ? <Check className="size-4" /> : <Save className="size-4" />} disabled={locked || empty || saved} onClick={() => save('brouillon')}>{saved ? 'Sélection enregistrée' : 'Enregistrer ma sélection'}</Button>; })()}
                <Button className="flex-1" variant="gold" size="lg" loading={busy} icon={<Check className="size-4" />} disabled={locked || (!cart.compositions.length && !cart.items.length)} onClick={() => setPinFor('validate')}>Valider la commande</Button>
              </>)
            )}
          </div>
        </div>
      </aside>

      {styleOpen && <StyleDialog style={styleOpen} examples={exOf(styleOpen.id)} participants={participants} price={(n) => stylePrice(styleOpen, n)} big={big}
        onClose={() => setStyleOpen(null)} onZoom={(items, i) => setLight({ items, i })}
        onAdd={(c) => { addComposition(c); setStyleOpen(null); }} />}
      <Lightbox items={light?.items ?? []} index={light?.i ?? null} onClose={() => setLight(null)} />
      {planOpen && <PaymentPlanDialog total={totals.total_cents} plan={cart.paymentPlan ?? null} onClose={() => setPlanOpen(false)}
        onSave={(pl) => { update((c) => ({ ...c, paymentPlan: pl })); setPlanOpen(false); }} />}
      <FormatGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} current={comp?.irisCount} />
      {sizeFor && (() => {
        const adv = adviceFor(comp?.irisCount);
        const formats = variants.filter((v) => v.product_id === sizeFor.productId).map((v) => {
          const d = variantDims(v.name, v.format);
          return d ? { label: v.name, dims: d, tag: sameDims(d, adv?.format) ? 'Conseillé' : sameDims(d, adv?.alt) ? 'Alternative' : undefined } : null;
        }).filter((x): x is { label: string; dims: [number, number]; tag: string | undefined } => !!x);
        return <SizeViewer open onClose={() => setSizeFor(null)} formats={formats} initial={sizeFor.initial} n={comp?.irisCount ?? 1} orientation={comp?.orientation} />;
      })()}
      {pinFor && <PinDialog open onClose={() => setPinFor(null)} subtitle={pinFor === 'discount' ? 'Remise commerciale — réservé au photographe' : 'Validation de la commande — réservé au photographe'}
        onCode={async (c) => {
          if (c !== (settings.client_pin || '1212')) return false;
          if (pinFor === 'discount') setManualOpen(true); else setTimeout(() => save('validee'), 0);
          return true;
        }} />}
      {manualOpen && <ManualDiscountDialog subtotal={totals.total_cents} onClose={() => setManualOpen(false)} onAdd={(m) => { update((c) => ({ ...c, manual: [...c.manual, m] })); setManualOpen(false); }} />}
    </div>
  );
}

/** Cart content fingerprint (to know whether the selection was saved). */
const snap = (c: Cart) => JSON.stringify([c.compositions, c.items, c.manual, c.paymentPlan ?? null, c.notes]);

/** Default iris selection for a style: the family's participants, up to the style maximum. */
function defaultIris(style: Style, participants: { id: string }[]) {
  return participants.slice(0, style.max_iris).map((p) => p.id);
}

function ItemLine({ i, locked, update }: { i: Cart['items'][number]; locked: boolean; update: (fn: (c: Cart) => Cart) => void }) {
  return (
    <div className="flex items-center gap-2 text-[13px]" onClick={(e) => e.stopPropagation()}>
      <div className="min-w-0 flex-1"><div className="truncate">{i.productName}</div><div className="text-[11.5px] text-mist-400">{i.variantName} · {eur(i.unitPriceCents)}</div></div>
      {locked ? <span className="tabular">× {i.qty}</span> : <Stepper value={i.qty} onChange={(q) => update((c) => ({ ...c, items: c.items.map((x) => (x.key === i.key ? { ...x, qty: q } : x)) }))} />}
      <span className="w-[72px] text-right font-medium tabular">{eur(i.qty * i.unitPriceCents)}</span>
      {!locked && <IconButton title="Retirer" className="size-7" onClick={() => update((c) => ({ ...c, items: c.items.filter((x) => x.key !== i.key) }))}><Minus className="size-3.5" /></IconButton>}
    </div>
  );
}

function StyleDialog({ style, examples, participants, price, big, onClose, onAdd, onZoom }: {
  style: Style; examples: Example[]; participants: { id: string; first_name: string }[]; price: (n: number) => number | null; big: boolean;
  onClose: () => void; onAdd: (c: CartComp) => void; onZoom: (items: LightItem[], i: number) => void;
}) {
  const [sel, setSel] = useState<string[]>(() => defaultIris(style, participants));
  const [manualCount, setManualCount] = useState(style.min_iris);
  const [instructions, setInstructions] = useState('');
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const count = participants.length ? sel.length : manualCount;
  const valid = count >= style.min_iris && count <= style.max_iris;
  const p = valid ? price(count) : null;
  const shown = examples.filter((e) => e.iris_count == null || e.iris_count === count);
  const gallery = (shown.length ? shown : examples);
  const items: LightItem[] = gallery.map((e) => ({ mediaId: e.media_id, thumb: e.thumb, caption: e.caption ?? `${style.name}${e.iris_count ? ` — ${e.iris_count} iris` : ''}` }));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < style.max_iris ? [...s, id] : s));
  return (
    <Modal open onClose={onClose} size="xl" title={<span className="font-display text-[28px]">{style.name}</span>} subtitle={style.description ?? undefined}
      footer={<>
        <div className="mr-auto text-[13px] text-mist-400">{valid ? '' : `Ce style accepte de ${style.min_iris} à ${style.max_iris} iris.`}</div>
        <span className="mr-3 text-[22px] font-semibold text-gold-400 tabular">{p != null ? (p === 0 ? 'Inclus' : eur(p)) : '—'}</span>
        <Button variant="gold" size="lg" disabled={!valid || p == null} icon={<Plus className="size-4" />} onClick={() => onAdd({
          key: uid(), styleId: style.id, styleName: style.name, irisCount: count, feeCents: p ?? 0,
          participantIds: sel, participantNames: participants.filter((x) => sel.includes(x.id)).map((x) => x.first_name).join(', '), instructions,
          orientation: count > 1 ? orientation : null,
        })}>Ajouter cette création</Button>
      </>}>
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div>
          <div className={cx('grid gap-3', big ? 'grid-cols-2' : 'grid-cols-3')}>
            {gallery.map((e, i) => (
              <button key={e.id} onClick={() => onZoom(items, i)} className="group relative aspect-square overflow-hidden rounded-xl bg-ink-800">
                <img src={e.thumb} alt="" className="size-full object-cover transition group-hover:scale-[1.03]" />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2 text-[12px]">{e.iris_count ? `${e.iris_count} iris` : ''}<Eye className="size-3.5 opacity-70" /></span>
              </button>
            ))}
            {!gallery.length && <div className="col-span-3 flex aspect-[3/1] items-center justify-center rounded-xl bg-ink-800 text-mist-400">Aucun exemple pour ce style.</div>}
          </div>
          <div className="mt-3 text-[12px] text-mist-400">Exemples de réalisations — votre création sera réalisée à partir de vos propres iris.</div>
        </div>
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-[13px] font-semibold">Iris à inclure</div>
            {participants.length ? (
              <div className="flex flex-wrap gap-2">
                {participants.map((x) => (
                  <button key={x.id} onClick={() => toggle(x.id)} className={cx('rounded-full border px-3.5 py-1.5 text-[13.5px] transition', sel.includes(x.id) ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-ink-600 text-mist-300 hover:border-ink-500')}>
                    {sel.includes(x.id) && <Check className="mr-1 inline size-3.5" />}{x.first_name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3"><Stepper value={manualCount} min={style.min_iris} max={style.max_iris} onChange={setManualCount} /><span className="text-[12.5px] text-mist-400">Nombre d’iris</span></div>
            )}
            <div className="mt-2 text-[12.5px] text-mist-400">{count} iris sélectionné(s)</div>
          </div>
          {count > 1 && (
            <div>
              <div className="mb-2 text-[13px] font-semibold">Disposition des iris</div>
              <div className="grid grid-cols-3 gap-2">
                {(['horizontal', 'vertical', 'diagonale'] as Orientation[]).map((o) => (
                  <button key={o} onClick={() => setOrientation(o)} className={cx('flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[12.5px] transition', orientation === o ? 'border-gold-500 bg-gold-500/10 text-gold-200' : 'border-ink-600 text-mist-300 hover:border-ink-500')}>
                    <IrisSketch n={count} w={o === 'vertical' ? 40 : o === 'diagonale' ? 45 : 60} h={o === 'vertical' ? 60 : o === 'diagonale' ? 45 : 40} width={o === 'vertical' ? 44 : o === 'diagonale' ? 56 : 72} orientation={o} />
                    {ORIENTATION_LABEL[o]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field label="Souhaits / instructions (facultatif)"><Textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Ordre des iris, couleur de fond…" /></Field>
        </div>
      </div>
    </Modal>
  );
}

function PaymentPlanDialog({ total, plan, onClose, onSave }: { total: number; plan: PaymentPlan | null; onClose: () => void; onSave: (p: PaymentPlan | null) => void }) {
  const [count, setCount] = useState(plan?.count ?? 3);
  const [first, setFirst] = useState(plan?.first_date ?? todayIso());
  const sch = schedule(total, { count, first_date: first });
  return (
    <Modal open onClose={onClose} title="Payer en plusieurs fois" subtitle="Échéances mensuelles. Le premier règlement se fait en général le jour de la séance." size="sm"
      footer={<>{plan && <Button variant="ghost" className="mr-auto" onClick={() => onSave(null)}>Paiement en une fois</Button>}<Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" onClick={() => onSave({ count, first_date: first })}>Valider l’échéancier</Button></>}>
      <div className="mb-4 flex gap-2">
        {[2, 3, 4].map((n) => <Button key={n} variant={count === n ? 'gold' : 'subtle'} onClick={() => setCount(n)}>{n} fois</Button>)}
      </div>
      <Field label="Date du premier règlement"><Input type="date" value={first} onChange={(e) => setFirst(e.target.value || todayIso())} /></Field>
      <div className="mt-4 divide-y divide-ink-700 rounded-xl border border-ink-700">
        {sch.map((x) => (
          <div key={x.n} className="flex justify-between px-4 py-2 text-[13.5px]"><span className="text-mist-300">{x.n === 1 ? '1er règlement' : `${x.n}e règlement`} · {fmtDate(x.date)}</span><span className="font-medium tabular">{eur(x.amount_cents)}</span></div>
        ))}
        <div className="flex justify-between px-4 py-2 text-[13.5px] font-semibold"><span>Total</span><span className="tabular">{eur(total)}</span></div>
      </div>
      <div className="mt-3 text-[12px] text-mist-400">Si le total change ensuite (ajout d’un produit, remise), les échéances sont recalculées automatiquement.</div>
    </Modal>
  );
}

function ManualDiscountDialog({ onClose, onAdd, subtotal }: { onClose: () => void; onAdd: (m: ManualDiscount) => void; subtotal: number }) {
  const [label, setLabel] = useState('Remise commerciale');
  const [amount, setAmount] = useState<number | null>(null);
  const [pct, setPct] = useState('');
  const [reason, setReason] = useState('');
  const bp = pct ? pctToBp(pct) : null;
  const preview = bp ? Math.round((subtotal * bp) / 10000) : amount ?? 0;
  const valid = (bp != null && bp > 0 && bp <= 10000) || (!pct && (amount ?? 0) > 0);
  const apply = () => onAdd({ label: label.trim() || 'Remise commerciale', reason: reason.trim() || 'Geste commercial', ...(bp ? { pct_bp: bp } : { amount_cents: amount ?? 0 }) });
  return (
    <Modal open onClose={onClose} title="Remise commerciale" subtitle="Appliquée sur le total actuel, enregistrée dans l’historique de la commande." size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="gold" disabled={!valid} onClick={apply}>Appliquer{valid ? ` (− ${eur(Math.min(preview, subtotal))})` : ''}</Button></>}>
      <div className="mb-4 flex flex-wrap gap-2">
        {[['5 €', 500, ''], ['10 €', 1000, ''], ['15 €', 1500, ''], ['5 %', null, '5'], ['10 %', null, '10']].map(([l, a, p]) => (
          <Button key={l as string} size="sm" variant={(p ? pct === p : !pct && amount === a) ? 'gold' : 'subtle'} onClick={() => { if (p) { setPct(p as string); setAmount(null); } else { setAmount(a as number); setPct(''); } }}>{l as string}</Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Montant"><MoneyInput value={amount} onChange={(v) => { setAmount(v); setPct(''); }} /></Field>
        <Field label="ou pourcentage"><Input value={pct} placeholder="%" inputMode="decimal" onChange={(e) => { setPct(e.target.value.replace('%', '')); setAmount(null); }} /></Field>
        <Field label="Libellé affiché" className="col-span-2"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Field label="Motif (facultatif)" hint="Par défaut : « Geste commercial »." className="col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Fidélité, adhérent, famille nombreuse…" /></Field>
      </div>
    </Modal>
  );
}
