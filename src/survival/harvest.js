/**
 * Harvesting rules, independent of input and rendering.
 *
 * Every harvestable object has harvest points (`harvest.hp` in props.json,
 * the number of bare-hand hits). Each hit removes `power` points and gives
 * the share of the object's total yield that corresponds to the points
 * removed, so the total obtained never depends on the tool, only the number
 * of hits does. The remaining points are stored in the world, so a half-cut
 * tree stays half-cut.
 */

/** Items given when going from `before` to `after` harvest points. */
export function yieldBetween(yields, hp, before, after) {
  const out = {};
  for (const [item, total] of Object.entries(yields ?? {})) {
    const given = (left) => Math.floor((total * (hp - left)) / hp + 1e-9);
    const n = given(after) - given(before);
    if (n > 0) out[item] = n;
  }
  return out;
}

/**
 * Hits an object. Returns `{ gained, depleted, left }` or null when the
 * object cannot be harvested. Removes the object from the world when its
 * points reach zero (the world puts a stump and schedules regrowth).
 */
export function hitProp(world, prop, power) {
  const h = prop.def.harvest;
  if (!h) return null;
  if (prop.type === 'dropped') {
    world.removeProp(prop);
    return { gained: { [prop.item]: prop.count }, depleted: true, left: 0 };
  }
  const before = prop.hpLeft;
  let after = before - power;
  if (after < 1e-6) after = 0; // 8 - 5 x 1.6 must be exactly zero
  const gained = yieldBetween(prop.def.yields, h.hp, before, after);
  if (after <= 0) {
    prop.harvested = true;
    world.removeProp(prop);
  } else {
    world.damageProp(prop, after);
  }
  return { gained, depleted: after <= 0, left: after / h.hp };
}

/**
 * Best object to act on: within reach, preferring what is in front of the
 * character (facing direction) and, when given, what the mouse points at.
 */
export function pickTarget(world, x, y, dirX, dirY, reach, hovered = null, scratch = []) {
  if (hovered && hovered.def?.harvest && Math.hypot(hovered.x - x, hovered.y - y) <= reach + 0.35) return hovered;
  let best = null;
  let bestScore = Infinity;
  for (const p of world.propsNear(x, y, reach + 0.5, scratch)) {
    if (!p.def.harvest) continue;
    const dx = p.x - x, dy = p.y - y;
    const d = Math.hypot(dx, dy);
    const edge = d - (p.def.collider?.r ?? p.def.collider?.hw ?? 0);
    if (edge > reach) continue;
    const facing = d > 1e-6 ? (dx * dirX + dy * dirY) / d : 1;
    if (facing < -0.2 && d > 0.45) continue; // behind the character
    const score = d - facing * 0.6;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Water the character can drink from: under the feet or just in front. */
export function waterInFront(world, x, y, dirX, dirY) {
  for (const k of [0, 0.7, 1.1]) {
    const tx = Math.floor(x + dirX * k), ty = Math.floor(y + dirY * k);
    const g = world.tileAt(tx, ty);
    if (g < 0) continue;
    const key = world.terrainTypes[g].key;
    if (key === 'water' || key === 'shallow_water') return { tx, ty };
  }
  return null;
}
