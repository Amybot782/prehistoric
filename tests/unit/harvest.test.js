import { describe, it, expect } from 'vitest';
import { yieldBetween, hitProp } from '../../src/survival/harvest.js';
import { PlayerSurvival } from '../../src/gameplay/PlayerSurvival.js';
import { Player } from '../../src/entities/Player.js';
import { ChunkDeltaStore } from '../../src/world/chunks/ChunkDeltaStore.js';
import { TestMapGenerator } from '../../src/world/testMap.js';
import { makeWorld } from './world.test.js';
import items from '../../src/data/items.json';
import survival from '../../src/data/survival.json';
import worldgen from '../../src/data/worldgen.json';
import cfg from '../../src/data/game.json';
import biomes from '../../src/data/biomes.json';

const keys = biomes.biomes.map((b) => b.key);
const testWorld = (deltas) => {
  const w = makeWorld(new TestMapGenerator(worldgen.chunkSize), deltas);
  w.stream({ minX: 0, minY: 0, maxX: 48, maxY: 48 }, Infinity);
  return w;
};
const firstOf = (w, type) => [...w.props()].find((p) => p.type === type);

describe('récolte', () => {
  it('le total obtenu ne dépend pas de l’outil, seulement le nombre de coups', () => {
    const total = (power) => {
      let left = 8, got = 0, hits = 0;
      while (left > 0) {
        let after = left - power;
        if (after < 1e-6) after = 0;
        got += yieldBetween({ wood: 6 }, 8, left, after).wood ?? 0;
        left = after;
        hits++;
      }
      return { got, hits };
    };
    expect(total(1)).toEqual({ got: 6, hits: 8 });
    expect(total(1.6).got).toBe(6);
    expect(total(1.6).hits).toBe(5);
  });

  it('un arbre abattu laisse une souche, reste coupé après rechargement puis repousse', () => {
    const deltas = new ChunkDeltaStore();
    const w = testWorld(deltas);
    const tree = firstOf(w, 'tree');
    let wood = 0;
    for (let i = 0; i < 4; i++) wood += hitProp(w, tree, 1).gained.wood ?? 0;
    expect(tree.hpLeft).toBe(4);
    // Moitié coupé : conservé après déchargement.
    const key = tree.chunk;
    const [cx, cy] = key.split(',').map(Number);
    w.unloadChunk(cx, cy);
    w.loadChunk(cx, cy);
    const same = [...w.props()].find((p) => p.id === tree.id);
    expect(same.hpLeft).toBe(4);
    let res;
    for (let i = 0; i < 4; i++) { res = hitProp(w, same, 1); wood += res.gained.wood ?? 0; }
    expect(res.depleted).toBe(true);
    expect(wood).toBe(6);
    expect([...w.props()].some((p) => p.id === tree.id)).toBe(false);
    const stump = [...w.props()].find((p) => p.stumpOf === tree.id);
    expect(stump?.type).toBe('stump');
    expect(w.collisions.overlaps(tree.x, tree.y, 0.05)).toBe(false); // la souche ne bloque pas
    // Toujours coupé après rechargement.
    w.unloadChunk(cx, cy);
    w.loadChunk(cx, cy);
    expect([...w.props()].some((p) => p.id === tree.id)).toBe(false);
    // Repousse après le délai.
    w.time += tree.def.regrowSeconds + 1;
    expect(w.updateRegrowth()).toBeGreaterThan(0);
    expect([...w.props()].some((p) => p.id === tree.id)).toBe(true);
    expect([...w.props()].some((p) => p.stumpOf === tree.id)).toBe(false);
  });

  it('les rochers ne repoussent pas', () => {
    const w = testWorld();
    const rock = firstOf(w, 'rock');
    hitProp(w, rock, Infinity);
    w.time += 1e6;
    w.updateRegrowth();
    expect([...w.props()].some((p) => p.id === rock.id)).toBe(false);
  });

  it('un objet posé au sol est conservé au rechargement et ramassé une seule fois', () => {
    const deltas = new ChunkDeltaStore();
    const w = testWorld(deltas);
    const prop = w.dropItem('wood', 7, 24.2, 24.8);
    w.unloadChunk(0, 0);
    w.loadChunk(0, 0);
    const again = [...w.props()].find((p) => p.type === 'dropped');
    expect(again).toMatchObject({ item: 'wood', count: 7, id: prop.id });
    expect(hitProp(w, again, 1).gained).toEqual({ wood: 7 });
    w.unloadChunk(0, 0);
    w.loadChunk(0, 0);
    expect([...w.props()].some((p) => p.type === 'dropped')).toBe(false);
  });
});

describe('boucle de survie du joueur', () => {
  const setup = () => {
    const w = testWorld();
    const player = w.addEntity(new Player(24.5, 24.5, cfg.player));
    const s = new PlayerSurvival({ world: w, player, cfg: survival, itemDefs: items, biomeKeys: keys });
    return { w, player, s };
  };

  it('commence avec ses vêtements de départ équipés', () => {
    const { s } = setup();
    expect(s.equipment.slots.body).toBe('loincloth');
    expect(s.inventory.count('loincloth')).toBe(0);
  });

  it('coupe l’arbre devant lui, reçoit du bois, et l’outil accélère', () => {
    const { w, player, s } = setup();
    const tree = firstOf(w, 'tree');
    player.placeAt(tree.x - 0.6, tree.y);
    player.dirX = 1; player.dirY = 0;
    expect(s.updateTarget()).toBe(tree);
    let hits = 0;
    while (s.target === tree && hits < 20) {
      s.cooldown = 0;
      s.vitals.stamina = 100;
      s.interact();
      hits++;
    }
    expect(hits).toBe(tree.def.harvest.hp);
    expect(s.inventory.count('wood')).toBe(tree.def.yields.wood);
    // Avec un silex en main, moins de coups.
    const t2 = [...w.props()].find((p) => p.type === 'tree' && p !== tree);
    s.inventory.add('flint', 1);
    s.useSlot(s.inventory.slots.findIndex((x) => x?.item === 'flint'));
    expect(s.equipment.slots.hand).toBe('flint');
    player.placeAt(t2.x - 0.6, t2.y);
    s.updateTarget();
    let h2 = 0;
    while (s.target === t2 && h2 < 20) { s.cooldown = 0; s.vitals.stamina = 100; s.updateTarget(); s.interact(); h2++; }
    expect(h2).toBeLessThan(hits);
  });

  it('boit dans l’étang et mange des baies', () => {
    const { player, s } = setup();
    player.placeAt(17.4, 30.6);
    player.dirX = -1; player.dirY = 0;
    s.vitals.thirst = 30;
    s.updateTarget();
    expect(s.water).not.toBe(null);
    expect(s.interact()).toBe('drink');
    expect(s.vitals.thirst).toBe(30 + survival.actions.drinkAmount);
    s.inventory.add('berries', 2);
    s.vitals.hunger = 40;
    const i = s.inventory.slots.findIndex((x) => x?.item === 'berries');
    expect(s.useSlot(i)).toBe('eat');
    expect(s.vitals.hunger).toBe(46);
    expect(s.inventory.count('berries')).toBe(1);
  });

  it('inventaire plein : la récolte tombe au sol au lieu de disparaître', () => {
    const { w, player, s } = setup();
    for (let i = 0; i < s.inventory.size; i++) s.inventory.slots[i] = { item: 'clay', count: 30 };
    const tree = firstOf(w, 'tree');
    player.placeAt(tree.x - 0.6, tree.y);
    player.dirX = 1; player.dirY = 0;
    s.updateTarget();
    for (let i = 0; i < 10 && s.target; i++) { s.cooldown = 0; s.vitals.stamina = 100; s.interact(); }
    const dropped = [...w.props()].filter((p) => p.type === 'dropped' && p.item === 'wood');
    expect(dropped.reduce((n, p) => n + p.count, 0)).toBe(tree.def.yields.wood);
  });

  it('poser puis ramasser un objet', () => {
    const { w, s } = setup();
    s.inventory.slots.fill(null);
    s.inventory.add('stone', 5);
    expect(s.dropSlot(0, 5)).toBe('drop');
    expect(s.inventory.count('stone')).toBe(0);
    const d = [...w.props()].find((p) => p.type === 'dropped');
    s.updateTarget(d);
    s.cooldown = 0;
    expect(s.interact()).toBe('pickup');
    expect(s.inventory.count('stone')).toBe(5);
  });

  it('mort puis réapparition avec l’inventaire', () => {
    const { player, s } = setup();
    const deaths = [];
    s.events.on('death', (e) => deaths.push(e));
    s.inventory.add('wood', 3);
    s.vitals.thirst = 0;
    s.vitals.hunger = 0;
    s.vitals.health = 1;
    for (let i = 0; i < 600 && !s.dead; i++) s.step(1 / 60);
    expect(s.dead).toBe(true);
    expect(deaths.length).toBe(1);
    expect(s.canRespawn()).toBe(false);
    for (let i = 0; i < 60 * survival.respawn.delay; i++) s.step(1 / 60);
    expect(s.canRespawn()).toBe(true);
    s.respawn(24.5, 24.5, 0);
    expect(s.dead).toBe(false);
    expect(s.inventory.count('wood')).toBe(3);
    expect(player.x).toBe(24.5);
  });
});
