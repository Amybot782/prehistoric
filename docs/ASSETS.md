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
| `prop_tree`, `prop_pine`, `prop_bush` | vegetation | Arbres, buisson |
| `prop_rock`, `prop_boulder` | terrain | Rochers |
| `prop_wall_x`, `prop_wall_y` | buildings | Pièces de mur (deux orientations) |
| `tile_<sol>_<0..2>` | terrain | Trois variantes par type de sol (`grass`, `dirt`, `sand`, `water`, `stone`) |
