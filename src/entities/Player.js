import { Entity } from './Entity.js';

/**
 * Player-controlled character. Movement accelerates towards the desired
 * velocity, so starts and stops are snappy but not jerky, and all values come
 * from src/data/game.json. Stamina for running and dodging is handled by
 * PlayerSurvival.
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
    this.dodgeLeft = 0; // seconds of dodge left: fast, untouchable, no steering
    this.loud = 0; // seconds during which an action (a hit) makes noise
  }

  get invulnerable() {
    return this.dodgeLeft > 0;
  }

  /** Loudness heard by animals: running is loud, standing still almost silent. */
  get noise() {
    if (this.loud > 0) return 1.2;
    return this.running ? 1 : this.moving ? 0.5 : 0.15;
  }

  /** Starts a dodge along a normalised world direction. */
  startDodge(dx, dy, speed, seconds) {
    this.dodgeLeft = seconds;
    this.vx = dx * speed;
    this.vy = dy * speed;
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
    this.loud = Math.max(0, this.loud - dt);
    if (this.dodgeLeft > 0) {
      this.dodgeLeft = Math.max(0, this.dodgeLeft - dt);
      const ox = this.x, oy = this.y;
      collisions.moveCircle(this, this.vx * dt, this.vy * dt);
      const moved = Math.hypot(this.x - ox, this.y - oy);
      this.distanceWalked += moved;
      this.moving = moved > 1e-4;
      if (this.dodgeLeft === 0) { this.vx *= 0.3; this.vy *= 0.3; }
      return;
    }
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
