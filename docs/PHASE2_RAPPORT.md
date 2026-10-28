# Compte rendu — Phase 2 : monde procédural (v0.2.0)

**Résultat attendu :** un monde généré automatiquement, varié, explorable et reproductible avec une seed.
**Statut :** terminé côté développement et tests automatiques ; en attente de ta validation.

## 1. Fonctionnalités développées

- **Monde infini par chunks** : le monde est découpé en morceaux de 32×32 tuiles, générés autour du joueur pendant qu'il marche (2 au maximum par image, les plus proches d'abord) et oubliés quand il s'éloigne. Un morceau se génère en 0,6 à 2 ms.
- **Seed reproductible** : la même seed (texte ou nombre) redonne exactement le même monde, quel que soit l'ordre dans lequel on l'explore. Le jeu rouvre le dernier monde joué ; F9 en crée un nouveau au hasard.
- **Réglages du monde** déjà prévus dans le code : taille des biomes, relief, densité des forêts, quantité d'eau, abondance des ressources. Ils seront proposés dans le menu de création de partie (phase 7).
- **Relief** : terrasses sur 7 niveaux (eau et rivages, puis 6 niveaux de terre), parois visibles, niveaux bas légèrement plus sombres. Le personnage monte et descend en douceur. Deux tuiles voisines ne diffèrent jamais de plus d'un niveau : tout se franchit à pied.
- **Eau** : eau profonde (infranchissable), eau peu profonde (on peut y marcher), plages de sable.
- **Quatre biomes** : forêt tempérée (feuillus, pins, bouleaux, baies), plaines (herbes hautes, fleurs, argile, silex), marais (boue, roseaux, arbres des marais, mares), montagnes rocheuses (pierre, gravier, rochers, affleurements, pins).
- **Ressources naturelles** : 15 types d'objets (arbres, buissons, buissons à baies, hautes herbes, roseaux, fleurs, rochers, gros blocs, affleurements, silex) avec leurs collisions et ce qu'ils donneront à la récolte (la récolte arrive en phase 3).
- **Modifications conservées** : un objet retiré ou un sol changé reste modifié même si le morceau est oublié puis régénéré. Ces modifications sont prêtes à être écrites dans la sauvegarde (phase 7).
- **Mini-carte** : en haut à droite, dans la même orientation que le jeu, avec les zones déjà explorées (même loin) ; touche M pour la cacher.
- **Débogage** : panneau F3 enrichi (seed, biome, hauteur, morceau, nombre chargés, temps de génération), F7 bordures de chunks. Le panneau est maintenant caché au démarrage.

## 2. Fichiers principaux

| Fichier | Rôle |
|---|---|
| `src/world/noise.js` | Bruit simplex à seed, fractal |
| `src/world/WorldSettings.js`, `worldSession.js` | Réglages, seed, choix du monde au lancement |
| `src/world/generation/ProceduralGenerator.js` | Relief, eau, biomes, sols, objets, point de départ |
| `src/world/ChunkedWorld.js` | Chargement / déchargement, collisions, hauteur du sol, événements |
| `src/world/chunks/ChunkDeltaStore.js` | Modifications du joueur par morceau |
| `src/world/testMap.js` | Zone de test de la phase 1 servie par morceaux, avec un plateau |
| `src/render/ChunkRenderer.js` | Rendu du sol, des parois et des objets, recyclage |
| `src/ui/Minimap.js` | Mini-carte |
| `src/data/worldgen.json`, `biomes.json`, `terrain.json`, `props.json`, `resources.json` | Réglages de génération et contenu |
| `src/scenes/WorldScene.js`, `UIScene.js` | Branchement de l'ensemble |

## 3. Tests réalisés

**Tests automatiques réussis (75 tests unitaires)** dont, pour cette phase :
- même seed = même monde, dans n'importe quel ordre ; autre seed = autre monde ;
- relief jamais plus d'un niveau entre voisins, y compris aux bords des morceaux (3 seeds, 65 000 tuiles chacune) ;
- les 4 biomes et l'eau présents sur une grande zone ; aucun objet dans l'eau ; point de départ sur la terre ferme ;
- en marchant sur 2 000 tuiles, le nombre de morceaux en mémoire reste borné et les collisions des morceaux oubliés sont bien retirées ;
- un objet retiré ne revient pas après rechargement ; aller-retour JSON des modifications ;
- les réglages ont l'effet attendu (plus de forêt = plus d'arbres, relief 0 = monde plat).

**Vérifications dans le jeu (navigateur Chromium automatisé, 25/25 réussies)** :
- toutes les vérifications de la phase 1 (déplacements, course, eau, murs, porte, forêt, zoom, souris, caméra stable au pixel près, 4K) ;
- montée sur le plateau de la zone de test (hauteur 2 atteinte) ;
- monde procédural : chargement, longue course avec chargement et déchargement des morceaux, téléportation lointaine, les 4 biomes trouvés et photographiés, même monde après rechargement, nouveau monde avec F9, aucune erreur JavaScript.
- J'ai regardé les captures d'écran : relief, plages, marais, montagnes et mini-carte s'affichent correctement.

**Pas encore vérifié** :
- sur ton PC Windows (fluidité réelle, aspect à ta résolution) ;
- les performances : mon environnement de test n'a pas de carte graphique, les FPS mesurés n'y veulent rien dire.

## 4. Problèmes connus et limites

- Pas de rivières pour l'instant (lacs, mers et marais seulement).
- Pas de falaises infranchissables : tout le relief se monte à pied.
- On ne peut pas encore récolter les objets (phase 3) ; le monde n'est pas encore sauvegardé sur disque (phase 7), seule la seed est retenue.
- Pas de menu de création de monde (phase 7) : F9 et la seed par défaut le remplacent en attendant.
- Les montagnes sont très chargées en rochers ; les densités se règlent facilement dans `biomes.json`.
- La grille F6 est dessinée au niveau du sol le plus bas (décalée sur les hauteurs).
- Graphismes toujours provisoires.

## 5. Comment tester

1. Lance Prehistoric comme d'habitude : il se met à jour tout seul en version 0.2.0 (le numéro est en bas à droite).
2. Marche dans toutes les directions et cours (Maj) : le monde doit se construire autour de toi sans trou ni saccade.
3. Regarde la mini-carte en haut à droite ; M la cache et la réaffiche.
4. Monte et descends des terrasses ; marche dans l'eau peu profonde (bleu clair), l'eau profonde doit t'arrêter.
5. Cherche les 4 biomes : forêt, plaines, marais, montagnes.
6. F9 crée un nouveau monde ; quitte et relance : tu dois retrouver le même monde.
7. F3 affiche les informations (seed, biome, FPS…). Dis-moi les FPS si tu peux.

## 6. Avancement

Phase 1 validée. Phase 2 livrée, en attente de validation. Phases 3 à 7 à venir.
