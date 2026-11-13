import { useState } from 'react';
import { DEFAULT_INVOICE_MAIL, DEFAULT_RECAP_MAIL, MAIL_PLACEHOLDERS, RECAP_PLACEHOLDERS } from '../lib/invoiceMail';
import { DatabaseBackup, Download, FolderOpen, HardDriveDownload, RotateCcw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Textarea, Toggle, useAsync, useConfirm } from '../components/ui';
import { setSetting } from '../services/base';
import { appPaths, backupNow, exportCsv, integrityCheck, listBackups, restoreBackup } from '../services/backup';
import { useApp } from '../store';
import { isTauri } from '../lib/db';
import { pickBackupFile, saveFile } from '../lib/files';
import { fmtDateTime } from '../lib/format';
import { todayIso } from '../lib/ids';
import { act } from '../lib/act';

const BUSINESS = [
  ['business_name', 'Nom commercial'], ['tagline', 'Sous-titre'], ['contact_name', 'Nom du contact'], ['contact_email', 'E-mail'],
  ['contact_phone', 'Téléphone'], ['website', 'Site web'],
] as const;

export default function Settings() {
  const { settings, reloadSettings } = useApp();
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
            <Field label="Mention libre (facultatif)" hint="Ex. délais de livraison, droit à l’image…"><Input value={v('invoice_terms')} onChange={(e) => setDraft({ ...draft, invoice_terms: e.target.value })} /></Field>
            <Field label="Texte de l’e-mail d’envoi de facture" hint={`Objet : « Facture – séance – MF/1.2 ». Variables : ${MAIL_PLACEHOLDERS}`} className="col-span-2"><Textarea rows={9} value={v('invoice_mail_body') || DEFAULT_INVOICE_MAIL} onChange={(e) => setDraft({ ...draft, invoice_mail_body: e.target.value })} /></Field>
            <Field label="Texte de l’e-mail « récap de la sélection + brochure »" hint={`Objet : « Votre sélection – séance – MF/1.2 ». Variables : ${RECAP_PLACEHOLDERS}`} className="col-span-2"><Textarea rows={9} value={v('recap_mail_body') || DEFAULT_RECAP_MAIL} onChange={(e) => setDraft({ ...draft, recap_mail_body: e.target.value })} /></Field>
            <Field label="Brochure des offres : texte d’introduction (facultatif)" hint="Affiché en page 2 de la brochure. Laissé vide : texte par défaut." className="col-span-2"><Textarea rows={3} value={v('brochure_intro')} onChange={(e) => setDraft({ ...draft, brochure_intro: e.target.value })} /></Field>
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
          <CardHeader title={<span className="flex items-center gap-2"><DatabaseBackup className="size-4 text-gold-400" />Sauvegardes</span>}
            subtitle="Sauvegarde SQLite en ligne (API de sauvegarde, sûre même base ouverte) + vérification d’intégrité. Les images d’exemple sont incluses dans la base."
            actions={isTauri() && <>
              <Button size="sm" icon={<ShieldCheck className="size-3.5" />} onClick={() => act(async () => { const r = await integrityCheck(); if (r !== 'ok') throw new Error(`Anomalie : ${r}`); return r; }, 'Base de données intègre ✓')}>Vérifier l’intégrité</Button>
              <Button size="sm" icon={<HardDriveDownload className="size-3.5" />} onClick={() => act(async () => { const { save } = await import('@tauri-apps/plugin-dialog'); const p = await save({ defaultPath: `iris-studio-${todayIso()}.db` }); return p ? backupNow('export', p) : null; }, 'Base exportée')}>Exporter la base…</Button>
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={async () => { const p = await pickBackupFile(); if (p) restore(p); }}>Restaurer un fichier…</Button>
              <Button size="sm" variant="gold" icon={<DatabaseBackup className="size-3.5" />} onClick={() => act(() => backupNow().then(backups.reload), 'Sauvegarde créée')}>Sauvegarder maintenant</Button>
            </>} />
          <div className="p-5">
            {!isTauri() && <div className="mb-3 text-[13px] text-amber-200">Aperçu navigateur : les sauvegardes sont disponibles dans l’application macOS.</div>}
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
