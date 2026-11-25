# Tâches — MF12 Studio (branche main)

## État actuel (25/11/2026)
- **Dernière version publiée : v2.5.1** (main = branche de travail `claude/gracious-gates-xu2t2t`, rien de non publié). 89 tests vitest OK.
- Toutes les étapes de la feuille de route sont faites. On travaille maintenant au fil des retours de l’utilisateur (il teste sur Mac et demande des améliorations).
- Dernières versions : v2.5.1 changer le montage d’une création (prénoms, disposition, souhaits gardés) + correctif libellés de lignes · v2.5.0 postproduction : urgence, ordre de traitement (glisser-déposer), tri (migration 22) · v2.4.9 disposition « En un seul iris (puzzle) » · v2.4.8 style « un seul visuel » (puzzle → format d’1 iris, migration 21) · v2.4.7 seuils de promo après remise commerciale · v2.4.6 statuts modifiables en un clic · v2.4.5 notes internes de commande · v2.4.4 BAT (joindre le RIB, suppression après envoi) · v2.4.3 agenda (RDV affichés, suppression) · v2.4.2 glisser-déposer Mac (✓ vérifié) · v2.4.1 BAT bande centrale · v2.4.0 stats par univers, relances & avis, BAT, filtre note exacte · v2.3.0 agenda, rappels « À faire », orientation tirages, copie Lightroom · v2.2.0 photos de séance, mariages · v2.1.x univers, compta, pièces jointes, registre des devis. Détail : PROJECT_STATUS.md.

## Règles de travail
- Réponses courtes en français. Développer sur `claude/gracious-gates-xu2t2t`, avancer `main` en fast-forward seulement à la publication.
- **Publier uniquement quand l’utilisateur dit « publie »** : bump version (package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock ligne `iris-studio`, package-lock.json ×2) → commit → push branche + `main` → workflow_dispatch `build-macos.yml` sur `main` avec `release_tag=vX.Y.Z` (outil GitHub MCP) → **annuler le run « push » en doublon** → vérifier ~8 min plus tard (send_later) puis donner le lien .dmg. Si le run reste « queued » > 15 min : relancer avec `runner=macos-15-intel`.
- La release contient aussi `MF12-Studio-macOS.zip` (nom fixe) ; installation Terminal (dernière version) :
  `curl -fL -o /tmp/mf12.zip https://github.com/F-Mathieu/mf12-iris-studio/releases/latest/download/MF12-Studio-macOS.zip && rm -rf "/Applications/MF12 Studio.app" && ditto -x -k /tmp/mf12.zip /Applications && rm /tmp/mf12.zip && xattr -dr com.apple.quarantine "/Applications/MF12 Studio.app" && open "/Applications/MF12 Studio.app"`
- Données de l’app sur le Mac : `~/Library/Application Support/fr.mf12.studio/` (studio.db, apercus/, backups/, envois/).
- Dépôt public : jamais de prix d’achat, données clients ni documents commerciaux. Changements d’interface : vérification Playwright sur `npm run dev` (vite port 5199) ; vitest + tsc systématiques.
- Prochaine migration : **23** (dernière : 22 `production_tasks.priority / rank`).

## Feuille de route (validée avec l’utilisateur)
| Étape | Contenu | État |
|---|---|---|
| 0 | MF12 Studio séparée d’Iris Studio (branche `iris` figée 1.1.13) + import des données | Fait, publié v2.0.0 |
| 1 | Compta micro-entreprise ; déclaration mensuelle (1re en décembre 2026, depuis le début d’activité), versement libératoire, prestations de services BIC | Fait, publié v2.1.0 |
| 2 | **Univers de séance** (Iris, Back to school, Noël, Halloween, Fête des mères…) : catalogue par univers (+ « commun »), template par défaut, textes brochure / e-mails ; données actuelles = univers Iris | Fait, publié v2.1.0 — à tester sur Mac |
| 3 | Photos de séance : aperçus Lightroom dans un dossier (nom de fichier = n°), présentation + favoris, panier par photo, packs numériques / numériques + tirages / unité | Fait, publié v2.2.0 |
| 4 | Montages photo → **pas de montage hors iris** (réponse 18/11) : photo à l’unité (taille, 3:2 vertical / horizontal), packs, numérique et/ou impression ; goodies, petits livres… par univers ; fournisseurs et templates par univers | Couvert par l’étape 3 + univers ; reste : produits / fournisseurs à saisir par l’utilisateur |
| 5 | Mariages : projet par couple, forfaits + options, contrat + devis, acompte / solde, échéancier, fiche jour J, livrables (galerie, album) | Fait, publié v2.2.0 — pas de facture d’acompte séparée (acompte = règlement, facture finale avec règlements) |

## Étape 3 — réponses de l’utilisateur (18/11/2026)
- Vente : sur certaines séances (ex. Back to school en magasin) vente **avant** les photos, sur photos d’illustration ; sinon rendez-vous après la séance pour montrer les photos.
- Volume : 1 à 30 photos par famille ; aperçus dans l’app, qui doit rester fluide.
- Lightroom Cloud et Classic (au choix de l’app : elle lit un dossier de JPEG exportés, quel que soit le logiciel).
- Pic-Time (abonnement, portfolio) ; garder le mode présentation hors ligne. Pic-Time : pas d’API publique documentée ; export CSV des favoris (formules Advanced / Professional) → import des favoris dans l’app.
- Packs et offres libres, propres à chaque séance.
- Livraison : toujours TransferNow, option galerie privée Pic-Time.
- Une commande peut mêler deux séances (ex. iris + photos de Noël dernier).

## Questions ouvertes à l’utilisateur
- Aucune. Idées non retenues pour l’instant : factures d’acompte numérotées, import depuis un outil de réservation (Calendly / Cal.com…), accès iPhone (agenda vers Calendrier iCloud).

## Divers
| P | Tâche | État |
|---|---|---|
| P1 | Vérifier sur Mac : Mail (pièces jointes multiples), import Iris (fait ✓ par l’utilisateur) | Mail à confirmer |
| P2 | Suppression d’une commande avec règlements : conserver les recettes dans le livre | Fait, publié v2.1.2 |
| P2 | Envoi groupé des offres à toutes les familles d’une séance | Fait, publié v2.1.2 |
| P2 | Devis dans le registre Documents PDF | Fait, publié v2.1.2 |
