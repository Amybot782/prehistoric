import { describe, it, expect } from 'vitest';
import { objectDepth, isBehind, DepthLayer } from '../../src/iso/depth.js';

const box = (cx, cy, hw, hh) => ({ minX: cx - hw, maxX: cx + hw, minY: cy - hh, maxY: cy + hh });

describe('tri de profondeur', () => {
  it('place les objets au-dessus du sol et sous les surcouches', () => {
    const d = objectDepth(500, 500);
    expect(d).toBeGreaterThan(DepthLayer.GROUND_DECAL);
    expect(d).toBeLessThan(DepthLayer.OVERLAY);
  });

  it('dessine plus tard ce qui est plus bas à l’écran', () => {
    expect(objectDepth(2.5, 2.5)).toBeGreaterThan(objectDepth(1.5, 2.5));
    expect(objectDepth(1.5, 3.5)).toBeGreaterThan(objectDepth(1.5, 2.5));
  });

  it('concorde avec l’ordre de référence pour des empreintes voisines d’une tuile', () => {
    const tiles = [];
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) tiles.push(box(x + 0.5, y + 0.5, 0.5, 0.5));
    for (const a of tiles) {
      for (const b of tiles) {
        if (a === b) continue;
        const adjacent = Math.abs(a.minX - b.minX) <= 1 && Math.abs(a.minY - b.minY) <= 1;
        if (!adjacent) continue;
        const da = objectDepth((a.minX + a.maxX) / 2, (a.minY + a.maxY) / 2);
        const db = objectDepth((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
        if (da === db) continue; // diagonales opposées : aucun chevauchement à l’écran
        expect(da < db).toBe(isBehind(a, b));
      }
    }
  });

  it('un personnage devant ou derrière un mur fin est bien ordonné', () => {
    const wallDepth = objectDepth(5.5, 5.5);
    expect(objectDepth(5.5, 5.1)).toBeLessThan(wallDepth); // derrière (nord)
    expect(objectDepth(5.5, 5.95)).toBeGreaterThan(wallDepth); // devant (sud)
  });
});

describe('profondeur dynamique', () => {
  it('un personnage juste au nord d’un mur est-ouest reste derrière le mur voisin', async () => {
    const { resolveDynamicDepth } = await import('../../src/iso/depth.js');
    // Mur est-ouest sur la tuile (36, 43) : empreinte fine en y.
    const wall = { box: { minX: 36, maxX: 37, minY: 43.38, maxY: 43.62 }, depth: objectDepth(36.5, 43.5) };
    const px = 37.12, py = 43.1, r = 0.28;
    const base = objectDepth(px, py);
    expect(base).toBeGreaterThan(wall.depth); // la règle du centre seule échoue ici
    const d = resolveDynamicDepth({ minX: px - r, maxX: px + r, minY: py - r, maxY: py + r }, base, [wall]);
    expect(d).toBeLessThan(wall.depth);
  });

  it('ne change rien quand la règle du centre est déjà correcte', async () => {
    const { resolveDynamicDepth } = await import('../../src/iso/depth.js');
    const tree = { box: { minX: 5.28, maxX: 5.72, minY: 5.28, maxY: 5.72 }, depth: objectDepth(5.5, 5.5) };
    const base = objectDepth(5.5, 6.3);
    expect(resolveDynamicDepth({ minX: 5.22, maxX: 5.78, minY: 6.02, maxY: 6.58 }, base, [tree])).toBe(base);
  });
});
