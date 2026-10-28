import { createRng } from '../core/random.js';

/**
 * Hand-built 48x48 test area (open with `?map=test`). It exercises every case
 * the movement, collision, depth and relief systems must handle: open ground,
 * a pond, trees to walk behind, rocks, a walled enclosure with a doorway, a
 * corridor narrower than the player and a two-step plateau. Everything
 * outside the area is deep water. Used by automated tests and for debugging.
 */
export const TEST_MAP_SIZE = 48;
export const TEST_MAP_SPAWN = { x: 24.5, y: 24.5 };
const T = { grass: 0, dirt: 1, sand: 2, water: 3, stone: 4 };

export function buildTestMap(seed = 1337) {
  const n = TEST_MAP_SIZE;
  const ground = new Uint8Array(n * n);
  const height = new Uint8Array(n * n);
  const set = (x, y, g) => { ground[y * n + x] = g; };
  const rng = createRng(seed);

  // Pond with a sandy shore.
  const pond = { x: 12, y: 30, r: 5.2 };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - pond.x, y + 0.5 - pond.y);
      if (d < pond.r) set(x, y, T.water);
      else if (d < pond.r + 1.6) set(x, y, T.sand);
    }
  }
  // Dirt path crossing the map.
  for (let i = 0; i < n; i++) {
    const py = Math.round(22 + Math.sin(i / 6) * 2);
    set(i, py, T.dirt);
    set(i, py + 1, T.dirt);
  }
  // Stone plaza in front of the enclosure.
  for (let y = 31; y < 35; y++) for (let x = 28; x < 36; x++) set(x, y, T.stone);
  // Plateau: one step up, then a second step in its middle.
  for (let y = 4; y < 12; y++) for (let x = 28; x < 38; x++) height[y * n + x] = 1;
  for (let y = 6; y < 10; y++) for (let x = 31; x < 35; x++) height[y * n + x] = 2;

  const props = [];
  const occupied = new Set();
  const place = (type, x, y) => {
    const k = `${x},${y}`;
    if (occupied.has(k) || ground[y * n + x] === T.water) return;
    occupied.add(k);
    props.push({ id: `p${x}_${y}`, type, tx: x, ty: y, x: x + 0.5, y: y + 0.5, h: height[y * n + x] });
  };
  for (let y = 21; y < 28; y++) for (let x = 21; x < 28; x++) occupied.add(`${x},${y}`); // spawn kept clear
  for (let y = 3; y < 13; y++) for (let x = 27; x < 39; x++) occupied.add(`${x},${y}`); // plateau kept clear

  // Enclosure: walls along x on rows 36 and 43, along y on columns 30 and 37.
  for (let x = 30; x <= 37; x++) {
    if (x !== 33 && x !== 34) place('wall_x', x, 36); // doorway on the north side
    place('wall_x', x, 43);
  }
  for (let y = 37; y <= 42; y++) {
    place('wall_y', 30, y);
    place('wall_y', 37, y);
  }
  // Narrow corridor: two boulders one tile apart let the player through, touching ones do not.
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
  return { ground, height, props };
}

/** Serves the test map through the same interface as ProceduralGenerator. */
export class TestMapGenerator {
  constructor(chunkSize) {
    this.size = chunkSize;
    this.map = buildTestMap();
    this.levels = 2;
    this.propsByChunk = new Map();
    for (const p of this.map.props) {
      const k = `${Math.floor(p.tx / chunkSize)},${Math.floor(p.ty / chunkSize)}`;
      if (!this.propsByChunk.has(k)) this.propsByChunk.set(k, []);
      this.propsByChunk.get(k).push(p);
    }
  }

  inside(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < TEST_MAP_SIZE && ty < TEST_MAP_SIZE;
  }

  heightAt(tx, ty) {
    return this.inside(tx, ty) ? this.map.height[ty * TEST_MAP_SIZE + tx] : 0;
  }

  generateChunk(cx, cy) {
    const n = this.size;
    const ground = new Uint8Array(n * n);
    const height = new Uint8Array(n * n);
    const biome = new Uint8Array(n * n).fill(1);
    for (let ly = 0; ly < n; ly++) {
      for (let lx = 0; lx < n; lx++) {
        const tx = cx * n + lx, ty = cy * n + ly;
        const i = ly * n + lx;
        if (this.inside(tx, ty)) {
          ground[i] = this.map.ground[ty * TEST_MAP_SIZE + tx];
          height[i] = this.map.height[ty * TEST_MAP_SIZE + tx];
        } else {
          ground[i] = T.water;
        }
      }
    }
    const props = (this.propsByChunk.get(`${cx},${cy}`) ?? []).map((p) => ({ ...p }));
    return { cx, cy, size: n, ground, height, biome, props };
  }

  findSpawn() {
    return { ...TEST_MAP_SPAWN };
  }
}
