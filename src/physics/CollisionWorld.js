import { SpatialHash } from './SpatialHash.js';
import { shapeBounds, circleVsShape } from './shapes.js';

/**
 * Static collision world and circle mover.
 *
 * Moving bodies are circles on the ground plane. A move is split into
 * sub-steps no longer than `maxSubstepDistance`, so a fast body cannot tunnel
 * through a thin wall, and after each sub-step overlaps are resolved by
 * pushing the circle out along the contact normal, which naturally makes the
 * body slide along walls instead of sticking to them.
 */
export class CollisionWorld {
  constructor({ spatialCellSize, maxSubstepDistance, resolveIterations }) {
    this.hash = new SpatialHash(spatialCellSize);
    this.maxSubstepDistance = maxSubstepDistance;
    this.resolveIterations = resolveIterations;
    this._candidates = [];
    this._hit = { nx: 0, ny: 0, depth: 0 };
  }

  /** Registers a solid. `collider` = { shape, solid = true, owner }. */
  addStatic(collider) {
    const b = shapeBounds(collider.shape);
    this.hash.insert(collider, b.minX, b.minY, b.maxX, b.maxY);
    return collider;
  }

  removeStatic(collider) {
    return this.hash.remove(collider);
  }

  get staticCount() {
    return this.hash.size;
  }

  /** True if a circle at (x, y) overlaps any solid. */
  overlaps(x, y, r) {
    const list = this.hash.query(x - r, y - r, x + r, y + r, this._candidates);
    for (const c of list) {
      if (c.solid === false) continue;
      if (circleVsShape(x, y, r, c.shape, this._hit)) return true;
    }
    return false;
  }

  /**
   * Moves `body` ({x, y, radius}) by (dx, dy) with collision response.
   * Returns the number of contacts resolved (useful for debug/tests).
   */
  moveCircle(body, dx, dy) {
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / this.maxSubstepDistance));
    const sx = dx / steps;
    const sy = dy / steps;
    let contacts = 0;
    for (let i = 0; i < steps; i++) {
      body.x += sx;
      body.y += sy;
      contacts += this.resolve(body);
    }
    return contacts;
  }

  /** Pushes a circle out of every overlapping solid. */
  resolve(body) {
    const r = body.radius;
    let contacts = 0;
    for (let it = 0; it < this.resolveIterations; it++) {
      const list = this.hash.query(body.x - r, body.y - r, body.x + r, body.y + r, this._candidates);
      let moved = false;
      for (const c of list) {
        if (c.solid === false) continue;
        if (circleVsShape(body.x, body.y, r, c.shape, this._hit)) {
          body.x += this._hit.nx * (this._hit.depth + 1e-6);
          body.y += this._hit.ny * (this._hit.depth + 1e-6);
          contacts++;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return contacts;
  }
}
