/**
 * Mariages : textes par défaut (modifiables dans Paramètres → Mariages) et champs de la fiche de renseignements.
 * Modèles à faire relire par un professionnel du droit avant usage ; variables entre accolades remplacées à l'édition.
 */

export const addDays = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Replaces {variables}; unknown variables are left as they are. */
export const fillText = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

export const WEDDING_VARS = '{photographe}, {siret}, {adresse_photographe}, {maries}, {date}, {lieu}, {prestations}, {total}, {acompte}, {solde}, {echeancier}, {delai_teaser}, {delai_final}, {mediateur}';

/** Articles of the engagement contract (one paragraph per line starting with a number = article title). */
export const DEFAULT_WEDDING_CONTRACT = `1. Objet
Le présent contrat a pour objet la réalisation par {photographe} (ci-après « le Prestataire ») de la prestation {prestations} du mariage de {maries} (ci-après « les Mariés »), le {date}, à {lieu}, selon le devis accepté joint, qui fait partie intégrante du contrat.

2. Prix et modalités de paiement
Le prix total de la prestation est de {total}, TVA non applicable (article 293 B du CGI). Un acompte de {acompte} est versé à la signature du présent contrat ; il confirme la réservation de la date, qui n’est bloquée qu’à sa réception. Le solde de {solde} est réglé au plus tard le jour du mariage, selon l’échéancier suivant : {echeancier}. Les frais de déplacement, d’hébergement ou les options non prévues au devis feront l’objet d’un avenant signé des deux parties.

3. Déroulement de la prestation
Les Mariés transmettent au Prestataire, au plus tard un mois avant le mariage, la fiche de renseignements du jour J (programme, lieux, horaires, contacts, photos de groupe souhaitées). Le Prestataire ne peut être tenu responsable de l’absence d’images d’un moment qui ne lui aurait pas été signalé, d’un retard du programme, des conditions météorologiques ou de restrictions imposées par les lieux ou les officiants. Les Mariés assurent au Prestataire un repas et une boisson pendant la réception lorsque la prestation couvre le repas, ainsi qu’un accès aux lieux.

4. Livraison
Le Prestataire livre une sélection d’images retouchées (et / ou le film, selon les prestations choisies) par lien de téléchargement (TransferNow) ou galerie privée en ligne, dans les délais suivants à compter du jour du mariage : premières photos ou teaser vidéo sous {delai_teaser} jours, galerie complète et film sous {delai_final} jours. Le choix des images, la retouche et le montage relèvent de la démarche artistique du Prestataire. Les fichiers bruts (RAW, rushes) ne sont pas remis. Les fichiers sont conservés par le Prestataire pendant un an après la livraison ; les Mariés sont invités à en faire plusieurs copies.

5. Album
Lorsqu’un album est commandé, le Prestataire propose une maquette ; les Mariés disposent de deux séries de modifications. L’album est commandé auprès du fournisseur après validation écrite de la maquette ; le délai de fabrication du fournisseur s’ajoute aux délais ci-dessus.

6. Annulation ou report
Par les Mariés : l’annulation doit être notifiée par écrit. L’acompte reste acquis au Prestataire, qui a réservé la date et refusé d’autres demandes. En cas d’annulation à moins de 60 jours du mariage, 50 % du prix total sont dus ; à moins de 15 jours, la totalité du prix est due. Un report à une autre date est possible sans frais, une seule fois, sous réserve de la disponibilité du Prestataire ; à défaut, il est traité comme une annulation.
Par le Prestataire : en cas d’empêchement grave (maladie, accident, force majeure), le Prestataire propose un professionnel de qualité équivalente, avec l’accord des Mariés ; à défaut, les sommes versées sont intégralement remboursées, sans autre indemnité.

7. Droit à l’image et droits d’auteur
Le Prestataire reste titulaire des droits d’auteur sur les images et le film. Il concède aux Mariés un droit d’utilisation pour un usage privé et familial (tirages, partage avec les proches, réseaux sociaux personnels en citant le Prestataire), à l’exclusion de tout usage commercial. Le Prestataire peut utiliser une sélection d’images et d’extraits pour sa communication (site, portfolio, réseaux sociaux, concours) uniquement si les Mariés l’ont accepté ci-dessous ; ils peuvent retirer cet accord à tout moment pour l’avenir.
☐ Nous acceptons      ☐ Nous refusons      l’utilisation de nos images par le Prestataire pour sa communication.

8. Données personnelles
Les informations recueillies sont utilisées uniquement pour l’exécution de la prestation et la facturation ; elles ne sont pas cédées à des tiers. Les Mariés disposent d’un droit d’accès, de rectification et d’effacement auprès du Prestataire.

9. Litiges
Le contrat est soumis au droit français. En cas de litige, les parties recherchent d’abord une solution amiable. Les Mariés peuvent recourir gratuitement au médiateur de la consommation : {mediateur}.`;

export const DEFAULT_WEDDING_CGV = `Conditions générales de vente — prestations de mariage

Article 1 — Champ d’application
Les présentes conditions générales de vente (CGV) s’appliquent à toutes les prestations de photographie et de vidéographie de mariage réalisées par {photographe}, entrepreneur individuel (SIRET {siret}, {adresse_photographe}). Toute commande implique l’acceptation des CGV, qui prévalent sur tout autre document, sauf conditions particulières écrites.

Article 2 — Devis et commande
Les prestations font l’objet d’un devis gratuit, valable 30 jours. La commande est ferme à la réception du devis et du contrat signés et de l’acompte. La date n’est réservée qu’à ce moment.

Article 3 — Prix
Les prix sont exprimés en euros, TVA non applicable (article 293 B du CGI). Ils comprennent les prestations détaillées au devis. Les frais de déplacement au-delà de la zone indiquée au devis, l’hébergement éventuel et les prestations supplémentaires sont facturés en sus, après accord des clients.

Article 4 — Paiement
Un acompte (30 % du prix total, sauf mention contraire au devis) est versé à la signature. Le solde est réglé au plus tard le jour de la prestation, le cas échéant en plusieurs fois selon l’échéancier du contrat. Moyens acceptés : virement, chèque, espèces dans la limite légale, carte bancaire. Aucun escompte pour paiement anticipé. La livraison des fichiers intervient après paiement intégral.

Article 5 — Droit de rétractation
Lorsque le contrat est conclu à distance ou hors établissement, le client dispose d’un délai de 14 jours à compter de la signature pour se rétracter, sans motif (articles L221-18 et suivants du Code de la consommation), au moyen du formulaire joint ou de toute déclaration dénuée d’ambiguïté. Les sommes versées sont alors remboursées sous 14 jours. Si le client demande expressément que la prestation commence avant la fin de ce délai, il reste redevable des prestations déjà réalisées. Le droit de rétractation ne s’applique pas aux contrats conclus dans les locaux du prestataire ni aux prestations pleinement exécutées avant la fin du délai avec l’accord exprès du client.

Article 6 — Exécution de la prestation
Le prestataire s’engage à mettre en œuvre tout son savoir-faire pour réaliser la prestation (obligation de moyens). Le style artistique, le choix des cadrages, la sélection et le traitement des images relèvent de sa liberté de création ; ils ne peuvent motiver un refus de paiement. Le client facilite le travail du prestataire (programme, accès aux lieux, informations du jour J).

Article 7 — Livraison et conservation
Les délais de livraison sont indiqués au contrat ; ils courent à compter du jour du mariage et peuvent être prolongés en période de forte activité, le client en étant informé. Les fichiers sont livrés par lien de téléchargement ou galerie en ligne. Ils sont conservés un an par le prestataire ; passé ce délai, leur perte ne pourra lui être reprochée.

Article 8 — Annulation, report, force majeure
Les conditions d’annulation et de report sont précisées au contrat. Aucune des parties n’est responsable d’un manquement dû à un cas de force majeure au sens de l’article 1218 du Code civil.

Article 9 — Responsabilité
En cas de perte ou de détérioration accidentelle des fichiers avant livraison (défaillance du matériel, vol), la responsabilité du prestataire est limitée au remboursement des sommes versées pour la partie de la prestation concernée. Le prestataire est assuré en responsabilité civile professionnelle.

Article 10 — Propriété intellectuelle et droit à l’image
Les images et films sont des œuvres protégées par le Code de la propriété intellectuelle ; le prestataire en conserve les droits d’auteur. Le client bénéficie d’un droit d’usage privé et familial. Toute utilisation commerciale ou modification (filtres, recadrages altérant l’œuvre) nécessite l’accord du prestataire. L’utilisation des images par le prestataire pour sa communication est soumise à l’accord du client indiqué au contrat.

Article 11 — Réclamations et médiation
Toute réclamation est adressée par écrit au prestataire. À défaut d’accord amiable, le client peut saisir gratuitement le médiateur de la consommation : {mediateur}. Plateforme européenne de règlement en ligne des litiges : https://ec.europa.eu/consumers/odr.

Article 12 — Droit applicable
Les présentes CGV sont soumises au droit français.

Formulaire de rétractation (à renvoyer uniquement si vous souhaitez vous rétracter)
À l’attention de {photographe}, {adresse_photographe} : je / nous notifions par la présente notre rétractation du contrat portant sur la prestation de mariage du {date}. Commandé le : ............ Nom(s) : ............ Adresse : ............ Date et signature : ............`;

export const DEFAULT_WEDDING_INFO_MAIL = `{bonjour}

Votre mariage approche ! Pour que tout se passe au mieux le jour J, merci de compléter la fiche de renseignements ci-jointe (programme, lieux, horaires, contacts, photos de groupe) et de me la renvoyer au plus tard un mois avant le mariage.

N’hésitez pas à m’appeler si vous avez la moindre question.

{signature}`;

export const DEFAULT_WEDDING_QUOTE_MAIL = `{bonjour}

Merci pour votre confiance. Vous trouverez ci-joint le devis de votre mariage, le contrat d’engagement et les conditions générales de vente.

Pour réserver la date, il suffit de me retourner le devis et le contrat signés, accompagnés de l’acompte de {acompte}. La date n’est bloquée qu’à réception.

Je reste à votre disposition pour adapter la prestation à vos envies.

{signature}`;

/** Information sheet of the wedding day: sections and fields (key = storage key in weddings.info). */
export interface InfoField { key: string; label: string; long?: boolean; video?: boolean }
export const WEDDING_INFO: { title: string; fields: InfoField[] }[] = [
  { title: 'Les mariés', fields: [
    { key: 'noms', label: 'Noms et prénoms complets' }, { key: 'telephones', label: 'Téléphones (le jour J)' },
    { key: 'adresse', label: 'Adresse postale' }, { key: 'invites', label: 'Nombre d’invités (dont enfants)' },
  ] },
  { title: 'Programme de la journée', fields: [
    { key: 'prepa_1', label: 'Préparatifs (1) — lieu, adresse, heure' }, { key: 'prepa_2', label: 'Préparatifs (2) — lieu, adresse, heure' },
    { key: 'first_look', label: 'Découverte / first look — lieu, heure' },
    { key: 'civile', label: 'Cérémonie civile — mairie, adresse, heure' }, { key: 'ceremonie', label: 'Cérémonie religieuse / laïque — lieu, adresse, heure' },
    { key: 'couple', label: 'Séance photo de couple — lieu, heure, durée' }, { key: 'cocktail', label: 'Vin d’honneur / cocktail — lieu, heure' },
    { key: 'reception', label: 'Repas / soirée — lieu, adresse, heure' },
    { key: 'temps_forts', label: 'Temps forts (entrée des mariés, discours, ouverture du bal, gâteau, animations) — heures', long: true },
    { key: 'fin', label: 'Heure de fin de la prestation' },
  ] },
  { title: 'Contacts le jour J', fields: [
    { key: 'temoins', label: 'Témoins (noms, téléphones)', long: true }, { key: 'planner', label: 'Wedding planner / coordinateur' },
    { key: 'officiant', label: 'Officiant' }, { key: 'prestataires', label: 'Autres prestataires (DJ, traiteur, fleuriste, vidéaste / photographe…)', long: true },
  ] },
  { title: 'Photos et souhaits', fields: [
    { key: 'groupes', label: 'Photos de groupe souhaitées (liste dans l’ordre)', long: true },
    { key: 'personnes', label: 'Personnes à photographier absolument (qui, comment les reconnaître)', long: true },
    { key: 'surprises', label: 'Surprises, moments importants à ne pas manquer', long: true },
    { key: 'sensible', label: 'Points d’attention (familles recomposées, personnes à ne pas associer, absences…)', long: true },
    { key: 'interdits', label: 'Contraintes des lieux (photos interdites pendant la cérémonie, flash…)' },
    { key: 'style', label: 'Thème, couleurs, ambiance souhaitée' },
    { key: 'musique', label: 'Musiques souhaitées pour le film', video: true },
  ] },
  { title: 'Organisation', fields: [
    { key: 'pluie', label: 'Plan B en cas de pluie' }, { key: 'acces', label: 'Accès, parking, horaires d’ouverture des lieux' },
    { key: 'repas_presta', label: 'Repas prestataire (heure, lieu)' }, { key: 'remarques', label: 'Autres remarques', long: true },
  ] },
];
