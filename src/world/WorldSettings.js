/**
 * Parameters chosen when a world is created. They are stored with the save
 * (phase 7) and, with the seed, fully determine the initial world: the same
 * seed and the same settings always produce the same terrain and objects.
 *
 * Each slider is a factor: 0.5 = low, 1 = balanced (default), 2 = high.
 */
export const DEFAULT_WORLD_SETTINGS = Object.freeze({
  seed: 'prehistoric',
  biomeSize: 1,
  relief: 1,
  forestDensity: 1,
  waterAmount: 1,
  resourceAbundance: 1,
});

const RANGES = {
  biomeSize: [0.25, 4],
  relief: [0, 2],
  forestDensity: [0, 3],
  waterAmount: [0, 2.5],
  resourceAbundance: [0, 3],
};

/** Fills defaults and clamps values; unknown keys are dropped. */
export function normalizeWorldSettings(input = {}) {
  const out = { ...DEFAULT_WORLD_SETTINGS };
  if (input.seed !== undefined && String(input.seed).trim() !== '') out.seed = String(input.seed).trim().slice(0, 64);
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    const v = Number(input[key]);
    if (Number.isFinite(v)) out[key] = Math.min(max, Math.max(min, v));
  }
  return out;
}

/** Turns any seed text into a 32-bit integer (FNV-1a). Numbers keep their value. */
export function seedToInt(seed) {
  const s = String(seed);
  if (/^-?\d{1,9}$/.test(s)) return Number(s) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A readable random seed for "new world". */
export function randomSeed() {
  return String(Math.floor(Math.random() * 1e9));
}
