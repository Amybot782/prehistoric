import { GENERATORS } from './placeholders.js';

/**
 * Single list of every texture the game uses. Systems refer to textures by
 * key only. Each entry knows how to generate a placeholder; an override in
 * public/assets/manifest.json can point the same key to a real image file
 * (or sprite sheet) instead. Anything missing or failing to load falls back
 * to the placeholder, and the problem is logged.
 */
export function buildCatalog(terrainTypes, items = {}) {
  const entries = [
    { key: 'player', gen: 'playerSheet', folder: 'characters' },
    { key: 'shadow', gen: 'shadow', folder: 'effects' },
    { key: 'ui_tile_cursor', gen: 'tileCursor', folder: 'ui' },
    { key: 'prop_tree', gen: 'tree', folder: 'vegetation' },
    { key: 'prop_pine', gen: 'pine', folder: 'vegetation' },
    { key: 'prop_bush', gen: 'bush', folder: 'vegetation' },
    { key: 'prop_berry_bush', gen: 'berryBush', folder: 'vegetation' },
    { key: 'prop_birch', gen: 'birch', folder: 'vegetation' },
    { key: 'prop_swamp_tree', gen: 'swampTree', folder: 'vegetation' },
    { key: 'prop_tall_grass', gen: 'tallGrass', folder: 'vegetation' },
    { key: 'prop_reeds', gen: 'reeds', folder: 'vegetation' },
    { key: 'prop_flowers', gen: 'flowers', folder: 'vegetation' },
    { key: 'prop_outcrop', gen: 'outcrop', folder: 'terrain' },
    { key: 'prop_flint', gen: 'flint', folder: 'terrain' },
    { key: 'prop_rock', gen: 'rock', folder: 'terrain' },
    { key: 'prop_boulder', gen: 'boulder', folder: 'terrain' },
    { key: 'prop_stump', gen: 'stump', folder: 'vegetation' },
    { key: 'prop_branch', gen: 'branch', folder: 'vegetation' },
    { key: 'prop_mushroom', gen: 'mushroomProp', folder: 'vegetation' },
    { key: 'prop_pebble', gen: 'pebble', folder: 'terrain' },
    { key: 'prop_wall_x', gen: 'wallX', folder: 'buildings' },
    { key: 'prop_wall_y', gen: 'wallY', folder: 'buildings' },
  ];
  for (const t of terrainTypes) {
    for (let v = 0; v < TERRAIN_VARIANTS; v++) {
      entries.push({ key: terrainTextureKey(t.key, v), gen: 'groundTile', args: [t.colors, v], folder: 'terrain' });
    }
    for (const side of ['left', 'right']) {
      entries.push({ key: faceTextureKey(t.key, side), gen: 'cliffFace', args: [t.face, side], folder: 'terrain' });
    }
  }
  for (const [id, def] of Object.entries(items)) {
    if (id.startsWith('_')) continue;
    entries.push({ key: itemTextureKey(id), gen: 'itemIcon', args: [def.icon?.shape, def.icon?.colors ?? ['#ff00ff', '#ff00ff']], folder: 'ui' });
  }
  return entries;
}

/** Inventory icon of an item (also drawn on the ground when dropped). */
export function itemTextureKey(item) {
  return `item_${item}`;
}

export const TERRAIN_VARIANTS = 3;

/** Side face of a raised tile ('left' = +y edge, 'right' = +x edge). */
export function faceTextureKey(terrainKey, side) {
  return `face_${terrainKey}_${side}`;
}

export function terrainTextureKey(terrainKey, variant) {
  return `tile_${terrainKey}_${variant}`;
}

/** Runs the placeholder generator of a catalog entry. */
export function generatePlaceholder(entry) {
  const fn = GENERATORS[entry.gen];
  if (!fn) throw new Error(`Générateur inconnu : ${entry.gen}`);
  return fn(...(entry.args ?? []));
}
