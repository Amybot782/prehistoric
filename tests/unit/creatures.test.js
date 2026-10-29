import { describe, it, expect } from 'vitest';
import { ChunkedWorld } from '../../src/world/ChunkedWorld.js';
import { TestMapGenerator } from '../../src/world/testMap.js';
import { Player } from '../../src/entities/Player.js';
import { PlayerSurvival } from '../../src/gameplay/PlayerSurvival.js';
import { CreatureSystem, carcassDefs } from '../../src/creatures/CreatureSystem.js';
import { lineClear } from '../../src/creatures/combat.js';
import { CREATURE_SPECIES } from '../../src/assets/creatureArt.js';
import creaturesCfg from '../../src/data/creatures.json';
import items from '../../src/data/items.json';
import props from '../../src/data/props.json';
import recipes from '../../src/data/recipes.json';
import survivalCfg from '../../src/data/survival.json';
import terrain from '../../src/data/terrain.json';
import worldgen from '../../src/data/worldgen.json';
import cfg from '../../src/data/game.json';
import biomes from '../../src/data/biomes.json';

const keys = biomes.biomes.map((b) => b.key);
const DT = 1 / 60;
const proj = { facingFromWorldDir: () => 0 };

function setup({ x = 24.5, y = 24.5, give = [] } = {}) {
  const world = new ChunkedWorld({
    generator: new TestMapGenerator(worldgen.chunkSize), terrainTypes: terrain.types, propDefs: { ...props, ...carcassDefs(creaturesCfg) },
    physicsCfg: cfg.physics, levelHeight: worldgen.levelHeight, streaming: worldgen.streaming,
  });
  world.stream({ minX: 0, minY: 0, maxX: 48, maxY: 48 }, Infinity);
  const player = world.addEntity(new Player(x, y, cfg.player));
  const sv = new PlayerSurvival({ world, player, cfg: survivalCfg, itemDefs: items, biomeKeys: keys, recipes });
  sv.vitals.hunger = sv.vitals.thirst = 100;
  for (const [item, n] of give) sv.inventory.add(item, n);
  const sys = new CreatureSystem({ world, player, survival: sv, cfg: creaturesCfg, biomeKeys: keys, seed: 7, spawning: false });
  // Plays the game: the player walks along `dir` (or stands), then needs, creatures and time advance.
  const run = (seconds, dir = { x: 0, y: 0 }) => {
    for (let t = 0; t < seconds; t += DT) {
      player.snapshot();
      player.step(DT, dir, false, world.collisions, proj);
      sv.step(DT);
      sys.step(DT);
      world.time += DT;
    }
  };
  return { world, player, sv, sys, run };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const equip = (sv, item) => sv.equipment.equipFrom(sv.inventory, sv.inventory.slots.findIndex((s) => s?.item === item));

describe('créatures', () => {
  it('chaque espèce a ses données, son graphisme et sa carcasse', () => {
    for (const k of Object.keys(creaturesCfg.species)) {
      expect(CREATURE_SPECIES).toContain(k);
      expect(carcassDefs(creaturesCfg)[`carcass_${k}`].harvest.kind).toBe('meat');
    }
  });

  it('le lapin s’enfuit quand le joueur approche', () => {
    const { sys, player, run } = setup();
    const r = sys.spawn('rabbit', 28.5, 24.5);
    run(2.5, { x: 1, y: 0 });
    expect(r.state).toBe('flee');
    expect(dist(r, player)).toBeGreaterThan(5);
  });

  it('un animal ne voit pas à travers un mur, mais il entend la course', () => {
    const { world, sys } = setup();
    expect(lineClear(world.collisions, 31.5, 35.5, 31.5, 37.5)).toBe(false);
    const deer = sys.spawn('deer', 31.5, 38.5);
    deer.dirY = -1; deer.dirX = 0;
    const quiet = { x: 31.5, y: 34.6, radius: 0.28, noise: 0.15 };
    expect(deer.perceives(quiet, sys.ctx)).toBe(false);
    expect(deer.perceives({ ...quiet, noise: 1 }, sys.ctx)).toBe(true);
  });

  it('le loup poursuit et mord le joueur', () => {
    const { sys, sv, run } = setup();
    const wolf = sys.spawn('wolf', 29.5, 24.5);
    wolf.dirX = -1; // looking at the player
    run(5);
    expect(sv.vitals.health).toBeLessThan(100);
    expect(sv.vitals.lastDamage).toBe('wolf');
  });

  it('l’esquive est rapide et protège des coups', () => {
    const { sv, player, run } = setup();
    expect(sv.dodge(1, 0)).toBe(true);
    expect(sv.takeDamage(10, 'wolf')).toBe(false);
    const x0 = player.x;
    run(0.3);
    expect(player.x - x0).toBeGreaterThan(1.5);
    expect(sv.takeDamage(10, 'wolf')).toBe(true);
    expect(sv.vitals.health).toBe(90);
    run(0.4);
    expect(sv.dodge(1, 0)).toBe(true); // the cooldown is over, stamina left
  });

  it('frapper à la massue tue un sanglier, qui laisse une carcasse à dépecer', () => {
    const { sv, sys, world, player, run } = setup({ give: [['stone_club', 1]] });
    equip(sv, 'stone_club');
    const boar = sys.spawn('boar', 25.4, 24.5);
    let swings = 0;
    while (!boar.dead && swings < 40) {
      if (sv.attack(boar.x - player.x, boar.y - player.y)) swings++;
      run(0.1);
      sv.vitals.health = 100;
    }
    expect(boar.dead).toBe(true);
    expect(sys.creatures).not.toContain(boar);
    const carcass = world.propsNear(boar.x, boar.y, 1).find((p) => p.type === 'carcass_boar');
    expect(carcass).toBeTruthy();
    player.dirX = Math.sign(carcass.x - player.x) || 1;
    for (let i = 0; i < 20 && !carcass.gone; i++) {
      sv.target = carcass;
      sv.cooldown = 0;
      sv.interact();
    }
    expect(carcass.gone).toBe(true);
    expect(sv.inventory.count('raw_meat')).toBe(3);
    expect(sv.inventory.count('hide')).toBe(1);
  });

  it('la lance lancée blesse un cerf de loin et retombe au sol', () => {
    const { sv, sys, world, run } = setup({ give: [['wooden_spear', 1]] });
    equip(sv, 'wooden_spear');
    const deer = sys.spawn('deer', 27.6, 24.5);
    expect(sv.throwHeld(1, 0)).toBeTruthy();
    expect(sv.equipment.slots.hand).toBe(null);
    run(1);
    expect(deer.hp).toBeLessThan(deer.def.hp);
    expect(sys.projectiles.length).toBe(0);
    const near = world.propsNear(26, 24.5, 4).filter((p) => p.type === 'dropped' && p.item === 'wooden_spear');
    expect(near.length).toBe(1);
  });

  it('un mur arrête la lance et le coup au corps à corps', () => {
    const { sv, sys, world, run } = setup({ x: 31.5, y: 35.2, give: [['wooden_spear', 2]] });
    equip(sv, 'wooden_spear');
    const boar = sys.spawn('boar', 31.5, 37.3);
    sv.attack(0, 1);
    expect(boar.hp).toBe(boar.def.hp);
    run(0.7);
    sv.throwHeld(0, 1);
    run(1);
    expect(boar.hp).toBe(boar.def.hp);
    const spear = world.propsNear(31.5, 35.5, 2).find((p) => p.item === 'wooden_spear');
    expect(spear.y).toBeLessThan(36.38); // the wall's north face
  });

  it('le loup affamé chasse le lapin, puis mange sa carcasse', () => {
    const { sys, world, run, sv } = setup({ x: 4.5, y: 44.5 });
    sv.vitals.health = 1e9; // the player is far and never the target here
    const wolf = sys.spawn('wolf', 38.5, 26.5);
    const rabbit = sys.spawn('rabbit', 42.5, 26.5);
    wolf.fed = 0;
    let t = 0;
    while (!rabbit.dead && t < 40) { run(0.5); t += 0.5; }
    expect(rabbit.dead).toBe(true);
    expect(world.propsNear(rabbit.x, rabbit.y, 0.5).some((p) => p.type === 'carcass_rabbit')).toBe(true);
    run(15);
    expect(world.propsNear(rabbit.x, rabbit.y, 1).some((p) => p.type === 'carcass_rabbit')).toBe(false);
    expect(wolf.fed).toBeGreaterThan(0);
  });

  it('le tricératops défend son territoire mais laisse passer de loin', () => {
    const far = setup({ x: 24.5, y: 24.5 });
    const t1 = far.sys.spawn('triceratops', 24.5, 30.5);
    far.run(3);
    expect(t1.state).not.toBe('chase');
    const near = setup({ x: 24.5, y: 24.5 });
    const t2 = near.sys.spawn('triceratops', 24.5, 27.2);
    near.run(3);
    expect(['chase', 'windup']).toContain(t2.state);
  });

  it('à la réapparition, les prédateurs proches du point de départ s’en vont', () => {
    const { sys } = setup();
    const wolf = sys.spawn('wolf', 26.5, 24.5);
    const deer = sys.spawn('deer', 27.5, 24.5);
    sys.onPlayerRespawn(24.5, 24.5);
    expect(sys.creatures).not.toContain(wolf);
    expect(sys.creatures).toContain(deer);
  });

  it('les groupes apparaissent hors de vue, sur un sol praticable', () => {
    const { sys, player } = setup();
    const added = sys.populate(40);
    expect(added.length).toBeGreaterThan(0);
    for (const c of added) {
      expect(dist(c, player)).toBeGreaterThan(creaturesCfg.spawner.spawnMin - 2);
      expect(sys.walkable(c.x, c.y)).toBe(true);
    }
  });

  it('la viande se cuit au feu de camp et nourrit bien plus que crue', () => {
    const { sv, world } = setup({ give: [['raw_meat', 2], ['campfire', 1]] });
    expect(sv.craft('cooked_meat')).toBe(0);
    sv.selectHotbar(sv.inventory.slots.findIndex((s) => s?.item === 'campfire'));
    expect(sv.placeAt(26.5, 24.5)).not.toBeNull();
    expect(sv.craft('cooked_meat', 2)).toBe(2);
    expect(sv.inventory.count('cooked_meat')).toBe(2);
    expect(items.cooked_meat.food.hunger).toBeGreaterThan(items.raw_meat.food.hunger * 3);
    expect(world.built.size).toBe(1);
  });

  it('la carcasse pourrit et disparaît après le délai', () => {
    const { sys, world } = setup();
    const r = sys.spawn('rabbit', 26.5, 26.5);
    r.hp = 0;
    sys.step(DT);
    expect(world.propsNear(26.5, 26.5, 0.5).length).toBe(1);
    world.time += creaturesCfg.spawner.carcassSeconds + 1;
    world.updateTransients();
    expect(world.propsNear(26.5, 26.5, 0.5).filter((p) => p.type === 'carcass_rabbit').length).toBe(0);
  });
});

describe('raptor', () => {
  it('mord, repart en courant, puis revient attaquer', () => {
    const { sys, sv, player, run } = setup();
    sv.vitals.health = 1e9;
    const r = sys.spawn('raptor', 27.5, 24.5);
    r.face(-1, 0);
    let bites = 0, last = sv.vitals.health, maxAway = 0, retreated = false;
    for (let t = 0; t < 12; t += 0.1) {
      run(0.1);
      sv.hurtCd = 0;
      if (sv.vitals.health < last) bites++;
      last = sv.vitals.health;
      if (r.state === 'retreat') retreated = true;
      if (bites === 1) maxAway = Math.max(maxAway, dist(r, player));
    }
    expect(retreated).toBe(true);
    expect(maxAway).toBeGreaterThan(2.5);
    expect(bites).toBeGreaterThanOrEqual(2);
  });
});
