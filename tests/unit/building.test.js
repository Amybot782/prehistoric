import { describe, it, expect } from 'vitest';
import { PlayerSurvival } from '../../src/gameplay/PlayerSurvival.js';
import { Player } from '../../src/entities/Player.js';
import { ChunkDeltaStore } from '../../src/world/chunks/ChunkDeltaStore.js';
import { TestMapGenerator } from '../../src/world/testMap.js';
import { spotAt, slotKey } from '../../src/building/placement.js';
import { airTemperature } from '../../src/survival/climate.js';
import { buildSave, writeSave, readSave, saveKey } from '../../src/save/autosave.js';
import { makeWorld } from './world.test.js';
import items from '../../src/data/items.json';
import props from '../../src/data/props.json';
import recipes from '../../src/data/recipes.json';
import survivalCfg from '../../src/data/survival.json';
import worldgen from '../../src/data/worldgen.json';
import cfg from '../../src/data/game.json';
import biomes from '../../src/data/biomes.json';

const keys = biomes.biomes.map((b) => b.key);

/** Test area with the player at (x, y) and the given items in the bag. */
function setup({ x = 24.5, y = 24.5, give = [], deltas } = {}) {
  const world = makeWorld(new TestMapGenerator(worldgen.chunkSize), deltas);
  world.stream({ minX: 0, minY: 0, maxX: 48, maxY: 48 }, Infinity);
  const player = world.addEntity(new Player(x, y, cfg.player));
  const sv = new PlayerSurvival({ world, player, cfg: survivalCfg, itemDefs: items, biomeKeys: keys, recipes });
  for (const [item, n] of give) sv.inventory.add(item, n);
  return { world, player, sv };
}

const select = (sv, item) => sv.selectHotbar(sv.inventory.slots.findIndex((s) => s?.item === item));
const walk = (world, player, dx, dy, seconds = 2) => {
  for (let t = 0; t < seconds; t += 1 / 60) player.step(1 / 60, { x: dx, y: dy }, false, world.collisions, { facingFromWorldDir: () => 0 });
};

describe('fabrication', () => {
  it('consomme exactement le coût et refuse quand il manque des ressources', () => {
    const { sv } = setup({ give: [['fiber', 7]] });
    expect(sv.craft('rope', 5)).toBe(2);
    expect(sv.inventory.count('rope')).toBe(2);
    expect(sv.inventory.count('fiber')).toBe(1);
    expect(sv.craft('rope')).toBe(0);
  });

  it('les recettes d’atelier demandent un établi à proximité', () => {
    const { sv, world } = setup({ give: [['wood', 20], ['stone', 4]] });
    expect(sv.craft('wood_wall')).toBe(0);
    expect(sv.craft('workbench')).toBe(1);
    select(sv, 'workbench');
    expect(sv.placeAt(26.5, 24.5)).not.toBeNull();
    expect(sv.stations().has('workbench')).toBe(true);
    expect(sv.craft('wood_wall')).toBe(1);
    expect(sv.inventory.count('wood')).toBe(20 - 8 - 4);
    sv.player.placeAt(10, 10);
    expect(sv.stations().has('workbench')).toBe(false); // trop loin
    expect(world.builtAt(slotKey('object', 26.5, 24.5)).type).toBe('workbench');
  });

  it('chaque recette donne un objet connu et chaque pièce posable a sa définition', () => {
    for (const r of recipes.recipes) {
      expect(items[r.id], r.id).toBeTruthy();
      for (const item of Object.keys(r.cost)) expect(items[item], item).toBeTruthy();
    }
    for (const [id, def] of Object.entries(items)) if (def.place) expect(props[id]?.build, id).toBeTruthy();
  });
});

describe('placement', () => {
  it('un mur prend le bord de tuile le plus proche de la souris', () => {
    const def = props.wood_wall;
    expect(spotAt(def, 10.5, 10.1)).toMatchObject({ x: 10.5, y: 10, rot: 'x' });
    expect(spotAt(def, 10.5, 10.9)).toMatchObject({ x: 10.5, y: 11, rot: 'x' });
    expect(spotAt(def, 10.1, 10.5)).toMatchObject({ x: 10, y: 10.5, rot: 'y' });
    // Le côté sud d'une tuile est le côté nord de la suivante : un seul emplacement.
    expect(spotAt(def, 10.5, 10.9).key).toBe(spotAt(def, 10.5, 11.1).key);
  });

  it('un mur posé bloque le passage et coûte une pièce', () => {
    const { world, player, sv } = setup({ give: [['wood_wall', 2]] });
    select(sv, 'wood_wall');
    expect(sv.placeAt(24.5, 23.1)).not.toBeNull(); // côté nord de la tuile du joueur
    expect(sv.inventory.count('wood_wall')).toBe(1);
    walk(world, player, 0, -1);
    expect(player.y).toBeGreaterThan(23 + 0.12 + player.radius - 0.01);
    expect(world.collisions.overlaps(player.x, player.y, player.radius - 1e-3)).toBe(false);
  });

  it('refuse : place prise, eau, sol pas plat, trop loin, joueur dans le passage, toit sans appui', () => {
    const { sv, player } = setup({ give: [['wood_wall', 5], ['thatch_roof', 2], ['workbench', 2]] });
    select(sv, 'wood_wall');
    sv.placeAt(24.5, 23.1);
    expect(sv.previewAt(24.5, 23.1).why).toBe('build.occupied');
    expect(sv.previewAt(24.5, 22.9).why).toBe('build.occupied'); // même bord, vu de l'autre tuile
    expect(sv.previewAt(40.5, 40.5).why).toBe('build.tooFar');
    expect(sv.previewAt(24.5, 24.9).why).toBe(null);
    player.placeAt(24.5, 24.9);
    expect(sv.previewAt(24.5, 24.95).why).toBe('build.blocked');
    player.placeAt(14.5, 27.5);
    expect(sv.previewAt(12.5, 30.5).why).toBe('build.water');
    player.placeAt(27.5, 6.5);
    expect(sv.previewAt(27.9, 6.5).why).toBe('build.notFlat'); // bord du plateau
    player.placeAt(24.5, 24.5);
    select(sv, 'thatch_roof');
    expect(sv.previewAt(26.5, 26.5).why).toBe('build.noSupport');
    expect(sv.previewAt(24.5, 23.5).why).toBe(null); // repose sur le mur du nord
    select(sv, 'workbench');
    expect(sv.previewAt(31.5, 37.5).why).toBe('build.tooFar');
  });

  it('R tourne un objet d’un quart de tour (empreinte comprise)', () => {
    const { sv } = setup({ give: [['workbench', 2]] });
    select(sv, 'workbench');
    const a = sv.placeAt(24.5, 25.5);
    sv.rotate();
    const b = sv.placeAt(23.5, 25.5);
    const size = (p) => [p.collider.shape.maxX - p.collider.shape.minX, p.collider.shape.maxY - p.collider.shape.minY].map((v) => +v.toFixed(2));
    expect(b.rot).toBe('y');
    expect(size(b)).toEqual(size(a).reverse());
  });

  it('un objet ne se pose pas sur un arbre, un mur pas à travers un gros bloc', () => {
    const { world, sv, player } = setup({ give: [['workbench', 1], ['wood_wall', 1]] });
    const tree = [...world.props()].find((p) => p.type === 'tree' && p.tx > 3 && p.ty > 3);
    player.placeAt(tree.x + 1.5, tree.y);
    select(sv, 'workbench');
    expect(sv.previewAt(tree.x, tree.y).why).toBe('build.occupied');
    player.placeAt(38.5, 18.5);
    select(sv, 'wood_wall');
    expect(sv.previewAt(40.1, 18.5).why).toBe('build.blocked'); // le bloc (40, 18) déborde sur son bord ouest
  });
});

describe('portes, démontage, chaleur', () => {
  it('une porte fermée bloque, ouverte laisse passer, ne se ferme pas sur le joueur', () => {
    const { world, player, sv } = setup({ give: [['wood_door', 1]] });
    select(sv, 'wood_door');
    const door = sv.placeAt(24.5, 23.1);
    walk(world, player, 0, -1, 1);
    expect(player.y).toBeGreaterThan(23.3);
    expect(sv.toggleDoor(door)).toBe('open');
    expect(door.collider.solid).toBe(false);
    player.placeAt(24.5, 23.05);
    expect(sv.toggleDoor(door)).toBe('blocked');
    player.placeAt(24.5, 24.5);
    walk(world, player, 0, -1, 1);
    expect(player.y).toBeLessThan(22.5);
    expect(sv.toggleDoor(door)).toBe('close');
  });

  it('démonter rend la pièce et libère la place', () => {
    const { world, sv } = setup({ give: [['wood_wall', 1]] });
    select(sv, 'wood_wall');
    const wall = sv.placeAt(24.5, 23.1);
    expect(sv.dismantle(wall)).toBe(true);
    expect(sv.inventory.count('wood_wall')).toBe(1);
    expect(world.builtAt(wall.slot)).toBeUndefined();
    expect(world.collisions.overlaps(24.5, 23, 0.1)).toBe(false);
    expect(world.deltas.size).toBe(0);
  });

  it('un feu de camp et un toit réchauffent l’air', () => {
    const { world, sv } = setup({ give: [['campfire', 1], ['wood_wall', 1], ['thatch_roof', 1]] });
    const base = airTemperature(world, 24.5, 24.5, survivalCfg, keys);
    select(sv, 'wood_wall');
    sv.placeAt(24.5, 22.1);
    select(sv, 'thatch_roof');
    expect(sv.placeAt(24.5, 22.5)).not.toBeNull();
    expect(airTemperature(world, 24.5, 22.5, survivalCfg, keys)).toBe(base + props.thatch_roof.build.shelter);
    select(sv, 'campfire');
    sv.placeAt(25.5, 24.5);
    expect(airTemperature(world, 24.5, 24.5, survivalCfg, keys)).toBeGreaterThan(base + 5);
    expect(airTemperature(world, 24.5, 30.5, survivalCfg, keys)).toBe(base);
  });

  it('rien ne repousse sous un plancher', () => {
    const { world, sv, player } = setup({ give: [['wood_floor', 1]] });
    const bush = [...world.props()].find((p) => p.type === 'bush');
    world.removeProp(bush);
    player.placeAt(bush.x + 1.5, bush.y);
    select(sv, 'wood_floor');
    expect(sv.placeAt(bush.x, bush.y)).not.toBeNull();
    world.time += 1e6;
    expect(world.updateRegrowth()).toBe(0);
  });
});

describe('sauvegarde des constructions', () => {
  it('les pièces restent après déchargement du chunk, porte ouverte comprise', () => {
    const { world, sv } = setup({ give: [['wood_door', 1], ['wood_wall', 1]] });
    select(sv, 'wood_door');
    world.setDoorOpen(sv.placeAt(24.5, 23.1), true);
    select(sv, 'wood_wall');
    sv.placeAt(24.9, 24.5);
    world.stream({ minX: 1000, minY: 1000, maxX: 1010, maxY: 1010 }, 0);
    expect(world.built.size).toBe(0);
    world.stream({ minX: 0, minY: 0, maxX: 48, maxY: 48 }, Infinity);
    const door = world.builtAt(slotKey('edge', 24.5, 23));
    expect(door.open).toBe(true);
    expect(door.collider.solid).toBe(false);
    expect(world.builtAt(slotKey('edge', 25, 24.5)).collider.solid).toBe(true);
  });

  it('le format v3 se relit, et l’ancien format v2 reste lisible', () => {
    const { world, sv } = setup({ give: [['wood_wall', 1]] });
    select(sv, 'wood_wall');
    sv.placeAt(24.5, 23.1);
    const json = JSON.parse(JSON.stringify(world.deltas.toJSON()));
    expect(json.version).toBe(3);
    const again = setup({ deltas: ChunkDeltaStore.fromJSON(json) });
    expect(again.world.builtAt(slotKey('edge', 24.5, 23)).type).toBe('wood_wall');
    // A new piece never reuses an id.
    again.sv.inventory.add('wood_wall', 1);
    select(again.sv, 'wood_wall');
    expect(again.sv.placeAt(24.5, 24.9).id).not.toBe(again.world.builtAt(slotKey('edge', 24.5, 23)).id);
    const v2 = ChunkDeltaStore.fromJSON({ version: 2, nextDropId: 3, chunks: { '0,0': { removed: [['p1_1', 5]], tiles: [], damage: [], dropped: [] } } });
    expect(v2.isRemoved('0,0', 'p1_1')).toBe(true);
  });

  it('la sauvegarde automatique rend le joueur et le monde, et se rabat sur la copie si besoin', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    const { world, player, sv } = setup({ give: [['wood_wall', 3], ['berries', 4]] });
    select(sv, 'wood_wall');
    sv.placeAt(24.5, 23.1);
    sv.vitals.hunger = 42;
    player.placeAt(25.2, 25.7);
    world.time = 1234;
    expect(writeSave(storage, 'graine', buildSave({ settings: { seed: 'graine' }, world, player, survival: sv }))).toBe(true);
    const data = readSave(storage, 'graine');
    expect(data.player).toEqual({ x: 25.2, y: 25.7 });
    expect(data.time).toBe(1234);
    const back = setup({ deltas: ChunkDeltaStore.fromJSON(data.deltas) });
    back.sv.restore(data.survival);
    expect(back.sv.inventory.count('wood_wall')).toBe(2);
    expect(back.sv.inventory.count('berries')).toBe(4);
    expect(back.sv.vitals.hunger).toBe(42);
    expect(back.sv.equipment.slots.body).toBe('loincloth');
    expect(back.world.builtAt(slotKey('edge', 24.5, 23))).toBeTruthy();
    // Second save, then the latest gets corrupted: the backup is used.
    writeSave(storage, 'graine', buildSave({ settings: { seed: 'graine' }, world, player, survival: sv }));
    store.set(saveKey('graine'), '{ cassé');
    expect(readSave(storage, 'graine')?.time).toBe(1234);
    expect(readSave(storage, 'autre')).toBeNull();
  });
});
