import { describe, it, expect } from 'vitest';
import { Simplex2 } from '../../src/world/noise.js';
import { ProceduralGenerator, BIOME_IDS } from '../../src/world/generation/ProceduralGenerator.js';
import { normalizeWorldSettings, seedToInt } from '../../src/world/WorldSettings.js';
import { resolveWorldChoice } from '../../src/world/worldSession.js';
import terrain from '../../src/data/terrain.json';
import biomes from '../../src/data/biomes.json';
import worldgen from '../../src/data/worldgen.json';
import props from '../../src/data/props.json';

const gen = (settings) => new ProceduralGenerator({ settings, cfg: worldgen, terrainTypes: terrain.types, biomes: biomes.biomes });
const T = Object.fromEntries(terrain.types.map((t) => [t.key, t.id]));

describe('bruit', () => {
  it('est déterministe et borné', () => {
    const a = new Simplex2(42), b = new Simplex2(42), c = new Simplex2(43);
    let diff = 0;
    for (let i = 0; i < 500; i++) {
      const x = i * 0.37, y = i * 0.11;
      expect(a.noise(x, y)).toBe(b.noise(x, y));
      const f = a.fbm01(x, y, 4, 0.05);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      if (a.noise(x, y) !== c.noise(x, y)) diff++;
    }
    expect(diff).toBeGreaterThan(400);
  });
});

describe('réglages du monde', () => {
  it('complète, borne et ignore les clés inconnues', () => {
    const s = normalizeWorldSettings({ seed: '  abc ', relief: 9, hack: 1, forestDensity: 'x' });
    expect(s.seed).toBe('abc');
    expect(s.relief).toBe(2);
    expect(s.forestDensity).toBe(1);
    expect(s.hack).toBeUndefined();
  });

  it('une seed texte donne toujours le même entier', () => {
    expect(seedToInt('prehistoric')).toBe(seedToInt('prehistoric'));
    expect(seedToInt('prehistoric')).not.toBe(seedToInt('prehistorik'));
    expect(seedToInt('123')).toBe(123);
  });

  it('choix du monde : ?map=test, ?seed=, dernier monde, défaut', () => {
    const store = (v) => ({ getItem: () => v });
    expect(resolveWorldChoice('?map=test', store(null)).mode).toBe('test');
    expect(resolveWorldChoice('?seed=abc', store(null)).settings.seed).toBe('abc');
    expect(resolveWorldChoice('', store(JSON.stringify({ seed: 'saved' }))).settings.seed).toBe('saved');
    expect(resolveWorldChoice('', store('{pas du json')).settings.seed).toBe('prehistoric');
    expect(resolveWorldChoice('', null).settings.seed).toBe('prehistoric');
  });
});

describe('générateur procédural', () => {
  it('même seed => même monde, quel que soit l’ordre de génération', () => {
    const a = gen({ seed: 'abc' }), b = gen({ seed: 'abc' });
    const order1 = [[0, 0], [5, -3], [-7, 2]];
    const ca = order1.map(([x, y]) => a.generateChunk(x, y));
    const cb = [...order1].reverse().map(([x, y]) => b.generateChunk(x, y)).reverse();
    for (let i = 0; i < ca.length; i++) {
      expect(Array.from(ca[i].ground)).toEqual(Array.from(cb[i].ground));
      expect(Array.from(ca[i].height)).toEqual(Array.from(cb[i].height));
      expect(ca[i].props).toEqual(cb[i].props);
    }
  });

  it('une autre seed donne un autre monde', () => {
    const a = gen({ seed: 'abc' }).generateChunk(0, 0), b = gen({ seed: 'xyz' }).generateChunk(0, 0);
    let same = 0;
    for (let i = 0; i < a.ground.length; i++) if (a.ground[i] === b.ground[i] && a.height[i] === b.height[i]) same++;
    expect(same).toBeLessThan(a.ground.length * 0.9);
  });

  it('le relief ne monte que d’un niveau à la fois, y compris entre chunks', () => {
    for (const seed of ['abc', 'prehistoric', 'e2e-seed']) {
      const g = gen({ seed });
      const n = g.size, R = 4;
      const h = (tx, ty) => g.heightAt(tx, ty);
      let violations = 0;
      for (let ty = -R * n; ty < R * n; ty += 1) {
        for (let tx = -R * n; tx < R * n; tx += 1) {
          if (Math.abs(h(tx, ty) - h(tx + 1, ty)) > 1 || Math.abs(h(tx, ty) - h(tx, ty + 1)) > 1) violations++;
        }
      }
      expect(violations).toBe(0);
    }
  });

  it('les hauteurs d’un chunk correspondent à heightAt (pas de couture aux bords)', () => {
    const g = gen({ seed: 'abc' });
    const c = g.generateChunk(-1, 2);
    const n = g.size;
    for (let i = 0; i < n * n; i += 7) {
      expect(c.height[i]).toBe(g.heightAt(-n + (i % n), 2 * n + Math.floor(i / n)));
    }
  });

  it('les quatre biomes et l’eau existent sur une grande zone', () => {
    const g = gen({ seed: 'prehistoric' });
    const biomeCount = new Map();
    let water = 0, total = 0;
    const t = {};
    for (let ty = -1200; ty < 1200; ty += 12) {
      for (let tx = -1200; tx < 1200; tx += 12) {
        g.tile(tx, ty, t);
        total++;
        if (t.ground === T.water || t.ground === T.shallow_water) water++;
        else biomeCount.set(t.biome, (biomeCount.get(t.biome) ?? 0) + 1);
      }
    }
    for (const id of Object.values(BIOME_IDS)) expect(biomeCount.get(id) ?? 0).toBeGreaterThan(total * 0.03);
    expect(water / total).toBeGreaterThan(0.05);
    expect(water / total).toBeLessThan(0.5);
  });

  it('aucun objet dans l’eau, ids stables, types connus', () => {
    const g = gen({ seed: 'abc' });
    for (const [cx, cy] of [[0, 0], [3, 1], [-2, -4]]) {
      const c = g.generateChunk(cx, cy);
      const n = c.size;
      for (const p of c.props) {
        const i = (p.ty - cy * n) * n + (p.tx - cx * n);
        expect([T.water, T.shallow_water]).not.toContain(c.ground[i]);
        expect(p.id).toBe(`p${p.tx}_${p.ty}`);
        expect(props[p.type]).toBeTruthy();
        expect(Math.floor(p.x)).toBe(p.tx);
        expect(Math.floor(p.y)).toBe(p.ty);
      }
    }
  });

  it('les réglages changent le monde dans le bon sens', () => {
    const count = (settings) => {
      const g = gen({ seed: 'abc', ...settings });
      let trees = 0;
      for (let cy = -2; cy < 2; cy++) for (let cx = -2; cx < 2; cx++) trees += g.generateChunk(cx, cy).props.filter((p) => ['tree', 'pine', 'birch', 'swamp_tree'].includes(p.type)).length;
      return trees;
    };
    expect(count({ forestDensity: 2 })).toBeGreaterThan(count({ forestDensity: 0.5 }));
    expect(gen({ seed: 'abc', relief: 0 }).levels).toBe(0);
  });

  it('le point de départ est sur la terre ferme, sans objet', () => {
    for (const seed of ['abc', 'prehistoric', '987654']) {
      const g = gen({ seed });
      const s = g.findSpawn();
      const t = g.tile(Math.floor(s.x), Math.floor(s.y));
      expect([T.water, T.shallow_water]).not.toContain(t.ground);
      expect(g.findSpawn()).toEqual(s);
    }
  });

  it('génère un chunk assez vite pour le streaming', () => {
    const g = gen({ seed: 'perf' });
    g.generateChunk(100, 100);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) g.generateChunk(i, 50);
    expect((performance.now() - t0) / 10).toBeLessThan(15);
  });
});
