# État du projet — MF/1.2 Iris Studio (v1.0.0, 08/11/2026)

## Terminé et testé
- Fondations : Tauri 2 + React 19 + TS + Vite + Tailwind 4, couche native rusqlite (connexion unique, transactions, WAL), migrations versionnées, seed initial (5 styles, produits & formats d'exemple, Onelab Pro / Dreambooks Pro, template « Tarif public » **sans prix**).
- Séances : création, modification, duplication (avec copie de grille), archivage, suppression protégée, fiche à 7 onglets.
- Inscriptions : modèle CSV (UTF-8 BOM, `;`), import avec validation, aperçu, doublons, réimport sans doublon, conflits (ignorer / mettre à jour / créer), restauration du 0 initial des téléphones, encodage Windows-1252 accepté, ajout manuel / famille existante.
- Clients : recherche (nom, tél., réf. inscription, réf. photo), fiches, participants, références photo, historique, doublons + fusion, suppression / anonymisation, export CSV.
- Planning : vues journée (glisser-déposer), liste, créneaux ; statuts ; capacité ; restant à recevoir ; accès direct à la vente.
- Catalogue : styles paramétrables + images d'exemple (miniatures auto), produits/variantes, archivage avec historique préservé.
- Templates tarifaires : éditeur en tableaux (créations par nb d'iris, variantes), modes manuel / coefficient / taux de marque, duplication, archivage, comparaison, copie indépendante par séance.
- Promotions : packs auto-détectés (unités les moins chères), %, €, quantité, catégorie/style/produit, priorités, cumul/exclusivité, activation par séance, remise exceptionnelle tracée.
- Configurateur de vente (admin et client) ; commandes brouillon / validée / annulée, prix figés, correction avec historique, duplication.
- Paiements : multiples, partiel/complet, solde, échéance prévue ; aucun encaissement ni donnée bancaire.
- Postproduction : tâches à la validation, tableau / kanban / regroupements, statuts en masse, notes, CSV, fiche PDF ; impressions groupées par fournisseur → commandes fournisseurs (statuts propagés aux tâches), export CSV/PDF.
- Fournisseurs : fiches, produits, historique des prix, import CSV, équivalent/proche, comparateur (coût réel TTC en franchise de TVA).
- Rentabilité : CA, remises, encaissements, coûts prévisionnels/réels, frais de séance, temps de travail facultatif, résultat estimé, comparaison.
- Tableau de bord global / par séance avec filtres.
- PDF : catalogue, grille, récapitulatif client, fiche de production, commande fournisseur ; aperçu avant export.
- Sauvegardes : API backup SQLite en ligne + integrity_check, auto (démarrage + 12 h, rotation), manuelle, export, restauration avec copie de sécurité préalable, vérification d'intégrité ; exports CSV.
- Mode présentation client : arbre séparé, persistant au redémarrage, sortie par PIN.

- Envoi de facture par e-mail : commande Rust `compose_mail` (PDF dans <données>/factures + AppleScript Mail : destinataire, objet, texte, pièce jointe, message visible, non envoyé) ; repli Finder + mailto ; texte modifiable (`settings.invoice_mail_body`). Testé : unitaires + aperçu navigateur (repli). **Non vérifié sur Mac réel** (autorisation Automatisation à accepter au 1er usage).

- Tirages papier Onelab (petits/grands formats, DPII Lustre) + option « Cadre Flybox 5 + acrylique anti-reflet » rattachée à une ligne de tirage (`order_items.parent_item_id`, migration 6 ; `settings.print_frame`) : quantité suivie, retrait en cascade, duplication, liste « Impressions à commander ». Import CSV fournisseur : liaison auto Support = produit, Format = variante. Prix d’achat fournis par CSV local (jamais dans le dépôt). Testé : unitaires + aperçu navigateur.

- Brochure des offres illustrée (`lib/brochure.ts`, `brochureData`) : remplace le « Catalogue commercial » ; images recadrées/réduites via canvas (`cropForPdf`). Récap brouillon « Votre sélection » illustré. E-mail « récap + brochure » (`emailOrderRecap`, bouton dans le configurateur et la fiche commande) ; `compose_mail` accepte plusieurs pièces jointes. Description des tirages papier corrigée (ne cite plus le fournisseur, `paper_desc_v2`). Testé : unitaires + aperçu navigateur (PDF rendus et relus). Mail.app non vérifié sur Mac réel.

- Devis (`services/quotes.ts`, table `quotes`, migration 7) : numérotation continue D{année}-0001, contenu figé (même format que la facture, kind 'devis'), réémission seulement si le contenu change, validité (`quote_validity_days`), statut envoyé/signé/refusé, PDF avec « Bon pour accord », e-mail (`emailQuote`). Testé : unitaires + aperçu navigateur.

- Bénéfice net micro-entreprise (`lib/micro.ts`, `profitability` : cotisations URSSAF en % du CA, mode services / mixte — produits achetés = unit_cost > 0 —, versement libératoire, autres contributions ; réglages `micro_*`). Rentabilité : synthèse de l’année + colonnes Cotisations / Bénéfice net. Testé : unitaires + aperçu.

- **Étape 0 — MF12 Studio 2.0.0** : nouvelle app (nom, identifiant `fr.mf12.studio`, icône platine, base `studio.db`) à côté de MF12 Iris Studio (branche `iris`, 1.1.13 figée). Import d’une copie des données d’Iris Studio : commandes Rust `iris_source` / `import_iris` (lecture seule de la source, API backup SQLite → inclut le WAL, sauvegarde de sécurité avant). Test Rust dédié. **Non vérifié sur Mac réel** (chemin ~/Library/Application Support/fr.mf12.irisstudio).

- **Étape 1 — Compta** (`services/compta.ts`, `lib/compta.ts`, page `Compta`, migration 11 : `urssaf_declarations`, `general_expenses`) : livre des recettes (paiements, CSV/PDF), déclaration URSSAF (période proposée, échéance, montant à l’euro, instantané figé, contrôle d’écart, payé), frais généraux + registre des achats, bilan annuel et seuils au prorata, rappel tableau de bord. Limites : la suppression d’une commande supprime ses encaissements du livre (écart signalé si période déclarée) ; factures d’acompte prévues avec les mariages.

- Prestations déjà signées (`services/prestations.ts`, `PrestationDialog`, Commandes) : séance à une famille + commande validée à lignes libres (category 'prestation'), acomptes datés, date de signature (validated_at), suivi coché, livrée ou à venir. Numérotation des factures continuée après les factures externes (`invoice_external_last_{année}`). Testé : unitaires + aperçu.

## Tests exécutés
- `npm test` : 23 tests (calculs monétaires, marges, promotions, CSV, séances, import/réimport, commandes, paiements, historique des prix, PDF sans données internes).
- `cargo test` : sauvegarde en ligne / restauration / intégrité.
- E2E Chromium (aperçu navigateur) : parcours complet catalogue → tarifs → séance → import CSV → planning → vente → validation → paiement partiel → postproduction → PDF → mode client (aucune fuite) → sortie PIN.
- Binaire Tauri natif lancé sous Linux/Xvfb : base créée, migrée, seed, WAL, sauvegarde auto OK.

- **Étape 2 — Univers de séance** (`services/universes.ts`, migration 12 : table `universes` + `universe_id` sur `sessions`, `price_templates`, `composition_styles`, `products` ; NULL = commun) : Catalogue → onglet « Univers de séance » (nom, template par défaut, intro brochure, e-mails offres / récap — vides = textes des Paramètres) ; filtre univers dans Catalogue, Templates, Séances ; univers choisi à la création de séance (template par défaut proposé), modifiable, conservé à la duplication ; grille tarifaire filtrée commun + univers (lignes déjà tarifées toujours visibles). Mise à jour de données `applyIrisUniverse` (drapeau `universe_iris`) : séances, templates et styles existants → univers Iris ; produits communs. Testé : unitaires + aperçu navigateur. Non vérifié sur Mac.
- Produits et variantes multi-univers (migration 13 `catalog_universes` ; `products.universe_id` n’est plus utilisé) : aucun lien = commun ; variante sans lien = univers de son produit ; fiche produit et lignes de variantes avec choix des univers ; grille tarifaire filtrée en conséquence. Mise à jour `applyIrisProducts` (drapeau `universe_iris_products`) : produits existants → Iris. Testé : unitaires + aperçu.
- Pièces jointes de commande (`services/attachments.ts`, `components/OrderAttachments.tsx`, migration 14 `order_attachments`) : fichiers en base64 dans la base (inclus dans les sauvegardes, 20 Mo max par fichier), type deviné (devis signé, e-mail, bon de commande, paiement, autre), note, aperçu (image, PDF, texte/.eml), enregistrer une copie, collage d’une capture (⌘V) sur la page commande, historique. Supprimées avec la commande (compte affiché dans l’avertissement ; sauvegarde faite avant). Testé : unitaires + aperçu navigateur ; collage ⌘V et aperçu PDF non vérifiés dans WebKit/macOS.

- Registre des devis (`Documents` → `QuoteRegister`, `listQuotes`, `emailQuoteRow`), envoi groupé des offres (`BulkOffersDialog` : un `compose_mail` par famille, séquentiel), encaissements conservés à la suppression d’une commande (migration 15 `archived_receipts`, `archiveReceiptsStmts`, union dans `receipts()`), pièce jointe « devis signé » → `signedQuoteStmts` (dernier devis envoyé → signé, inscription cochée ; pas d’effet inverse à la suppression de la pièce). Testé : unitaires + aperçu navigateur. Envoi groupé non vérifié dans Mail (une fenêtre par famille).

## Limites connues / non vérifié
- **Build macOS (.dmg) non produit ici** (environnement Linux) : à lancer sur le Mac (`npm run tauri build`). Application non signée (clic droit → Ouvrir).
- Aperçu PDF dans l'app : iframe WebKit — non vérifié visuellement sur macOS (l'enregistrement du fichier fonctionne).
- Références photo : saisie manuelle des références/chemins ; pas de miniature des fichiers RAW ni contrôle des chemins manquants dans l'UI (commande `path_exists` disponible côté natif).
- Import fournisseur PDF/Excel natif : non implémenté (CSV uniquement).
- Paiements sur commande annulée : pas de gestion de remboursement.

## Décisions
- Factures officielles (micro-entreprise, franchise de TVA) : table `invoices` (migration 5), numérotation continue F/AV par an, contenu figé, avoirs automatiques. Client = « Prénom Nom » (pas d’adresse, choix utilisateur). Validation en présentation client ⇒ sortie automatique vers la fiche commande.
- Guide des formats (src/lib/formatsGuide.ts) : recommandation par nombre d’iris d’après le PDF « Guide formats iris » ; 3 iris = 45 × 30 cm (le 40 × 30 du guide n’existe pas chez Onelab). Croquis dessinés en SVG (IrisSketch), visualiseur de taille à l’échelle (canapé 2 m + A4).
- rusqlite au lieu de tauri-plugin-sql (pool non transactionnel) ; images d'exemple stockées en base (sauvegarde complète en un fichier).
- `families` = clients (pas de table `customers` séparée) ; RDV intégré à `session_registrations` (1 RDV par inscription) ; `price_lists` couvre versions de template et grilles de séance.
- Création facturée une fois + produits liés ; packs sur les unités les moins chères.
- Supports d’impression iris : Acrylique 3 mm, Acrylique 5 mm, Alu Dibond, HD Metal Print, en 12 formats (20×20 → 60×90). Option « Cadre gamme 6 » (12 formats). **Aucun prix d’achat dans le code** : ils sont saisis ou importés (CSV) dans Fournisseurs et restent dans la base locale. `applyDataUpgrades()` ne crée que la structure.
- Import CSV fournisseur : la colonne « Prix TTC (oui/non) » est obligatoire (plus de supposition HT/TTC).
- Fournisseurs : création + liaison au Catalogue des produits fournisseurs non liés (unitaire ou en masse).

- Dépôt public : historique repris à zéro ; documents de travail (tarifs, marges) et prix fournisseurs retirés du dépôt — ils ne doivent jamais y être ajoutés.
