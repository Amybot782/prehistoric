import { Entity } from '../entities/Entity.js';
import { lineClear } from './combat.js';

/**
 * An animal or a dinosaur. Behaviour is a small state machine driven by the
 * species data (src/data/creatures.json), the same for every species, so
 * different species really behave differently only through their numbers:
 *
 *   idle / wander  rests, then walks around its home spot
 *   flee           runs away from a threat it saw or heard (fearful species)
 *   chase          runs to a target (player or prey) and attacks in reach
 *   windup         the attack is coming: it stops a moment, then bites/charges
 *                  (the player can dodge during this time)
 *   retreat        after biting the player, a hit-and-run hunter (raptor)
 *                  sprints off to one side, then comes back
 *   eat            a hungry carnivore eats a carcass
 *   home           a territorial creature walks back after a chase
 *
 * Perception: sight (range, wide field of view, blocked by obstacles) and
 * hearing (range x how noisy the other is: running is loud). A threat is
 * remembered for `memory` seconds after it was last perceived.
 * No Phaser here: the creature system feeds it a context each step.
 */
const THINK_EVERY = 0.2;
const ACCEL = 18;
const TIRES_AFTER = 4; // seconds of flight
const TIRED_SPEED = 0.6;

export class Creature extends Entity {
  constructor(species, def, x, y, rng) {
    super('creature', x, y, def.radius);
    this.species = species;
    this.def = def;
    this.rng = rng;
    this.hp = def.hp;
    this.state = 'idle';
    this.timer = rng.range(0.5, 3);
    this.home = { x, y };
    this.goal = null; // wander destination
    this.target = null; // entity chased
    this.threat = null; // { x, y, source, until }
    this.carcass = null;
    this.lastSeen = 0;
    this.attackCd = 0;
    this.thinkIn = rng.range(0, THINK_EVERY);
    this.fed = rng.range(20, 90); // seconds before a carnivore gets hungry
    this.hurtAt = -99;
    this.attackAt = -99;
    this.stuck = 0;
    this.fleeFor = 0; // seconds spent running away: prey tires, so predators can catch it
    this.turn = 1;
    this.moving = false;
    this.running = false;
    this.distanceWalked = 0;
    this.dirX = 1;
    this.dirY = 0;
  }

  get dead() {
    return this.hp <= 0;
  }

  /** Loudness heard by others: running is loud, standing still almost silent. */
  get noise() {
    return this.running ? 1 : this.moving ? 0.5 : 0.15;
  }

  /** Sees or hears `other` (an entity with x, y, radius and noise). */
  perceives(other, ctx) {
    const d = Math.hypot(other.x - this.x, other.y - this.y);
    if (d <= this.def.hearing * other.noise) return true;
    if (d > this.def.vision) return false;
    // Wide field of view: only what is behind it, beyond 2 tiles, goes unseen.
    const front = d < 2 || ((other.x - this.x) * this.dirX + (other.y - this.y) * this.dirY) / d > -0.4;
    return front && lineClear(ctx.collisions, this.x, this.y, other.x, other.y);
  }

  /** Takes a hit; fearful creatures flee from the attacker, others fight back. */
  hurt(amount, source, kx = 0, ky = 0, time = 0) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.hurtAt = time;
    this.lastHitBy = source;
    this.vx += kx;
    this.vy += ky;
    if (this.dead || !source) return;
    this.react(source, time);
  }

  /** Response to a threat perceived or signalled by the group. */
  react(source, time) {
    if (this.dead) return;
    if (this.def.temper === 'fearful') this.startFlee(source, time);
    else this.startChase(source, time);
  }

  startFlee(source, time) {
    this.threat = { x: source.x, y: source.y, source, until: time + this.def.memory };
    if (this.state !== 'flee') this.state = 'flee';
  }

  startChase(target, time) {
    if (this.target !== target) this.target = target;
    this.lastSeen = time;
    if (this.state !== 'windup' && this.state !== 'retreat') this.state = 'chase';
  }

  /** One fixed simulation step. */
  step(dt, ctx) {
    if (this.dead) return;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.fed -= dt;
    this.fleeFor = this.state === 'flee' ? this.fleeFor + dt : Math.max(0, this.fleeFor - dt * 0.5);
    this.thinkIn -= dt;
    if (this.thinkIn <= 0) {
      this.thinkIn = THINK_EVERY;
      this.think(ctx);
    }
    const t = ctx.time;
    const d = this.def;
    switch (this.state) {
      case 'idle':
        this.brake(dt, ctx);
        if ((this.timer -= dt) <= 0) this.pickWander(ctx);
        break;
      case 'wander':
        if (!this.goal || this.reached(this.goal, 0.3) || this.stuck > 1) {
          this.state = 'idle';
          this.timer = this.rng.range(1.5, 5);
          this.stuck = 0;
        } else this.moveTo(this.goal.x, this.goal.y, d.walk, dt, ctx);
        break;
      case 'flee': {
        const th = this.threat;
        const far = !th || Math.hypot(th.x - this.x, th.y - this.y) > d.vision * 1.3;
        if (!th || (t > th.until && far)) {
          this.threat = null;
          this.state = 'idle';
          this.timer = this.rng.range(1, 3);
          break;
        }
        if (this.stuck > 0.4) {
          this.turn = -this.turn;
          this.stuck = 0;
        }
        // Away from the threat; when blocked, veer to one side.
        let ax = this.x - th.x, ay = this.y - th.y;
        const l = Math.hypot(ax, ay) || 1;
        ax /= l; ay /= l;
        const side = this.turn * (this.blockedRecently ? 0.9 : 0.15);
        const speed = this.fleeFor > TIRES_AFTER ? d.run * TIRED_SPEED : d.run;
        this.moveDir(ax - ay * side, ay + ax * side, speed, dt, ctx);
        break;
      }
      case 'chase': {
        const tg = this.target;
        if (!tg || tg.dead || t - this.lastSeen > d.memory || Math.hypot(tg.x - this.x, tg.y - this.y) > (d.giveUp ?? d.vision * 1.6) || this.tooFarFromHome()) {
          this.dropTarget();
          break;
        }
        const gap = Math.hypot(tg.x - this.x, tg.y - this.y) - tg.radius - this.radius;
        if (gap <= d.attack.reach && this.attackCd <= 0) {
          this.state = 'windup';
          // Only the player gets a warning to dodge; prey is bitten at once.
          this.timer = tg === ctx.player ? d.attack.windup : 0;
          this.face(tg.x - this.x, tg.y - this.y);
          break;
        }
        if (gap <= d.attack.reach) this.brake(dt, ctx);
        else this.moveTo(tg.x, tg.y, d.run, dt, ctx);
        break;
      }
      case 'windup': {
        this.brake(dt, ctx);
        if ((this.timer -= dt) > 0) break;
        const tg = this.target;
        this.attackCd = d.attack.cooldown;
        this.attackAt = ctx.time;
        this.state = 'chase';
        if (!tg || tg.dead) break;
        // Hit and run: after the bite it sprints off to one side, then turns back for another pass.
        if (d.hitAndRun && tg === ctx.player) {
          this.state = 'retreat';
          this.timer = this.rng.range(0.75, 1.05); // 3 to 4 tiles: it stays close (after the bite)
          this.turn = this.rng.next() < 0.5 ? -1 : 1;
        }
        const dx = tg.x - this.x, dy = tg.y - this.y;
        const gap = Math.hypot(dx, dy) - tg.radius - this.radius;
        // Out of reach by now (the target stepped back or dodged sideways): the attack misses.
        if (gap <= d.attack.reach + 0.25 && lineClear(ctx.collisions, this.x, this.y, tg.x, tg.y)) ctx.hit(this, tg);
        break;
      }
      case 'retreat': {
        const tg = this.target;
        if (!tg || (this.timer -= dt) <= 0) {
          this.state = tg ? 'chase' : 'idle';
          this.lastSeen = ctx.time;
          break;
        }
        // Finishes the bite facing its target before running off.
        if (ctx.time - this.attackAt < 0.25) { this.brake(dt, ctx); break; }
        let ax = this.x - tg.x, ay = this.y - tg.y;
        const l = Math.hypot(ax, ay) || 1;
        ax /= l; ay /= l;
        const k = this.turn * 0.8; // about 40 degrees off the straight line away
        this.moveDir(ax - ay * k, ay + ax * k, d.run, dt, ctx);
        break;
      }
      case 'eat': {
        const c = this.carcass;
        if (!c || c.gone) {
          this.carcass = null;
          this.state = 'idle';
          this.timer = 1;
          break;
        }
        if (!this.reached(c, 0.5)) {
          if (this.stuck > 1.5) { this.carcass = null; this.state = 'idle'; break; }
          this.moveTo(c.x, c.y, d.walk * 1.5, dt, ctx);
          break;
        }
        this.brake(dt, ctx);
        if ((this.timer -= dt) <= 0) {
          ctx.eat(c);
          this.fed = this.rng.range(90, 180);
          this.carcass = null;
          this.state = 'idle';
          this.timer = 4;
        }
        break;
      }
      case 'home':
        if (this.reached(this.home, 0.8) || this.stuck > 2) {
          this.state = 'idle';
          this.timer = 2;
          this.stuck = 0;
        } else this.moveTo(this.home.x, this.home.y, d.walk * 1.4, dt, ctx);
        break;
    }
  }

  /** Perception and decisions, a few times per second. */
  think(ctx) {
    const d = this.def;
    const t = ctx.time;
    const p = ctx.player;
    const playerOk = p && !ctx.playerDead;
    if (this.state === 'windup' || this.state === 'retreat') return;

    if (d.temper === 'fearful') {
      if (playerOk && this.perceives(p, ctx)) return this.alarm(p, ctx);
      for (const o of ctx.creatures) {
        if (o !== this && !o.dead && o.def.prey?.includes(this.species) && this.perceives(o, ctx)) return this.alarm(o, ctx);
      }
      if (this.state === 'flee' && this.threat?.source && !this.threat.source.dead && this.perceives(this.threat.source, ctx)) {
        this.threat.x = this.threat.source.x;
        this.threat.y = this.threat.source.y;
        this.threat.until = t + d.memory;
      }
      return;
    }

    // Fighting: keep track of the target while it can be seen or heard.
    if (this.state === 'chase' && this.target) {
      if (this.target === p && !playerOk) return this.dropTarget();
      if (this.perceives(this.target, ctx)) this.lastSeen = t;
      return;
    }
    if (d.temper === 'aggressive') {
      if (playerOk && this.perceives(p, ctx)) return this.alarm(p, ctx);
    } else if (d.temper === 'territorial') {
      const intruders = playerOk ? [p, ...ctx.creatures] : ctx.creatures;
      for (const o of intruders) {
        // Intruders: the player and predators; peaceful herbivores are tolerated.
        if (o === this || o.dead || (o !== p && !o.def.prey)) continue;
        if (Math.hypot(o.x - this.x, o.y - this.y) <= d.territory && this.perceives(o, ctx)) return this.alarm(o, ctx);
      }
    }
    if (this.fed > 0 || !d.prey) return;
    // Hungry carnivore: a carcass first, else prey.
    if (this.state !== 'eat') {
      const c = ctx.carcassNear(this.x, this.y, d.vision);
      if (c) {
        this.state = 'eat';
        this.carcass = c;
        this.timer = 6;
        this.stuck = 0;
        return;
      }
    }
    let best = null, bd = Infinity;
    for (const o of ctx.creatures) {
      if (o.dead || !d.prey.includes(o.species)) continue;
      const dd = Math.hypot(o.x - this.x, o.y - this.y);
      if (dd < bd && this.perceives(o, ctx)) { best = o; bd = dd; }
    }
    if (best) this.alarm(best, ctx);
  }

  /** Reacts and passes the alert to the group (same species nearby). */
  alarm(source, ctx) {
    const fresh = this.state !== (this.def.temper === 'fearful' ? 'flee' : 'chase') || (this.target !== source && this.def.temper !== 'fearful');
    this.react(source, ctx.time);
    if (!fresh) return;
    for (const o of ctx.creatures) {
      if (o === this || o.dead || o.species !== this.species) continue;
      if (Math.hypot(o.x - this.x, o.y - this.y) <= 8) o.react(source, ctx.time);
    }
  }

  dropTarget() {
    this.target = null;
    this.state = this.def.temper === 'territorial' ? 'home' : 'idle';
    this.timer = this.rng.range(1, 3);
    this.stuck = 0;
  }

  tooFarFromHome() {
    return this.def.temper === 'territorial' && Math.hypot(this.home.x - this.x, this.home.y - this.y) > this.def.territory * 4;
  }

  pickWander(ctx) {
    const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(2, 7);
    const gx = this.home.x + Math.cos(a) * r, gy = this.home.y + Math.sin(a) * r;
    if (!ctx.walkable(gx, gy)) {
      this.timer = 1;
      return;
    }
    this.goal = { x: gx, y: gy };
    this.state = 'wander';
    this.stuck = 0;
  }

  reached(p, r) {
    return Math.hypot(p.x - this.x, p.y - this.y) <= r;
  }

  face(dx, dy) {
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return;
    this.dirX = dx / l;
    this.dirY = dy / l;
  }

  moveTo(x, y, speed, dt, ctx) {
    this.moveDir(x - this.x, y - this.y, speed, dt, ctx);
  }

  brake(dt, ctx) {
    this.moveDir(0, 0, 0, dt, ctx);
  }

  /** Accelerates towards a direction and moves with collisions; never walks off the loaded world. */
  moveDir(dx, dy, speed, dt, ctx) {
    const l = Math.hypot(dx, dy);
    const tx = l > 1e-6 ? (dx / l) * speed : 0, ty = l > 1e-6 ? (dy / l) * speed : 0;
    const k = ACCEL * dt;
    this.vx += Math.max(-k, Math.min(k, tx - this.vx));
    this.vy += Math.max(-k, Math.min(k, ty - this.vy));
    const nx = this.x + this.vx * dt * 6, ny = this.y + this.vy * dt * 6;
    if (!ctx.walkable(nx, ny)) {
      this.vx = this.vy = 0;
    }
    const ox = this.x, oy = this.y;
    ctx.collisions.moveCircle(this, this.vx * dt, this.vy * dt);
    const moved = Math.hypot(this.x - ox, this.y - oy);
    const wanted = speed * dt;
    this.blockedRecently = wanted > 0 && moved < wanted * 0.4;
    this.stuck = this.blockedRecently ? this.stuck + dt : Math.max(0, this.stuck - dt);
    // Velocity follows what really happened (sliding on walls), but a push out of an obstacle never speeds it up.
    const tried = Math.hypot(this.vx, this.vy) * dt;
    if (dt > 0 && moved > 1e-9) {
      const k = Math.min(1, tried / moved) / dt;
      this.vx = (this.x - ox) * k;
      this.vy = (this.y - oy) * k;
    } else if (dt > 0) this.vx = this.vy = 0;
    this.distanceWalked += moved;
    this.moving = moved > 1e-4;
    this.running = this.moving && speed > this.def.walk * 1.5;
    if (l > 1e-6 && speed > 0) this.face(dx, dy);
    this.followGround(ctx.world.groundZ(this.x, this.y), dt);
  }
}
