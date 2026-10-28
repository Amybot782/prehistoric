/**
 * End-to-end smoke test: serves the production build, opens it in Chromium
 * (Playwright) and drives the game with real keyboard and mouse events.
 * Part 1 uses the hand-built test area (?map=test): movement in each
 * direction, running, collisions with water, walls and trees, relief, zoom,
 * picking and camera stability. Part 2 uses procedural worlds: streaming
 * while walking far, bounded memory, same seed = same world after a reload,
 * new world (F9), minimap. Fails on any runtime error. Screenshots are written
 * to tests/e2e/screenshots/.
 *
 * Usage: npm run test:e2e   (needs the `playwright` package and Chromium)
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');
const shots = join(root, 'tests', 'e2e', 'screenshots');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright est introuvable : installez-le (npm i -D playwright) pour lancer ce test.');
  process.exit(2);
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const path = raw === '/' ? '/index.html' : raw;
  try {
    const data = await readFile(join(dist, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  await mkdir(shots, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.stack));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}?map=test`);
  await page.waitForFunction(() => window.__PREHISTORIC__, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const state = () => page.evaluate(() => window.__PREHISTORIC__.state());
  const teleport = (x, y) => page.evaluate(([a, b]) => window.__PREHISTORIC__.teleport(a, b), [x, y]);
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of keys) await page.keyboard.up(k);
    await page.waitForTimeout(250);
  };
  await page.screenshot({ path: join(shots, '01-depart.png') });

  // Direction checks: each key must move the character the right way on screen.
  const dirs = [
    ['KeyW', 'haut (Z/W)', (d) => d.sy < -5 && Math.abs(d.sx) < 2],
    ['KeyS', 'bas (S)', (d) => d.sy > 5 && Math.abs(d.sx) < 2],
    ['KeyA', 'gauche (Q/A)', (d) => d.sx < -5 && Math.abs(d.sy) < 2],
    ['KeyD', 'droite (D)', (d) => d.sx > 5 && Math.abs(d.sy) < 2],
  ];
  for (const [key, label, ok] of dirs) {
    await teleport(24.5, 24.5);
    await page.waitForTimeout(100);
    const a = await state();
    await hold([key], 400);
    const b = await state();
    const d = { sx: b.playerScreen.x - a.playerScreen.x, sy: b.playerScreen.y - a.playerScreen.y };
    check(`Déplacement ${label}`, ok(d), `écran Δx=${d.sx.toFixed(1)} Δy=${d.sy.toFixed(1)}`);
  }

  // Diagonal speed equals straight speed (world units).
  await teleport(24.5, 24.5);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(400);
  const diag = await state();
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyS');
  const diagSpeed = Math.hypot(diag.player.vx, diag.player.vy);
  check('Vitesse diagonale normalisée', Math.abs(diagSpeed - 3.2) < 0.15, `${diagSpeed.toFixed(2)} tuiles/s`);

  // Running is faster.
  await teleport(24.5, 24.5);
  await page.waitForTimeout(250);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  const run = await state();
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ShiftLeft');
  const runSpeed = Math.hypot(run.player.vx, run.player.vy);
  check('Course (Maj)', run.player.running && Math.abs(runSpeed - 5.2) < 0.2, `${runSpeed.toFixed(2)} tuiles/s`);

  // Water blocks the player: walk west into the pond from its east shore.
  await teleport(19.5, 30.5);
  await hold(['KeyA', 'KeyW'], 2500);
  const pond = await state();
  check("L'eau bloque le joueur", pond.tile.terrain !== 'water' && !pond.overlapping, `arrêt sur ${pond.tile.terrain} (${pond.player.x.toFixed(2)}, ${pond.player.y.toFixed(2)})`);

  // Enclosure wall: from inside, walk south-east into the south wall (row 43).
  await teleport(33.5, 40.5);
  await hold(['KeyS'], 2000);
  const wall = await state();
  check('Le mur bloque le joueur', wall.player.y < 43.38 - wall.player.radius + 0.01 && !wall.overlapping, `y=${wall.player.y.toFixed(3)}`);
  await page.keyboard.press('F4');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(shots, '02-mur-collisions.png') });
  await page.keyboard.press('F4');

  // Leaving the enclosure through the doorway (columns 33-34 on row 36).
  await teleport(34.0, 40.5);
  await hold(['KeyW', 'KeyD'], 1600); // screen-up-right = world -y
  const door = await state();
  check('Sortie par la porte de l’enclos', door.player.y < 36, `y=${door.player.y.toFixed(2)}`);

  // Trees in the forest: run through it for a while, never overlapping a collider.
  await teleport(10.5, 19.5);
  let overlapped = false;
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(150);
    if ((await state()).overlapping) overlapped = true;
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await page.screenshot({ path: join(shots, '03-foret.png') });
  check('Aucune interpénétration dans la forêt', !overlapped);

  // Relief: walking east onto the plateau raises the character one level, then two.
  await teleport(26.5, 7.5);
  await page.waitForTimeout(150);
  const low = await state();
  await hold(['KeyD', 'KeyS'], 1500); // screen right-down = world +x
  const high = await state();
  check('Montée sur le plateau (relief)', low.player.z === 0 && high.tile.height === 2 && Math.abs(high.player.z - 1) < 0.05,
    `hauteur ${high.tile.height}, z=${high.player.z.toFixed(2)} à x=${high.player.x.toFixed(2)}`);
  await page.screenshot({ path: join(shots, '03b-plateau.png') });

  // ---- Phase 3: survival loop (test area) -----------------------------------
  const api = (f, ...a) => page.evaluate(([f, a]) => window.__PREHISTORIC__[f](...a), [f, a]);
  const sv = async () => (await state()).survival;
  const s0 = await sv();
  check('Départ : besoins pleins et vêtements équipés', s0.health === 100 && s0.equipment.body === 'loincloth' && s0.hunger > 80,
    `santé ${s0.health}, faim ${s0.hunger.toFixed(0)}, soif ${s0.thirst.toFixed(0)}, corps ${s0.equipment.body}`);

  // Cut a tree with E held: wood in the inventory, stump left behind.
  const tree = (await api('propsNear', 24.5, 24.5, 9)).find((p) => p.type === 'tree');
  await teleport(tree.x - 0.7, tree.y);
  await api('face', 1, 0);
  await page.waitForTimeout(200);
  const aimed = (await sv()).target;
  await page.keyboard.down('KeyE');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    if (!(await api('propsNear', tree.x, tree.y, 0.1)).some((p) => p.id === tree.id)) break;
  }
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(300);
  const afterCut = await sv();
  const around = await api('propsNear', tree.x, tree.y, 0.1);
  check('Abattre un arbre (E maintenu)', aimed?.id === tree.id && afterCut.items.wood >= 6 && around.some((p) => p.type === 'stump') && !around.some((p) => p.id === tree.id),
    `bois ${afterCut.items.wood ?? 0}, souche ${around.some((p) => p.type === 'stump')}`);
  await page.screenshot({ path: join(shots, '10-arbre-abattu.png') });

  // Regrowth after its delay.
  await api('advanceTime', 1000);
  await page.waitForTimeout(200);
  check('L’arbre repousse après le délai', (await api('propsNear', tree.x, tree.y, 0.1)).some((p) => p.id === tree.id));

  // Drink at the pond.
  await api('setVital', 'thirst', 30);
  await teleport(17.4, 30.6);
  await api('face', -1, 0);
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const drank = await sv();
  check('Boire à l’étang', drank.thirst > 40, `soif ${drank.thirst.toFixed(1)}`);

  // Eat berries from the quick bar with F.
  const slotOf = (st, item) => st.slots.findIndex((x) => x?.[0] === item);
  await api('give', 'berries', 3);
  await api('setVital', 'hunger', 40);
  const bi = slotOf(await sv(), 'berries');
  await page.keyboard.press(`Digit${bi + 1}`);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(200);
  const ate = await sv();
  check('Manger des baies (touche F)', bi >= 0 && bi < 8 && ate.hunger > 40 && ate.items.berries === 2, `faim ${ate.hunger.toFixed(1)}, baies ${ate.items.berries}`);

  // Inventory panel: move a stack with two clicks, equip flint with a right click.
  await api('give', 'flint', 1);
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(200);
  const st1 = await sv();
  const from = slotOf(st1, 'wood');
  const a = await api('hudSlot', 'inv', from);
  const b = await api('hudSlot', 'inv', 20);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(150);
  const st2 = await sv();
  const fi = slotOf(st2, 'flint');
  const f = await api('hudSlot', 'inv', fi);
  await page.mouse.click(f.x, f.y, { button: 'right' });
  await page.waitForTimeout(150);
  await page.mouse.move(f.x, f.y);
  await page.screenshot({ path: join(shots, '11-inventaire.png') });
  const st3 = await sv();
  check('Inventaire (I) : déplacer une pile à la souris', a.open && st2.slots[20]?.[0] === 'wood' && st2.slots[from] === null && st2.items.wood === st1.items.wood,
    `bois en ${from} -> ${slotOf(st2, 'wood')}`);
  check('Équiper un silex (clic droit)', st3.equipment.hand === 'flint' && !st3.items.flint, `main : ${st3.equipment.hand}`);
  await page.keyboard.press('KeyI');

  // A rock: bare hands need 8 hits, the flint fewer stone points per hit than stone but more than 1.
  const rock = (await api('propsNear', 24.5, 24.5, 12)).find((p) => p.type === 'rock');
  await teleport(rock.x - 0.85, rock.y);
  await api('face', 1, 0);
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const hitRock = (await api('propsNear', rock.x, rock.y, 0.1)).find((p) => p.id === rock.id);
  check('Frapper un rocher avec l’outil en main', hitRock && hitRock.hpLeft < 8 && hitRock.hpLeft > 0, `points restants ${hitRock?.hpLeft?.toFixed(2)}`);

  // Drop with G and pick up again with E.
  const before = (await sv()).items;
  await page.keyboard.press(`Digit${slotOf(await sv(), 'berries') + 1}`);
  await teleport(24.5, 24.5);
  await api('face', 1, 0);
  await page.waitForTimeout(150);
  const selItem = Object.keys(before)[0];
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(200);
  const dropped = (await api('propsNear', 24.5, 24.5, 1.5)).find((p) => p.type === 'dropped');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const after = (await sv()).items;
  check('Poser (G) puis ramasser (E) un objet', !!dropped && (await api('propsNear', 24.5, 24.5, 1.5)).every((p) => p.type !== 'dropped') && Object.values(after).reduce((x, y) => x + y, 0) === Object.values(before).reduce((x, y) => x + y, 0),
    `posé : ${dropped?.item ?? 'rien'} (sélection ${selItem})`);

  // Running empties stamina; exhaustion stops running.
  await teleport(24.5, 24.5);
  await page.keyboard.down('ShiftLeft');
  for (const k of ['KeyD', 'KeyA', 'KeyD', 'KeyA']) {
    await page.keyboard.down(k);
    await page.waitForTimeout(3200);
    await page.keyboard.up(k);
  }
  const tired = await state();
  await page.keyboard.up('ShiftLeft');
  check('L’endurance se vide en courant (épuisement)', tired.survival.exhausted || tired.survival.stamina < 20, `endurance ${tired.survival.stamina.toFixed(0)}, épuisé ${tired.survival.exhausted}`);

  // Death and respawn.
  await api('setVital', 'hunger', 0);
  await api('setVital', 'thirst', 0);
  await api('setVital', 'health', 0.5);
  await page.waitForTimeout(800);
  const dead = await sv();
  await page.screenshot({ path: join(shots, '12-mort.png') });
  await page.waitForTimeout(3500);
  const back = await state();
  check('Mort puis réapparition au point de départ', dead.dead && !back.survival.dead && back.survival.health === 100 && Math.hypot(back.player.x - 24.5, back.player.y - 24.5) < 0.5,
    `mort ${dead.dead}, santé après ${back.survival.health}`);

  // ---- Phase 4: crafting and building (test area) ----------------------------
  await teleport(24.5, 24.5);
  for (const [item, n] of [['wood', 40], ['stone', 10], ['fiber', 20], ['stick', 10]]) await api('give', item, n);
  const craftClick = async (id, shift = false) => {
    const r = await api('craftRow', id);
    if (shift) await page.keyboard.down('ShiftLeft');
    await page.mouse.click(r.x, r.y);
    if (shift) await page.keyboard.up('ShiftLeft');
    await page.waitForTimeout(120);
    return r.open;
  };
  const aimAt = async (x, y) => {
    const q = await api('screenOf', x, y);
    await page.mouse.move(q.x, q.y);
    await page.waitForTimeout(120);
    return q;
  };
  const buildAt = async (x, y) => {
    const q = await aimAt(x, y);
    await page.mouse.click(q.x, q.y);
    await page.waitForTimeout(120);
  };
  const c0 = await sv();
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(200);
  const menuOpen = await craftClick('workbench');
  await page.screenshot({ path: join(shots, '13-fabrication.png') });
  const c1 = await sv();
  check('Fabriquer un établi (menu C, clic)', menuOpen && c1.items.workbench === 1 && c1.items.wood === c0.items.wood - 8 && c1.items.stone === c0.items.stone - 4,
    `établi ${c1.items.workbench ?? 0}, bois ${c0.items.wood} -> ${c1.items.wood}`);
  await craftClick('wood_wall', true);
  const c2 = await sv();
  check('Sans établi posé, pas de mur', !c2.items.wood_wall, `murs ${c2.items.wood_wall ?? 0}`);
  await page.keyboard.press('KeyC');
  await api('selectItem', 'workbench');
  await aimAt(27.5, 24.5);
  const pv1 = (await sv()).preview;
  await buildAt(27.5, 24.5);
  const c3 = await sv();
  check('Poser l’établi à la souris (aperçu valide)', pv1?.type === 'workbench' && pv1.why === null && c3.stations.includes('workbench') && !c3.items.workbench,
    `aperçu ${JSON.stringify(pv1)}, ateliers ${c3.stations.join(',')}`);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(150);
  await craftClick('wood_wall', true);
  await craftClick('rope');
  await craftClick('wood_door');
  await craftClick('thatch_roof');
  await page.keyboard.press('KeyC');
  const c4 = await sv();
  check('Fabrication instantanée près de l’établi (Maj + clic = 5)', c4.items.wood_wall === 5 && c4.items.wood_door === 1 && c4.items.thatch_roof === 1,
    `murs ${c4.items.wood_wall}, porte ${c4.items.wood_door}, toit ${c4.items.thatch_roof}`);

  // A wall on the north side of the player's tile blocks the way north (screen up-right).
  await api('selectItem', 'wood_wall');
  await buildAt(24.5, 24.05);
  await aimAt(24.5, 24.05);
  const pvTaken = (await sv()).preview;
  check('Aperçu rouge quand la place est prise', pvTaken?.why === 'build.occupied', pvTaken?.why);
  await teleport(24.5, 24.5);
  await hold(['KeyW', 'KeyD'], 800);
  const blocked = await state();
  check('Le mur construit bloque le joueur', blocked.player.y > 24.3 && !blocked.overlapping, `y=${blocked.player.y.toFixed(2)}`);

  // A door next to it: E opens it, the player walks through.
  await api('selectItem', 'wood_door');
  await buildAt(25.5, 24.05);
  await teleport(25.5, 24.6);
  await api('face', 0, -1);
  await page.waitForTimeout(150);
  await page.mouse.move(5, 400);
  await hold(['KeyW', 'KeyD'], 500);
  const shut = await state();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const opened = (await api('built')).find((p) => p.type === 'wood_door');
  await hold(['KeyW', 'KeyD'], 700);
  const through = await state();
  check('Porte : fermée elle bloque, E l’ouvre, on passe', shut.player.y > 24.3 && opened?.open && !opened.solid && through.player.y < 23.8,
    `fermée y=${shut.player.y.toFixed(2)}, ouverte ${opened?.open}, après y=${through.player.y.toFixed(2)}`);

  // Roof on the wall, then X takes a wall down and gives it back.
  await teleport(24.5, 25.5);
  await api('selectItem', 'thatch_roof');
  await buildAt(24.5, 24.5);
  await page.mouse.move(5, 400);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(shots, '14-construction.png') });
  const roofed = (await api('built')).some((p) => p.type === 'thatch_roof');
  const wallsBefore = (await sv()).items.wood_wall;
  await aimAt(24.5, 24.0);
  const target = (await sv()).dismantle;
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(200);
  const c5 = await sv();
  check('Toit posé sur le mur ; démonter (X) rend la pièce', roofed && target?.type && c5.items[target.type] === (target.type === 'wood_wall' ? wallsBefore + 1 : 1),
    `visé ${target?.type}, murs ${wallsBefore} -> ${c5.items.wood_wall}`);

  // Zoom with the wheel.
  const z0 = (await state()).zoom;
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(200);
  const z1 = (await state()).zoom;
  await page.mouse.wheel(0, 200);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(200);
  const z2 = (await state()).zoom;
  check('Zoom molette', z1 > z0 && z2 < z1, `${z0} -> ${z1} -> ${z2}`);
  await page.keyboard.press('Digit0');

  // Mouse picking: hovering the player's screen point must pick the player's tile.
  await teleport(24.5, 24.5);
  await page.waitForTimeout(600);
  await page.mouse.move(640, 360 - 4);
  await page.waitForTimeout(150);
  const pick = await state();
  check('Sélection de tuile à la souris', pick.mouse.tx === 24 && pick.mouse.ty === 24, `tuile (${pick.mouse.tx}, ${pick.mouse.ty})`);

  // Camera stability: at the desktop window size, the character must stay on the
  // same screen pixel while walking, and the scenery must never step backwards.
  await page.setViewportSize({ width: 1600, height: 870 });
  for (const keys of [['KeyD'], ['KeyS'], ['KeyD', 'KeyS'], ['KeyW', 'KeyA']]) {
    await teleport(24.5, 24.5);
    await page.waitForTimeout(300);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(250);
    const samples = await page.evaluate(() => new Promise((res) => {
      const out = [];
      const f = () => { out.push(window.__PREHISTORIC__.renderProbe()); if (out.length < 40) requestAnimationFrame(f); else res(out); };
      requestAnimationFrame(f);
    }));
    for (const k of keys) await page.keyboard.up(k);
    const spread = (arr) => Math.max(...arr) - Math.min(...arr);
    const px = samples.map((p) => Math.round(p.player.x));
    const py = samples.map((p) => Math.round(p.player.y));
    // The scenery must move by exactly the opposite of the character's own
    // movement, in whole pixels, on every frame (no wobble, no lag).
    const mismatches = (axis) => samples.slice(1).filter((p, i) => {
      const decor = Math.round(p.prop[axis]) - Math.round(samples[i].prop[axis]);
      const self = Math.round(p.playerIso[axis]) - Math.round(samples[i].playerIso[axis]);
      return decor !== -self;
    }).length;
    const moved = Math.round(samples.at(-1).playerIso.x - samples[0].playerIso.x) !== 0
      || Math.round(samples.at(-1).playerIso.y - samples[0].playerIso.y) !== 0;
    const ok = moved && spread(px) === 0 && spread(py) === 0 && mismatches('x') === 0 && mismatches('y') === 0
      && Number.isInteger(samples[0].zoom);
    check(`Caméra stable en marchant (${keys.join('+')})`, ok,
      `zoom x${samples[0].zoom}, joueur ±${spread(px)}/${spread(py)} px, images incohérentes ${mismatches('x')}/${mismatches('y')}`);
  }

  // HiDPI / 4K layout: base zoom follows window height.
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.waitForTimeout(400);
  const k4 = await state();
  check('Zoom de base adapté au 4K', k4.baseZoom === 6, `x${k4.baseZoom}`);
  await page.screenshot({ path: join(shots, '04-4k.png') });

  const st = await state();
  console.log(`FPS mesurés dans le navigateur de test (rendu logiciel) : ${st.fps.toFixed(0)}`);

  // ---- Part 2: procedural worlds ------------------------------------------
  await page.setViewportSize({ width: 1600, height: 870 });
  await page.goto(`${url}?seed=e2e-seed`);
  await page.waitForFunction(() => window.__PREHISTORIC__, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const start = await state();
  check('Monde procédural chargé', start.world.mode === 'procedural' && start.world.seed === 'e2e-seed' && start.world.loadedChunks > 0 && !start.overlapping,
    `départ (${start.player.x}, ${start.player.y}) ${start.tile.terrain}/${start.tile.biome}, ${start.world.loadedChunks} chunks`);
  await page.screenshot({ path: join(shots, '05-monde-depart.png') });

  // Constructions and the bag are saved: build a wall, reload, it is still there.
  await page.evaluate(() => window.__PREHISTORIC__.give('wood_wall', 2));
  await page.evaluate(() => window.__PREHISTORIC__.selectItem('wood_wall'));
  const tx0 = Math.floor(start.player.x), ty0 = Math.floor(start.player.y);
  let wallSpot = null;
  for (const [x, y] of [[tx0 + 0.5, ty0 + 1.05], [tx0 + 0.5, ty0 - 0.95], [tx0 + 1.05, ty0 + 0.5], [tx0 - 0.95, ty0 + 0.5], [tx0 + 0.5, ty0 + 2.05]]) {
    const q = await page.evaluate(([a, b]) => window.__PREHISTORIC__.screenOf(a, b), [x, y]);
    await page.mouse.move(q.x, q.y);
    await page.waitForTimeout(120);
    if ((await state()).survival.preview?.why === null) {
      await page.mouse.click(q.x, q.y);
      await page.waitForTimeout(150);
      wallSpot = (await state()).survival.preview;
      break;
    }
  }
  const builtBefore = await page.evaluate(() => window.__PREHISTORIC__.built());
  await page.reload();
  await page.waitForFunction(() => window.__PREHISTORIC__, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const builtAfter = await page.evaluate(() => window.__PREHISTORIC__.built());
  const reloaded = await state();
  check('Sauvegarde : le mur et le sac restent après rechargement', builtBefore.length === 1 && builtAfter.length === 1 && builtAfter[0].x === builtBefore[0].x && reloaded.survival.items.wood_wall === 1,
    `avant ${builtBefore.length}, après ${builtAfter.length} pièce(s), murs dans le sac ${reloaded.survival.items.wood_wall ?? 0} (${wallSpot ? 'posé' : 'aucune place'})`);
  const sample = () => page.evaluate(() => {
    const out = [];
    for (let y = -40; y < 40; y += 3) for (let x = -40; x < 40; x += 3) out.push(window.__PREHISTORIC__.tileAt(x, y));
    return JSON.stringify(out);
  });
  const sig1 = await sample();

  // Walk (run) a long way: chunks stream in and out, memory stays bounded.
  let maxLoaded = 0, stuckFrames = 0, lastX = null;
  await page.keyboard.down('ShiftLeft');
  for (let leg = 0; leg < 3; leg++) {
    const keys = [['KeyD'], ['KeyS'], ['KeyD', 'KeyS']][leg];
    for (const k of keys) await page.keyboard.down(k);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(300);
      const s1 = await state();
      maxLoaded = Math.max(maxLoaded, s1.world.loadedChunks);
      if (lastX !== null && Math.hypot(s1.player.x - lastX.x, s1.player.y - lastX.y) < 0.05) stuckFrames++;
      lastX = { x: s1.player.x, y: s1.player.y };
    }
    for (const k of keys) await page.keyboard.up(k);
  }
  await page.keyboard.up('ShiftLeft');
  const walked = await state();
  check('Marche longue : chargement et déchargement des chunks', walked.world.unloaded > 0 && maxLoaded <= 40 && !walked.overlapping,
    `générés ${walked.world.generated}, déchargés ${walked.world.unloaded}, max chargés ${maxLoaded}, streaming ${walked.world.streamMs.toFixed(2)} ms/image (bloqué ${stuckFrames}/30 mesures)`);
  await page.screenshot({ path: join(shots, '06-apres-marche.png') });

  // Far teleport: the area is generated immediately and the player lands on its ground height.
  await teleport(5000.5, -3000.5);
  await page.waitForTimeout(300);
  const far = await state();
  check('Téléportation lointaine', far.world.loadedChunks > 0 && far.tile.terrain !== null && Math.abs(far.player.z - far.tile.height * 0.5) < 0.01,
    `${far.tile.terrain}/${far.tile.biome} hauteur ${far.tile.height}`);

  // Look for each biome to take a picture of it.
  const found = {};
  for (let i = 0; i < 60 && Object.keys(found).length < 4; i++) {
    const x = 300 + (i % 8) * 260 + 0.5, y = -900 + Math.floor(i / 8) * 260 + 0.5;
    await teleport(x, y);
    const s2 = await state();
    if (s2.tile.biome && !found[s2.tile.biome] && !['water', 'shallow_water'].includes(s2.tile.terrain)) {
      found[s2.tile.biome] = true;
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(shots, `07-biome-${s2.tile.biome}.png`) });
    }
  }
  check('Les 4 biomes trouvés en jeu', Object.keys(found).length === 4, Object.keys(found).join(', '));

  // Same seed after a reload: identical terrain (back at the start, where the save will put the player).
  await teleport(start.player.x, start.player.y);
  await page.reload();
  await page.waitForFunction(() => window.__PREHISTORIC__, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const sig2 = await sample();
  check('Même seed = même monde après rechargement', sig1 === sig2 && sig1.includes('ground'));

  // F9: a new random world, then M hides the minimap without errors.
  await page.keyboard.press('F9');
  await page.waitForTimeout(1200);
  const nw = await state();
  check('Nouveau monde (F9)', nw.world.seed !== 'e2e-seed' && nw.world.loadedChunks > 0 && !nw.overlapping, `seed ${nw.world.seed}`);
  await page.screenshot({ path: join(shots, '08-nouveau-monde.png') });
  await page.keyboard.press('F7');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(shots, '09-bordures-chunks.png') });
  await page.keyboard.press('F7');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(300);

  check('Aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
process.exit(failed ? 1 : 0);
