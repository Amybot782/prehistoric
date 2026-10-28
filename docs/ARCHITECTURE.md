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
  world/             État du monde (sol, objets), carte de test de la phase 1
  entities/          Entités simulées (joueur ; animaux et habitants plus tard)
  input/             Actions clavier configurables
  render/            Rendu du sol, des objets, du joueur, caméra
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
`world/chunks`, `world/generation`, `ai/`, `pathfinding/`, `combat/`, `inventory/`, `crafting/`, `building/`,
`tech/`, `tribe/`, `save/`, `settings/`, `audio/`, `ui/`.

## 6. Flux d'une image

1. `InputMap` donne l'état des actions (touches physiques).
2. `FixedStepClock.advance(delta)` indique combien de pas de 1/60 s exécuter (borné en cas de gros ralentissement).
3. Chaque pas : `snapshot()` puis `Player.step()` → `CollisionWorld.moveCircle()`.
4. Rendu : position interpolée, profondeur, caméra lissée (indépendante des FPS), visibilité des objets, débogage.

## 7. Électron et sécurité

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, politique CSP stricte dans `index.html`.
- Le jeu est servi par `app://game/` (lecture limitée au dossier `dist`), aucune navigation externe, aucune permission accordée.
- Passerelle `window.prehistoric` : `log(entrée)` (validée côté principal) et `appInfo()`.
- Journaux : `%APPDATA%\Prehistoric\logs\prehistoric-AAAA-MM-JJ.log`. Sauvegardes : `%APPDATA%\Prehistoric\saves\`.
