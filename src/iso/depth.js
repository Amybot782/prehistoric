/**
 * Depth sorting for isometric objects.
 *
 * Objects standing on the ground are sorted by the "x + y" of their footprint
 * centre in world space (the further down-screen, the closer to the viewer).
 * This is exact for footprints that do not overlap and are at most one tile
 * wide, which is why multi-tile structures (long walls, large buildings) are
 * split into one-tile pieces. The building system (phase 4) follows that rule.
 *
 * Layers keep ground, objects and overlays apart regardless of the sort key.
 */
export const DepthLayer = Object.freeze({
  GROUND: 0,
  GROUND_DECAL: 1_000_000,
  OBJECTS: 2_000_000,
  OVERLAY: 9_000_000,
});

/** Range that object sort keys must stay within (in tile units * scale). */
const KEY_SCALE = 100;

/**
 * Depth for an object whose footprint centre is (cx, cy) at height z.
 * `bias` breaks ties between objects on the same spot (e.g. a decoration
 * placed on a floor tile): larger bias draws later.
 */
export function objectDepth(cx, cy, z = 0, bias = 0) {
  return DepthLayer.OBJECTS + (cx + cy) * KEY_SCALE + z * 0.5 + bias * 0.01;
}

/**
 * Reference ordering for two non-overlapping axis-aligned footprints:
 * returns true when `a` must be drawn before (behind) `b`.
 * Used by tests to validate `objectDepth`, and available for future
 * topological sorting of large footprints.
 */
export function isBehind(a, b) {
  if (a.maxX <= b.minX) return true;
  if (b.maxX <= a.minX) return false;
  if (a.maxY <= b.minY) return true;
  if (b.maxY <= a.minY) return false;
  // Overlapping footprints: fall back to the centre key.
  return (a.minX + a.maxX + a.minY + a.maxY) < (b.minX + b.maxX + b.minY + b.maxY);
}

/**
 * Depth for a moving object, corrected against the static objects around it.
 *
 * The centre rule alone fails next to thin pieces such as walls: a character
 * standing just north of an east-west wall can have a larger x + y than the
 * wall piece next to it and would be drawn in front of it. Here every nearby
 * footprint that must be in front of (or behind) the mover narrows the
 * allowed depth interval, using the exact `isBehind` test, and the depth is
 * clamped into that interval.
 *
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} box mover footprint
 * @param {number} baseDepth depth from the centre rule
 * @param {Array<{box:object, depth:number}>} neighbours nearby static footprints
 */
export function resolveDynamicDepth(box, baseDepth, neighbours) {
  let lo = -Infinity;
  let hi = Infinity;
  for (const n of neighbours) {
    if (isBehind(box, n.box)) hi = Math.min(hi, n.depth);
    else lo = Math.max(lo, n.depth);
  }
  if (lo >= hi) return baseDepth; // contradictory constraints: keep the centre rule
  const eps = 0.01;
  if (baseDepth <= lo) return Math.min(lo + eps, (lo + hi) / 2);
  if (baseDepth >= hi) return Math.max(hi - eps, (lo + hi) / 2);
  return baseDepth;
}
