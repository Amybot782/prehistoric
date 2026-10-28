import { DEFAULT_WORLD_SETTINGS, normalizeWorldSettings, randomSeed } from './WorldSettings.js';

/**
 * Which world to open at startup, until the main menu and saves (phase 7)
 * take over: `?map=test` opens the hand-built test area, `?seed=...` a given
 * seed; otherwise the last world played (remembered in the browser storage
 * of the app), or the default seed on the very first launch.
 */
const STORAGE_KEY = 'prehistoric.lastWorld';

export function resolveWorldChoice(locationSearch = '', storage = safeStorage()) {
  const params = new URLSearchParams(locationSearch);
  if (params.get('map') === 'test') return { mode: 'test', settings: normalizeWorldSettings({ seed: 'test' }) };
  if (params.get('seed')) return { mode: 'procedural', settings: normalizeWorldSettings({ seed: params.get('seed') }) };
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) return { mode: 'procedural', settings: normalizeWorldSettings(JSON.parse(saved)) };
  } catch {
    // Unreadable entry: fall back to the default world.
  }
  return { mode: 'procedural', settings: { ...DEFAULT_WORLD_SETTINGS } };
}

export function rememberWorld(settings, storage = safeStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the world simply is not remembered.
  }
}

export function newRandomWorldSettings(previous) {
  return normalizeWorldSettings({ ...previous, seed: randomSeed() });
}

function safeStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
