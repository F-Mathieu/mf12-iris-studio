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

## Tests exécutés
- `npm test` : 23 tests (calculs monétaires, marges, promotions, CSV, séances, import/réimport, commandes, paiements, historique des prix, PDF sans données internes).
- `cargo test` : sauvegarde en ligne / restauration / intégrité.
- E2E Chromium (aperçu navigateur) : parcours complet catalogue → tarifs → séance → import CSV → planning → vente → validation → paiement partiel → postproduction → PDF → mode client (aucune fuite) → sortie PIN.
- Binaire Tauri natif lancé sous Linux/Xvfb : base créée, migrée, seed, WAL, sauvegarde auto OK.

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
