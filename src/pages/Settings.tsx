import { useState } from 'react';
import { DEFAULT_INVOICE_MAIL, DEFAULT_OFFERS_MAIL, DEFAULT_QUOTE_MAIL, DEFAULT_RECAP_MAIL, MAIL_PLACEHOLDERS, OFFERS_PLACEHOLDERS, QUOTE_PLACEHOLDERS, RECAP_PLACEHOLDERS } from '../lib/invoiceMail';
import { DatabaseBackup, Download, FolderOpen, HardDriveDownload, RotateCcw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea, Toggle, useAsync, useConfirm } from '../components/ui';
import { setSetting } from '../services/base';
import { appPaths, backupNow, exportCsv, importIris, integrityCheck, irisSource, listBackups, restoreBackup } from '../services/backup';
import { useApp } from '../store';
import { isTauri } from '../lib/db';
import { pickBackupFile, saveFile } from '../lib/files';
import { fmtDateTime } from '../lib/format';
import { todayIso } from '../lib/ids';
import { act } from '../lib/act';
import { PreviewsUsageCard } from '../components/SessionPhotos';
import { DEFAULT_PROOF_MAIL } from '../services/proofs';
import { DEFAULT_PAYMENT_FOLLOWUP, DEFAULT_QUOTE_FOLLOWUP, DEFAULT_REVIEW_MAIL, FOLLOWUP_VARS } from '../lib/followUpMail';
import { DEFAULT_WEDDING_CGV, DEFAULT_WEDDING_CONTRACT, DEFAULT_WEDDING_INFO_MAIL, DEFAULT_WEDDING_QUOTE_MAIL, WEDDING_VARS } from '../lib/weddingTexts';
import { useNavigate } from 'react-router-dom';

const BUSINESS = [
  ['business_name', 'Nom commercial'], ['tagline', 'Sous-titre'], ['contact_name', 'Nom du contact'], ['contact_email', 'E-mail'],
  ['contact_phone', 'Téléphone'], ['website', 'Site web'],
] as const;

export default function Settings() {
  const { settings, reloadSettings } = useApp();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const v = (k: string) => draft[k] ?? settings[k] ?? '';
  const backups = useAsync(() => listBackups(), []);
  const paths = useAsync(() => appPaths(), []);
  const save = () => act(async () => {
    if (draft.client_pin !== undefined && !/^\d{4,8}$/.test(draft.client_pin)) throw new Error('Le code PIN doit contenir 4 à 8 chiffres.');
    for (const [k, val] of Object.entries(draft)) await setSetting(k, val);
    setDraft({}); await reloadSettings();
  }, 'Paramètres enregistrés');
  const setNow = (k: string, val: string) => act(() => setSetting(k, val).then(reloadSettings));
  const iris = useAsync(() => irisSource(), []);
  const importFromIris = async () => {
    if (!(await confirm({ title: 'Importer les données d’Iris Studio ?', text: 'Les données actuelles de MF/1.2 Studio sont remplacées par une COPIE de celles de MF12 Iris Studio (séances, clients, catalogue, prix, commandes, factures, réglages). Iris Studio n’est pas modifiée. Une sauvegarde de sécurité est faite avant. Conseil : fermez Iris Studio avant l’import.', danger: true, confirm: 'Importer', input: { label: 'Tapez IMPORTER pour confirmer', required: true } })) || false) return;
    const r = await act(() => importIris(), 'Données d’Iris Studio importées');
    if (r) setTimeout(() => window.location.reload(), 600);
  };
  const restore = async (path: string) => {
    if (!(await confirm({ title: 'Restaurer cette sauvegarde ?', text: 'Toutes les données actuelles seront remplacées. Une copie de sécurité de la base actuelle est créée automatiquement avant la restauration.', danger: true, confirm: 'Restaurer', input: { label: 'Tapez RESTAURER pour confirmer', required: true } })) || false) return;
    const r = await act(() => restoreBackup(path), 'Sauvegarde restaurée');
    if (r) setTimeout(() => window.location.reload(), 600);
  };
  return (
    <>
      <PageHeader title="Paramètres" actions={Object.keys(draft).length > 0 && <Button variant="gold" onClick={save}>Enregistrer</Button>} />
      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Identité & coordonnées" subtitle="Utilisées dans les PDF et le mode présentation." />
          <div className="grid grid-cols-2 gap-4 p-5">
            {BUSINESS.map(([k, l]) => <Field key={k} label={l}><Input value={v(k)} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} /></Field>)}
            <Field label="Adresse" className="col-span-2"><Textarea rows={2} value={v('address')} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
          </div>
        </Card>
        <Card className="col-span-2 row-start-2">
          <CardHeader title="Facturation — mentions légales" subtitle="Imprimées sur chaque facture. Les champs marqués * sont obligatoires pour émettre une facture. Le nom commercial, l’e-mail et le téléphone viennent du bloc Identité." />
          <div className="grid grid-cols-3 gap-4 p-5">
            <Field label="Nom et prénom de l’entrepreneur *"><Input value={v('legal_name')} placeholder="Prénom Nom" onChange={(e) => setDraft({ ...draft, legal_name: e.target.value })} /></Field>
            <Field label="Statut" hint="« EI » obligatoire après le nom pour une entreprise individuelle."><Input value={v('legal_status') || 'EI'} onChange={(e) => setDraft({ ...draft, legal_status: e.target.value })} /></Field>
            <Field label="SIRET *"><Input value={v('siret')} placeholder="123 456 789 00012" onChange={(e) => setDraft({ ...draft, siret: e.target.value })} /></Field>
            <Field label="Adresse professionnelle *" className="col-span-2"><Textarea rows={2} value={v('legal_address')} onChange={(e) => setDraft({ ...draft, legal_address: e.target.value })} /></Field>
            <Field label="Immatriculation"><Textarea rows={2} value={v('registration_mention') || 'Dispensé d’immatriculation au RCS et au RM'} onChange={(e) => setDraft({ ...draft, registration_mention: e.target.value })} /></Field>
            <Field label="Code APE (facultatif)"><Input value={v('ape_code')} placeholder="7420Z" onChange={(e) => setDraft({ ...draft, ape_code: e.target.value })} /></Field>
            <Field label="Médiateur de la consommation" hint="Nom + site, ex. « CNPM Médiation — www.cnpm-mediation-consommation.eu »" className="col-span-2"><Input value={v('mediator')} onChange={(e) => setDraft({ ...draft, mediator: e.target.value })} /></Field>
            <Field label="IBAN (facultatif, pour les virements)" className="col-span-2"><Input value={v('iban')} onChange={(e) => setDraft({ ...draft, iban: e.target.value })} /></Field>
            <Field label={`Dernière facture émise avant le logiciel en ${new Date().getFullYear()} (n°)`} hint="Ex. 4 si vous avez déjà émis 4 factures : la suivante sera F…-0005"><Input type="number" min={0} value={v(`invoice_external_last_${new Date().getFullYear()}`)} onChange={(e) => setDraft({ ...draft, [`invoice_external_last_${new Date().getFullYear()}`]: e.target.value })} /></Field>
            <Field label="Mention libre (facultatif)" hint="Ex. délais de livraison, droit à l’image…"><Input value={v('invoice_terms')} onChange={(e) => setDraft({ ...draft, invoice_terms: e.target.value })} /></Field>
            <Field label="Texte de l’e-mail d’envoi de facture" hint={`Objet : « Facture – séance – MF/1.2 ». Variables : ${MAIL_PLACEHOLDERS}`} className="col-span-2"><Textarea rows={9} value={v('invoice_mail_body') || DEFAULT_INVOICE_MAIL} onChange={(e) => setDraft({ ...draft, invoice_mail_body: e.target.value })} /></Field>
            <Field label="Texte de l’e-mail « récap de la sélection + brochure »" hint={`Objet : « Votre sélection – séance – MF/1.2 ». Variables : ${RECAP_PLACEHOLDERS}`} className="col-span-2"><Textarea rows={9} value={v('recap_mail_body') || DEFAULT_RECAP_MAIL} onChange={(e) => setDraft({ ...draft, recap_mail_body: e.target.value })} /></Field>
            <Field label="Texte de l’e-mail « offres de la séance » (brochure seule, depuis la liste des inscrits)" hint={`Objet : « Vos créations iris – séance – MF/1.2 ». Variables : ${OFFERS_PLACEHOLDERS}`} className="col-span-2"><Textarea rows={8} value={v('offers_mail_body') || DEFAULT_OFFERS_MAIL} onChange={(e) => setDraft({ ...draft, offers_mail_body: e.target.value })} /></Field>
            <Field label="Devis : durée de validité (jours)"><Input type="number" min={1} className="w-28" value={v('quote_validity_days') || '30'} onChange={(e) => setDraft({ ...draft, quote_validity_days: e.target.value })} /></Field>
            <Field label="Devis : conditions particulières (facultatif)" hint="Ex. acompte, délai de réalisation…" className="col-span-2"><Textarea rows={2} value={v('quote_terms')} onChange={(e) => setDraft({ ...draft, quote_terms: e.target.value })} /></Field>
            <Field label="Texte de l’e-mail d’envoi du devis" hint={`Objet : « Devis – séance – MF/1.2 ». Variables : ${QUOTE_PLACEHOLDERS}`} className="col-span-2"><Textarea rows={8} value={v('quote_mail_body') || DEFAULT_QUOTE_MAIL} onChange={(e) => setDraft({ ...draft, quote_mail_body: e.target.value })} /></Field>
            <Field label="Brochure des offres : texte d’introduction (facultatif)" hint="Affiché en page 2 de la brochure. Laissé vide : texte par défaut." className="col-span-2"><Textarea rows={3} value={v('brochure_intro')} onChange={(e) => setDraft({ ...draft, brochure_intro: e.target.value })} /></Field>
          </div>
        </Card>
        <Card className="col-span-2 row-start-3">
          <CardHeader title="Micro-entreprise — calcul du bénéfice" subtitle="Cotisations URSSAF en % du chiffre d’affaires (achats non déductibles). Taux 2026 par défaut : à vérifier sur autoentrepreneur.urssaf.fr selon votre déclaration d’activité." />
          <div className="grid grid-cols-4 gap-4 p-5">
            <Field label="Déclaration" className="col-span-2"><Select value={v('micro_mode') || 'services'} onChange={(e) => setDraft({ ...draft, micro_mode: e.target.value })}>
              <option value="services">Tout en prestations de services</option>
              <option value="mixte">Activité mixte : produits achetés et revendus = vente de marchandises</option>
            </Select></Field>
            <Field label="Prestations de services (%)" hint="BIC : 21,2 %"><Input value={v('micro_services_rate') || '21,2'} onChange={(e) => setDraft({ ...draft, micro_services_rate: e.target.value })} /></Field>
            <Field label="Vente de marchandises (%)" hint="12,3 % (mode mixte)"><Input value={v('micro_sales_rate') || '12,3'} onChange={(e) => setDraft({ ...draft, micro_sales_rate: e.target.value })} /></Field>
            <div className="col-span-2 flex items-end pb-2"><Toggle checked={v('micro_vl') === '1'} onChange={(x) => setDraft({ ...draft, micro_vl: x ? '1' : '0' })} label="Versement libératoire de l’impôt sur le revenu" /></div>
            <Field label="Versement libératoire services (%)" hint="1,7 %"><Input value={v('micro_vl_services_rate') || '1,7'} onChange={(e) => setDraft({ ...draft, micro_vl_services_rate: e.target.value })} /></Field>
            <Field label="Versement libératoire ventes (%)" hint="1 %"><Input value={v('micro_vl_sales_rate') || '1'} onChange={(e) => setDraft({ ...draft, micro_vl_sales_rate: e.target.value })} /></Field>
            <Field label="Autres contributions (%)" hint="Formation professionnelle, taxe chambre consulaire… (voir votre déclaration URSSAF)"><Input value={v('micro_other_rate') || '0'} onChange={(e) => setDraft({ ...draft, micro_other_rate: e.target.value })} /></Field>
            <Field label="Début d’activité" hint="Date de création de la micro-entreprise (1re période à déclarer, seuils au prorata)"><Input type="date" value={v('activity_start')} onChange={(e) => setDraft({ ...draft, activity_start: e.target.value })} /></Field>
            <Field label="Déclaration URSSAF"><Select value={v('urssaf_frequency') || 'mensuelle'} onChange={(e) => setDraft({ ...draft, urssaf_frequency: e.target.value })}><option value="mensuelle">Mensuelle</option><option value="trimestrielle">Trimestrielle</option></Select></Field>
            <Field label="Seuil franchise TVA (€)" hint="Services : 37 500 € (2026)"><Input value={v('ceiling_vat') || '37500'} onChange={(e) => setDraft({ ...draft, ceiling_vat: e.target.value })} /></Field>
            <Field label="Seuil majoré TVA (€)" hint="Services : 41 250 € (2026)"><Input value={v('ceiling_vat_major') || '41250'} onChange={(e) => setDraft({ ...draft, ceiling_vat_major: e.target.value })} /></Field>
            <Field label="Plafond micro-entreprise (€)" hint="Services : 83 600 € (2026)"><Input value={v('ceiling_micro_services') || '83600'} onChange={(e) => setDraft({ ...draft, ceiling_micro_services: e.target.value })} /></Field>
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Mode présentation client" />
            <div className="p-5"><Field label="Code PIN de sortie (4 à 8 chiffres)" hint={settings.client_pin === '1212' ? 'Code par défaut 1212 — pensez à le changer.' : undefined}><Input className="w-40 font-mono" inputMode="numeric" value={v('client_pin')} onChange={(e) => setDraft({ ...draft, client_pin: e.target.value.replace(/\D/g, '') })} /></Field></div>
          </Card>
          <Card>
            <CardHeader title="Fiscalité" />
            <div className="space-y-2 p-5 text-[13px]">
              <Toggle checked={settings.vat_recoverable === '1'} onChange={(x) => setNow('vat_recoverable', x ? '1' : '0')} label="TVA récupérable sur les achats" />
              <div className="text-mist-400">Désactivé (recommandé en micro-entreprise en franchise de TVA) : le coût fournisseur retenu est le montant TTC réellement payé.</div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Données personnelles" />
            <div className="p-5 text-[13px] text-mist-300">Seul le nom de famille est obligatoire. Depuis la fiche d’une famille : correction, export CSV, suppression (si aucune commande) ou anonymisation (commandes conservées). Aucune donnée bancaire n’est stockée.</div>
          </Card>
        </div>
        <Card className="col-span-2">
          <CardHeader title="Relances, avis & BAT" subtitle={`E-mails préparés en un clic depuis le tableau de bord. Variables : ${FOLLOWUP_VARS}.`} />
          <div className="grid grid-cols-3 gap-4 p-5">
            <Field label="Lien vers votre fiche d’avis Google" hint="Google Business Profile → « Demander des avis » → copier le lien" className="col-span-3"><Input value={v('google_review_url')} placeholder="https://g.page/r/…/review" onChange={(e) => setDraft({ ...draft, google_review_url: e.target.value })} /></Field>
            <Field label="Relancer un devis après (jours)"><Input type="number" min={1} value={v('quote_followup_days') || '7'} onChange={(e) => setDraft({ ...draft, quote_followup_days: e.target.value })} /></Field>
            <Field label="Demander un avis après la livraison (jours)"><Input type="number" min={0} value={v('review_delay_days') || '7'} onChange={(e) => setDraft({ ...draft, review_delay_days: e.target.value })} /></Field>
            <div />
            <Field label="Relance d’un devis"><Textarea rows={10} value={v('quote_followup_mail') || DEFAULT_QUOTE_FOLLOWUP} onChange={(e) => setDraft({ ...draft, quote_followup_mail: e.target.value })} /></Field>
            <Field label="Relance d’une échéance"><Textarea rows={10} value={v('payment_followup_mail') || DEFAULT_PAYMENT_FOLLOWUP} onChange={(e) => setDraft({ ...draft, payment_followup_mail: e.target.value })} /></Field>
            <Field label="Demande d’avis (questionnaire + lien Google)"><Textarea rows={10} value={v('review_mail') || DEFAULT_REVIEW_MAIL} onChange={(e) => setDraft({ ...draft, review_mail: e.target.value })} /></Field>
            <Field label="Envoi d’un BAT (bon à tirer)" hint="Variables : {bonjour} {numero} {seance} {liste} {signature}" className="col-span-3"><Textarea rows={9} value={v('proof_mail') || DEFAULT_PROOF_MAIL} onChange={(e) => setDraft({ ...draft, proof_mail: e.target.value })} /></Field>
          </div>
        </Card>
        <Card className="col-span-2">
          <CardHeader title="Mariages — contrat, CGV, délais" subtitle={`Modèles à faire relire par un juriste avant usage. Variables remplacées dans le contrat et les CGV : ${WEDDING_VARS}.`} />
          <div className="grid grid-cols-4 gap-4 p-5">
            <Field label="Acompte à la signature (%)"><Input type="number" min={0} max={100} value={v('wedding_deposit_pct') || '30'} onChange={(e) => setDraft({ ...draft, wedding_deposit_pct: e.target.value })} /></Field>
            <Field label="Teaser / premières photos (jours)" hint="Après le mariage"><Input type="number" min={1} value={v('wedding_teaser_days') || '15'} onChange={(e) => setDraft({ ...draft, wedding_teaser_days: e.target.value })} /></Field>
            <Field label="Film + galerie complète (jours)" hint="Après le mariage"><Input type="number" min={1} value={v('wedding_final_days') || '30'} onChange={(e) => setDraft({ ...draft, wedding_final_days: e.target.value })} /></Field>
            <div />
            <Field label="Contrat d’engagement (articles)" hint="« 1. Titre » sur une ligne = titre d’article. Le tableau du devis, l’échéancier et les signatures sont ajoutés automatiquement." className="col-span-4"><Textarea rows={12} value={v('wedding_contract') || DEFAULT_WEDDING_CONTRACT} onChange={(e) => setDraft({ ...draft, wedding_contract: e.target.value })} /></Field>
            <Field label="Conditions générales de vente" className="col-span-4"><Textarea rows={12} value={v('wedding_cgv') || DEFAULT_WEDDING_CGV} onChange={(e) => setDraft({ ...draft, wedding_cgv: e.target.value })} /></Field>
            <Field label="E-mail « devis + contrat »" hint="Variables : {bonjour} {maries} {date} {total} {acompte} {signature}" className="col-span-2"><Textarea rows={8} value={v('wedding_quote_mail') || DEFAULT_WEDDING_QUOTE_MAIL} onChange={(e) => setDraft({ ...draft, wedding_quote_mail: e.target.value })} /></Field>
            <Field label="E-mail « fiche de renseignements »" hint="Variables : {bonjour} {signature}" className="col-span-2"><Textarea rows={8} value={v('wedding_info_mail') || DEFAULT_WEDDING_INFO_MAIL} onChange={(e) => setDraft({ ...draft, wedding_info_mail: e.target.value })} /></Field>
          </div>
        </Card>
        <Card className="col-span-2">
          <CardHeader title={<span className="flex items-center gap-2"><DatabaseBackup className="size-4 text-gold-400" />Sauvegardes</span>}
            subtitle="Sauvegarde SQLite en ligne (API de sauvegarde, sûre même base ouverte) + vérification d’intégrité. Les images d’exemple sont incluses dans la base."
            actions={isTauri() && <>
              <Button size="sm" icon={<ShieldCheck className="size-3.5" />} onClick={() => act(async () => { const r = await integrityCheck(); if (r !== 'ok') throw new Error(`Anomalie : ${r}`); return r; }, 'Base de données intègre ✓')}>Vérifier l’intégrité</Button>
              <Button size="sm" icon={<HardDriveDownload className="size-3.5" />} onClick={() => act(async () => { const { save } = await import('@tauri-apps/plugin-dialog'); const p = await save({ defaultPath: `mf12-studio-${todayIso()}.db` }); return p ? backupNow('export', p) : null; }, 'Base exportée')}>Exporter la base…</Button>
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={async () => { const p = await pickBackupFile(); if (p) restore(p); }}>Restaurer un fichier…</Button>
              <Button size="sm" variant="gold" icon={<DatabaseBackup className="size-3.5" />} onClick={() => act(() => backupNow().then(backups.reload), 'Sauvegarde créée')}>Sauvegarder maintenant</Button>
            </>} />
          <div className="p-5">
            {!isTauri() && <div className="mb-3 text-[13px] text-amber-200">Aperçu navigateur : les sauvegardes sont disponibles dans l’application macOS.</div>}
            {iris.data && (
              <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-gold-500/30 bg-gold-500/[0.05] px-4 py-3 text-[13px]">
                <div><div className="font-medium">Données de MF12 Iris Studio trouvées sur ce Mac</div><div className="text-mist-400">Importer en fait une copie ici ; Iris Studio reste intacte et utilisable. Factures : n’en émettez que dans une seule des deux apps.</div></div>
                <Button size="sm" variant="gold" icon={<DatabaseBackup className="size-3.5" />} onClick={importFromIris}>Importer les données d’Iris Studio</Button>
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-6 text-[13px]">
              <Toggle checked={settings.auto_backup !== '0'} onChange={(x) => setNow('auto_backup', x ? '1' : '0')} label="Sauvegarde automatique (au démarrage puis toutes les 12 h)" />
              <span className="text-mist-400">Dernière : {fmtDateTime(settings.last_backup)}</span>
              <span className="flex items-center gap-2 text-mist-400">Conserver <Input className="h-8 w-16" value={v('backup_keep')} onChange={(e) => setDraft({ ...draft, backup_keep: e.target.value.replace(/\D/g, '') })} /> sauvegardes auto</span>
            </div>
            {paths.data && <div className="mb-3 flex items-center gap-2 text-[12px] text-mist-400"><FolderOpen className="size-3.5" />{paths.data.backupsDir}</div>}
            <div className="max-h-72 divide-y divide-ink-700/50 overflow-auto rounded-xl border border-ink-700">
              {backups.data?.map((b) => (
                <div key={b.path} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                  <span className="flex-1 font-mono text-[12px]">{b.name}</span>
                  <Badge>{(b.size / 1024 / 1024).toFixed(1)} Mo</Badge>
                  <span className="w-36 text-mist-400">{fmtDateTime(new Date(b.modified * 1000).toISOString())}</span>
                  <Button size="sm" variant="ghost" onClick={() => restore(b.path)}>Restaurer</Button>
                </div>
              ))}
              {!backups.data?.length && <div className="px-4 py-4 text-[13px] text-mist-400">Aucune sauvegarde.</div>}
            </div>
          </div>
        </Card>
        <PreviewsUsageCard limitGb={Number(v('previews_limit_gb')) || 20} onLimit={(gb) => act(() => setSetting('previews_limit_gb', String(gb)).then(reloadSettings))} onOpenSession={(id) => nav(`/seances/${id}?tab=photos`)} />
        <Card className="col-span-2">
          <CardHeader title="Exports CSV (Excel)" />
          <div className="flex flex-wrap gap-2 p-5">
            {(['familles', 'inscriptions', 'commandes', 'lignes', 'paiements'] as const).map((k) => (
              <Button key={k} icon={<Download className="size-4" />} onClick={() => act(async () => saveFile(`${k}-${todayIso()}.csv`, await exportCsv(k), [{ name: 'CSV', extensions: ['csv'] }]), 'Export enregistré')}>{k[0].toUpperCase() + k.slice(1)}</Button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
