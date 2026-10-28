# Suivi du développement

## Historique des versions

| Version | Date | Contenu | Statut |
|---|---|---|---|
| 0.2.0 | 2026-10-28 | Phase 2 — Monde procédural : chunks, seed, relief, eau, 4 biomes, ressources naturelles, mini-carte | En attente de validation |
| 0.1.2 | 2026-10-28 | Mise à jour automatique depuis GitHub Releases, retour à la version précédente en cas d'échec, publication automatique sur Windows | Installée par Raphael ; phase 1 validée |
| 0.1.1 | 2026-10-28 | Correction du tremblement de l'image pendant la marche (zoom entier, caméra calée au pixel sur le joueur) | Incluse dans 0.1.2 |
| 0.1.0 | 2026-10-28 | Phase 1 — Fondations techniques | Lancée par Raphael sur Windows ; tremblement signalé |

## Fonctionnalités terminées (testées)

- Projet JavaScript + Phaser 3.90 + Vite, structure modulaire, données en JSON.
- Application Electron sécurisée (protocole `app://`, bac à sable), journaux dans `%APPDATA%\Prehistoric\logs`.
- Dossier Windows autonome avec `Prehistoric.exe` (construit sous Linux, à confirmer sur Windows).
- Projection isométrique 2:1, coordonnées monde séparées des coordonnées écran, sélection de tuile à la souris.
- Boucle de simulation à pas fixe (60 Hz) avec interpolation du rendu.
- Déplacements ZQSD/WASD/flèches orientés à l'écran, course (Maj), vitesse diagonale normalisée, 8 orientations.
- Collisions logiques (cercles/rectangles), anti-traversée, glissement le long des murs, eau infranchissable.
- Tri de profondeur par empreinte au sol, corrigé près des murs fins ; objets devant le joueur rendus translucides.
- Caméra calée au pixel près sur le joueur, zoom entier (molette et clavier), zoom de base adapté à la résolution (jusqu'au 4K).
- Outils de débogage : panneau F3, collisions F4, grille F6, journal en mémoire et sur disque.
- Assets remplaçables par manifeste, graphismes provisoires générés, repli automatique si un fichier manque.
- Zone de test de 48×48 tuiles (forêt, étang, chemin, enclos avec porte, passages étroits, plateau à deux marches), via `?map=test`.
- Mise à jour automatique au lancement (GitHub Releases), avec vérification d'empreinte et retour arrière.
- Monde procédural infini par chunks de 32×32, seed reproductible, réglages du monde (taille des biomes, relief, forêts, eau, ressources).
- Relief en terrasses franchissables, eau profonde / peu profonde, plages ; 4 biomes ; 15 types d'objets naturels.
- Chargement et déchargement progressifs des chunks, modifications du joueur conservées (prêtes pour la sauvegarde).
- Mini-carte des zones explorées (M), bordures de chunks (F7), nouveau monde (F9).
- 75 tests unitaires et 25 vérifications de bout en bout dans Chromium.

## Fonctionnalités en cours

- Aucune (phase 2 livrée, en attente de validation).

## Fonctionnalités futures (V1)

- Phase 3 : survie (santé, faim, soif, endurance, température), récolte, inventaire, équipements.
- Phase 4 : craft instantané, ateliers, construction pièce par pièce, sauvegarde des constructions.
- Phase 5 : animaux et dinosaures, combat, esquive, réapparition.
- Phase 6 : habitants, métiers, pathfinding, transport.
- Phase 7 : contenu V1 complet, jour/nuit, météo, sauvegardes, menus, paramètres, sons, installateur Windows.

## Bugs connus et limitations

- Phase 2 non encore essayée sur le PC de Raphael (performances réelles inconnues).
- Pas encore de rivières : seulement des lacs, des mers et des marais.
- Les objets ne se récoltent pas encore (phase 3) ; le monde n'est pas encore sauvegardé sur disque (phase 7), seule la seed est retenue.
- Pas de menu de création de monde (phase 7) : F9 et la seed par défaut le remplacent.
- La grille de débogage (F6) est dessinée au niveau 0 : décalée sur les hauteurs.
- Pas d'installateur (NSIS demande Wine pour être produit depuis Linux) ni d'icône personnalisée : la version est un dossier à extraire.
- Les performances n'ont pas été mesurées sur un vrai PC (seulement en rendu logiciel dans un conteneur).
- Les angles de l'enclos de test ne sont pas raccordés visuellement (pièces de mur provisoires).
- Les montagnes ont beaucoup de rochers ; densités à ajuster selon les retours.
