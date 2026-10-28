import { Simplex2 } from '../noise.js';
import { hash2 } from '../../core/random.js';
import { seedToInt, normalizeWorldSettings } from '../WorldSettings.js';

/**
 * Deterministic world generator.
 *
 * Every tile is a pure function of (seed, settings, tile coordinates):
 *   elevation  -> height level (terraces) and water,
 *   humidity + temperature + elevation -> biome,
 *   biome + per-tile hash -> ground variant and objects.
 * Chunks can therefore be generated in any order, unloaded and regenerated
 * identically; only the player's modifications need saving (ChunkDeltaStore).
 * Temperature is already computed for the biomes of later phases.
 */
export const BIOME_IDS = Object.freeze({ temperate_forest: 0, plains: 1, swamp: 2, rocky_mountains: 3 });

export class ProceduralGenerator {
  /**
   * @param {object} p
   * @param {object} p.settings world settings (see WorldSettings.js)
   * @param {object} p.cfg      src/data/worldgen.json
   * @param {Array}  p.terrainTypes src/data/terrain.json types
   * @param {Array}  p.biomes   src/data/biomes.json biomes
   */
  constructor({ settings, cfg, terrainTypes, biomes }) {
    this.settings = normalizeWorldSettings(settings);
    this.cfg = cfg;
    this.size = cfg.chunkSize;
    this.seed = seedToInt(this.settings.seed);
    this.elevNoise = new Simplex2(this.seed ^ 0x1234567);
    this.humNoise = new Simplex2(this.seed ^ 0x2345678);
    this.tempNoise = new Simplex2(this.seed ^ 0x3456789);
    this.jitterNoise = new Simplex2(this.seed ^ 0x4567891);
    this.patchNoise = new Simplex2(this.seed ^ 0x5678912);

    const s = this.settings;
    this.scale = 1 / s.biomeSize;
    this.levels = Math.max(0, Math.round(cfg.heightLevels * s.relief));
    this.seaLevel = Math.min(0.7, cfg.seaLevel * Math.sqrt(s.waterAmount));
    this.groupMultiplier = { forest: s.forestDensity, resource: s.resourceAbundance, decor: 1 };

    this.terrainIds = Object.fromEntries(terrainTypes.map((t) => [t.key, t.id]));
    this.biomes = biomes.map((b) => ({
      key: b.key,
      id: BIOME_IDS[b.key],
      ground: cumulative(b.ground.map(([k, w]) => [this.terrainIds[k], w])),
      props: b.props,
    }));
    this.biomeByKey = Object.fromEntries(this.biomes.map((b) => [b.key, b]));
  }

  // ---- Climate fields ------------------------------------------------------

  stretch(v, contrast) {
    const r = 0.5 + (v - 0.5) * contrast;
    return r < 0 ? 0 : r > 1 ? 1 : r;
  }

  elevation(tx, ty) {
    const c = this.cfg.elevation;
    return this.stretch(this.elevNoise.fbm01(tx, ty, c.octaves, c.frequency * this.scale), c.contrast);
  }

  humidity(tx, ty) {
    const c = this.cfg.humidity;
    const j = this.cfg.borderJitter;
    const base = this.stretch(this.humNoise.fbm01(tx, ty, c.octaves, c.frequency * this.scale), c.contrast);
    // Small high-frequency wobble so biome borders are irregular, not smooth curves.
    return base + this.jitterNoise.noise(tx * j.frequency, ty * j.frequency) * j.amount;
  }

  temperature(tx, ty) {
    const c = this.cfg.temperature;
    return this.stretch(this.tempNoise.fbm01(tx, ty, c.octaves, c.frequency * this.scale), c.contrast);
  }

  /**
   * Height level of a tile (0..levels). Water and shores are level 0; the
   * land above sea level is split into equal terraces.
   */
  heightFromElevation(e) {
    if (e <= this.seaLevel) return 0;
    return Math.min(this.levels, Math.floor(((e - this.seaLevel) / (1 - this.seaLevel)) * (this.levels + 1)));
  }

  heightAt(tx, ty) {
    return this.heightFromElevation(this.elevation(tx + 0.5, ty + 0.5));
  }

  /** Full description of one tile: { ground, height, biome }. */
  tile(tx, ty, out = { ground: 0, height: 0, biome: 0 }) {
    const x = tx + 0.5;
    const y = ty + 0.5;
    const cfg = this.cfg;
    const e = this.elevation(x, y);
    const h = this.humidity(x, y);
    const T = this.terrainIds;
    out.height = this.heightFromElevation(e);

    let biome;
    const jitter = this.jitterNoise.noise(x * cfg.borderJitter.frequency + 31.7, y * cfg.borderJitter.frequency) * cfg.borderJitter.amount;
    if (e + jitter > cfg.mountainLevel) biome = this.biomeByKey.rocky_mountains;
    else if (h > cfg.swampHumidity && e < cfg.swampMaxElevation) biome = this.biomeByKey.swamp;
    else if (h > cfg.forestHumidity) biome = this.biomeByKey.temperate_forest;
    else biome = this.biomeByKey.plains;
    out.biome = biome.id;

    if (e < this.seaLevel - cfg.deepWaterMargin) {
      out.ground = T.water;
    } else if (e < this.seaLevel) {
      out.ground = T.shallow_water;
    } else if (e < this.seaLevel + cfg.beachWidth && biome.key !== 'swamp') {
      out.ground = T.sand;
    } else {
      // Ground variants come in patches rather than as per-tile noise.
      const p = this.stretch(this.patchNoise.noise(x * 0.11, y * 0.11) * 0.5 + 0.5, 1.8);
      const r = p * 0.75 + hash2(tx, ty, this.seed) * 0.25;
      out.ground = pick(biome.ground, r);
    }
    return out;
  }

  /**
   * Generates one chunk. Props get stable ids derived from their tile, so a
   * prop removed by the player can be recognised after regeneration.
   */
  generateChunk(cx, cy) {
    const n = this.size;
    const ground = new Uint8Array(n * n);
    const height = new Uint8Array(n * n);
    const biome = new Uint8Array(n * n);
    const props = [];
    const t = { ground: 0, height: 0, biome: 0 };
    const T = this.terrainIds;
    for (let ly = 0; ly < n; ly++) {
      for (let lx = 0; lx < n; lx++) {
        const tx = cx * n + lx;
        const ty = cy * n + ly;
        this.tile(tx, ty, t);
        const i = ly * n + lx;
        ground[i] = t.ground;
        height[i] = t.height;
        biome[i] = t.biome;
        if (t.ground === T.water || t.ground === T.shallow_water) continue;
        const type = this.pickProp(this.biomes[t.biome], tx, ty);
        if (!type) continue;
        // Small offsets inside the tile so forests do not look like grids.
        const jx = (hash2(tx, ty, this.seed ^ 0x9e3779b9) - 0.5) * 0.36;
        const jy = (hash2(ty, tx, this.seed ^ 0x7f4a7c15) - 0.5) * 0.36;
        props.push({ id: `p${tx}_${ty}`, type, tx, ty, x: tx + 0.5 + jx, y: ty + 0.5 + jy, h: t.height });
      }
    }
    return { cx, cy, size: n, ground, height, biome, props };
  }

  pickProp(biome, tx, ty) {
    const r = hash2(tx, ty, this.seed ^ 0x51ed27);
    let acc = 0;
    for (const p of biome.props) {
      acc += p.chance * (this.groupMultiplier[p.group] ?? 1);
      if (r < acc) return p.type;
    }
    return null;
  }

  /**
   * First walkable tile near the origin in a pleasant biome, with no object on
   * it: where a new game starts. Deterministic for a given seed and settings.
   */
  findSpawn(maxRadius = 400) {
    const T = this.terrainIds;
    const good = new Set([BIOME_IDS.plains, BIOME_IDS.temperate_forest]);
    const t = { ground: 0, height: 0, biome: 0 };
    for (let r = 0; r <= maxRadius; r += 2) {
      for (let a = 0; a < Math.max(1, r * 4); a++) {
        const ang = (a / Math.max(1, r * 4)) * Math.PI * 2;
        const tx = Math.round(Math.cos(ang) * r);
        const ty = Math.round(Math.sin(ang) * r);
        this.tile(tx, ty, t);
        if (!good.has(t.biome) || t.ground === T.water || t.ground === T.shallow_water) continue;
        if (this.pickProp(this.biomes[t.biome], tx, ty)) continue;
        return { x: tx + 0.5, y: ty + 0.5 };
      }
    }
    return { x: 0.5, y: 0.5 };
  }
}

function cumulative(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let acc = 0;
  return entries.map(([id, w]) => {
    acc += w / total;
    return [id, acc];
  });
}

function pick(cum, r) {
  for (const [id, limit] of cum) if (r < limit) return id;
  return cum[cum.length - 1][0];
}
