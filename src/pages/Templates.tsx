import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, Columns2, Copy, Plus, Tags } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Loading, Modal, PageHeader, Select, Textarea, Toggle, useAsync, useConfirm, cx } from '../components/ui';
import { PriceListEditor } from '../components/PriceListEditor';
import { createTemplate, getPriceItems, getTemplate, listTemplates, updateTemplate } from '../services/pricing';
import { listProducts, listStyles, listVariants } from '../services/catalog';
import { eur } from '../lib/money';
import { fmtDate } from '../lib/format';
import { act } from '../lib/act';

export default function Templates() {
  const { id } = useParams();
  return id ? <TemplateEditor id={id} /> : <TemplateList />;
}

function TemplateList() {
  const nav = useNavigate();
  const confirm = useConfirm();
  const [archived, setArchived] = useState(false);
  const t = useAsync(() => listTemplates(archived), [archived]);
  const [compare, setCompare] = useState(false);
  const create = async (from?: string, name?: string) => {
    const n = name ?? (await confirm({ title: from ? 'Dupliquer le template' : 'Nouveau template tarifaire', input: { label: 'Nom', placeholder: 'Tarif TEMPSDANSES', required: true }, confirm: 'Créer' }));
    if (!n) return;
    const nid = await act(() => createTemplate(n, '', from), 'Template créé');
    if (nid) nav(`/tarifs/${nid}`);
  };
  return (
    <>
      <PageHeader title="Templates tarifaires" subtitle="Grilles de prix réutilisables. Appliquer un template à une séance en crée une copie indépendante."
        actions={<><Toggle checked={archived} onChange={setArchived} label="Archives" /><Button icon={<Columns2 className="size-4" />} onClick={() => setCompare(true)}>Comparer</Button><Button variant="gold" icon={<Plus className="size-4" />} onClick={() => create()}>Nouveau template</Button></>} />
      {!t.data ? <Loading /> : !t.data.length ? <Card><Empty icon={<Tags className="size-5" />} title="Aucun template" /></Card> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {t.data.map((x) => (
            <Card key={x.id} onClick={() => nav(`/tarifs/${x.id}`)} className={cx('p-5', x.archived && 'opacity-55')}>
              <div className="flex items-start justify-between"><div className="font-display text-[24px] font-semibold">{x.name}</div>{!!x.archived && <Badge>Archivé</Badge>}</div>
              <div className="mt-1 min-h-[18px] text-[12.5px] text-mist-400">{x.description}</div>
              <div className="mt-4 flex items-center justify-between text-[12.5px] text-mist-400">
                <span>{x.items_count} prix · {x.sessions_count} séance(s)</span><span>maj {fmtDate(x.updated_at)}</span>
              </div>
              <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="subtle" icon={<Copy className="size-3.5" />} onClick={() => create(x.id)}>Dupliquer</Button>
                <Button size="sm" variant="ghost" icon={<Archive className="size-3.5" />} onClick={() => act(() => updateTemplate(x.id, { archived: x.archived ? 0 : 1 }).then(t.reload), x.archived ? 'Template restauré' : 'Template archivé')}>{x.archived ? 'Restaurer' : 'Archiver'}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {compare && t.data && <CompareDialog templates={t.data} onClose={() => setCompare(false)} />}
    </>
  );
}

function TemplateEditor({ id }: { id: string }) {
  const nav = useNavigate();
  const t = useAsync(() => getTemplate(id), [id]);
  const [meta, setMeta] = useState<{ name?: string; description?: string | null; conditions?: string | null }>({});
  if (!t.data) return <Loading />;
  const m = { name: t.data.name, description: t.data.description, conditions: t.data.conditions, ...meta };
  return (
    <>
      <PageHeader back={() => nav('/tarifs')} title={m.name} subtitle="Modifier ce template ne modifie pas les séances auxquelles il a déjà été appliqué."
        actions={<Button variant="gold" disabled={!Object.keys(meta).length} onClick={() => act(() => updateTemplate(id, meta).then(() => { setMeta({}); t.reload(); }), 'Template enregistré')}>Enregistrer les informations</Button>} />
      <Card className="mb-5">
        <div className="grid grid-cols-3 gap-4 p-5">
          <Field label="Nom"><Input value={m.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></Field>
          <Field label="Description" className="col-span-2"><Input value={m.description ?? ''} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></Field>
          <Field label="Conditions commerciales (imprimées sur le catalogue)" className="col-span-3"><Textarea rows={2} value={m.conditions ?? ''} onChange={(e) => setMeta({ ...meta, conditions: e.target.value })} placeholder="Délais de livraison, modalités de règlement…" /></Field>
        </div>
      </Card>
      <PriceListEditor priceListId={t.data.price_list_id} />
    </>
  );
}

function CompareDialog({ templates, onClose }: { templates: { id: string; name: string; price_list_id: string }[]; onClose: () => void }) {
  const [a, setA] = useState(templates[0]?.id ?? '');
  const [b, setB] = useState(templates[1]?.id ?? templates[0]?.id ?? '');
  const d = useAsync(async () => {
    const la = templates.find((t) => t.id === a)?.price_list_id, lb = templates.find((t) => t.id === b)?.price_list_id;
    const [ia, ib, styles, products, variants] = await Promise.all([la ? getPriceItems(la) : [], lb ? getPriceItems(lb) : [], listStyles(), listProducts(), listVariants()]);
    const label = (kind: string, ref: string, iris: number) => {
      if (kind === 'style') return `Création ${styles.find((s) => s.id === ref)?.name ?? '?'}${iris ? ` · ${iris} iris` : ''}`;
      const v = variants.find((x) => x.id === ref);
      return `${products.find((p) => p.id === v?.product_id)?.name ?? '?'} — ${v?.name ?? '?'}`;
    };
    const keys = new Map<string, string>();
    [...ia, ...ib].forEach((i) => keys.set(`${i.kind}|${i.ref_id}|${i.iris_count}`, label(i.kind, i.ref_id, i.iris_count)));
    const get = (arr: typeof ia, k: string) => arr.find((i) => `${i.kind}|${i.ref_id}|${i.iris_count}` === k)?.price_cents ?? null;
    return [...keys.entries()].map(([k, l]) => ({ k, l, a: get(ia, k), b: get(ib, k) })).sort((x, y) => x.l.localeCompare(y.l));
  }, [a, b]);
  return (
    <Modal open onClose={onClose} size="lg" title="Comparer deux templates">
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Select value={a} onChange={(e) => setA(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        <Select value={b} onChange={(e) => setB(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
      </div>
      <Card>
        <CardHeader title={`${d.data?.length ?? 0} prix`} />
        <table className="w-full text-[13px]"><tbody>
          {d.data?.map((r) => (
            <tr key={r.k} className="border-t border-ink-700/50"><td className="px-4 py-2">{r.l}</td><td className="px-4 py-2 text-right tabular">{eur(r.a)}</td><td className="px-4 py-2 text-right tabular">{eur(r.b)}</td>
              <td className={cx('px-4 py-2 text-right tabular', r.a != null && r.b != null && r.b > r.a && 'text-emerald-300', r.a != null && r.b != null && r.b < r.a && 'text-red-300')}>{r.a != null && r.b != null ? (r.b - r.a >= 0 ? '+' : '−') + eur(Math.abs(r.b - r.a)) : ''}</td></tr>
          ))}
        </tbody></table>
      </Card>
    </Modal>
  );
}
