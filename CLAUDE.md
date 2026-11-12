# MF/1.2 Iris Studio — instructions permanentes

App macOS (Tauri 2) de gestion des séances photo d'iris : séances, familles, planning, catalogue, tarifs, vente, paiements (suivi seulement), postproduction, fournisseurs, rentabilité, PDF, sauvegardes. 100 % local, hors ligne.

## Architecture
- `src-tauri/src/lib.rs` : couche native. **Connexion SQLite unique (rusqlite, bundled)**, commandes `db_select / db_execute / db_batch` (transaction), `db_backup` (API backup SQLite en ligne + integrity_check), `db_restore`, `db_integrity`, `list_backups`, `prune_backups`. Plugins : dialog, fs, process.
- `src/lib/db/` : interface `Db` unique ; adaptateurs `tauri.ts` (prod), `sqljs.ts` (aperçu navigateur `npm run dev`, persisté IndexedDB), `node.ts` (tests, `node:sqlite`). `migrations.ts` : migrations versionnées via `PRAGMA user_version` — **ne jamais modifier une migration livrée, en ajouter une**.
- `src/lib/` : logique pure testée — `money.ts` (centimes, bp, coûts fournisseur, marges), `pricing.ts` (panier, packs/promotions), `csv.ts`, `pdf.ts` (jsPDF), `files.ts`.
- `src/services/` : accès données + règles métier (une fonction = une opération ; écritures multi-tables via `batch`).
- `src/pages/` (admin, routes HashRouter), `src/components/` (UI kit `ui.tsx`, Configurator, PriceListEditor, Planning…), `src/client/ClientApp.tsx` (mode présentation).

## Règles métier clés
- Montants en **centimes entiers**, taux en **points de base** (1 % = 100). Jamais de float pour les totaux.
- Franchise de TVA : coût fournisseur réel = TTC payé (réglage `vat_recoverable`).
- Une **création** (style + iris) est facturée une fois (`price_list_items.kind='style'`), les produits sont des lignes liées (`kind='variant'`). `iris_count=0` = prix générique.
- Appliquer un template à une séance = **copie** de la grille (`price_lists` séance). Commandes validées = prix figés dans `order_items`/`order_compositions`.
- Correction de commande validée → `audit_logs` (snapshot avant). Suppression possible de toute commande (choix utilisateur) : confirmation « SUPPRIMER », sauvegarde de la base juste avant, snapshot complet dans `audit_logs` (`deleteOrder`). Les brouillons se suppriment simplement.
- Mode client : `ClientApp` est le seul arbre monté (admin non monté), état persistant en `settings.client_mode`, sortie par PIN (`settings.client_pin`). Aucun coût/marge/fournisseur dans le Configurator ni dans les PDF clients.
- Images d'exemple : JPEG redimensionnés (2048 px + miniature 480 px) stockés dans la table `media` → inclus dans les sauvegardes. Pas de RAW en base.
- Ne jamais inventer de prix fournisseur manquant. **Dépôt public : ne jamais y mettre de prix d’achat, marges, documents commerciaux ni données clients** (ils restent dans la base locale).
- Factures (`services/invoices.ts`, table `invoices`) : numérotation continue par an (F2026-0001, AV2026-0001), contenu figé en JSON à l’émission, réimpression identique. Correction / annulation / suppression d’une commande facturée ⇒ avoir automatique ; jamais de suppression d’une facture. Mentions : EI, SIRET, immatriculation, TVA non applicable art. 293 B du CGI, médiateur (Paramètres → Facturation).
- Mises à jour de données (hors schéma) : fonctions idempotentes appelées par `applyDataUpgrades()` (src/services/onelab.ts) après migrations + seed, protégées par un drapeau dans `settings`.

## Commandes
- `npm run dev` — aperçu navigateur (sql.js) ; `npm run tauri dev` — app native.
- `npm test` — vitest (logique + services sur SQLite réel). `npx tsc --noEmit -p tsconfig.app.json` — typecheck.
- `npm run tauri build` — **sur Mac** : produit `.app` et `.dmg` (src-tauri/target/release/bundle).
- `cd src-tauri && cargo build` — vérifie la couche Rust.

## Qualité
- Tester chaque règle métier dans `src/tests/` ; typecheck + tests avant de déclarer terminé.
- Ne pas déclarer une fonction opérationnelle si elle ne l'est pas ; noter dans PROJECT_STATUS.md.

## Économie de tokens
- Lire PROJECT_STATUS.md + TASKS.md en début de session, puis seulement les fichiers concernés.
- Modifications ciblées (Edit), pas de réécriture complète ; réutiliser `ui.tsx`, `act()`, `useAsync`, `insertStmt/updateStmt`.
- Réponses courtes : Réalisé / Tests / Prochaine étape / Blocage.
