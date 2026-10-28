/**
 * End-to-end smoke test: serves the production build, opens it in Chromium
 * (Playwright) and drives the game with real keyboard and mouse events.
 * Checks movement in each direction, running, collisions with water, walls
 * and trees, zoom and the absence of runtime errors. Screenshots are written
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
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
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

  check('Aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  const st = await state();
  console.log(`FPS mesurés dans le navigateur de test (rendu logiciel) : ${st.fps.toFixed(0)}`);
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
process.exit(failed ? 1 : 0);
