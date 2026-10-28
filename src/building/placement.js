import { footprint, shapeBounds, shapesOverlap, circleVsShape } from '../physics/shapes.js';

/**
 * Rules for building, piece by piece, on the tile grid. No Phaser here.
 *
 * Each piece (props.json, `build.slot`) takes one slot:
 *   floor  - the ground of a tile (floors, foundations),
 *   object - the centre of a tile (workbench, campfire, decorations),
 *   roof   - above a tile,
 *   edge   - one side of a tile (walls, doors). An edge is shared by the two
 *            tiles it separates, so walls of neighbouring rooms never double.
 * A slot holds one piece; pieces of different slots can share a tile.
 * Edge pieces lying along world x are 'x' (the north/south sides of a tile),
 * along y are 'y'. Other pieces use `rot` 'y' for a quarter turn.
 */
const SLOT_LETTER = { floor: 'f', object: 'o', roof: 'r', edge: 'e' };
const WATER = new Set(['water', 'shallow_water']);

export function slotKey(slot, x, y) {
  return slot === 'edge' ? `e:${x},${y}` : `${SLOT_LETTER[slot]}:${Math.floor(x)},${Math.floor(y)}`;
}

/** Edge midpoints of tile (tx, ty), with their orientation. */
function edgesOf(tx, ty) {
  return [
    { x: tx + 0.5, y: ty, rot: 'x' }, // north
    { x: tx + 0.5, y: ty + 1, rot: 'x' }, // south
    { x: tx, y: ty + 0.5, rot: 'y' }, // west
    { x: tx + 1, y: ty + 0.5, rot: 'y' }, // east
  ];
}

/**
 * Where a piece would go for a world point (the mouse on the ground).
 * Edge pieces take the side of the tile closest to the point.
 */
export function spotAt(def, wx, wy, rot = 'x') {
  const slot = def.build.slot;
  const tx = Math.floor(wx), ty = Math.floor(wy);
  if (slot !== 'edge') return { slot, x: tx + 0.5, y: ty + 0.5, rot, key: slotKey(slot, wx, wy) };
  const fx = wx - tx, fy = wy - ty;
  const d = [fy, 1 - fy, fx, 1 - fx];
  const e = edgesOf(tx, ty)[d.indexOf(Math.min(...d))];
  return { slot, ...e, key: slotKey('edge', e.x, e.y) };
}

/** Tiles a piece stands on: one, or the two tiles on each side of an edge. */
export function tilesOf(spot) {
  if (spot.slot !== 'edge') return [[Math.floor(spot.x), Math.floor(spot.y)]];
  return spot.rot === 'x'
    ? [[Math.floor(spot.x), spot.y - 1], [Math.floor(spot.x), spot.y]]
    : [[spot.x - 1, Math.floor(spot.y)], [spot.x, Math.floor(spot.y)]];
}

/** Collision shape of a piece at a spot, or null for pieces one walks over. */
export function pieceShape(def, spot) {
  return def.collider ? footprint(def.collider, spot.x, spot.y, spot.rot === 'y') : null;
}

/**
 * Why a piece cannot be placed (an i18n key), or null when it can.
 * `from` is the builder's position, `reach` the building distance.
 */
export function checkPlacement(world, def, spot, from, reach) {
  if (Math.hypot(spot.x - from.x, spot.y - from.y) > reach) return 'build.tooFar';
  const tiles = tilesOf(spot);
  for (const [tx, ty] of tiles) {
    const g = world.tileAt(tx, ty);
    if (g < 0) return 'build.tooFar';
    const type = world.terrainTypes[g];
    if (type.solid || WATER.has(type.key)) return 'build.water';
  }
  if (tiles.length === 2 && world.heightAt(...tiles[0]) !== world.heightAt(...tiles[1])) return 'build.notFlat';
  if (world.builtAt(spot.key)) return 'build.occupied';

  if (spot.slot === 'object' || spot.slot === 'floor') {
    const [tx, ty] = tiles[0];
    for (const p of world.propsNear(spot.x, spot.y, 0.75)) {
      if (p.built || p.tx !== tx || p.ty !== ty) continue;
      // Decorations need an empty tile; floors only need it free of solid things.
      if (spot.slot === 'object' ? p.type !== 'stump' : p.collider) return 'build.occupied';
    }
  }
  if (spot.slot === 'roof' && !hasRoofSupport(world, spot)) return 'build.noSupport';

  const shape = pieceShape(def, spot);
  if (shape) {
    const hit = {};
    for (const e of world.entities) {
      if (circleVsShape(e.x, e.y, e.radius, shape, hit)) return 'build.blocked';
    }
    const b = shapeBounds(shape);
    for (const c of world.collisions.hash.query(b.minX, b.minY, b.maxX, b.maxY, [])) {
      if (c.solid === false || !c.owner?.def) continue;
      // Walls meet other pieces at corners: only natural objects get in the way.
      if (c.owner.built) continue;
      if (shapesOverlap(shape, c.shape, hit)) return 'build.blocked';
    }
  }
  return null;
}

/** A roof rests on a wall or door on one of its sides, or on a neighbouring roof. */
export function hasRoofSupport(world, spot) {
  const tx = Math.floor(spot.x), ty = Math.floor(spot.y);
  if (edgesOf(tx, ty).some((e) => world.builtAt(slotKey('edge', e.x, e.y)))) return true;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => world.builtAt(slotKey('roof', tx + dx, ty + dy)));
}
