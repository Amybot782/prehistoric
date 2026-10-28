# Compte rendu — Phase 4 : fabrication et construction (v0.4.0)

**Résultat attendu :** construire un véritable refuge personnalisé.
**Statut :** terminé côté développement et tests automatiques ; en attente de ta validation.

## 1. Fonctionnalités développées

- **Fabrication instantanée** (touche C) : un menu liste toutes les recettes avec ce qu'il te faut (en vert si tu l'as, en orange s'il manque quelque chose, en rouge s'il faut un atelier). Un clic fabrique tout de suite, Maj + clic en fait 5. Pas de barre d'attente, pas d'usure (comme demandé).
- **Recettes** : corde (fibres), hache en silex (coupe le bois 2,4 fois plus vite), pioche en pierre (casse la pierre 2,4 fois plus vite), établi, feu de camp, et toutes les pièces de construction.
- **Premiers ateliers** :
  - **Établi** : à moins de 3 cases, il débloque planchers, fondations, murs, portes, toits et décorations. E devant l'établi ouvre aussi le menu.
  - **Feu de camp** : débloque les torches et réchauffe l'air autour de lui (jusqu'à +14 °C).
- **Construction pièce par pièce** : plancher en bois, fondation en pierre, mur en bois, porte en bois, toit de chaume, et en décoration natte en fibres, pierre dressée et torche.
- **Placement** : choisis la pièce dans la barre rapide, un aperçu transparent suit la souris, **vert** si c'est possible, **rouge** sinon avec la raison (trop loin, dans l'eau, sol pas au même niveau, place prise, quelque chose gêne, toit sans appui). Les murs et portes se mettent sur le bord de case le plus proche de la souris et se raccordent aux angles. R tourne les objets (établi…).
- **Portes** : E les ouvre et les ferme ; fermées elles bloquent, ouvertes on passe. Elles ne se ferment pas si tu es dedans.
- **Toits** : ils reposent sur un mur, une porte ou un autre toit. Quand tu entres sous un toit, tous les toits deviennent transparents pour voir l'intérieur ; il y fait 4 °C de plus.
- **Destruction** : X démonte la construction visée (sous la souris, ou devant toi) et la rend entière dans l'inventaire.
- **Collisions** : on ne traverse jamais un mur ni une porte fermée. Rien ne repousse sous un plancher ou un objet construit.
- **Sauvegarde des constructions** : sauvegarde automatique toutes les 30 secondes, quand tu quittes et quand tu changes de monde (F9). Elle garde le monde (arbres coupés, objets posés, constructions), ton inventaire, ton équipement, tes besoins et ta position. Une sauvegarde par monde, avec une copie de secours de la précédente.

## 2. Fichiers principaux

| Fichier | Rôle |
|---|---|
| `src/data/recipes.json` | Recettes (coût, atelier) |
| `src/data/items.json`, `props.json` | Nouveaux objets et pièces de construction |
| `src/crafting/crafting.js` | Règles de fabrication |
| `src/building/placement.js` | Emplacements (sol, centre, toit, bord de case) et règles de placement |
| `src/world/ChunkedWorld.js`, `chunks/ChunkDeltaStore.js` | Pièces construites dans le monde, portes, mémorisation par chunk |
| `src/gameplay/PlayerSurvival.js` | Fabriquer, construire, ouvrir, démonter, sauvegarder le joueur |
| `src/save/autosave.js` | Sauvegarde automatique |
| `src/ui/CraftingPanel.js`, `SurvivalHud.js` | Menu de fabrication, messages de construction |
| `src/render/ChunkRenderer.js`, `PlayerView.js` | Ordre d'affichage des sols et toits, toits transparents |
| `src/assets/placeholders.js` | Graphismes provisoires de toutes les nouvelles pièces |

## 3. Tests réalisés

**Tests automatiques réussis : 135 tests unitaires** (26 nouveaux) : coût exact consommé, refus sans ressources ou sans établi, mur sur le bon bord, un mur bloque le passage, refus (place prise, eau, sol en pente, trop loin, joueur dans le passage, toit sans appui, gros bloc), rotation, porte fermée/ouverte, porte qui ne se ferme pas sur le joueur, démontage qui rend la pièce, chaleur du feu et du toit, rien ne repousse sous un plancher, constructions conservées après déchargement des chunks, ancien format de données toujours lisible, sauvegarde relue et copie de secours utilisée si la dernière est abîmée.

**Vérifications dans le jeu (Chromium automatisé) : 45/45 réussies**, dont 9 nouvelles avec de vrais clics et de vraies touches : fabriquer l'établi dans le menu, mur refusé sans établi, poser l'établi à la souris, fabriquer 5 murs avec Maj + clic, aperçu rouge sur une place prise, le mur construit bloque, la porte bloque puis s'ouvre avec E et on passe, toit posé puis démontage avec X, et **construction toujours là après rechargement du jeu**. Toutes les vérifications des phases 1 à 3 passent toujours. J'ai regardé les captures (cabane complète, intérieur avec toit transparent, menu de fabrication).

**Pas encore vérifié** : sur ton PC Windows (en particulier que la sauvegarde reste bien après avoir fermé l'application). L'équilibrage des coûts n'a été réglé que par calcul.

## 4. Problèmes connus et limites

- Graphismes des constructions provisoires : tu peux les redessiner (mêmes tailles que les objets, 32 px de large au maximum).
- Sauvegarde provisoire : pas encore de menu ni d'emplacements de sauvegarde (prévus en phase 7). La zone de test n'est pas sauvegardée.
- Pas encore d'arbre des technologies ni de qualité des objets (phase 7).
- Les toits ne tombent pas si on démonte le mur qui les porte.
- Pas encore de murs à fenêtre, d'escaliers, de palissades ni de coffres.
- Le feu de camp n'éclaire pas (le jour et la nuit arrivent en phase 7) et ne cuit rien (la viande arrive avec les animaux en phase 5).
- Les murs et portes se posent sur le bord de case le plus proche de la souris : il faut viser près du bord voulu.

## 5. Comment tester

1. Lance Prehistoric : il se met à jour en 0.4.0 (numéro en bas à droite).
2. Récolte du bois (8), de la pierre (4), des fibres et des branches.
3. Appuie sur C, clique sur « Établi ». Choisis l'établi dans la barre rapide (1 à 8), vise une case libre : l'aperçu est vert, clique.
4. Près de l'établi, rouvre C et fabrique des murs, une porte (il faut une corde), des toits et un plancher (Maj + clic pour 5).
5. Pose le plancher, puis les murs autour en visant près des bords des cases, mets la porte dans un mur, puis les toits par-dessus.
6. Entre par la porte (E pour l'ouvrir) : les toits deviennent transparents, la température monte.
7. Construis un feu de camp et approche-toi : il fait plus chaud.
8. Vise une construction et appuie sur X : elle revient dans ton inventaire.
9. Ferme le jeu, relance-le : ta cabane, ton inventaire et ta position sont toujours là.

## 6. Avancement

Phases 1 à 3 validées. Phase 4 livrée, en attente de validation. Phases 5 à 7 à venir.
