import { Entity } from './Entity.js';

/**
 * Player-controlled character. Movement accelerates towards the desired
 * velocity, so starts and stops are snappy but not jerky, and all values come
 * from src/data/game.json. Running has no stamina cost yet: stamina belongs
 * to the survival systems of phase 3.
 */
export class Player extends Entity {
  constructor(x, y, cfg) {
    super('player', x, y, cfg.radius);
    this.cfg = cfg;
    this.running = false;
    this.moving = false;
    this.distanceWalked = 0;
    // Last movement direction in world space: what the character faces (actions).
    this.dirX = 1;
    this.dirY = 0;
  }

  /**
   * One fixed simulation step.
   * @param {number} dt step length in seconds
   * @param {{x:number,y:number}} dir normalised world direction (or zero)
   * @param {boolean} run
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisions
   * @param {import('../iso/projection.js').IsoProjection} projection
   */
  step(dt, dir, run, collisions, projection) {
    const hasInput = dir.x !== 0 || dir.y !== 0;
    this.running = hasInput && run;
    const speed = this.running ? this.cfg.runSpeed : this.cfg.walkSpeed;
    const tx = dir.x * speed;
    const ty = dir.y * speed;
    const rate = (hasInput ? this.cfg.acceleration : this.cfg.deceleration) * dt;
    this.vx = approach(this.vx, tx, rate);
    this.vy = approach(this.vy, ty, rate);

    const ox = this.x;
    const oy = this.y;
    collisions.moveCircle(this, this.vx * dt, this.vy * dt);
    // Keep velocity consistent with what actually happened (sliding on walls).
    const mx = this.x - ox;
    const my = this.y - oy;
    if (dt > 0) {
      this.vx = mx / dt;
      this.vy = my / dt;
    }
    const moved = Math.hypot(mx, my);
    this.distanceWalked += moved;
    this.moving = moved > 1e-4;
    if (hasInput) {
      this.facing = projection.facingFromWorldDir(dir.x, dir.y);
      this.dirX = dir.x;
      this.dirY = dir.y;
    }
  }
}

function approach(value, target, maxDelta) {
  if (value < target) return Math.min(value + maxDelta, target);
  if (value > target) return Math.max(value - maxDelta, target);
  return value;
}
