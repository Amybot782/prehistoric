/**
 * Player modifications to the generated world, per chunk.
 *
 * The generator recreates any chunk from the seed; this store only keeps
 * what differs: removed objects (harvested trees, mined rocks...) and changed
 * ground tiles. Its size grows with what the player did, not with the area
 * explored. It survives chunk unloading and is what the save system writes.
 * Regrowth (phase 3) will remove entries from `removed` after a delay.
 */
export class ChunkDeltaStore {
  constructor() {
    this.chunks = new Map();
  }

  _get(key, create) {
    let d = this.chunks.get(key);
    if (!d && create) {
      d = { removed: new Map(), tiles: new Map() };
      this.chunks.set(key, d);
    }
    return d;
  }

  /** Records that a generated object is gone, with the world time it happened. */
  removeProp(chunkKey, propId, time = 0) {
    this._get(chunkKey, true).removed.set(propId, time);
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

  setTile(chunkKey, index, groundId) {
    this._get(chunkKey, true).tiles.set(index, groundId);
  }

  /** Applies stored modifications to freshly generated chunk data (in place). */
  apply(chunkKey, data) {
    const d = this._get(chunkKey, false);
    if (!d) return data;
    for (const [i, g] of d.tiles) data.ground[i] = g;
    if (d.removed.size) data.props = data.props.filter((p) => !d.removed.has(p.id));
    return data;
  }

  _prune(key, d) {
    if (d.removed.size === 0 && d.tiles.size === 0) this.chunks.delete(key);
  }

  get size() {
    return this.chunks.size;
  }

  toJSON() {
    const out = {};
    for (const [k, d] of this.chunks) {
      out[k] = { removed: [...d.removed], tiles: [...d.tiles] };
    }
    return { version: 1, chunks: out };
  }

  static fromJSON(json) {
    const store = new ChunkDeltaStore();
    if (!json || json.version !== 1) return store;
    for (const [k, d] of Object.entries(json.chunks ?? {})) {
      store.chunks.set(k, { removed: new Map(d.removed ?? []), tiles: new Map(d.tiles ?? []) });
    }
    return store;
  }
}
