/**
 * Automatic save of a procedural world: what the player changed (chunk
 * deltas: harvests, dropped items, constructions), the world time, and the
 * player (position, inventory, equipment, needs). One save per seed, kept in
 * the app's local storage; the previous save is kept as a backup and used if
 * the latest one cannot be read.
 *
 * shortcut: local storage (about 5 MB, ample for deltas), until the save
 * files with slots and a menu of phase 7 (%APPDATA%\Prehistoric\saves).
 */
export const SAVE_VERSION = 1;

export function saveKey(seed) {
  return `prehistoric.save.${seed}`;
}

export function buildSave({ settings, world, player, survival }) {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    settings,
    time: world.time,
    player: { x: player.x, y: player.y },
    survival: survival.toJSON(),
    deltas: world.deltas.toJSON(),
  };
}

/** Writes a save; the previous one becomes the backup. Returns false when storage refused it. */
export function writeSave(storage, seed, data) {
  if (!storage) return false;
  const key = saveKey(seed);
  try {
    const text = JSON.stringify(data);
    const previous = storage.getItem(key);
    if (previous) storage.setItem(`${key}.prev`, previous);
    storage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

/** Latest readable save for a seed (falls back to the backup), or null. */
export function readSave(storage, seed) {
  if (!storage) return null;
  const key = saveKey(seed);
  for (const k of [key, `${key}.prev`]) {
    try {
      const data = JSON.parse(storage.getItem(k));
      if (data?.version === SAVE_VERSION && data.deltas && data.player) return data;
    } catch {
      // Unreadable: try the backup.
    }
  }
  return null;
}
