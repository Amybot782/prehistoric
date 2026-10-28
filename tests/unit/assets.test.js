import { describe, it, expect } from 'vitest';
import { buildCatalog, generatePlaceholder } from '../../src/assets/assetCatalog.js';
import { FACING_FRAMES } from '../../src/assets/placeholders.js';
import terrain from '../../src/data/terrain.json';
import props from '../../src/data/props.json';

describe('catalogue d’assets', () => {
  const catalog = buildCatalog(terrain.types);

  it('chaque objet du décor a une texture déclarée', () => {
    const keys = new Set(catalog.map((e) => e.key));
    for (const [name, def] of Object.entries(props)) {
      if (name.startsWith('_')) continue;
      expect(keys.has(def.texture), def.texture).toBe(true);
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
