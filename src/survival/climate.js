import { slotKey } from '../building/placement.js';

/**
 * Air temperature (°C) at a tile, from the world's temperature field, the
 * biome, the altitude and water. There is no day/night or weather yet
 * (phase 7); they will add an offset here. Built shelters count: a roof
 * overhead and a campfire nearby warm the air.
 */
export function airTemperature(world, x, y, cfg, biomeKeys) {
  const t = cfg.temperature;
  const gen = world.generator;
  if (typeof gen.temperature !== 'function') return t.testMapAir + builtWarmth(world, x, y);
  const tx = Math.floor(x), ty = Math.floor(y);
  const a = t.air;
  let temp = a.base + gen.temperature(tx + 0.5, ty + 0.5) * a.range;
  const biome = biomeKeys[world.biomeAt(tx, ty)];
  temp += a.biome[biome] ?? 0;
  temp -= Math.max(0, world.heightAt(tx, ty) - a.levelReference) * a.perLevelAbove;
  const ground = world.tileAt(tx, ty);
  if (ground >= 0 && world.terrainTypes[ground].key === 'shallow_water') temp += a.inWater;
  return temp + builtWarmth(world, x, y);
}

/** Degrees added by a roof overhead plus the closest fire (fires do not add up). */
export function builtWarmth(world, x, y) {
  let fire = 0;
  for (const p of world.propsNear(x, y, 5)) {
    const b = p.def.build;
    if (b?.warmth) fire = Math.max(fire, b.warmth * Math.max(0, 1 - Math.hypot(p.x - x, p.y - y) / b.warmthRadius));
  }
  return fire + (world.builtAt(slotKey('roof', x, y))?.def.build.shelter ?? 0);
}
