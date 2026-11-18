# Tâches — MF12 Studio (branche main)

**Règles de travail** : réponses courtes en français ; publier (`gh` workflow_dispatch `build-macos.yml`, `release_tag=vX.Y.Z`, bump package.json / tauri.conf.json / Cargo.toml / package-lock) **uniquement quand l’utilisateur dit « publie »**, et redonner le lien du .dmg. Dépôt public : jamais de prix d’achat, données clients ni documents commerciaux.

## Non publié (branche claude/gracious-gates-xu2t2t, après v2.3.0)
- Bouton « Ouvrir le dossier » des aperçus (commande native `open_data_folder`, non compilée ici).
- Filtre des photos par note exacte + « Notées ».
- **Statistiques par univers** (Rentabilité → « Par univers », par année) : CA, part du CA, panier moyen, marge et taux, frais, cotisations, bénéfice net estimé.
- **Relances & avis** (tableau de bord) : devis sans réponse (après N jours), échéances impayées, demande d’avis N jours après la livraison (questionnaire + lien Google) ; un clic prépare l’e-mail dans Mail, noté dans l’historique ; ✕ = ne pas relancer. Textes et délais dans Paramètres → Relances & avis.

- **BAT** (commande validée, migration 19 `proofs`) : import du fichier final JPEG/PNG → copie 1400 px, JPEG compressé, filigrane diagonal répété + bandeau « BAT — ne pas imprimer » ; envoi par Mail ; Validé / Corrections (commentaire) / Nouvelle version (l’ancienne passe « remplacé ») ; historique ; rappel « BAT sans réponse » (3 jours, en retard à 7). Texte de l’e-mail dans Paramètres → Relances, avis & BAT.

## Publié en v2.3.0 (à tester sur Mac)
- **Agenda** (menu Agenda, migration 18 `calendar_events`) : vue mois / à venir ; événements (prestation, livraison, RDV, perso) avec rappel N jours avant et « journée réservée » ; affiche aussi séances, RDV des inscrits, mariages (option si non signé), livrables J+15/J+30, échéances de paiement, fin de validité des devis ; alerte « date déjà réservée » à la création d’un mariage, d’une séance, d’un événement.
- **Rappels du tableau de bord** (« À faire ») : livraisons en retard / sous 7 jours, fiches jour J non reçues (mariage sous 45 jours), échéances impayées / sous 14 jours, devis expirés, rappels d’agenda.
- **Orientation des tirages** (vertical / horizontal) choisie sur la ligne (vente et commande validée), sur documents et postproduction.
- **Copier pour Lightroom** : noms de fichiers des photos notées (galerie) ou d’une ligne de commande, à coller dans le filtre Lightroom Classic.

## Publié en v2.2.0 (à tester sur Mac)
- **Étape 3 Photos de séance** (migration 16) : Séance → Photos (import du dossier de séance = un sous-dossier par famille, ou par famille ; aperçus 1600/400 px hors base dans « apercus » ; notes 1 à 5 étoiles comme Lightroom ; CSV Pic-Time ; suppression des aperçus sans toucher aux commandes). Produit : « photos à choisir » (aucune / 1 par unité / pack de N / toutes). Vente : onglet Photos (galerie + favoris), choix des photos par ligne (galerie ou n° saisis depuis les étoiles Lightroom), « N à choisir » ; photos d’une autre séance de la famille. Commande validée : n° complétables sans avoir. Livraison : lien TransferNow + date. N° sur récap, devis, facture, postproduction.
  - À vérifier sur Mac : import d’un dossier (permissions lecture de dossier / suppression), fluidité avec 30 photos.
- Jauge des aperçus (Paramètres) ; notes 1 à 5 étoiles.
- **Étape 5 Mariages** (migration 17, menu Mariages) : projet par couple (séance univers « Mariage »), devis à lignes catalogue / libres modifiables, acompte 30 % + solde au jour J en 1 à 12 fois, envoi « devis + contrat + CGV » dans Mail, contrat PDF (tableau, échéancier, signatures, CGV, formulaire de rétractation), « Marquer signé » (prix figés, devis signé), fiche de renseignements à envoyer plus tard + saisie + fiche du jour J (PDF), livrables J+15 / J+30 avec liens, album (fournisseur, 6 étapes datées), pièces jointes. Textes CGV / contrat / e-mails / délais / acompte dans Paramètres → Mariages.
  - CGV et contrat = modèles à faire relire par un juriste (dit à l’utilisateur).

## Publié en v2.1.2 (à tester sur Mac)
- Registre des devis (Documents PDF) : statut envoyé / signé / refusé modifiable, validité / expiré, lien commande, e-mail, PDF, export CSV.
- Envoi groupé des offres (Séance → Inscrits → « Offres à toutes les familles ») : un e-mail personnalisé par famille cochée dans Mail.
- Suppression d’une commande réglée : encaissements conservés dans le livre des recettes (migration 15 `archived_receipts`).
- Pièce jointe « devis signé » : le dernier devis envoyé passe en signé, « devis envoyé / validé » cochés sur l’inscription. Nouveau type « Devis (non signé) ».

## Publié en v2.1.1 (à tester sur Mac)
- Produits et variantes dans **plusieurs univers** (cases à cocher ; aucun = commun ; variante sans univers = comme son produit). Produits existants → Iris. Migration 13 (`catalog_universes`).
- **Pièces jointes de commande** (devis signé, captures d’e-mails, bons de commande, justificatifs) : ajout de fichiers ou collage ⌘V d’une capture, type, note, aperçu, copie. Migration 14 (`order_attachments`). À vérifier sur Mac : collage ⌘V et aperçu PDF.

## Publié en v2.1.0 (à tester sur Mac)
- Étape 1 Compta (livre des recettes, déclaration URSSAF, dépenses, année & seuils) + prestations déjà signées + numérotation factures externes → publié en **v2.1.0**.
- Étape 2 Univers de séance (Catalogue → onglet « Univers de séance » ; univers par séance / style / produit / template, template par défaut, textes brochure + e-mails offres / récap ; données existantes = univers Iris).

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

## Divers
| P | Tâche | État |
|---|---|---|
| P1 | Vérifier sur Mac : Mail (pièces jointes multiples), import Iris (fait ✓ par l’utilisateur) | Mail à confirmer |
| P2 | Suppression d’une commande avec règlements : conserver les recettes dans le livre | Fait, publié v2.1.2 |
| P2 | Envoi groupé des offres à toutes les familles d’une séance | Fait, publié v2.1.2 |
| P2 | Devis dans le registre Documents PDF | Fait, publié v2.1.2 |
