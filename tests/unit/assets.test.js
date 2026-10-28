import { describe, it, expect } from 'vitest';
import { buildCatalog, generatePlaceholder, pickVariant, terrainTextureKey } from '../../src/assets/assetCatalog.js';
import { FACING_FRAMES } from '../../src/assets/placeholders.js';
import terrain from '../../src/data/terrain.json';
import props from '../../src/data/props.json';
import items from '../../src/data/items.json';

describe('catalogue d’assets', () => {
  const catalog = buildCatalog(terrain.types, items);

  it('chaque objet du décor a une texture déclarée', () => {
    const keys = new Set(catalog.map((e) => e.key));
    for (const [name, def] of Object.entries(props)) {
      if (name.startsWith('_') || name === 'dropped') continue; // dropped items use their item icon
      const edge = def.build?.slot === 'edge';
      const needed = edge ? [`${def.texture}_x`, `${def.texture}_y`] : [def.texture];
      if (def.build?.door) needed.push(`${def.texture}_x_open`, `${def.texture}_y_open`);
      for (const k of needed) expect(keys.has(k), k).toBe(true);
    }
  });

  it('chaque graphisme provisoire est généré, non vide, avec une ancre valide', () => {
    for (const entry of catalog) {
      const r = generatePlaceholder(entry);
      expect(r.pc.width).toBeGreaterThan(0);
      let opaque = 0;
      for (let i = 3; i < r.pc.data.length; i += 4) if (r.pc.data[i] > 0) opaque++;
      expect(opaque, entry.key).toBeGreaterThan(0);
      expect(r.originX).toBeGreaterThanOrEqual(0);
      expect(r.originX).toBeLessThanOrEqual(1);
      expect(r.originY).toBeGreaterThanOrEqual(0);
      expect(r.originY).toBeLessThanOrEqual(1);
    }
  });

  it('la planche du joueur couvre les 8 directions', () => {
    const sheet = generatePlaceholder(catalog.find((e) => e.key === 'player'));
    const rows = sheet.pc.height / sheet.frameHeight;
    expect(FACING_FRAMES).toHaveLength(8);
    for (const [row] of FACING_FRAMES) expect(row).toBeLessThan(rows);
  });
});

describe('variantes de sol', () => {
  it('suit les fréquences et chaque variante a une texture', () => {
    const grass = terrain.types.find((t) => t.key === 'grass');
    const counts = Array(grass.variants.length).fill(0);
    for (let i = 0; i < 1000; i++) counts[pickVariant(grass, i / 1000)]++;
    expect(counts[0]).toBeGreaterThan(counts[1] * 4); // herbe simple fréquente, fleurie rare
    expect(pickVariant({ key: 'x' }, 0.99)).toBe(2); // 3 variantes par défaut
    const keys = new Set(buildCatalog(terrain.types).map((e) => e.key));
    grass.variants.forEach((_, v) => expect(keys.has(terrainTextureKey('grass', v))).toBe(true));
  });
});
