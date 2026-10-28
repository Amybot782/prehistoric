# Compte rendu — Phase 1 : fondations techniques (v0.1.0)

**Résultat attendu :** un personnage capable de se déplacer correctement dans un environnement isométrique.
**Statut :** terminé côté développement et tests automatiques ; en attente de ta validation.

## 1. Fonctionnalités développées

- **Projet et structure** : Phaser 3.90 + Vite, modules séparés (cœur, iso, physique, monde, entités, entrées, rendu, assets, scènes, débogage, traductions, données). Valeurs d'équilibrage, touches, sols et objets dans des fichiers JSON.
- **Fenêtre et Windows** : application Electron (fenêtre 1600×900 redimensionnable, F11 plein écran), protocole privé `app://` (pas de serveur ni de terminal), rendu isolé et sans accès Node.js. Dossier Windows autonome avec `Prehistoric.exe`.
- **Première scène** : carte de test 48×48 avec herbe, terre, sable, pierre, un étang, une forêt, des rochers, des buissons, un enclos avec une porte et deux passages (un trop étroit, un franchissable).
- **Projection isométrique** : 2:1 (tuiles 32×16 px), coordonnées monde en tuiles séparées des coordonnées écran, conversion inverse pour la souris (curseur de tuile).
- **Boucle de jeu** : simulation à pas fixe de 60 Hz, indépendante des FPS, bornée en cas de ralentissement, prête pour l'accélération du temps ; rendu interpolé.
- **Déplacements** : ZQSD sur AZERTY et WASD sur QWERTY avec la même configuration (touches physiques), flèches, course avec Maj, accélération et freinage courts, diagonale à la même vitesse, personnage orienté sur 8 directions avec animation de marche calée sur la distance parcourue.
- **Collisions de base** : calculées dans le monde logique (cercles pour les troncs et rochers, rectangles pour murs, blocs et eau), découpage en sous-pas pour ne jamais traverser un mur, glissement le long des obstacles, bords de carte infranchissables.
- **Tri de profondeur** : par empreinte au sol, corrigé dynamiquement près des murs fins ; un objet qui cache le joueur devient translucide.
- **Caméra** : suit le joueur avec un lissage indépendant des FPS, zoom molette ou `+`/`-`/`0`, zoom de base adapté à la hauteur de fenêtre (x2 en 720p, x3 en 1080p, x6 en 4K).
- **Outils de débogage** : panneau F3 (FPS, tick, positions monde/écran, tuile, souris, vitesse, zoom, compteurs), affichage des collisions F4, grille F6, journal en mémoire et fichier `%APPDATA%\Prehistoric\logs\`, capture des erreurs non gérées.
- **Structure des assets** : dossiers personnages, villageois, dinosaures, animaux, bâtiments, végétation, terrains, interface, animations, effets, sons, musiques ; manifeste qui permet de remplacer chaque graphisme provisoire par un vrai fichier (voir `docs/ASSETS.md`).

## 2. Fichiers principaux

| Fichier | Rôle |
|---|---|
| `src/iso/projection.js`, `src/iso/depth.js` | Projection et tri de profondeur |
| `src/core/FixedStepClock.js`, `Logger.js`, `random.js`, `EventBus.js` | Boucle à pas fixe, journal, aléatoire déterministe |
| `src/physics/shapes.js`, `SpatialHash.js`, `CollisionWorld.js` | Collisions et index spatial |
| `src/world/World.js`, `testMap.js` | État du monde, carte de test |
| `src/entities/Entity.js`, `Player.js` | Entités, joueur |
| `src/input/InputMap.js` | Actions clavier configurables |
| `src/render/*` | Sol, objets, joueur, caméra |
| `src/assets/*`, `public/assets/manifest.json` | Catalogue, graphismes provisoires, remplacement |
| `src/scenes/BootScene.js`, `WorldScene.js`, `UIScene.js` | Scènes |
| `src/debug/DebugDraw.js` | Affichage des collisions et de la grille |
| `src/data/*.json`, `src/i18n/fr.json` | Données et textes |
| `electron/main.cjs`, `electron/preload.cjs` | Application de bureau |
| `tests/unit/*.test.js`, `tests/e2e/smoke.mjs` | Tests |

## 3. Tests réalisés

**Tests automatiques réussis**
- 45 tests unitaires (`npm test`) : projection et inverse, directions et orientations, tri de profondeur (dont le cas du mur fin), boucle à pas fixe (24 à 240 FPS → même nombre de pas), index spatial, collisions (mur fin à 50 tuiles par pas, glissement, passage étroit bloqué, passage d'une tuile franchissable, contournement d'un tronc), entrées (AZERTY/QWERTY, appui unique, perte du focus, réassignation), joueur (même distance à 30/60/144 FPS, vitesses de marche, course et diagonale), carte de test (déterministe, apparition libre, eau et bords solides), assets, traductions, journal.
- 14 vérifications de bout en bout dans Chromium avec de vraies touches et la vraie souris : les quatre directions, la diagonale, la course, l'eau, le mur, la sortie par la porte, la traversée de la forêt sans interpénétration, le zoom à la molette, la sélection de tuile, le zoom 4K, l'absence d'erreur JavaScript.

**Vérifications manuelles effectivement réalisées (par moi, dans le conteneur)**
- Captures d'écran inspectées : rendu du sol sans jointures, personnage, arbres, enclos, affichage des collisions, transparence d'un mur qui cache le joueur.
- Remplacement d'un graphisme par un fichier PNG : pris en compte ; fichier absent : graphisme provisoire et avertissement dans le journal.
- Application Electron lancée sous Linux (écran virtuel) : le jeu démarre par `app://` et écrit son journal sur disque.

**Vérifications restant à effectuer (par toi)**
- Lancer `Prehistoric.exe` sur Windows (jamais exécuté sur Windows à ce stade).
- Ressenti des commandes et fluidité à 60 FPS ou plus sur ton PC : les FPS mesurés ici (13 à 50) viennent d'un rendu logiciel sans carte graphique et ne sont pas représentatifs.
- Affichage sur écran 4K réel.

## 4. Problèmes connus

- Pas d'installateur ni d'icône personnalisée : l'outil d'installation (NSIS) et l'édition de l'exécutable demandent Wine, absent de mon environnement. Livraison sous forme de dossier à extraire ; l'installateur est prévu en phase 7.
- En isométrique, monter ou descendre à l'écran couvre deux fois moins de pixels que se déplacer à gauche ou à droite à la même vitesse au sol. C'est voulu (vitesse constante dans le monde), mais je peux compenser si tu trouves cela désagréable.
- La course ne consomme pas encore d'endurance (phase 3). L'esquive arrive en phase 5. La souris sert pour l'instant au curseur de tuile et au zoom.
- Les touches sont modifiables dans `src/data/keybindings.json` et par code ; le menu de réassignation arrive avec les paramètres (phase 7).
- Les angles de l'enclos de test ne sont pas raccordés visuellement.
- Le panneau de débogage est affiché au démarrage (F3 pour le masquer).

## 5. Lancement

- **Windows** : extraire `Prehistoric-0.1.0-win-x64.zip`, double-cliquer `Prehistoric.exe` (SmartScreen : « Informations complémentaires » → « Exécuter quand même »).
- **Code source** : Node.js 20+, puis `npm install` et `npm start`.

## 6. Actions de test proposées

1. Marcher dans les quatre directions avec ZQSD (ou WASD), puis en diagonale : le personnage suit exactement la touche à l'écran et s'oriente.
2. Maintenir Maj : la vitesse passe de 3,2 à 5,2 tuiles/s (panneau F3).
3. Entrer dans l'enclos par la porte (au sud du point de départ), longer les murs, essayer de les traverser ; afficher les collisions avec F4.
4. Passer derrière les arbres de la forêt (au nord) : le personnage est masqué correctement et l'arbre devient translucide.
5. Marcher vers l'étang (à l'ouest) : arrêt sur le sable.
6. Zoomer à la molette, puis `0` pour revenir au zoom par défaut ; F11 pour le plein écran.
7. Ouvrir `%APPDATA%\Prehistoric\logs\` et vérifier qu'un journal a été écrit.
