/**
 * Uniform grid spatial index in world space.
 *
 * Items are registered with their world-space bounding box and can be found
 * by area queries. Used for static colliders now, and for entities, AI
 * perception and interaction lookups in later phases. Query results are
 * written into a reusable array to avoid per-frame allocations.
 */
export class SpatialHash {
  constructor(cellSize = 2) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.itemCells = new Map();
    this._stamp = 0;
    this._seen = new Map();
  }

  _key(cx, cy) {
    // Stable integer key for |cx|,|cy| < 2^20 (≈ 2 million tiles at cellSize 2).
    return (cx + 1048576) * 2097152 + (cy + 1048576);
  }

  insert(item, minX, minY, maxX, maxY) {
    if (this.itemCells.has(item)) this.remove(item);
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs), y0 = Math.floor(minY / cs);
    const x1 = Math.floor(maxX / cs), y1 = Math.floor(maxY / cs);
    const keys = [];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this._key(cx, cy);
        let cell = this.cells.get(k);
        if (!cell) {
          cell = [];
          this.cells.set(k, cell);
        }
        cell.push(item);
        keys.push(k);
      }
    }
    this.itemCells.set(item, keys);
  }

  remove(item) {
    const keys = this.itemCells.get(item);
    if (!keys) return false;
    for (const k of keys) {
      const cell = this.cells.get(k);
      if (!cell) continue;
      const i = cell.indexOf(item);
      if (i >= 0) {
        cell[i] = cell[cell.length - 1];
        cell.pop();
      }
      if (cell.length === 0) this.cells.delete(k);
    }
    this.itemCells.delete(item);
    return true;
  }

  /** Items whose cells intersect the box. `out` is cleared and returned. */
  query(minX, minY, maxX, maxY, out = []) {
    out.length = 0;
    const stamp = ++this._stamp;
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs), y0 = Math.floor(minY / cs);
    const x1 = Math.floor(maxX / cs), y1 = Math.floor(maxY / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this._key(cx, cy));
        if (!cell) continue;
        for (const item of cell) {
          if (this._seen.get(item) === stamp) continue;
          this._seen.set(item, stamp);
          out.push(item);
        }
      }
    }
    return out;
  }

  get size() {
    return this.itemCells.size;
  }

  clear() {
    this.cells.clear();
    this.itemCells.clear();
    this._seen.clear();
  }
}
