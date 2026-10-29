# Compte rendu — Phase 5 : animaux, dinosaures et combat (v0.5.0)

**Résultat attendu :** un environnement dangereux avec des créatures réellement interactives.
**Statut :** terminé côté développement et tests automatiques ; en attente de ta validation.

## 1. Fonctionnalités développées

- **7 espèces**, 4 animaux et 3 dinosaures, chacune avec son caractère (tout est réglable dans `src/data/creatures.json`) :

| Espèce | Où | Caractère |
|---|---|---|
| Lapin | forêt, plaines (un peu partout) | craintif, très rapide, fuit tout |
| Cerf | forêt, plaines | craintif, en harde de 2 à 4 : quand l'un s'enfuit, les autres aussi |
| Sanglier | forêt, marais | territorial : charge si tu t'approches à 2-3 cases ou si tu le frappes |
| Loup | forêt, montagnes, plaines | agressif, en meute de 2 ou 3, chasse lapins et cerfs |
| Compsognathus | marais | petit dinosaure agressif en bande de 3 à 5, chasse les lapins |
| Raptor | montagnes, forêt (rare) | dinosaure très dangereux, chasse cerfs, lapins et sangliers |
| Tricératops | plaines | énorme, paisible de loin, défend son territoire (3-4 cases) avec des coups très forts |

- **Déplacements autonomes** : chaque créature se repose, se promène autour de son coin, contourne les obstacles en glissant, ne traverse ni l'eau profonde, ni les murs, ni les portes fermées.
- **Détection du joueur** : par la **vue** (distance propre à chaque espèce, bloquée par les murs, les arbres et les rochers, et rien derrière elle au-delà de 2 cases) et par l'**ouïe** (courir s'entend de loin, marcher moins, rester immobile presque pas, frapper fait du bruit). Une menace est **retenue quelques secondes** même quand elle n'est plus visible.
- **Fuite** : les espèces craintives s'enfuient et préviennent leur groupe. Elles se fatiguent après quelques secondes de course : on peut les rattraper (ou un prédateur peut).
- **Agressivité** : les agressifs attaquent dès qu'ils te repèrent, les territoriaux seulement si tu entres sur leur terrain ou les attaques. Ils abandonnent si tu t'éloignes assez.
- **Chasse entre animaux** : un prédateur affamé chasse ses proies, les tue, puis mange la carcasse (elle disparaît). Les proies fuient les prédateurs qu'elles voient.
- **Combat au corps à corps** : quand un animal est à moins de 3 cases, le **clic gauche frappe vers la souris** (sinon le clic récolte comme avant). Chaque arme a ses dégâts, sa portée et sa vitesse : poings, pierre, silex, hache, pioche, **lance en bois** (longue portée) et **massue en pierre** (gros dégâts, gros recul). Les coups ne passent pas à travers les murs.
- **Armes à distance** : le **clic droit lance l'arme en main** vers la souris (lance en bois ou pierres). Elle vole en ligne droite, s'arrête sur les obstacles, blesse le premier animal touché, puis **retombe au sol** où on la ramasse (E).
- **Esquive** : **Espace** fait un bond rapide (dans la direction des touches) pendant lequel rien ne te touche. Elle coûte de l'endurance.
- **Dégâts et réactions** : chaque coup fait reculer, la créature touchée clignote en rouge et une barre de vie s'affiche au-dessus d'elle. Les attaques des animaux **se voient venir** (ils s'arrêtent et clignotent une fraction de seconde) : c'est le moment d'esquiver ou de reculer. Toi aussi tu clignotes en rouge quand tu es touché.
- **Chasse et dépeçage** : une créature tuée laisse une **carcasse** ; E maintenu la dépèce (plus vite avec un silex, une hache ou une lance) et donne **viande crue** et **peaux**. Les carcasses pourrissent après 5 minutes.
- **Nouvelles recettes** : lance en bois, massue en pierre, **cape en peau** (3 peaux, protège bien du froid, à l'établi) et **viande cuite** au feu de camp (nourrit 4 fois plus que crue).
- **Mort et réapparition** : l'écran indique la cause (« tué par un loup »). Tu réapparais au point de départ ; les prédateurs qui rôdent autour s'en vont et les autres oublient ta poursuite.
- **Population** : les animaux apparaissent hors de ta vue (à plus de 22 cases) selon le biome, en groupes, et ceux laissés loin derrière disparaissent. Au plus 14 autour de toi, pour garder le jeu fluide.

## 2. Fichiers principaux

| Fichier | Rôle |
|---|---|
| `src/data/creatures.json` | Espèces : caractère, vitesses, vue, ouïe, mémoire, attaque, dépeçage, biomes |
| `src/creatures/Creature.js` | Comportement d'une créature (repos, promenade, fuite, poursuite, attaque, repas) |
| `src/creatures/CreatureSystem.js` | Apparition et disparition, collisions entre corps, armes lancées, carcasses |
| `src/creatures/combat.js` | Ligne de vue et zone touchée par un coup |
| `src/gameplay/PlayerSurvival.js`, `src/entities/Player.js` | Frapper, lancer, esquiver, recevoir des coups |
| `src/render/CreatureLayer.js` | Affichage des créatures, armes en vol, barres de vie, effets de coup |
| `src/assets/creatureArt.js` | Graphismes provisoires des 7 espèces (marche en 4 images) et de leurs carcasses |
| `src/data/items.json`, `recipes.json`, `survival.json` | Armes, viande, peaux, cape, réglages du combat |

## 3. Tests réalisés

**Tests automatiques réussis : 149 tests unitaires** (14 nouveaux) : le lapin fuit, un animal ne voit pas à travers un mur mais entend la course, le loup poursuit et mord, l'esquive est rapide et protège, la massue tue un sanglier qui laisse une carcasse, le dépeçage donne exactement la viande et la peau prévues, la lance blesse un cerf de loin et retombe au sol, un mur arrête la lance et le coup, le loup affamé chasse un lapin puis mange sa carcasse, le tricératops défend son territoire mais laisse passer de loin, les prédateurs quittent le point de réapparition, les groupes apparaissent hors de vue sur un sol praticable, la viande se cuit au feu, la carcasse pourrit.

**Vérifications dans le jeu (Chromium automatisé) : 54/54 réussies**, dont 9 nouvelles avec de vrais clics et de vraies touches : pas d'animal dans la zone de test au départ, le lapin s'enfuit quand on marche vers lui, le loup attaque, esquive avec Espace, abattre un sanglier à la massue en cliquant dessus, le dépecer avec E, lancer une lance au clic droit sur un cerf, mourir sous les crocs de deux loups puis réapparaître sans loup autour, et des animaux présents dans le monde procédural. Toutes les vérifications des phases 1 à 4 passent toujours. J'ai regardé les captures (les 7 espèces, l'attaque du loup, la lance, l'écran de mort).

**Pas encore vérifié** : sur ton PC Windows, et l'équilibrage (dégâts, vitesses, nombre d'animaux) n'a été réglé que par calcul et par les tests : dis-moi si c'est trop dur ou trop facile.

## 4. Problèmes connus et limites

- Graphismes des créatures provisoires, vus de profil (gauche/droite) : tu peux les redessiner (planche de 4 images de marche par espèce, plus une image de carcasse).
- Les animaux ne sont pas sauvegardés : en relançant le jeu, d'autres apparaissent. Une lance encore en vol au moment de quitter est perdue.
- Pas de vrai calcul de chemin (il arrive en phase 6) : un animal peut rester bloqué derrière un obstacle compliqué.
- Pas encore de blocage au bouclier ni d'armures (prévus plus tard), ni d'arc.
- Apprivoisement, montures, élevage, petits, odorat, recherche d'eau et de nourriture : phase 9 du cahier des charges.
- 7 espèces sur les 10 prévues pour la V1 : les 3 dernières viendront en phase 7.
- Pas de réapparition à un lit ou au village : toujours au point de départ (le village arrive en phase 6).

## 5. Comment tester

1. Lance Prehistoric : il se met à jour en 0.5.0 (numéro en bas à droite).
2. Promène-toi : lapins et cerfs s'enfuient quand tu cours vers eux. En marchant doucement tu peux les approcher plus près.
3. Fabrique une lance (2 branches, 1 silex, 1 corde) avec C, équipe-la (clic droit dans l'inventaire), vise un cerf avec la souris et fais clic droit pour la lancer. Ramasse-la avec E.
4. Approche-toi d'un sanglier : il charge. Quand il s'arrête et clignote, appuie sur Espace pour esquiver, puis frappe-le avec clic gauche.
5. Dépèce la carcasse avec E maintenu, puis fais cuire la viande au feu de camp (menu C près du feu).
6. Avec 3 peaux et 2 cordes, fabrique une cape à l'établi.
7. Attention aux loups en forêt et aux raptors dans les montagnes. Si tu meurs, l'écran te dit qui t'a tué.

## 6. État d'avancement

Phases 1 à 4 validées. Phase 5 terminée, en attente de ta validation. Ensuite : phase 6 (premiers habitants, métiers, calcul de chemin).
