import { describe, it, expect } from 'vitest';
import { ChunkedWorld } from '../../src/world/ChunkedWorld.js';
import { TestMapGenerator, TEST_MAP_SIZE, TEST_MAP_SPAWN } from '../../src/world/testMap.js';
import { ProceduralGenerator } from '../../src/world/generation/ProceduralGenerator.js';
import { ChunkDeltaStore } from '../../src/world/chunks/ChunkDeltaStore.js';
import terrain from '../../src/data/terrain.json';
import props from '../../src/data/props.json';
import biomes from '../../src/data/biomes.json';
import worldgen from '../../src/data/worldgen.json';
import cfg from '../../src/data/game.json';

const WATER = 3;

export function makeWorld(generator, deltas) {
  return new ChunkedWorld({
    generator,
    terrainTypes: terrain.types,
    propDefs: props,
    physicsCfg: cfg.physics,
    levelHeight: worldgen.levelHeight,
    streaming: worldgen.streaming,
    deltas,
  });
}

const testWorld = () => {
  const w = makeWorld(new TestMapGenerator(worldgen.chunkSize));
  w.stream({ minX: 0, minY: 0, maxX: TEST_MAP_SIZE, maxY: TEST_MAP_SIZE }, Infinity);
  return w;
};

const procedural = (seed = 'tests') =>
  new ProceduralGenerator({ settings: { seed }, cfg: worldgen, terrainTypes: terrain.types, biomes: biomes.biomes });

describe('carte de test (servie par chunks)', () => {
  it('est déterministe', () => {
    const a = testWorld(), b = testWorld();
    const sig = (w) => [...w.props()].map((p) => `${p.type}@${p.tx},${p.ty}`).sort();
    expect(sig(a)).toEqual(sig(b));
    for (let y = 0; y < TEST_MAP_SIZE; y += 3) for (let x = 0; x < TEST_MAP_SIZE; x += 3) expect(a.tileAt(x, y)).toBe(b.tileAt(x, y));
  });

  it('le point d’apparition est libre et l’eau est solide', () => {
    const w = testWorld();
    expect(w.collisions.overlaps(TEST_MAP_SPAWN.x, TEST_MAP_SPAWN.y, cfg.player.radius)).toBe(false);
    expect(w.collisions.overlaps(12, 30, 0.1)).toBe(true); // centre de l'étang
  });

  it('l’extérieur de la zone est de l’eau profonde infranchissable', () => {
    const w = testWorld();
    expect(w.collisions.overlaps(-0.5, 10, 0.2)).toBe(true);
    expect(w.collisions.overlaps(TEST_MAP_SIZE + 0.5, 10, 0.2)).toBe(true);
  });

  it('le plateau a deux marches et la hauteur du sol suit les tuiles', () => {
    const w = testWorld();
    expect(w.heightAt(29, 5)).toBe(1);
    expect(w.heightAt(32, 7)).toBe(2);
    expect(w.groundZ(32.5, 7.5)).toBeCloseTo(2 * worldgen.levelHeight);
    expect(w.heightAt(24, 24)).toBe(0);
  });

  it('aucun objet n’est posé dans l’eau ni deux fois sur la même tuile', () => {
    const w = testWorld();
    const seen = new Set();
    for (const p of w.props()) {
      expect(w.tileAt(p.tx, p.ty)).not.toBe(WATER);
      const k = `${p.tx},${p.ty}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('refuse un type d’objet inconnu', () => {
    const gen = new TestMapGenerator(worldgen.chunkSize);
    const orig = gen.generateChunk.bind(gen);
    gen.generateChunk = (cx, cy) => {
      const c = orig(cx, cy);
      c.props.push({ id: 'x', type: 'dragon', tx: 1, ty: 1, x: 1.5, y: 1.5, h: 0 });
      return c;
    };
    expect(() => makeWorld(gen).loadChunk(0, 0)).toThrow();
  });
});

describe('chunks : chargement, déchargement, modifications', () => {
  it('la mémoire reste bornée quand on marche loin', () => {
    const w = makeWorld(procedural());
    let maxChunks = 0, maxColliders = 0;
    for (let x = 0; x <= 2000; x += 8) {
      w.stream({ minX: x - 20, minY: -12, maxX: x + 20, maxY: 12 }, Infinity);
      maxChunks = Math.max(maxChunks, w.loadedCount);
      maxColliders = Math.max(maxColliders, w.collisions.staticCount);
    }
    expect(w.stats.generated).toBeGreaterThan(100);
    expect(maxChunks).toBeLessThanOrEqual(30);
    // Les colliders des chunks déchargés sont bien retirés.
    expect(w.collisions.staticCount).toBeLessThanOrEqual(maxColliders);
    let expected = 0;
    for (const c of w.chunks.values()) expected += c.colliders.length + c.props.filter((p) => p.collider).length;
    expect(w.collisions.staticCount).toBe(expected);
  });

  it('le budget par image limite la génération, les plus proches d’abord', () => {
    const w = makeWorld(procedural());
    const r = w.stream({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 2);
    expect(r.loaded).toBe(2);
    expect(r.pending).toBeGreaterThan(0);
    expect(w.isLoaded(0, 0)).toBe(true);
  });

  it('un objet retiré ne revient pas après déchargement puis rechargement', () => {
    const deltas = new ChunkDeltaStore();
    const w = makeWorld(procedural(), deltas);
    const chunk = w.loadChunk(0, 0);
    const prop = chunk.props.find((p) => p.collider);
    expect(prop).toBeTruthy();
    const before = w.collisions.staticCount;
    expect(w.removeProp(prop, 12)).toBe(true);
    expect(w.collisions.staticCount).toBe(before - 1);
    w.unloadChunk(0, 0);
    const again = w.loadChunk(0, 0);
    expect(again.props.some((p) => p.id === prop.id)).toBe(false);
    expect(again.props.length).toBe(chunk.props.length);
  });

  it('une tuile modifiée est conservée et la sauvegarde JSON fait l’aller-retour', () => {
    const deltas = new ChunkDeltaStore();
    const w = makeWorld(procedural(), deltas);
    w.loadChunk(0, 0);
    w.setTile(3, 4, 1);
    const p = w.chunks.get('0,0').props[0];
    w.removeProp(p, 5);
    const restored = ChunkDeltaStore.fromJSON(JSON.parse(JSON.stringify(deltas.toJSON())));
    const w2 = makeWorld(procedural(), restored);
    w2.loadChunk(0, 0);
    expect(w2.tileAt(3, 4)).toBe(1);
    expect(w2.chunks.get('0,0').props.some((q) => q.id === p.id)).toBe(false);
  });

  it('chunk:loaded / chunk:unloaded sont émis', () => {
    const w = makeWorld(procedural());
    const seen = [];
    w.events.on('chunk:loaded', (c) => seen.push(`+${c.key}`));
    w.events.on('chunk:unloaded', (c) => seen.push(`-${c.key}`));
    w.loadChunk(2, 3);
    w.unloadChunk(2, 3);
    expect(seen).toEqual(['+2,3', '-2,3']);
  });
});
