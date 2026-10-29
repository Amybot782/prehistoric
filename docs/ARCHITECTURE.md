# Architecture technique

Ce document décrit l'analyse technique du projet, les choix retenus et l'organisation du code.
Il est mis à jour à chaque phase.

## 1. Analyse : contraintes et difficultés principales

| Difficulté | Risque | Réponse retenue |
|---|---|---|
| Monde quasiment infini | Mémoire et sauvegardes proportionnelles à la surface explorée ; perte de précision des flottants très loin de l'origine | Chunks de 32×32 tuiles à coordonnées entières stables, génération déterministe par seed (phase 2). Seuls les chunks proches sont en mémoire ; on ne sauvegarde que les **différences** par rapport à la génération (ressources récoltées, constructions). Les coordonnées restent en tuiles (précision suffisante jusqu'à des millions de tuiles). Index spatial à clés entières déjà prêt. |
| Projection isométrique | Incohérences de perspective, mauvais ordre d'affichage | Une seule classe de projection (2:1, tuiles 32×16 px) utilisée par tous les systèmes. Coordonnées monde séparées des coordonnées écran. Tri de profondeur par empreinte au sol + correction dynamique près des objets fins (murs). |
| Construction libre | Murs longs mal triés, placement imprécis | Construction pièce par pièce (une tuile maximum par pièce), ce qui rend le tri exact. Les collisions et la validation de placement utilisent les empreintes logiques. |
| Collisions | Traversée des murs à grande vitesse, blocages dans les coins | Corps circulaires contre formes du monde (cercles, rectangles), sous-pas limités à 0,12 tuile (anti-traversée), résolution par poussée qui fait glisser le long des murs. Jamais de collision sur les rectangles des sprites. |
| Sauvegardes | Corruption, duplication de ressources, migrations | Format JSON versionné par chunk + fichier d'état global, écriture atomique (fichier temporaire puis renommage), copie de secours, migrations numérotées (phase 3 à 7). Dossier utilisateur persistant `%APPDATA%\Prehistoric`. |
| Intelligence artificielle | Coût CPU, comportements figés quand une tâche devient impossible | Simulation indépendante de Phaser, à pas fixe ; IA par priorités (besoins, danger, travail) avec interruption ; pathfinding A* limité à la zone utile, mis en cache par chunk (phases 5-6). |
| Simulation distante | Milliers d'entités simulées pour rien | Trois niveaux : complet (proche), allégé (chunks chargés mais lointains), statistique (villages et caravanes déchargés : bilans de production et trajets calculés par durée). |
| Performances | Chute de FPS = ralentissement du jeu | Boucle à pas fixe : la simulation ne ralentit pas quand les FPS baissent. Sol rendu par blocs dans des textures (peu d'appels de dessin), sprites hors champ masqués, pas d'allocation dans les boucles chaudes. |
| Application Windows | Sécurité Electron, dépendance à un serveur local | Jeu servi par un protocole privé `app://` (pas de serveur), rendu isolé (`contextIsolation`, `sandbox`, pas de Node.js), passerelle minimale et validée pour les journaux. |

### Dépendances majeures entre systèmes

```
Projection iso ─┬─> Rendu ─> Caméra ─> Interface
                └─> Sélection souris ─> Construction (4)
Boucle à pas fixe ─> Physique/collisions ─> Joueur ─> Combat (5)
Chunks/génération (2) ─> Ressources/récolte (3) ─> Craft/construction (4)
                       └─> Index spatial ─> IA animaux (5) ─> IA habitants (6) ─> Villages (14)
Inventaire (3) ─> Craft (4) ─> Technologies (7) ─> Logistique (15)
Sauvegarde : dépend de tous les états persistants ; format posé dès la phase 2 (chunks modifiés).
```

## 2. Bibliothèques retenues

| Bibliothèque | Rôle | Pourquoi |
|---|---|---|
| Phaser 3.90.0 | Rendu WebGL 2D, scènes, chargement, entrées souris | Dernière version stable de la branche 3, très éprouvée et documentée. Phaser 4 (sorti en avril 2026) est encore jeune ; la migration reste possible car la simulation ne dépend pas de Phaser. |
| Electron 38 | Application Windows autonome | Moteur Chromium fiable pour WebGL, accès disque pour journaux et sauvegardes. |
| electron-builder | Production de l'exécutable | Standard pour Electron. |
| Vite 6 | Construction du jeu | Rapide, sans configuration lourde. |
| Vitest 3 | Tests automatiques | Même syntaxe que Jest, exécute directement les modules du jeu. |

Aucune autre dépendance d'exécution. Pas de service en ligne, pas d'API externe.

## 3. Principes

1. **La simulation ne connaît pas Phaser.** Monde, entités, physique et IA sont des modules JavaScript purs,
   testables sans navigateur et réutilisables pour la simulation distante. Le rendu lit l'état, il ne le modifie pas.
2. **Pas fixe de 60 Hz** pour toute la simulation ; le rendu interpole entre deux états (fluidité à 144 Hz comme à 30 Hz).
3. **Données plutôt que code** : valeurs d'équilibrage, touches, sols, objets, assets sont dans des fichiers JSON.
4. **Assets remplaçables** : chaque texture a une clé ; un graphisme provisoire est généré si aucun fichier n'est fourni.
5. **Chaînes traduisibles** : tout texte affiché passe par `t('clé')` (français uniquement pour l'instant).

## 4. Systèmes de coordonnées

- **Monde** (unité : la tuile) : `x` vers le bas-droite de l'écran, `y` vers le bas-gauche, `z` la hauteur.
  Tous les systèmes de jeu (collisions, IA, construction, sauvegardes) travaillent ici.
- **Écran iso** (unité : pixel non zoomé) : `sx = (x − y) × 16`, `sy = (x + y) × 8 − z × 16`.
  Dans le code Phaser, ce sont les « world coordinates » de la caméra.
- **Fenêtre** : pixels réels après zoom et défilement de la caméra.

Déplacement : les touches donnent une direction **à l'écran**, convertie en direction monde normalisée.
La vitesse est constante au sol ; en isométrique, un déplacement vertical paraît donc deux fois plus court
à l'écran qu'un déplacement horizontal de même durée (c'est la projection, pas un ralentissement).

## 5. Organisation des dossiers

```
electron/            Processus principal Electron et passerelle (preload)
public/assets/       Assets remplaçables (personnages, dinosaures, sons...) + manifest.json
src/
  main.js            Point d'entrée (configuration Phaser)
  core/              Boucle à pas fixe, journal, bus d'événements, aléatoire déterministe
  iso/               Projection isométrique, tri de profondeur
  physics/           Formes, index spatial, monde de collision
  world/             Monde par chunks, réglages et seed, choix du monde, zone de test
    generation/      Bruit et générateur procédural (relief, eau, biomes, objets)
    chunks/          Modifications du joueur par chunk (ce que la sauvegarde écrira)
  entities/          Entités simulées (joueur ; animaux et habitants plus tard)
  input/             Actions clavier configurables
  render/            Rendu des chunks (sol, relief, objets), du joueur, caméra
  ui/                Mini-carte, interface de survie (barres, barre rapide, inventaire)
  survival/          Besoins (Vitals), température de l'air, règles de récolte
  inventory/         Inventaire par emplacements, équipement
  gameplay/          Boucle de survie du joueur (relie besoins, inventaire, actions sur le monde)
  assets/            Catalogue des textures, générateurs de graphismes provisoires
  scenes/            Scènes Phaser (démarrage, monde, interface)
  debug/             Outils de débogage visuels
  i18n/              Traductions (fr.json)
  data/              Définitions de contenu et équilibrage (JSON)
tests/unit/          Tests automatiques (Vitest)
tests/e2e/           Test de bout en bout dans Chromium
docs/                Architecture, suivi, rapports de phase
```

Dossiers prévus pour les phases suivantes (créés au moment où ils servent, pour ne pas afficher de systèmes vides) :
`ai/`, `pathfinding/`, `combat/`, `inventory/`, `crafting/`, `building/`,
`tech/`, `tribe/`, `save/`, `settings/`, `audio/`.

## 6. Flux d'une image

1. `InputMap` donne l'état des actions (touches physiques).
2. `FixedStepClock.advance(delta)` indique combien de pas de 1/60 s exécuter (borné en cas de gros ralentissement).
3. Chaque pas : `snapshot()` puis `Player.step()` → `CollisionWorld.moveCircle()`, puis `followGround()` (hauteur du sol).
4. Streaming : `ChunkedWorld.stream()` charge au plus 2 chunks par image autour de la vue et décharge les lointains.
5. Rendu : position interpolée, profondeur, caméra calée au pixel, visibilité des objets, débogage ; mini-carte 5 fois par seconde.

## 7. Électron et sécurité

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, politique CSP stricte dans `index.html`.
- Le jeu est servi par `app://game/` (lecture limitée au dossier `dist`), aucune navigation externe, aucune permission accordée.
- Passerelle `window.prehistoric` : `log(entrée)` (validée côté principal) et `appInfo()`.
- Journaux : `%APPDATA%\Prehistoric\logs\prehistoric-AAAA-MM-JJ.log`. Sauvegardes : `%APPDATA%\Prehistoric\saves\`.

## 8. Mises à jour

Seul le jeu (le dossier `dist`, empaqueté en un fichier `game.asar` d'environ 2 Mo) est mis à jour ;
l'exécutable et le code Electron restent ceux du zip installé.

- `electron/updater-core.cjs` : règles pures (choix de la version, retour arrière, versions refusées), testées.
- `electron/updater.cjs` : appels à l'API GitHub, téléchargement, contrôle taille + SHA-256, écriture atomique.
- État dans `%APPDATA%\Prehistoric\game\state.json`. Une version installée reste « non confirmée » tant que
  le jeu n'a pas signalé son démarrage (`gameReady`). Si elle échoue au lancement suivant, retour à la version
  précédente et blocage de la version fautive.
- `game.json` porte `minShell` : une version qui a besoin d'un nouvel exécutable n'est pas installée
  automatiquement ; le joueur est prévenu.
- Publication : `.github/workflows/release.yml` à chaque envoi sur `main` dont la version n'a pas encore de release (construction sur `windows-latest`).

## 9. Monde procédural (phase 2)

- **Déterministe** : chaque tuile est une fonction pure de (seed, réglages, coordonnées) — bruit simplex
  à plusieurs octaves pour l'altitude, l'humidité et la température. Un chunk peut donc être généré dans
  n'importe quel ordre, oublié puis régénéré à l'identique. Seules les modifications du joueur sont
  conservées (`ChunkDeltaStore`, objets retirés et sols changés, avec export JSON pour la sauvegarde).
- **Chunks** de 32×32 tuiles (`worldgen.json`). Chargement autour de la vue avec une marge de 12 tuiles,
  déchargement au-delà de 28 tuiles, 2 chunks générés par image au maximum, les plus proches d'abord.
  Un chunk se génère en 0,6 à 2 ms. Les colliders des chunks déchargés sont retirés (mémoire bornée, testé).
- **Relief** en terrasses : 7 niveaux (0 = eau et rivages, puis 6 niveaux de terre), 8 px par niveau.
  Deux tuiles voisines ne diffèrent jamais de plus d'un niveau (vérifié par test sur 3 seeds), donc tout
  le relief se franchit à pied ; les falaises infranchissables viendront plus tard si besoin.
- **Eau** : eau profonde (bloque) et eau peu profonde (praticable), plages de sable hors marais.
- **Biomes** (`biomes.json`) : forêt tempérée, plaines, marais, montagnes rocheuses. Chaque biome donne
  ses sols (par plaques) et ses objets (probabilité par tuile). Les objets ont un identifiant stable
  `p<x>_<y>`, ce qui permet de savoir qu'un arbre coupé ne doit pas revenir.
- **Réglages du monde** (`WorldSettings.js`) : seed, taille des biomes, relief, densité des forêts,
  quantité d'eau, abondance des ressources. Ils seront proposés dans le menu de création (phase 7).
- **Rendu** (`ChunkRenderer`) : le sol de chaque chunk est dessiné une fois dans une texture (un seul appel
  de dessin par chunk), de l'arrière vers l'avant et à sa hauteur, avec un léger assombrissement des
  niveaux bas. Les tuiles surélevées au bord d'un dénivelé sont en plus des sprites triés (dessus + parois),
  pour cacher correctement ce qui est derrière elles. Textures et sprites sont recyclés (réserve plafonnée).
- **Mini-carte** (`ui/Minimap.js`) : une petite image par chunk exploré (1 pixel par tuile), conservée après
  déchargement, assemblée en vue isométrique autour du joueur.

## 10. Survie et récolte (phase 3)

- **Besoins** (`survival/Vitals.js`, réglages `data/survival.json`) : santé, faim, soif, endurance,
  température du corps. Pas de Phaser : la même classe servira aux habitants (phase 6).
  La course vide l'endurance (épuisement jusqu'à 30 %), la faim et la soif à zéro, le gel ou le coup
  de chaleur font perdre de la santé ; bien nourri, on récupère.
- **Température** (`survival/climate.js`) : champ de température du monde + biome + altitude + eau.
  Les vêtements ajoutent des degrés quand il fait froid. Le jour/nuit et la météo (phase 7) ajouteront un décalage.
- **Récolte** (`survival/harvest.js`) : chaque objet a des points de récolte (`harvest.hp` = coups à mains nues).
  Un outil (`tool` dans `items.json`) retire plus de points par coup ; le total obtenu reste le même.
  Les points restants sont enregistrés (`ChunkDeltaStore.damage`), les arbres laissent une souche,
  la repousse se fait après `regrowSeconds` de temps de jeu, jamais sur le joueur.
- **Inventaire** (`inventory/Inventory.js`) : 24 emplacements dont 8 de barre rapide, piles limitées.
  `add` rend ce qui ne rentre pas : la récolte en trop est posée au sol, rien ne disparaît.
  **Équipement** (`inventory/Equipment.js`) : main (outil) et corps (vêtement), sans usure.
- **Objets posés au sol** : stockés par chunk dans `ChunkDeltaStore.dropped`, recréés au rechargement.
- **Boucle du joueur** (`gameplay/PlayerSurvival.js`) : cible (devant le personnage ou sous la souris),
  action principale (récolter, ramasser, boire), manger, équiper, poser, mort et réapparition.
  Elle émet des événements que l'interface (`ui/SurvivalHud.js`) affiche.

## 11. Fabrication et construction (phase 4)

- **Recettes** (`data/recipes.json`, `crafting/crafting.js`) : fabrication instantanée, sans minuteur. Une recette
  consomme son coût exact ; certaines demandent un atelier construit à moins de 3 tuiles (`build.station` :
  établi, feu de camp). Le résultat va dans l'inventaire, le surplus tombe au sol.
- **Pièces** : chaque pièce est un objet d'inventaire (`place: true` dans `items.json`) et un objet du décor du
  même nom (`build` dans `props.json`). Elle occupe un **emplacement** (`building/placement.js`) : le sol d'une tuile
  (planchers, fondations), son centre (établi, feu, décorations), le dessus (toit) ou un **bord** (murs, portes).
  Un bord est partagé par les deux tuiles qu'il sépare : deux pièces ne peuvent jamais se superposer, et les murs
  se raccordent aux angles (empreinte légèrement plus longue que la tuile).
- **Placement** : la pièce choisie dans la barre rapide suit la souris (aperçu transparent vert ou rouge). Les murs
  prennent le bord le plus proche du pointeur ; R tourne les autres pièces d'un quart de tour (empreinte comprise).
  Refus expliqués : trop loin (4,5 tuiles), eau, sol de hauteur différente des deux côtés d'un mur, place prise,
  arbre/rocher/joueur dans l'empreinte, toit sans mur, porte ou toit voisin pour le porter.
- **Collisions** : les murs et portes fermées sont des rectangles du monde de collision, comme les rochers ;
  une porte ouverte devient non solide. Une porte ne se ferme pas sur le joueur.
- **Rendu** : murs et portes ont un graphisme par orientation (`_x`, `_y`, `_open`). Les planchers sont dessinés
  juste au-dessus de leur tuile et sous tout ce qui s'y tient ; les toits au-dessus des murs de leur tuile.
  Quand le joueur est sous un toit, tous les toits deviennent transparents pour montrer l'intérieur.
- **Démontage** (X) : la pièce visée revient entière dans l'inventaire. Rien ne repousse sous un plancher ou un objet.
- **Climat** : un feu de camp réchauffe l'air (jusqu'à +14 °C, sur 3,5 tuiles), un toit ajoute +4 °C.
- **Sauvegarde automatique** (`save/autosave.js`) : toutes les 30 s, en quittant et en changeant de monde, pour
  les mondes procéduraux (pas la zone de test). Contenu : modifications des chunks (format v3, avec les pièces
  construites), temps du monde, position, inventaire, équipement et besoins. Une sauvegarde par seed dans le
  stockage local de l'application, plus une copie de la précédente utilisée si la dernière est illisible.
  Les fichiers de sauvegarde avec emplacements et menu restent prévus en phase 7.

## 12. Animaux et combat (phase 5)

- **Espèces** (`data/creatures.json`) : uniquement des nombres (caractère, vitesses, vue, ouïe, mémoire, attaque,
  dépeçage, poids d'apparition par biome). Le même automate (`creatures/Creature.js`) sert à toutes : repos,
  promenade, fuite, poursuite, préparation de l'attaque, repas, retour au territoire. Il réfléchit 5 fois par seconde
  et se déplace à chaque pas de simulation avec le même moteur de collisions que le joueur.
- **Perception** : vue (portée, champ large, ligne de vue testée contre les obstacles, `creatures/combat.js`) et ouïe
  (portée multipliée par le bruit de l'autre : course 1, marche 0,5, immobile 0,15, coup porté 1,2).
- **Système** (`creatures/CreatureSystem.js`) : population autour du joueur (apparition hors de vue, disparition au
  loin et dans les chunks déchargés), séparation des corps, armes lancées (projectiles), mort → carcasse.
- **Carcasses** : objets « transitoires » du monde (`ChunkedWorld.addTransient`), jamais sauvegardés, récoltés avec
  le type `meat` (même règle de récolte que le bois ou la pierre) et retirés à leur échéance.
- **Joueur** : `PlayerSurvival.attack / throwHeld / dodge / takeDamage`, statistiques d'arme dans `items.json`
  (`weapon`, `throw`) et réglages dans `survival.json` (`combat`).
- **Affichage** : `render/CreatureLayer.js` (une vue par créature, dérivée de `PlayerView` pour le tri de profondeur).
