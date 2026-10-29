# Prehistoric

Jeu de survie, de construction et de civilisation préhistorique en pixel art isométrique, pour PC Windows.
JavaScript + Phaser 3 (moteur 2D) + Electron (application de bureau), entièrement local et hors ligne.

**État actuel : phases 1 à 3 validées, phase 4 (fabrication et construction) livrée, en attente de validation.**
Voir [docs/SUIVI.md](docs/SUIVI.md) pour l'avancement et [docs/PHASE1_RAPPORT.md](docs/PHASE1_RAPPORT.md) pour le compte rendu.

## Lancer le jeu

### Version Windows prête à l'emploi

1. Télécharger le dernier `Prehistoric-X.Y.Z-win-x64.zip` (onglet *Releases* du dépôt) et l’extraire dans un dossier (par exemple `C:\Jeux\Prehistoric`).
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
puis envoyer sur `main`. Le workflow `.github/workflows/release.yml` voit qu'aucune release `vX.Y.Z` n'existe,
construit le jeu sur Windows, lance les tests et publie `game.asar`, `game.json` et le zip Windows complet.

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

## Commandes

| Action | Touches |
|---|---|
| Se déplacer | ZQSD (AZERTY) ou WASD (QWERTY), ou flèches |
| Courir | Maj (consomme l'endurance) |
| Récolter, ramasser, boire | E maintenu, ou clic gauche sur l'objet |
| Choisir un emplacement de la barre rapide | 1 à 8 (ou clic) |
| Utiliser l'objet choisi (manger, équiper) | F (ou clic droit sur l'emplacement) |
| Poser au sol | G (Maj + G : toute la pile) |
| Inventaire | I ou Tab |
| Fabrication (menu des recettes) | C (Maj + clic : 5 d'un coup) |
| Construire | choisir la pièce dans la barre rapide, viser avec la souris, clic gauche |
| Tourner la pièce | R |
| Ouvrir / fermer une porte | E |
| Démonter une construction | X (elle revient dans l'inventaire) |
| Frapper un animal | clic gauche vers lui (quand un animal est à moins de 3 cases) |
| Lancer l'arme en main (lance, pierre) | clic droit vers la cible |
| Esquiver | Espace (dans la direction des touches, sinon droit devant) |
| Dépecer une carcasse | E maintenu |
| Zoom | Molette, `+` / `-`, `0` pour revenir au zoom par défaut |
| Panneau de débogage | F3 |
| Afficher les collisions | F4 |
| Afficher la grille | F6 |
| Afficher les bordures de chunks | F7 |
| Nouveau monde aléatoire (provisoire, en attendant le menu) | F9 |
| Mini-carte | M |
| Plein écran (application) | F11 |

Les touches sont définies par position physique : la même configuration donne ZQSD sur AZERTY et WASD sur QWERTY.

## Choisir le monde (en attendant le menu de la phase 7)

Au premier lancement, le jeu ouvre le monde de seed `prehistoric`, puis rouvre le dernier monde joué.
F9 crée un nouveau monde avec une seed aléatoire (affichée dans le panneau F3).
En développement : `?seed=texte` ouvre une seed précise, `?map=test` la zone de test de la phase 1.

## Organisation

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
