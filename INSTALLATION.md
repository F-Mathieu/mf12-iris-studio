# MF/1.2 Iris Studio — installation & maintenance

## 1. Construire l'application (une fois, sur votre Mac Apple Silicon)
Prérequis (une seule fois) : Xcode Command Line Tools, Node.js 20+ et Rust.
```bash
xcode-select --install
```
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
Node.js : installer la version LTS depuis https://nodejs.org.

Puis, dans le dossier du projet :
```bash
npm install
```
```bash
npm run tauri build
```
Résultat : `src-tauri/target/release/bundle/dmg/MF12 Iris Studio_1.0.0_aarch64.dmg`.
Ouvrez le .dmg et glissez l'application dans **Applications**. Au premier lancement : clic droit → Ouvrir (application non signée).

Ensuite, plus aucun Terminal n'est nécessaire.

## 2. Premier démarrage
1. **Paramètres** : nom commercial, coordonnées, **changez le code PIN** (défaut 1212).
2. **Catalogue** : ajoutez les images d'exemple de chaque style, vérifiez produits et formats.
3. **Fournisseurs** : saisissez ou importez (CSV) vos tarifs d'achat Onelab Pro / Dreambooks Pro.
4. **Templates tarifaires** : complétez « Tarif public » (aucun prix n'est pré-rempli), créez vos packs.
5. **Séances** : créez une séance, téléchargez le modèle CSV, remplissez-le dans Excel, importez-le.

## 3. Où sont mes données ?
`~/Library/Application Support/fr.mf12.irisstudio/`
- `iris_studio.db` : base SQLite (contient aussi les images d'exemple).
- `backups/` : sauvegardes automatiques (`auto-…`), manuelles (`manuel-…`), et copie de sécurité créée avant chaque restauration.

Conseil : exportez régulièrement la base (Paramètres → Exporter la base…) vers un disque externe ou un dossier iCloud/Dropbox. Ne copiez jamais `iris_studio.db` pendant que l'application est ouverte : utilisez les boutons de sauvegarde.

## 4. Mise à jour de l'application
1. Récupérez la nouvelle version du code source.
2. `npm install` puis `npm run tauri build`.
3. Remplacez l'application dans Applications. Les données ne sont pas touchées ; les migrations de base s'appliquent automatiquement au démarrage (une sauvegarde automatique est faite au lancement).

## 5. Maintenance (développeur)
- Tests : `npm test` ; vérification des types : `npx tsc --noEmit -p tsconfig.app.json`.
- Aperçu rapide dans un navigateur (données de test séparées, non persistantes de façon fiable) : `npm run dev`.
- Toute évolution du schéma = nouvelle entrée en fin de `src/lib/db/migrations.ts`.
