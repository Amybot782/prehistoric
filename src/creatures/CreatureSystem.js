import { Creature } from './Creature.js';
import { createRng } from '../core/random.js';
import { EventBus } from '../core/EventBus.js';
import { slotKey } from '../building/placement.js';

/**
 * Every animal and dinosaur near the player, plus thrown weapons in flight.
 *
 * - Population: groups appear out of sight (between `spawnMin` and
 *   `spawnMax` tiles away) on walkable ground, chosen by the biome's weights,
 *   while fewer than `maxNearby` live around the player; those left far
 *   behind disappear. shortcut: creatures are not saved and do not live in
 *   unloaded chunks, until the off-screen simulation of later phases.
 * - Each step: creature behaviour (Creature.js), bodies pushing each other
 *   apart (player included), thrown weapons, deaths. A dead creature becomes
 *   a carcass prop that can be butchered (harvest kind 'meat') and rots
 *   after `carcassSeconds`.
 * Events: killed {creature, by}, hurt {creature}, landed {projectile}.
 */
export function carcassDefs(cfg) {
  const out = {};
  for (const [k, sp] of Object.entries(cfg.species)) {
    out[`carcass_${k}`] = {
      texture: `creature_${k}_dead`, collider: null, occludes: false, carcass: k,
      yields: sp.butcher, harvest: { kind: 'meat', hp: sp.butcherHp },
    };
  }
  return out;
}

export class CreatureSystem {
  constructor({ world, player, survival, cfg, biomeKeys, seed = 1, spawning = true }) {
    this.world = world;
    this.player = player;
    this.survival = survival;
    this.cfg = cfg;
    this.biomeKeys = biomeKeys;
    this.spawning = spawning;
    this.rng = createRng(seed);
    this.creatures = [];
    this.projectiles = [];
    this.events = new EventBus();
    this.spawnTimer = 0;
    const self = this;
    this.ctx = {
      world, collisions: world.collisions, player, creatures: this.creatures, time: 0, playerDead: false,
      hit: (a, t) => self.hit(a, t),
      eat: (c) => self.eat(c),
      carcassNear: (x, y, r) => self.carcassNear(x, y, r),
      walkable: (x, y) => self.walkable(x, y),
    };
    if (survival) survival.creatures = this;
  }

  spawn(species, x, y) {
    const def = this.cfg.species[species];
    if (!def) throw new Error(`Espèce inconnue : ${species}`);
    const c = new Creature(species, def, x, y, createRng((this.rng.next() * 4294967296) >>> 0));
    c.placeAt(x, y, this.world.groundZ(x, y));
    this.creatures.push(c);
    this.world.addEntity(c);
    return c;
  }

  remove(c) {
    const i = this.creatures.indexOf(c);
    if (i >= 0) this.creatures.splice(i, 1);
    const j = this.world.entities.indexOf(c);
    if (j >= 0) this.world.entities.splice(j, 1);
  }

  walkable(x, y) {
    const g = this.world.tileAt(Math.floor(x), Math.floor(y));
    return g >= 0 && !this.world.terrainTypes[g].solid;
  }

  /** One fixed simulation step, after the player's. */
  step(dt) {
    const ctx = this.ctx;
    ctx.time = this.world.time;
    ctx.playerDead = !!this.survival?.dead;
    for (const c of this.creatures) {
      c.snapshot();
      c.step(dt, ctx);
    }
    this.separate();
    this.stepProjectiles(dt);
    for (const c of [...this.creatures]) if (c.dead) this.die(c);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.cfg.spawner.interval;
      this.despawnFar();
      if (this.spawning) this.populate(1);
    }
  }

  /** Bodies do not overlap: each pair is pushed apart, the heavier one moving less. */
  separate() {
    const bodies = this.survival?.dead ? this.creatures : [this.player, ...this.creatures];
    const col = this.world.collisions;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const push = min - d;
        const ma = a.radius ** 2, mb = b.radius ** 2;
        const ka = mb / (ma + mb), kb = ma / (ma + mb);
        a.x -= (dx / d) * push * ka; a.y -= (dy / d) * push * ka;
        b.x += (dx / d) * push * kb; b.y += (dy / d) * push * kb;
        col.resolve(a);
        col.resolve(b);
      }
    }
  }

  /** A creature's attack lands on its target (the player or another creature). */
  hit(attacker, target) {
    const a = attacker.def.attack;
    const dx = target.x - attacker.x, dy = target.y - attacker.y;
    const l = Math.hypot(dx, dy) || 1;
    const kx = (dx / l) * a.knockback, ky = (dy / l) * a.knockback;
    if (target === this.player) {
      this.survival?.takeDamage(a.damage, attacker.species, kx, ky);
      return;
    }
    target.hurt(a.damage, attacker, kx, ky, this.world.time);
  }

  /** Damage dealt by the player (melee or thrown weapon). */
  hurtByPlayer(c, damage, kx, ky) {
    c.hurt(damage, this.player, kx, ky, this.world.time);
    this.events.emit('hurt', { creature: c });
  }

  die(c) {
    this.remove(c);
    const prop = this.world.addTransient(`carcass_${c.species}`, c.x, c.y, this.world.time + this.cfg.spawner.carcassSeconds);
    if (c.lastHitBy === this.player) this.survival?.message('combat.killed', { creature: c.species });
    this.events.emit('killed', { creature: c, prop });
  }

  eat(carcass) {
    this.world.removeProp(carcass);
  }

  carcassNear(x, y, r) {
    let best = null, bd = Infinity;
    for (const p of this.world.propsNear(x, y, r, this._near ??= [])) {
      if (!p.def.carcass) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { best = p; bd = d; }
    }
    return best;
  }

  // ---- Thrown weapons ---------------------------------------------------------

  /** Launches a thrown item from the player; it flies straight until it hits something or falls. */
  throwFrom(body, dirX, dirY, item, spec) {
    const l = Math.hypot(dirX, dirY) || 1;
    const p = {
      item, damage: spec.damage, owner: body, range: spec.range, travelled: 0,
      x: body.x + (dirX / l) * (body.radius + 0.1), y: body.y + (dirY / l) * (body.radius + 0.1),
      vx: (dirX / l) * spec.speed, vy: (dirY / l) * spec.speed, z: body.z,
    };
    p.prevX = p.x; p.prevY = p.y; p.prevZ = p.z;
    this.projectiles.push(p);
    return p;
  }

  stepProjectiles(dt) {
    const col = this.world.collisions;
    for (const p of [...this.projectiles]) {
      p.prevX = p.x; p.prevY = p.y; p.prevZ = p.z;
      const dist = Math.hypot(p.vx, p.vy) * dt;
      const n = Math.max(1, Math.ceil(dist / 0.15));
      let landed = null;
      for (let i = 0; i < n && !landed; i++) {
        const ox = p.x, oy = p.y;
        p.x += (p.vx * dt) / n;
        p.y += (p.vy * dt) / n;
        p.travelled += dist / n;
        if (col.overlaps(p.x, p.y, 0.05, true) || this.world.tileAt(Math.floor(p.x), Math.floor(p.y)) < 0) {
          landed = { x: ox, y: oy, hit: null };
          break;
        }
        for (const c of this.creatures) {
          if (c.dead || c === p.owner) continue;
          if (Math.hypot(c.x - p.x, c.y - p.y) <= c.radius + 0.08) {
            const l = Math.hypot(p.vx, p.vy) || 1;
            this.hurtByPlayer(c, p.damage, (p.vx / l) * 3, (p.vy / l) * 3);
            landed = { x: c.x, y: c.y, hit: c };
            break;
          }
        }
        if (!landed && p.travelled >= p.range) landed = { x: p.x, y: p.y, hit: null };
      }
      p.z = this.world.groundZ(p.x, p.y);
      if (!landed) continue;
      this.projectiles.splice(this.projectiles.indexOf(p), 1);
      // The weapon falls where it stopped and can be picked up again (never lost while loaded).
      const at = this.walkable(landed.x, landed.y) ? landed : p.owner; // fallen into deep water: back at the thrower's feet
      const drop = this.world.dropItem(p.item, 1, at.x, at.y);
      this.events.emit('landed', { projectile: p, hit: landed.hit, drop });
    }
  }

  // ---- Population -------------------------------------------------------------

  aliveNear(x, y, r) {
    let n = 0;
    for (const c of this.creatures) if (Math.hypot(c.x - x, c.y - y) <= r) n++;
    return n;
  }

  /** Tries `tries` times to add a group out of sight; returns the creatures added. */
  populate(tries = 1) {
    const s = this.cfg.spawner;
    const added = [];
    for (let k = 0; k < tries; k++) {
      if (this.aliveNear(this.player.x, this.player.y, s.radius) >= s.maxNearby) break;
      const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(s.spawnMin, s.spawnMax);
      const x = this.player.x + Math.cos(a) * r, y = this.player.y + Math.sin(a) * r;
      if (!this.canSpawnAt(x, y, 0.6)) continue;
      const biome = this.biomeKeys[this.world.biomeAt(Math.floor(x), Math.floor(y))];
      const species = this.pickSpecies(biome);
      if (!species) continue;
      const [min, max] = this.cfg.species[species].group;
      const count = this.rng.int(min, max);
      for (let i = 0; i < count; i++) {
        const gx = x + this.rng.range(-1.5, 1.5), gy = y + this.rng.range(-1.5, 1.5);
        if (this.canSpawnAt(gx, gy, this.cfg.species[species].radius)) added.push(this.spawn(species, gx, gy));
      }
    }
    return added;
  }

  canSpawnAt(x, y, r) {
    const tx = Math.floor(x), ty = Math.floor(y);
    return this.walkable(x, y) && !this.world.collisions.overlaps(x, y, r) && !this.world.builtAt(slotKey('floor', tx, ty));
  }

  pickSpecies(biome) {
    const list = Object.entries(this.cfg.species).filter(([, sp]) => sp.spawn?.[biome]);
    let r = this.rng.next() * list.reduce((t, [, sp]) => t + sp.spawn[biome], 0);
    for (const [k, sp] of list) if ((r -= sp.spawn[biome]) < 0) return k;
    return null;
  }

  despawnFar() {
    const d = this.cfg.spawner.despawn;
    for (const c of [...this.creatures]) {
      const far = Math.hypot(c.x - this.player.x, c.y - this.player.y) > d;
      if (far || !this.world.chunkOf(Math.floor(c.x), Math.floor(c.y))) this.remove(c);
    }
  }

  /** The player came back to life at (x, y): dangerous animals there go away, the others forget. */
  onPlayerRespawn(x, y) {
    const r = this.cfg.spawner.respawnClear;
    for (const c of [...this.creatures]) {
      if (c.target === this.player) c.dropTarget();
      if (c.threat?.source === this.player) c.threat = null;
      if (c.def.attack && Math.hypot(c.x - x, c.y - y) < r) this.remove(c);
    }
  }
}
