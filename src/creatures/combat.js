/**
 * Combat geometry shared by the player and the creatures: line of sight
 * through the collision world and melee strike arcs. Pure functions.
 */

/** True when nothing solid (wall, closed door, tree, rock; water does not block the view) lies between two points. */
export function lineClear(collisions, x0, y0, x1, y1, step = 0.2) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / step);
  // The end points stand on bodies, not on obstacles: only the stretch in between is tested.
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (collisions.overlaps(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 0.04, true)) return false;
  }
  return true;
}

/**
 * Bodies a melee strike from (x, y) towards (dirX, dirY) touches: within
 * `reach` of the attacker's edge, inside the half angle `arc` (radians), and
 * not behind an obstacle. Sorted nearest first.
 */
export function strikeTargets(attacker, dirX, dirY, reach, arc, bodies, collisions) {
  const cos = Math.cos(arc);
  const hits = [];
  for (const b of bodies) {
    if (b === attacker || b.dead) continue;
    const dx = b.x - attacker.x, dy = b.y - attacker.y;
    const d = Math.hypot(dx, dy);
    if (d - b.radius - attacker.radius > reach) continue;
    if (d > 1e-6 && (dx * dirX + dy * dirY) / d < cos && d > attacker.radius + b.radius + 0.05) continue;
    if (!lineClear(collisions, attacker.x, attacker.y, b.x, b.y)) continue;
    hits.push([d, b]);
  }
  return hits.sort((a, b) => a[0] - b[0]).map((h) => h[1]);
}
