import { PlayerView } from './PlayerView.js';
import { DepthLayer } from '../iso/depth.js';
import { itemTextureKey } from '../assets/assetCatalog.js';

/**
 * Visuals of the creatures and of thrown weapons, plus combat feedback:
 * health bars of wounded creatures, the swing of the player's strikes, red
 * flashes on hits. Reads the simulation only; one view per living creature.
 */
const FRAMES = 4;
const WALK = [1, 2, 3, 2];
const HURT_FLASH = 0.15;
const BAR_SECONDS = 5;

class CreatureView extends PlayerView {
  constructor(scene, creature, projection, origins, world) {
    super(scene, creature, projection, origins, world);
    const key = `creature_${creature.species}`;
    const o = origins[key] ?? { x: 0.5, y: 1 };
    this.sprite.setTexture(key, 0).setOrigin(o.x, o.y);
    // Drawn sheets can have one row per screen direction ('s', 'e', 'n', 'w'); placeholders are one profile row, mirrored.
    this.columns = o.columns ?? FRAMES;
    this.rows = o.rows ?? null;
    this.shadow.setScale(Math.max(0.6, creature.radius / 0.25));
    this.flip = false;
  }

  update(alpha, snap, time) {
    const c = this.player;
    const w = c.interpolated(alpha, this._w);
    const s = this.proj.worldToScreen(w.x, w.y, w.z, this.screen);
    s.x = snap(s.x);
    s.y = snap(s.y);
    this.depth = this.computeDepth(w.x, w.y);
    this.sprite.setPosition(s.x, s.y).setDepth(this.depth);
    this.shadow.setPosition(s.x, s.y).setDepth(this.depth - 0.001);
    const dx = c.dirX - c.dirY; // screen direction of the facing
    if (this.rows) {
      const dy = (c.dirX + c.dirY) / 2;
      const dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'e' : 'w') : dy >= 0 ? 's' : 'n';
      // Distance per animation frame: longer strides when running, so the legs do not spin.
      const stride = (c.def.stride ?? Math.max(0.2, c.radius)) * (c.running ? 1 : 0.6);
      const phase = c.distanceWalked / stride;
      const since = time - c.attackAt;
      let mode = c.running ? 'run' : 'walk', col = c.moving ? Math.floor(phase) % this.columns : 0;
      if (c.state === 'windup' || since < 0.3) {
        mode = 'bite';
        col = c.state === 'windup' ? 0 : since < 0.12 ? 1 : 2;
      }
      const row = this.rows.indexOf(mode === 'walk' ? dir : `${mode}-${dir}`);
      this.sprite.setFrame((row >= 0 ? row : Math.max(0, this.rows.indexOf(dir))) * this.columns + (row >= 0 || mode !== 'bite' ? col : 0));
      // Running bounds: each stride lifts it a little off the ground, like a leap.
      if (mode === 'run' && c.moving) this.sprite.y -= Math.round(2 * Math.abs(Math.sin((phase / 3) * Math.PI)));
    } else {
      const step = Math.floor(c.distanceWalked / Math.max(0.2, c.radius));
      this.sprite.setFrame(c.moving ? WALK[step % WALK.length] : 0);
      // Facing left or right on screen; kept when moving straight up or down the screen.
      if (Math.abs(dx) > 0.1) this.flip = dx < 0;
      this.sprite.setFlipX(this.flip);
    }
    if (time - c.hurtAt < HURT_FLASH) this.sprite.setTint(0xff5050);
    else if (c.state === 'windup' && Math.floor(time * 12) % 2 === 0) this.sprite.setTint(0xffe0a0);
    else this.sprite.clearTint();
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}

export class CreatureLayer {
  constructor(scene, system, survival, projection, origins, world) {
    this.scene = scene;
    this.system = system;
    this.proj = projection;
    this.origins = origins;
    this.world = world;
    this.views = new Map();
    this.shots = new Map();
    this.g = scene.add.graphics().setDepth(DepthLayer.OVERLAY - 2);
    this.swing = null;
    this._p = { x: 0, y: 0 };
    survival.events.on('swing', (e) => { this.swing = { ...e, at: world.time }; });
  }

  update(alpha, snap, playerScreen) {
    const time = this.world.time;
    const alive = new Set(this.system.creatures);
    for (const [c, v] of this.views) if (!alive.has(c)) { v.destroy(); this.views.delete(c); }
    for (const c of alive) {
      let v = this.views.get(c);
      if (!v) this.views.set(c, (v = new CreatureView(this.scene, c, this.proj, this.origins, this.world)));
      v.update(alpha, snap, time);
    }

    // Thrown weapons: the item icon, turned along its flight, in a low arc.
    const flying = new Set(this.system.projectiles);
    for (const [p, img] of this.shots) if (!flying.has(p)) { img.destroy(); this.shots.delete(p); }
    for (const p of flying) {
      let img = this.shots.get(p);
      if (!img) {
        img = this.scene.add.image(0, 0, itemTextureKey(p.item)).setScale(0.7).setDepth(DepthLayer.OVERLAY - 3);
        const s = this.proj.worldToScreen(p.vx, p.vy, 0);
        const o = this.proj.worldToScreen(0, 0, 0);
        // Icons are drawn pointing to the upper right.
        img.setRotation(Math.atan2(s.y - o.y, s.x - o.x) + Math.PI / 4);
        this.shots.set(p, img);
      }
      const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
      const k = Math.min(1, p.travelled / p.range);
      const s = this.proj.worldToScreen(x, y, p.z + 0.5 + Math.sin(k * Math.PI) * 0.25, this._p);
      img.setPosition(s.x, s.y);
    }

    const g = this.g.clear();
    // Health bars of recently hurt creatures.
    for (const [c, v] of this.views) {
      if (time - c.hurtAt > BAR_SECONDS) continue;
      const h = v.sprite.height;
      const bw = Math.max(10, Math.round(v.sprite.width * 0.6));
      const x = Math.round(v.screen.x - bw / 2), y = Math.round(v.screen.y - h - 3);
      g.fillStyle(0x1a0c08, 0.85).fillRect(x - 1, y - 1, bw + 2, 4);
      g.fillStyle(0xd84a4a, 1).fillRect(x, y, Math.max(1, Math.round((bw * c.hp) / c.def.hp)), 2);
    }
    // Swing of the last strike, for a fraction of a second.
    const sw = this.swing;
    if (sw && time - sw.at < 0.14) {
      const p = this.system.player;
      const base = Math.atan2(sw.dirY, sw.dirX);
      const r = sw.reach + p.radius;
      g.lineStyle(1, sw.hit ? 0xffd0a0 : 0xffffff, 0.9 - (time - sw.at) * 5);
      g.beginPath();
      for (let i = 0; i <= 8; i++) {
        const a = base - 0.9 + (1.8 * i) / 8;
        const s = this.proj.worldToScreen(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.z + 0.35, this._p);
        if (i === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      }
      g.strokePath();
    }
  }

  destroy() {
    for (const v of this.views.values()) v.destroy();
    for (const img of this.shots.values()) img.destroy();
    this.g.destroy();
  }
}
