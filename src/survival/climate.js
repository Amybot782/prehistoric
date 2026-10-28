/**
 * Air temperature (°C) at a tile, from the world's temperature field, the
 * biome, the altitude and water. There is no day/night or weather yet
 * (phase 7); they will add an offset here.
 */
export function airTemperature(world, x, y, cfg, biomeKeys) {
  const t = cfg.temperature;
  const gen = world.generator;
  if (typeof gen.temperature !== 'function') return t.testMapAir;
  const tx = Math.floor(x), ty = Math.floor(y);
  const a = t.air;
  let temp = a.base + gen.temperature(tx + 0.5, ty + 0.5) * a.range;
  const biome = biomeKeys[world.biomeAt(tx, ty)];
  temp += a.biome[biome] ?? 0;
  temp -= Math.max(0, world.heightAt(tx, ty) - a.levelReference) * a.perLevelAbove;
  const ground = world.tileAt(tx, ty);
  if (ground >= 0 && world.terrainTypes[ground].key === 'shallow_water') temp += a.inWater;
  return temp;
}
