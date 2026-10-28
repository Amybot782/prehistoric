/**
 * Instant crafting (no timer, by design). A recipe (src/data/recipes.json)
 * turns resources into an item when the inventory holds the whole cost and,
 * for some recipes, a workshop ("station": workbench, campfire...) has been
 * built nearby. No Phaser here.
 */

/** Items still missing for a recipe, as { item: count }; empty when affordable. */
export function missingFor(recipe, inventory) {
  const out = {};
  for (const [item, n] of Object.entries(recipe.cost)) {
    const have = inventory.count(item);
    if (have < n) out[item] = n - have;
  }
  return out;
}

/** Stations built within `range` tiles of (x, y). */
export function stationsNear(world, x, y, range) {
  const found = new Set();
  for (const p of world.propsNear(x, y, range)) if (p.def.build?.station) found.add(p.def.build.station);
  return found;
}

/** Why a recipe cannot be crafted now (i18n key), or null. */
export function craftBlocker(recipe, inventory, stations) {
  if (recipe.station && !stations.has(recipe.station)) return 'craft.needStation';
  if (Object.keys(missingFor(recipe, inventory)).length) return 'craft.missing';
  return null;
}

/** Takes the cost out of the inventory and returns the crafted stack (the caller stores it). */
export function consumeCost(recipe, inventory) {
  for (const [item, n] of Object.entries(recipe.cost)) inventory.remove(item, n);
  return { item: recipe.id, count: recipe.count ?? 1 };
}
