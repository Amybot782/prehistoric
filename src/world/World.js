import { CollisionWorld } from '../physics/CollisionWorld.js';
import { circle, aabb } from '../physics/shapes.js';

/**
 * Logical world state for phase 1: a bounded ground grid, static props and
 * moving entities. Phase 2 replaces the single grid by streamed chunks with
 * the same public API (tileAt, props, collisions), so systems built on top of
 * it do not change.
 */
export class World {
  constructor({ width, height, terrainTypes, propDefs, physicsCfg }) {
    this.width = width;
    this.height = height;
    this.ground = new Uint8Array(width * height);
    this.terrainTypes = terrainTypes;
    this.propDefs = propDefs;
    this.props = [];
    this.entities = [];
    this.collisions = new CollisionWorld(physicsCfg);
    this._nextPropId = 1;
  }

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  tileAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return -1;
    return this.ground[ty * this.width + tx];
  }

  setTile(tx, ty, typeId) {
    if (!this.inBounds(tx, ty)) return;
    this.ground[ty * this.width + tx] = typeId;
  }

  /**
   * Builds colliders for solid terrain and the outer border. Call once the
   * ground is filled (phase 2 will do this per chunk on load).
   */
  buildTerrainColliders() {
    for (let ty = 0; ty < this.height; ty++) {
      for (let tx = 0; tx < this.width; tx++) {
        const t = this.terrainTypes[this.tileAt(tx, ty)];
        if (t && t.solid) {
          this.collisions.addStatic({ shape: aabb(tx, ty, tx + 1, ty + 1), solid: true, owner: { kind: 'terrain', tx, ty } });
        }
      }
    }
    const w = this.width, h = this.height, t = 1;
    const owner = { kind: 'border' };
    this.collisions.addStatic({ shape: aabb(-t, -t, w + t, 0), owner });
    this.collisions.addStatic({ shape: aabb(-t, h, w + t, h + t), owner });
    this.collisions.addStatic({ shape: aabb(-t, 0, 0, h), owner });
    this.collisions.addStatic({ shape: aabb(w, 0, w + t, h), owner });
  }

  /** Places a prop centred on tile (tx, ty). Returns null if the spot is blocked. */
  addProp(type, tx, ty) {
    const def = this.propDefs[type];
    if (!def) throw new Error(`Type d'objet inconnu : ${type}`);
    const cx = tx + 0.5;
    const cy = ty + 0.5;
    const prop = { id: this._nextPropId++, type, tx, ty, x: cx, y: cy, def, collider: null };
    if (def.collider) {
      const c = def.collider;
      const shape = c.type === 'circle' ? circle(cx, cy, c.r) : aabb(cx - c.hw, cy - c.hh, cx + c.hw, cy + c.hh);
      prop.collider = this.collisions.addStatic({ shape, solid: true, owner: prop });
    }
    this.props.push(prop);
    return prop;
  }

  addEntity(entity) {
    this.entities.push(entity);
    return entity;
  }
}
