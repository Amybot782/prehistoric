import { describe, it, expect } from 'vitest';
import { World } from '../../src/world/World.js';
import { populateTestMap, TEST_MAP_SIZE, TEST_MAP_SPAWN } from '../../src/world/testMap.js';
import terrain from '../../src/data/terrain.json';
import props from '../../src/data/props.json';
import cfg from '../../src/data/game.json';

const build = () => {
  const w = new World({ width: TEST_MAP_SIZE, height: TEST_MAP_SIZE, terrainTypes: terrain.types, propDefs: props, physicsCfg: cfg.physics });
  populateTestMap(w);
  return w;
};

describe('carte de test', () => {
  it('est déterministe', () => {
    const a = build(), b = build();
    expect(Array.from(a.ground)).toEqual(Array.from(b.ground));
    expect(a.props.map((p) => `${p.type}@${p.tx},${p.ty}`)).toEqual(b.props.map((p) => `${p.type}@${p.tx},${p.ty}`));
  });

  it('le point d’apparition est libre et l’eau est solide', () => {
    const w = build();
    expect(w.collisions.overlaps(TEST_MAP_SPAWN.x, TEST_MAP_SPAWN.y, cfg.player.radius)).toBe(false);
    expect(w.collisions.overlaps(12, 30, 0.1)).toBe(true); // centre de l'étang
  });

  it('les bords de la carte sont infranchissables', () => {
    const w = build();
    expect(w.collisions.overlaps(-0.1, 10, 0.2)).toBe(true);
    expect(w.collisions.overlaps(TEST_MAP_SIZE + 0.1, 10, 0.2)).toBe(true);
  });

  it('aucun objet n’est posé dans l’eau ni deux fois sur la même tuile', () => {
    const w = build();
    const seen = new Set();
    for (const p of w.props) {
      expect(w.tileAt(p.tx, p.ty)).not.toBe(3);
      const k = `${p.tx},${p.ty}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('refuse un type d’objet inconnu', () => {
    const w = build();
    expect(() => w.addProp('dragon', 1, 1)).toThrow();
  });
});
