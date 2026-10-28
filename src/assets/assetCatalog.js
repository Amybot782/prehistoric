import { GENERATORS } from './placeholders.js';

/**
 * Single list of every texture the game uses. Systems refer to textures by
 * key only. Each entry knows how to generate a placeholder; an override in
 * public/assets/manifest.json can point the same key to a real image file
 * (or sprite sheet) instead. Anything missing or failing to load falls back
 * to the placeholder, and the problem is logged.
 */
export function buildCatalog(terrainTypes) {
  const entries = [
    { key: 'player', gen: 'playerSheet', folder: 'characters' },
    { key: 'shadow', gen: 'shadow', folder: 'effects' },
    { key: 'ui_tile_cursor', gen: 'tileCursor', folder: 'ui' },
    { key: 'prop_tree', gen: 'tree', folder: 'vegetation' },
    { key: 'prop_pine', gen: 'pine', folder: 'vegetation' },
    { key: 'prop_bush', gen: 'bush', folder: 'vegetation' },
    { key: 'prop_rock', gen: 'rock', folder: 'terrain' },
    { key: 'prop_boulder', gen: 'boulder', folder: 'terrain' },
    { key: 'prop_wall_x', gen: 'wallX', folder: 'buildings' },
    { key: 'prop_wall_y', gen: 'wallY', folder: 'buildings' },
  ];
  for (const t of terrainTypes) {
    for (let v = 0; v < TERRAIN_VARIANTS; v++) {
      entries.push({ key: terrainTextureKey(t.key, v), gen: 'groundTile', args: [t.colors, v], folder: 'terrain' });
    }
  }
  return entries;
}

export const TERRAIN_VARIANTS = 3;

export function terrainTextureKey(terrainKey, variant) {
  return `tile_${terrainKey}_${variant}`;
}

/** Runs the placeholder generator of a catalog entry. */
export function generatePlaceholder(entry) {
  const fn = GENERATORS[entry.gen];
  if (!fn) throw new Error(`Générateur inconnu : ${entry.gen}`);
  return fn(...(entry.args ?? []));
}
