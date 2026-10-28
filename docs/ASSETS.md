# Remplacer les graphismes

Toutes les textures du jeu sont référencées par une **clé** (par exemple `prop_tree`).
Si aucun fichier n'est déclaré pour une clé, le jeu génère un graphisme provisoire en pixel art.

## Remplacer un graphisme

1. Déposer l'image dans le bon dossier de `public/assets/` (par exemple `public/assets/vegetation/chene.png`).
2. Dans `public/assets/manifest.json`, renseigner la clé :

```json
"prop_tree": { "file": "assets/vegetation/chene.png", "originX": 0.5, "originY": 0.92 }
```

- `originX` / `originY` (de 0 à 1) : point de l'image posé au sol, au centre de la tuile (en général le pied du tronc).
- Pour une planche d'animation, ajouter `frameWidth` et `frameHeight`.

Si le fichier est absent ou illisible, le jeu utilise le graphisme provisoire et l'indique dans le journal.

## Règles de perspective

- Tuiles de sol : losange de 32×16 pixels (rapport 2:1).
- Une unité de hauteur = 16 pixels.
- Le joueur utilise une planche de 4 colonnes (images de marche) × 5 lignes (est, sud-est, sud, nord, nord-est) ;
  les directions ouest sont obtenues par symétrie.

## Clés actuelles

| Clé | Dossier conseillé | Contenu |
|---|---|---|
| `player` | characters | Planche du personnage (16×26 par image) |
| `shadow` | effects | Ombre au sol |
| `ui_tile_cursor` | ui | Curseur de tuile |
| `prop_tree`, `prop_pine`, `prop_birch`, `prop_swamp_tree` | vegetation | Arbres (feuillu, pin, bouleau, arbre des marais) |
| `prop_bush`, `prop_berry_bush`, `prop_tall_grass`, `prop_reeds`, `prop_flowers` | vegetation | Buissons, baies, hautes herbes, roseaux, fleurs |
| `prop_rock`, `prop_boulder`, `prop_outcrop`, `prop_flint`, `prop_pebble` | terrain | Rochers, gros bloc, affleurement, silex, cailloux |
| `prop_stump`, `prop_branch`, `prop_mushroom` | vegetation | Souche, branche au sol, champignons |
| `item_<objet>` | ui | Icône d'inventaire 16×16 (`wood`, `stick`, `stone`, `flint`, `fiber`, `reed`, `resin`, `clay`, `berries`, `mushroom`, `loincloth`), aussi dessinée au sol quand l'objet est posé |
| `prop_wall_x`, `prop_wall_y` | buildings | Pièces de mur (deux orientations) |
| `tile_<sol>_<0..2>` | terrain | Trois variantes par type de sol (`grass`, `dirt`, `sand`, `water`, `stone`, `shallow_water`, `forest_floor`, `mud`, `swamp_grass`, `gravel`, `clay`) |
| `face_<sol>_left`, `face_<sol>_right` | terrain | Parois d'une tuile surélevée (16×16 px, côté gauche et côté droit, 8 px de haut par niveau) |

## Planches de tuiles de sol

Une grande planche par sol (3 tuiles en haut, paroi gauche et paroi droite en dessous), nommée d'après le sol (`grass.png`, `stone.png`…), peut être découpée automatiquement :

```
python3 scripts/slice-terrain.py <dossier des planches> public/assets/terrain
```

Le script recadre le dessus de chaque tuile en losange 32×16, les parois en 16×16, et retire le dégradé de lumière pour que les tuiles se raccordent. Les planches d'origine sont gardées dans les fichiers du projet (`prehistoric/textures-sol/`).
