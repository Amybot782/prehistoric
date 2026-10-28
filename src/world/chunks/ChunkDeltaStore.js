/**
 * Player modifications to the generated world, per chunk.
 *
 * The generator recreates any chunk from the seed; this store only keeps
 * what differs:
 *   - removed: generated objects that are gone (harvested), with the world
 *     time it happened, so they can grow back after their regrowth delay;
 *   - damage: what is left of partly harvested objects (harvest points);
 *   - tiles: changed ground tiles;
 *   - dropped: items put on the ground by the player.
 * Its size grows with what the player did, not with the area explored. It
 * survives chunk unloading and is what the save system writes.
 */
export class ChunkDeltaStore {
  constructor() {
    this.chunks = new Map();
    this.nextDropId = 1;
  }

  _get(key, create) {
    let d = this.chunks.get(key);
    if (!d && create) {
      d = { removed: new Map(), tiles: new Map(), damage: new Map(), dropped: new Map() };
      this.chunks.set(key, d);
    }
    return d;
  }

  /** Records that a generated object is gone, with the world time it happened. */
  removeProp(chunkKey, propId, time = 0) {
    const d = this._get(chunkKey, true);
    d.removed.set(propId, time);
    d.damage.delete(propId);
  }

  restoreProp(chunkKey, propId) {
    const d = this._get(chunkKey, false);
    if (!d) return;
    d.removed.delete(propId);
    this._prune(chunkKey, d);
  }

  isRemoved(chunkKey, propId) {
    return this._get(chunkKey, false)?.removed.has(propId) ?? false;
  }

  /** World time the object was removed, or undefined. */
  removedAt(chunkKey, propId) {
    return this._get(chunkKey, false)?.removed.get(propId);
  }

  /** Harvest points left on a partly harvested object. */
  setDamage(chunkKey, propId, hpLeft) {
    this._get(chunkKey, true).damage.set(propId, hpLeft);
  }

  hpLeft(chunkKey, propId) {
    return this._get(chunkKey, false)?.damage.get(propId);
  }

  setTile(chunkKey, index, groundId) {
    this._get(chunkKey, true).tiles.set(index, groundId);
  }

  /** Item stack lying on the ground; returns its id. */
  addDropped(chunkKey, entry) {
    const id = `d${this.nextDropId++}`;
    this._get(chunkKey, true).dropped.set(id, { ...entry });
    return id;
  }

  updateDropped(chunkKey, id, count) {
    const e = this._get(chunkKey, false)?.dropped.get(id);
    if (e) e.count = count;
  }

  removeDropped(chunkKey, id) {
    const d = this._get(chunkKey, false);
    if (!d) return;
    d.dropped.delete(id);
    this._prune(chunkKey, d);
  }

  dropped(chunkKey) {
    const d = this._get(chunkKey, false);
    return d ? [...d.dropped] : [];
  }

  /** Applies stored ground changes to freshly generated chunk data (in place). */
  applyTiles(chunkKey, data) {
    const d = this._get(chunkKey, false);
    if (d) for (const [i, g] of d.tiles) data.ground[i] = g;
    return data;
  }

  /** Ground changes plus removal of removed objects (no regrowth rules). */
  apply(chunkKey, data) {
    this.applyTiles(chunkKey, data);
    const d = this._get(chunkKey, false);
    if (d?.removed.size) data.props = data.props.filter((p) => !d.removed.has(p.id));
    return data;
  }

  _prune(key, d) {
    if (d.removed.size === 0 && d.tiles.size === 0 && d.damage.size === 0 && d.dropped.size === 0) this.chunks.delete(key);
  }

  get size() {
    return this.chunks.size;
  }

  toJSON() {
    const out = {};
    for (const [k, d] of this.chunks) {
      out[k] = { removed: [...d.removed], tiles: [...d.tiles], damage: [...d.damage], dropped: [...d.dropped] };
    }
    return { version: 2, nextDropId: this.nextDropId, chunks: out };
  }

  /** Reads versions 1 (phase 2) and 2. */
  static fromJSON(json) {
    const store = new ChunkDeltaStore();
    if (!json || (json.version !== 1 && json.version !== 2)) return store;
    store.nextDropId = json.nextDropId ?? 1;
    for (const [k, d] of Object.entries(json.chunks ?? {})) {
      store.chunks.set(k, {
        removed: new Map(d.removed ?? []),
        tiles: new Map(d.tiles ?? []),
        damage: new Map(d.damage ?? []),
        dropped: new Map((d.dropped ?? []).map(([id, e]) => [id, { ...e }])),
      });
    }
    return store;
  }
}
