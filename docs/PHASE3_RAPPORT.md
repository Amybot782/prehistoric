# Compte rendu — Phase 3 : survie et récolte (v0.3.0)

**Résultat attendu :** une boucle de survie jouable.
**Statut :** terminé côté développement et tests automatiques ; en attente de ta validation.

## 1. Fonctionnalités développées

- **Santé, faim, soif** : la faim se vide en 40 minutes environ, la soif en 25 (plus vite en courant). À zéro, la santé baisse ; bien nourri et hydraté, elle remonte doucement.
- **Endurance** : la course la consomme (environ 11 secondes de course) ; vide, le personnage est épuisé et ne peut plus courir avant d'en avoir récupéré 30 %. Chaque coup donné en coûte un peu.
- **Température** : température de l'air selon la région (biome, altitude, eau peu profonde), température du corps qui la suit lentement. Le froid fait plus vite venir la faim, le gel fait perdre de la santé. Le pagne de départ protège un peu. Montagnes froides, marais plus doux.
- **Récolte** : E maintenu ou clic gauche sur l'objet visé (il est marqué au sol en vert, et son nom s'affiche au-dessus de la barre rapide).
  - Arbres : ils tremblent à chaque coup, tombent et laissent une souche. Bois, branches, résine (pins).
  - Rochers : ils s'assombrissent en se fissurant. Pierre, silex dans les affleurements.
  - Plantes : buissons (fibres, branches), buissons à baies, hautes herbes, roseaux, fleurs.
  - Ramassage : branches, cailloux, silex, champignons posés au sol.
  - Ce qui reste d'un objet à moitié récolté est mémorisé ; tout repousse avec le temps (de 4 à 20 minutes), sauf les rochers.
- **Outils** : un silex en main coupe le bois et les plantes plus vite, une pierre casse mieux les rochers. Pas d'usure (comme demandé).
- **Inventaire** : 24 emplacements dont les 8 de la barre rapide, piles (50 bois, 20 baies…). Si l'inventaire est plein, la récolte tombe au sol au lieu de disparaître.
- **Équipement** : emplacement Main (outil) et Corps (vêtement).
- **Manger et boire** : baies et champignons (barre rapide puis F, ou clic droit) ; E face à l'eau pour boire.
- **Poser et ramasser** : G pose un objet devant soi (Maj + G toute la pile), E le ramasse. Les objets posés restent même si on s'éloigne.
- **Mort et réapparition** : écran « Tu es mort de soif / de faim / de froid », puis retour au point de départ après 3 secondes avec l'inventaire.
- **Interface de survie** : barres en bas à gauche avec la température et les états (affamé, assoiffé, froid, épuisé…), barre rapide et équipement en bas au centre, inventaire à la souris (I ou Tab) avec la description des objets, messages « +1 Bois ».

## 2. Fichiers principaux

| Fichier | Rôle |
|---|---|
| `src/survival/Vitals.js` | Santé, faim, soif, endurance, température du corps |
| `src/survival/climate.js` | Température de l'air |
| `src/survival/harvest.js` | Règles de récolte, choix de la cible, eau à boire |
| `src/inventory/Inventory.js`, `Equipment.js` | Inventaire et équipement |
| `src/gameplay/PlayerSurvival.js` | Boucle de survie du joueur |
| `src/ui/SurvivalHud.js` | Interface de survie |
| `src/world/ChunkedWorld.js`, `chunks/ChunkDeltaStore.js` | Souches, repousse, objets posés, récolte partielle mémorisée |
| `src/render/ChunkRenderer.js` | Tremblement, fissures, chute des arbres |
| `src/data/items.json`, `survival.json`, `props.json` | Objets, équilibrage, ressources des objets du décor |

## 3. Tests réalisés

**Tests automatiques réussis : 108 tests unitaires** (33 nouveaux), dont : inventaire (piles, surplus rendu, déplacements sans perte), équipement sans duplication, faim et soif au bon rythme, épuisement puis récupération, mort de faim et de soif, effet du froid et des vêtements, total de récolte identique quel que soit l'outil, souche puis repousse, objet à moitié coupé conservé au rechargement, rochers qui ne repoussent pas, objets posés conservés et ramassés une seule fois, récolte qui tombe au sol si l'inventaire est plein, mort puis réapparition.

**Vérifications dans le jeu (Chromium automatisé) : 36/36 réussies** dont 11 nouvelles avec de vraies touches et de vrais clics : abattre un arbre en maintenant E (6 bois + souche), repousse, boire à l'étang, manger des baies avec F, déplacer une pile à la souris dans l'inventaire, équiper un silex au clic droit, frapper un rocher, poser avec G puis ramasser avec E, épuisement en courant, mort puis réapparition. Toutes les vérifications des phases 1 et 2 passent toujours. J'ai regardé les captures d'écran (arbre abattu, inventaire, écran de mort, montagnes).

**Pas encore vérifié** : sur ton PC Windows. L'équilibrage (vitesse de la faim, de la soif, de l'endurance) n'a été réglé que par calcul : dis-moi si c'est trop facile ou trop dur.

## 4. Problèmes connus et limites

- **Rien n'est sauvegardé en quittant** : l'inventaire repart de zéro à chaque lancement. Les sauvegardes sont prévues en phase 7 ; je peux les avancer si tu préfères.
- Pas encore de feu ni de fabrication (phase 4) : contre le froid, seul le pagne aide.
- Les blessures arrivent avec le combat (phase 5).
- On ne peut pas encore extraire l'argile du sol.
- Le personnage n'a pas encore d'animation de frappe.
- Maintenir E enchaîne sur l'objet suivant à portée une fois le premier récolté.

## 5. Comment tester

1. Lance Prehistoric : il se met à jour en 0.3.0 (numéro en bas à droite).
2. Approche-toi d'un arbre, maintiens E : il tremble, tombe et laisse une souche ; regarde le bois arriver.
3. Ouvre l’inventaire (I) et fais un clic droit sur un silex ou une pierre pour l’équiper en main, puis recoupe un arbre : c'est plus rapide.
4. Cueille un buisson à baies, choisis les baies avec les touches 1 à 8 et appuie sur F pour manger.
5. Va au bord de l'eau et appuie sur E pour boire.
6. Cours longtemps avec Maj : l'endurance se vide, puis revient.
7. Monte dans les montagnes : la température baisse (en bas à gauche).
8. Pose un objet avec G, ramasse-le avec E.

## 6. Avancement

Phases 1 et 2 validées. Phase 3 livrée, en attente de validation. Phases 4 à 7 à venir.
