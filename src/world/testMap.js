import { createRng } from '../core/random.js';

/**
 * Hand-built test area for phase 1: it exercises every case the movement,
 * collision and depth systems must handle (open ground, a pond, trees to walk
 * behind, rocks, a walled enclosure with a doorway, a corridor narrower than
 * the player). Procedural chunks replace it in phase 2.
 */
export const TEST_MAP_SIZE = 48;
export const TEST_MAP_SPAWN = { x: 24.5, y: 24.5 };

export function populateTestMap(world, seed = 1337) {
  const rng = createRng(seed);
  const T = { grass: 0, dirt: 1, sand: 2, water: 3, stone: 4 };
  const n = world.width;

  // Pond with a sandy shore.
  const pond = { x: 12, y: 30, r: 5.2 };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - pond.x, y + 0.5 - pond.y);
      if (d < pond.r) world.setTile(x, y, T.water);
      else if (d < pond.r + 1.6) world.setTile(x, y, T.sand);
    }
  }
  // Dirt path crossing the map.
  for (let i = 0; i < n; i++) {
    const py = Math.round(22 + Math.sin(i / 6) * 2);
    world.setTile(i, py, T.dirt);
    world.setTile(i, py + 1, T.dirt);
  }
  // Stone plaza in front of the enclosure.
  for (let y = 31; y < 35; y++) for (let x = 28; x < 36; x++) world.setTile(x, y, T.stone);

  world.buildTerrainColliders();

  const occupied = new Set();
  const mark = (x, y) => occupied.add(`${x},${y}`);
  const free = (x, y) => !occupied.has(`${x},${y}`) && world.tileAt(x, y) !== T.water;
  const place = (type, x, y) => {
    if (!free(x, y)) return null;
    mark(x, y);
    return world.addProp(type, x, y);
  };

  // Keep the spawn area clear.
  for (let y = 21; y < 28; y++) for (let x = 21; x < 28; x++) mark(x, y);

  // Enclosure: walls along x on rows 36 and 43, along y on columns 30 and 37.
  for (let x = 30; x <= 37; x++) {
    if (x !== 33 && x !== 34) place('wall_x', x, 36); // doorway on the north side
    place('wall_x', x, 43);
  }
  for (let y = 37; y <= 42; y++) {
    place('wall_y', 30, y);
    place('wall_y', 37, y);
  }
  // Narrow corridor: two boulders one tile apart is wide enough, touching ones are not.
  place('boulder', 40, 18);
  place('boulder', 42, 18);
  place('boulder', 40, 14);
  place('boulder', 41, 14);

  // Forest in the north-west, scattered rocks and bushes elsewhere.
  for (let i = 0; i < 70; i++) {
    const x = rng.int(2, 20), y = rng.int(2, 18);
    place(rng.next() < 0.6 ? 'tree' : 'pine', x, y);
  }
  for (let i = 0; i < 25; i++) place('tree', rng.int(2, n - 3), rng.int(2, n - 3));
  for (let i = 0; i < 20; i++) place('rock', rng.int(2, n - 3), rng.int(2, n - 3));
  for (let i = 0; i < 35; i++) place('bush', rng.int(2, n - 3), rng.int(2, n - 3));
}
