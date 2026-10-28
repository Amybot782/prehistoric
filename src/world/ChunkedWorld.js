import { CollisionWorld } from '../physics/CollisionWorld.js';
import { circle, aabb } from '../physics/shapes.js';
import { EventBus } from '../core/EventBus.js';
import { ChunkDeltaStore } from './chunks/ChunkDeltaStore.js';

/**
 * The world as a set of streamed chunks.
 *
 * Only chunks near the player are in memory. Loading a chunk generates it
 * from the seed (any generator with `generateChunk`, `heightAt`, `size`),
 * applies the player's modifications from the delta store, and registers its
 * colliders; unloading removes everything but keeps the modifications.
 * Renderers and the minimap listen to `chunk:loaded` / `chunk:unloaded` /
 * `prop:added` / `prop:removed` / `prop:damaged` on `events` and never
 * reach into the generator. Harvested objects leave a stump when their
 * definition says so and grow back after `regrowSeconds` of world time.
 *
 * Chunk coordinates are integers: chunk (cx, cy) covers tiles
 * [cx*size, cx*size+size) x [cy*size, cy*size+size).
 */
export function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

export class ChunkedWorld {
  constructor({ generator, terrainTypes, propDefs, physicsCfg, levelHeight, streaming, deltas }) {
    this.generator = generator;
    this.size = generator.size;
    this.terrainTypes = terrainTypes;
    this.propDefs = propDefs;
    this.levelHeight = levelHeight;
    this.streaming = streaming;
    this.deltas = deltas ?? new ChunkDeltaStore();
    this.collisions = new CollisionWorld(physicsCfg);
    this.events = new EventBus();
    this.chunks = new Map();
    this.entities = [];
    this.stats = { generated: 0, unloaded: 0, lastGenMs: 0 };
    this.time = 0; // world time in seconds, advanced by the simulation (regrowth)
  }

  // ---- Queries -------------------------------------------------------------

  chunkOf(tx, ty) {
    return this.chunks.get(chunkKey(Math.floor(tx / this.size), Math.floor(ty / this.size)));
  }

  _index(chunk, tx, ty) {
    return (ty - chunk.cy * this.size) * this.size + (tx - chunk.cx * this.size);
  }

  /** Ground type id, or -1 when the chunk is not loaded. */
  tileAt(tx, ty) {
    const c = this.chunkOf(tx, ty);
    return c ? c.ground[this._index(c, tx, ty)] : -1;
  }

  biomeAt(tx, ty) {
    const c = this.chunkOf(tx, ty);
    return c ? c.biome[this._index(c, tx, ty)] : -1;
  }

  /** Height level; falls back to the generator for unloaded tiles (chunk edges). */
  heightAt(tx, ty) {
    const c = this.chunkOf(tx, ty);
    return c ? c.height[this._index(c, tx, ty)] : this.generator.heightAt(tx, ty);
  }

  /** Ground height in world z units under a world position. */
  groundZ(x, y) {
    return this.heightAt(Math.floor(x), Math.floor(y)) * this.levelHeight;
  }

  isLoaded(cx, cy) {
    return this.chunks.has(chunkKey(cx, cy));
  }

  get loadedCount() {
    return this.chunks.size;
  }

  *props() {
    for (const c of this.chunks.values()) yield* c.props;
  }

  addEntity(entity) {
    this.entities.push(entity);
    return entity;
  }

  // ---- Streaming -------------------------------------------------------------

  /**
   * Loads chunks touching the box (in tiles) and unloads those beyond the
   * unload margin. Generation is limited to `chunksPerFrame`, nearest first;
   * pass `Infinity` to load everything now (spawn, teleport).
   */
  stream(box, budget = this.streaming.chunksPerFrame) {
    const n = this.size;
    const m = this.streaming.marginTiles;
    const cx0 = Math.floor((box.minX - m) / n), cx1 = Math.floor((box.maxX + m) / n);
    const cy0 = Math.floor((box.minY - m) / n), cy1 = Math.floor((box.maxY + m) / n);
    const midX = (box.minX + box.maxX) / 2 / n;
    const midY = (box.minY + box.maxY) / 2 / n;
    const wanted = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.chunks.has(chunkKey(cx, cy))) wanted.push([cx, cy, (cx + 0.5 - midX) ** 2 + (cy + 0.5 - midY) ** 2]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);
    let loaded = 0;
    for (const [cx, cy] of wanted) {
      if (loaded >= budget) break;
      this.loadChunk(cx, cy);
      loaded++;
    }
    const u = this.streaming.unloadMarginTiles;
    const ux0 = Math.floor((box.minX - u) / n), ux1 = Math.floor((box.maxX + u) / n);
    const uy0 = Math.floor((box.minY - u) / n), uy1 = Math.floor((box.maxY + u) / n);
    for (const c of [...this.chunks.values()]) {
      if (c.cx < ux0 || c.cx > ux1 || c.cy < uy0 || c.cy > uy1) this.unloadChunk(c.cx, c.cy);
    }
    return { loaded, pending: wanted.length - loaded };
  }

  loadChunk(cx, cy) {
    const key = chunkKey(cx, cy);
    if (this.chunks.has(key)) return this.chunks.get(key);
    const t0 = now();
    const data = this.deltas.applyTiles(key, this.generator.generateChunk(cx, cy));
    const chunk = {
      key, cx, cy, ground: data.ground, height: data.height, biome: data.biome,
      props: [], colliders: [], removed: new Map(),
    };
    for (const p of data.props) {
      const at = this.deltas.removedAt(key, p.id);
      if (at === undefined) {
        this._addProp(chunk, p);
      } else if (this._regrowDue(p.type, at)) {
        this.deltas.restoreProp(key, p.id);
        this._addProp(chunk, p);
      } else {
        this._keepRemoved(chunk, p, at);
      }
    }
    for (const [id, e] of this.deltas.dropped(key)) this._addProp(chunk, this._droppedData(id, e));
    this._addTerrainColliders(chunk);
    this.chunks.set(key, chunk);
    this.stats.generated++;
    this.stats.lastGenMs = now() - t0;
    this.events.emit('chunk:loaded', chunk);
    return chunk;
  }

  _regrowDue(type, removedAt) {
    const s = this.propDefs[type]?.regrowSeconds;
    return s !== undefined && this.time - removedAt >= s;
  }

  /** Remembers a harvested object (for regrowth) and puts its stump, if any. */
  _keepRemoved(chunk, raw, at) {
    chunk.removed.set(raw.id, { raw, at });
    const stump = this.propDefs[raw.type]?.stump;
    if (stump) return this._addProp(chunk, { ...raw, id: `${raw.id}_stump`, type: stump, stumpOf: raw.id });
    return null;
  }

  _droppedData(id, e) {
    const tx = Math.floor(e.x), ty = Math.floor(e.y);
    return { id, type: 'dropped', tx, ty, x: e.x, y: e.y, h: this.heightAt(tx, ty), item: e.item, count: e.count, texture: `item_${e.item}` };
  }

  unloadChunk(cx, cy) {
    const key = chunkKey(cx, cy);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    for (const c of chunk.colliders) this.collisions.removeStatic(c);
    for (const p of chunk.props) if (p.collider) this.collisions.removeStatic(p.collider);
    this.chunks.delete(key);
    this.stats.unloaded++;
    this.events.emit('chunk:unloaded', chunk);
  }

  _addProp(chunk, p) {
    const def = this.propDefs[p.type];
    if (!def) throw new Error(`Type d'objet inconnu : ${p.type}`);
    const prop = { ...p, def, chunk: chunk.key, z: (p.h ?? 0) * this.levelHeight, collider: null, hpLeft: 0 };
    if (def.harvest) prop.hpLeft = this.deltas.hpLeft(chunk.key, p.id) ?? def.harvest.hp;
    if (def.collider) {
      const c = def.collider;
      const shape = c.type === 'circle' ? circle(prop.x, prop.y, c.r) : aabb(prop.x - c.hw, prop.y - c.hh, prop.x + c.hw, prop.y + c.hh);
      prop.collider = this.collisions.addStatic({ shape, solid: true, owner: prop });
    }
    chunk.props.push(prop);
    return prop;
  }

  /** Loaded objects whose centre is within `r` tiles of (x, y). */
  propsNear(x, y, r, out = []) {
    out.length = 0;
    const n = this.size;
    const cx0 = Math.floor((x - r) / n), cx1 = Math.floor((x + r) / n);
    const cy0 = Math.floor((y - r) / n), cy1 = Math.floor((y + r) / n);
    const r2 = r * r;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(chunkKey(cx, cy));
        if (!c) continue;
        for (const p of c.props) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r2) out.push(p);
      }
    }
    return out;
  }

  /** Solid ground (deep water) as one rectangle per horizontal run of tiles. */
  _addTerrainColliders(chunk) {
    const n = this.size;
    const solid = this.terrainTypes.map((t) => t.solid);
    for (let ly = 0; ly < n; ly++) {
      let lx = 0;
      while (lx < n) {
        if (!solid[chunk.ground[ly * n + lx]]) {
          lx++;
          continue;
        }
        const start = lx;
        while (lx < n && solid[chunk.ground[ly * n + lx]]) lx++;
        const x0 = chunk.cx * n + start, y0 = chunk.cy * n + ly;
        const collider = { shape: aabb(x0, y0, chunk.cx * n + lx, y0 + 1), solid: true, owner: { kind: 'terrain' } };
        chunk.colliders.push(this.collisions.addStatic(collider));
      }
    }
  }

  // ---- Modifications -------------------------------------------------------

  /**
   * Removes an object (harvested, picked up). Generated objects are recorded
   * with the time so they can grow back; dropped items are simply forgotten.
   */
  removeProp(prop, time = this.time) {
    const chunk = this.chunks.get(prop.chunk);
    if (!chunk) return false;
    const i = chunk.props.indexOf(prop);
    if (i < 0) return false;
    chunk.props.splice(i, 1);
    if (prop.collider) this.collisions.removeStatic(prop.collider);
    this.events.emit('prop:removed', prop);
    if (prop.type === 'dropped') {
      this.deltas.removeDropped(chunk.key, prop.id);
    } else if (prop.stumpOf === undefined) {
      this.deltas.removeProp(chunk.key, prop.id, time);
      const raw = { id: prop.id, type: prop.type, tx: prop.tx, ty: prop.ty, x: prop.x, y: prop.y, h: prop.h };
      const stump = this._keepRemoved(chunk, raw, time);
      if (stump) this.events.emit('prop:added', stump);
    }
    return true;
  }

  /** Stores the harvest points left on a partly harvested object. */
  damageProp(prop, hpLeft) {
    prop.hpLeft = hpLeft;
    if (prop.type === 'dropped') return;
    this.deltas.setDamage(prop.chunk, prop.id, hpLeft);
    this.events.emit('prop:damaged', prop);
  }

  /** Puts an item stack on the ground (its chunk must be loaded). */
  dropItem(item, count, x, y) {
    const chunk = this.chunkOf(Math.floor(x), Math.floor(y));
    if (!chunk || count <= 0) return null;
    const id = this.deltas.addDropped(chunk.key, { item, count, x, y });
    const prop = this._addProp(chunk, this._droppedData(id, { item, count, x, y }));
    this.events.emit('prop:added', prop);
    return prop;
  }

  /** Changes the size of a dropped stack (partial pick-up). */
  setDroppedCount(prop, count) {
    prop.count = count;
    this.deltas.updateDropped(prop.chunk, prop.id, count);
  }

  /** Grows back harvested objects of loaded chunks whose delay has passed. */
  updateRegrowth() {
    let grown = 0;
    for (const chunk of this.chunks.values()) {
      if (!chunk.removed.size) continue;
      for (const [id, { raw, at }] of chunk.removed) {
        if (!this._regrowDue(raw.type, at)) continue;
        if (this._blocked(raw)) continue; // something stands there: try later
        chunk.removed.delete(id);
        this.deltas.restoreProp(chunk.key, id);
        const stump = chunk.props.find((p) => p.stumpOf === id);
        if (stump) {
          chunk.props.splice(chunk.props.indexOf(stump), 1);
          this.events.emit('prop:removed', stump);
        }
        this.events.emit('prop:added', this._addProp(chunk, raw));
        grown++;
      }
    }
    return grown;
  }

  /** True when an entity overlaps where a solid object would grow back. */
  _blocked(raw) {
    const c = this.propDefs[raw.type]?.collider;
    if (!c) return false;
    const r = c.type === 'circle' ? c.r : Math.max(c.hw, c.hh);
    return this.entities.some((e) => Math.hypot(e.x - raw.x, e.y - raw.y) < r + e.radius);
  }

  /** Changes a ground tile (loaded chunks only); persists across reloads. */
  setTile(tx, ty, groundId) {
    const c = this.chunkOf(tx, ty);
    if (!c) return false;
    const i = this._index(c, tx, ty);
    c.ground[i] = groundId;
    this.deltas.setTile(c.key, i, groundId);
    for (const col of c.colliders) this.collisions.removeStatic(col);
    c.colliders.length = 0;
    this._addTerrainColliders(c);
    this.events.emit('chunk:changed', c);
    return true;
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
