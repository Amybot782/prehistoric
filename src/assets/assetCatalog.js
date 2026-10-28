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
    { key: 'prop_wood_floor', gen: 'woodFloor', folder: 'buildings' },
    { key: 'prop_stone_floor', gen: 'stoneFloor', folder: 'buildings' },
    { key: 'prop_wood_wall_x', gen: 'woodWallX', folder: 'buildings' },
    { key: 'prop_wood_wall_y', gen: 'woodWallY', folder: 'buildings' },
    { key: 'prop_wood_door_x', gen: 'woodDoorX', folder: 'buildings' },
    { key: 'prop_wood_door_y', gen: 'woodDoorY', folder: 'buildings' },
    { key: 'prop_wood_door_x_open', gen: 'woodDoorXOpen', folder: 'buildings' },
    { key: 'prop_wood_door_y_open', gen: 'woodDoorYOpen', folder: 'buildings' },
    { key: 'prop_thatch_roof', gen: 'thatchRoof', folder: 'buildings' },
    { key: 'prop_workbench', gen: 'workbench', folder: 'buildings' },
    { key: 'prop_campfire', gen: 'campfire', folder: 'buildings' },
    { key: 'prop_torch', gen: 'torch', folder: 'buildings' },
    { key: 'prop_fiber_mat', gen: 'fiberMat', folder: 'buildings' },
    { key: 'prop_standing_stone', gen: 'standingStone', folder: 'buildings' },
  ];
  for (const t of terrainTypes) {
    for (let v = 0; v < variantWeights(t).length; v++) {
      entries.push({ key: terrainTextureKey(t.key, v), gen: 'groundTile', args: [t.colors, v], folder: 'terrain' });
    }
    for (const side of ['left', 'right']) {
      entries.push({ key: faceTextureKey(t.key, side), gen: 'cliffFace', args: [t.face, side], folder: 'terrain' });
    }
  }
  for (const [id, def] of Object.entries(items)) {
    if (id.startsWith('_')) continue;
    entries.push(def.icon?.piece
      ? { key: itemTextureKey(id), gen: 'pieceIcon', args: [def.icon.piece], folder: 'ui' }
      : { key: itemTextureKey(id), gen: 'itemIcon', args: [def.icon?.shape, def.icon?.colors ?? ['#ff00ff', '#ff00ff']], folder: 'ui' });
  }
  return entries;
}

/** Inventory icon of an item (also drawn on the ground when dropped). */
export function itemTextureKey(item) {
  return `item_${item}`;
}

export const TERRAIN_VARIANTS = 3;

/** Relative frequency of each ground variant ('variants' in terrain.json, default 3 equal). */
export function variantWeights(type) {
  return type.variants ?? Array(TERRAIN_VARIANTS).fill(1);
}

/** Variant for a stable random value r in [0, 1), following the weights. */
export function pickVariant(type, r) {
  const w = variantWeights(type);
  let x = r * w.reduce((a, b) => a + b, 0);
  for (let v = 0; v < w.length; v++) if ((x -= w[v]) < 0) return v;
  return w.length - 1;
}

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
