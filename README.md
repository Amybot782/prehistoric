# Prehistoric

Jeu de survie, de construction et de civilisation préhistorique en pixel art isométrique, pour PC Windows.
JavaScript + Phaser 3 (moteur 2D) + Electron (application de bureau), entièrement local et hors ligne.

**État actuel : phase 1 (fondations techniques) terminée, en attente de validation.**
Voir [docs/SUIVI.md](docs/SUIVI.md) pour l'avancement et [docs/PHASE1_RAPPORT.md](docs/PHASE1_RAPPORT.md) pour le compte rendu.

## Lancer le jeu

### Version Windows prête à l'emploi

1. Extraire `Prehistoric-0.1.0-win-x64.zip` dans un dossier (par exemple `C:\Jeux\Prehistoric`).
2. Double-cliquer sur `Prehistoric.exe`.

Aucune installation de Node.js n'est nécessaire. Windows SmartScreen peut avertir que l'application
n'est pas signée : « Informations complémentaires » puis « Exécuter quand même ».

Les journaux et (à partir de la phase 7) les sauvegardes sont dans `%APPDATA%\Prehistoric\`.

### Mises à jour automatiques

À chaque lancement, le jeu regarde la dernière version publiée dans l'onglet *Releases* du dépôt GitHub.
Si elle est plus récente, il la télécharge (environ 2 Mo), vérifie son empreinte puis la lance : il n'y a plus
de dossier à remplacer. Sans connexion, le jeu démarre normalement avec la version déjà installée.
Si une nouvelle version ne démarre pas, le jeu revient tout seul à la précédente et ne la réinstalle plus.

Publier une version (développeur) : mettre à jour `version` dans `package.json`, écrire `docs/releases/vX.Y.Z.md`,
puis pousser l'étiquette `vX.Y.Z`. Le workflow `.github/workflows/release.yml` construit le jeu sur Windows,
lance les tests et publie `game.asar`, `game.json` et le zip Windows complet.

### Depuis le code source (développement)

Prérequis : [Node.js 20 ou plus récent](https://nodejs.org/).

```bat
npm install
npm start            :: construit le jeu puis ouvre la fenêtre Electron
npm run dev          :: version navigateur avec rechargement automatique (http://localhost:5173)
npm test             :: tests automatiques
npm run dist:win     :: produit release\win-unpacked\Prehistoric.exe
```

`npm run test:e2e` lance un test de bout en bout dans Chromium ; il nécessite en plus
`npm i -D playwright` puis `npx playwright install chromium`.

## Commandes (phase 1)

| Action | Touches |
|---|---|
| Se déplacer | ZQSD (AZERTY) ou WASD (QWERTY), ou flèches |
| Courir | Maj |
| Zoom | Molette, `+` / `-`, `0` pour revenir au zoom par défaut |
| Panneau de débogage | F3 |
| Afficher les collisions | F4 |
| Afficher la grille | F6 |
| Plein écran (application) | F11 |

Les touches sont définies par position physique : la même configuration donne ZQSD sur AZERTY et WASD sur QWERTY.

## Organisation

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
