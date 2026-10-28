import { objectDepth, resolveDynamicDepth } from '../iso/depth.js';
import { shapeBounds } from '../physics/shapes.js';
import { FACING_FRAMES } from '../assets/placeholders.js';

/**
 * Visual of the player: shadow + 8-direction animated sprite. It reads the
 * interpolated simulation state each frame and owns no gameplay logic.
 * The walk cycle advances with the distance travelled, so feet never slide
 * whatever the speed or frame rate.
 */
const FRAMES_PER_ROW = 4;
const STRIDE_TILES = 0.3; // distance covered per animation frame
const WALK_CYCLE = [1, 2, 3, 2];

export class PlayerView {
  constructor(scene, player, projection, origins, world) {
    this.player = player;
    this.world = world;
    this.collisions = world?.collisions;
    this._near = [];
    this._neighbours = [];
    this._box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    this.proj = projection;
    const o = origins.player ?? { x: 0.5, y: 0.92 };
    const so = origins.shadow ?? { x: 0.5, y: 0.5 };
    this.shadow = scene.add.image(0, 0, 'shadow').setOrigin(so.x, so.y);
    this.sprite = scene.add.sprite(0, 0, 'player', 0).setOrigin(o.x, o.y);
    this.screen = { x: 0, y: 0 };
    this.depth = 0;
    this._w = { x: 0, y: 0, z: 0 };
  }

  /**
   * @param {number} alpha interpolation factor from the fixed-step clock
   * @param {(v:number)=>number} [snap] rounds to the camera's screen-pixel grid
   */
  update(alpha, snap = (v) => v) {
    const w = this.player.interpolated(alpha, this._w);
    const s = this.proj.worldToScreen(w.x, w.y, w.z, this.screen);
    s.x = snap(s.x);
    s.y = snap(s.y);
    this.depth = this.computeDepth(w.x, w.y);
    this.sprite.setPosition(s.x, s.y).setDepth(this.depth);
    this.shadow.setPosition(s.x, s.y).setDepth(this.depth - 0.001);

    const [row, flip] = FACING_FRAMES[this.player.facing];
    let f = 0;
    if (this.player.moving) {
      f = WALK_CYCLE[Math.floor(this.player.distanceWalked / STRIDE_TILES) % WALK_CYCLE.length];
    }
    this.sprite.setFrame(row * FRAMES_PER_ROW + f);
    this.sprite.setFlipX(flip);
  }

  /** Centre-rule depth corrected against nearby props (see resolveDynamicDepth). */
  computeDepth(x, y) {
    let base = objectDepth(x, y, 0, 0.5);
    if (!this.collisions) return base;
    base = Math.max(base, this.reliefFloor(x, y));
    const r = this.player.radius;
    const box = this._box;
    box.minX = x - r; box.maxX = x + r; box.minY = y - r; box.maxY = y + r;
    const near = this.collisions.hash.query(x - 1.5, y - 1.5, x + 1.5, y + 1.5, this._near);
    const list = this._neighbours;
    list.length = 0;
    for (const c of near) {
      const prop = c.owner;
      if (!prop || prop.def === undefined) continue; // terrain and borders have no sprite
      list.push({ box: shapeBounds(c.shape), depth: objectDepth(prop.x, prop.y) });
    }
    return resolveDynamicDepth(box, base, list);
  }

  /**
   * Raised tiles are sorted sprites (see ChunkRenderer). Those the player
   * stands on or above must never cover the character, even when its centre
   * is near their back edge.
   */
  reliefFloor(x, y) {
    const w = this.world;
    const level = Math.round(this.player.z / w.levelHeight + 0.2);
    let floor = -Infinity;
    const tx0 = Math.floor(x), ty0 = Math.floor(y);
    for (let ty = ty0 - 1; ty <= ty0 + 1; ty++) {
      for (let tx = tx0 - 1; tx <= tx0 + 1; tx++) {
        const h = w.heightAt(tx, ty);
        if (h > 0 && h <= level) floor = Math.max(floor, objectDepth(tx + 0.25, ty + 0.25) + 0.01);
      }
    }
    return floor;
  }
}
