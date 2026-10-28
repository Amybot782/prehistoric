import Phaser from 'phaser';
import { DepthLayer, objectDepth } from '../iso/depth.js';
import { terrainTextureKey, faceTextureKey, pickVariant } from '../assets/assetCatalog.js';
import { hash2 } from '../core/random.js';

/**
 * Draws loaded chunks and nothing else.
 *
 * - Ground: one RenderTexture per chunk, tiles drawn back to front at their
 *   height, so a chunk costs one draw call. Textures are pooled and reused
 *   when chunks stream in and out.
 * - Relief: a raised tile whose neighbour is lower gets its top and its side
 *   faces as sorted sprites (depth of its back edge). They hide whatever
 *   stands behind and below them, while anything standing on or in front of
 *   them is drawn over them, like any other object.
 * - Objects: one sprite per prop, sorted with the shared depth rule. Sprites
 *   outside the camera are hidden; tall objects in front of the player turn
 *   translucent so the character is never lost.
 */
// Reused objects kept for chunks about to stream in; extras are destroyed.
const MAX_POOLED_IMAGES = 3000;
const MAX_POOLED_TEXTURES = 8;

export class ChunkRenderer {
  constructor(scene, world, projection, origins) {
    this.scene = scene;
    this.world = world;
    this.proj = projection;
    this.origins = origins;
    this.n = world.size;
    this.tw = projection.tileWidth;
    this.th = projection.tileHeight;
    this.levelPx = world.levelHeight * projection.heightUnit;
    this.maxLevels = Math.max(1, world.generator.levels ?? 6);
    this.headroom = Math.ceil(this.maxLevels * this.levelPx) + 2;
    this.rtWidth = this.n * this.tw;
    this.rtHeight = this.n * this.th + this.headroom;
    this.views = new Map(); // chunk key -> { rt, images: [], props: Map(propId -> view) }
    this.rtPool = [];
    this.imagePool = [];
    this.visibleCount = 0;
    this._p = { x: 0, y: 0 };
    this._bounds = new Phaser.Geom.Rectangle();

    const ev = world.events;
    this._off = [
      ev.on('chunk:loaded', (c) => this.addChunk(c)),
      ev.on('chunk:unloaded', (c) => this.removeChunk(c)),
      ev.on('chunk:changed', (c) => this.redrawGround(c)),
      ev.on('prop:removed', (p) => this.removePropView(p)),
      ev.on('prop:added', (p) => {
        const view = this.views.get(p.chunk);
        if (view) this.addPropView(view, p);
      }),
      ev.on('prop:damaged', (p) => this.onDamaged(p)),
      ev.on('prop:changed', (p) => {
        const pv = this.views.get(p.chunk)?.props.get(p.id);
        if (pv) pv.sprite.setTexture(p.texture).setOrigin(this.origins[p.texture]?.x ?? 0.5, this.origins[p.texture]?.y ?? 1);
      }),
    ];
    for (const c of world.chunks.values()) this.addChunk(c);
  }

  destroy() {
    for (const off of this._off) off();
  }

  // ---- Pools ---------------------------------------------------------------

  _image(key, x, y, origin, depth) {
    const img = this.imagePool.pop() ?? this.scene.add.image(0, 0, key);
    img.setTexture(key).setPosition(x, y).setOrigin(origin.x, origin.y).setDepth(depth)
      .setAlpha(1).setVisible(true).setActive(true).setFlipX(false).clearTint().setAngle(0);
    return img;
  }

  _release(img) {
    if (this.imagePool.length >= MAX_POOLED_IMAGES) {
      img.destroy();
      return;
    }
    img.setVisible(false).setActive(false);
    this.imagePool.push(img);
  }

  /** Low ground is drawn slightly darker so terraces read at a glance. */
  heightTint(h) {
    const f = 0.84 + 0.16 * Math.min(1, h / this.maxLevels);
    const c = Math.round(f * 255);
    return (c << 16) | (c << 8) | c;
  }

  // ---- Chunks --------------------------------------------------------------

  addChunk(chunk) {
    if (this.views.has(chunk.key)) this.removeChunk(chunk);
    const view = { chunk, rt: null, images: [], props: new Map(), bounds: null };
    this.views.set(chunk.key, view);
    this.redrawGround(chunk);
    this.buildEdges(view);
    for (const p of chunk.props) this.addPropView(view, p);
  }

  removeChunk(chunk) {
    const view = this.views.get(chunk.key);
    if (!view) return;
    if (this.rtPool.length >= MAX_POOLED_TEXTURES) view.rt.destroy();
    else this.rtPool.push(view.rt.setVisible(false));
    for (const img of view.images) this._release(img);
    for (const pv of view.props.values()) this._release(pv.sprite);
    this.views.delete(chunk.key);
  }

  redrawGround(chunk) {
    const view = this.views.get(chunk.key);
    if (!view) return;
    const n = this.n;
    const origin = this.proj.worldToScreen(chunk.cx * n + 0.5, chunk.cy * n + 0.5, 0, this._p);
    const left = origin.x - this.rtWidth / 2;
    const top = origin.y - this.th / 2 - this.headroom;
    let rt = view.rt;
    if (!rt) {
      rt = this.rtPool.pop() ?? this.scene.add.renderTexture(0, 0, this.rtWidth, this.rtHeight).setOrigin(0, 0);
      view.rt = rt;
    }
    rt.clear();
    rt.setPosition(left, top).setVisible(true).setDepth(DepthLayer.GROUND + chunk.cx + chunk.cy);
    view.bounds = { x: left, y: top, right: left + this.rtWidth, bottom: top + this.rtHeight };
    const types = this.world.terrainTypes;
    rt.beginDraw();
    // Back to front (diagonals of increasing lx + ly) so raised tiles cover lower ones behind.
    for (let d = 0; d <= 2 * (n - 1); d++) {
      for (let lx = Math.max(0, d - n + 1); lx <= Math.min(n - 1, d); lx++) {
        const ly = d - lx;
        const i = ly * n + lx;
        const tx = chunk.cx * n + lx, ty = chunk.cy * n + ly;
        const type = types[chunk.ground[i]];
        const tex = terrainTextureKey(type.key, pickVariant(type, hash2(tx, ty, 41)));
        const x = (lx - ly) * (this.tw / 2) + this.rtWidth / 2 - this.tw / 2;
        const y = (lx + ly) * (this.th / 2) + this.headroom - chunk.height[i] * this.levelPx;
        rt.batchDrawFrame(tex, undefined, x, y, 1, this.heightTint(chunk.height[i]));
      }
    }
    rt.endDraw();
    if (view.images.length) {
      for (const img of view.images) this._release(img);
      view.images.length = 0;
      this.buildEdges(view);
    }
  }

  /** Sorted sprites for raised tiles next to lower ground (see class comment). */
  buildEdges(view) {
    const { chunk } = view;
    const n = this.n;
    const types = this.world.terrainTypes;
    const tileOrigin = { x: 0.5, y: 0.5 };
    for (let ly = 0; ly < n; ly++) {
      for (let lx = 0; lx < n; lx++) {
        const i = ly * n + lx;
        const h = chunk.height[i];
        if (h === 0) continue;
        const tx = chunk.cx * n + lx, ty = chunk.cy * n + ly;
        const hS = this.world.heightAt(tx, ty + 1);
        const hE = this.world.heightAt(tx + 1, ty);
        const hN = this.world.heightAt(tx, ty - 1);
        const hW = this.world.heightAt(tx - 1, ty);
        if (hS >= h && hE >= h && hN >= h && hW >= h) continue;
        const type = types[chunk.ground[i]];
        const key = type.key;
        const depth = objectDepth(tx + 0.25, ty + 0.25);
        const z = h * this.world.levelHeight;
        const c = this.proj.worldToScreen(tx + 0.5, ty + 0.5, z, this._p);
        const cx = c.x, cy = c.y;
        const tint = this.heightTint(h);
        if (hS < h) view.images.push(this._image(faceTextureKey(key, 'left'), cx, cy, this.origins[faceTextureKey(key, 'left')] ?? { x: 1, y: 0 }, depth - 0.002).setTint(tint));
        if (hE < h) view.images.push(this._image(faceTextureKey(key, 'right'), cx, cy, this.origins[faceTextureKey(key, 'right')] ?? { x: 0, y: 0 }, depth - 0.002).setTint(tint));
        view.images.push(this._image(terrainTextureKey(key, pickVariant(type, hash2(tx, ty, 41))), cx, cy, tileOrigin, depth - 0.001).setTint(tint));
      }
    }
  }

  // ---- Props ---------------------------------------------------------------

  addPropView(view, prop) {
    const p = this.proj.worldToScreen(prop.x, prop.y, prop.z, this._p);
    const key = prop.texture ?? prop.def.texture;
    const sprite = this._image(key, p.x, p.y, this.origins[key] ?? { x: 0.5, y: 1 }, propDepth(prop));
    if (prop.built) sprite.setFlipX(prop.rot === 'y' && prop.def.build.slot !== 'edge');
    else if (prop.type !== 'dropped') sprite.setFlipX(hash2(prop.tx, prop.ty, 77) < 0.5);
    const pv = { prop, sprite, faded: false, baseX: p.x, shakeUntil: 0, roof: prop.def.build?.slot === 'roof' };
    view.props.set(prop.id, pv);
    this.applyWear(pv);
  }

  removePropView(prop) {
    const view = this.views.get(prop.chunk);
    const pv = view?.props.get(prop.id);
    if (!pv) return;
    if (prop.harvested) this.playDepleted(pv);
    this._release(pv.sprite);
    view.props.delete(prop.id);
  }

  /** A hit: the object shakes, and rocks darken as they crack. */
  onDamaged(prop) {
    const pv = this.views.get(prop.chunk)?.props.get(prop.id);
    if (!pv) return;
    pv.shakeUntil = this.scene.time.now + 260;
    this.applyWear(pv);
  }

  applyWear(pv) {
    const { prop, sprite } = pv;
    const h = prop.def.harvest;
    if (!h || h.kind !== 'stone' || prop.hpLeft >= h.hp) return;
    const c = Math.round(255 * (0.62 + 0.38 * (prop.hpLeft / h.hp)));
    sprite.setTint((c << 16) | (c << 8) | c);
  }

  /** Short farewell animation: trees fall over, other objects shrink away. */
  playDepleted(pv) {
    const s = pv.sprite;
    const ghost = this.scene.add.image(pv.baseX, s.y, s.texture.key)
      .setOrigin(s.originX, s.originY).setDepth(s.depth).setFlipX(s.flipX).setTint(s.tintTopLeft);
    const falls = pv.prop.def.harvest?.kind === 'wood';
    this.scene.tweens.add({
      targets: ghost,
      angle: falls ? (s.flipX ? -84 : 84) : 0,
      scaleX: falls ? 1 : 0.2,
      scaleY: falls ? 1 : 0.2,
      alpha: 0,
      duration: falls ? 700 : 220,
      ease: falls ? 'Quad.easeIn' : 'Linear',
      onComplete: () => ghost.destroy(),
    });
  }

  /** Topmost object sprite under a screen point, among `candidates` (world props). */
  propAtScreen(sx, sy, candidates) {
    let best = null;
    let bestDepth = -Infinity;
    for (const prop of candidates) {
      const pv = this.views.get(prop.chunk)?.props.get(prop.id);
      if (!pv || !pv.sprite.visible || (pv.roof && pv.faded)) continue;
      const b = pv.sprite.getBounds(this._bounds);
      if (sx < b.x || sx > b.right || sy < b.y || sy > b.bottom) continue;
      if (pv.sprite.depth > bestDepth) {
        bestDepth = pv.sprite.depth;
        best = prop;
      }
    }
    return best;
  }

  /**
   * @param {Phaser.Geom.Rectangle} worldView camera view in screen pixels
   * @param {{x:number,y:number,depth:number,underRoof?:boolean}} focus player's screen position and
   *   depth; under a roof, every roof turns see-through so the inside of the house shows.
   */
  update(worldView, focus) {
    let visible = 0;
    const now = this.scene.time.now;
    const margin = 96;
    const left = worldView.x - margin, right = worldView.right + margin;
    const top = worldView.y - margin, bottom = worldView.bottom + margin * 2;
    for (const view of this.views.values()) {
      const b = view.bounds;
      const chunkVisible = b.right > left && b.x < right && b.bottom > top && b.y < bottom;
      view.rt.setVisible(chunkVisible);
      for (const img of view.images) img.setVisible(chunkVisible && img.x > left && img.x < right && img.y > top && img.y < bottom);
      for (const pv of view.props.values()) {
        const s = pv.sprite;
        if (pv.shakeUntil) {
          const left = pv.shakeUntil - now;
          if (left > 0) s.x = pv.baseX + Math.sin(left * 0.09) * 1.5;
          else { s.x = pv.baseX; pv.shakeUntil = 0; }
        }
        const inView = chunkVisible && s.x > left && s.x < right && s.y > top && s.y < bottom;
        s.setVisible(inView);
        if (!inView) continue;
        visible++;
        let fade = false;
        if (pv.roof) {
          fade = !!focus.underRoof;
        } else if (pv.prop.def.occludes && s.depth > focus.depth) {
          const r = s.getBounds();
          fade = focus.x > r.x && focus.x < r.right && focus.y > r.y && focus.y < r.bottom;
        }
        if (fade !== pv.faded) {
          pv.faded = fade;
          s.setAlpha(fade ? (pv.roof ? 0.12 : 0.45) : 1);
        }
      }
    }
    this.visibleCount = visible;
  }

  get stats() {
    let images = 0;
    for (const v of this.views.values()) images += v.images.length + v.props.size;
    return { chunks: this.views.size, sprites: images, pooledTextures: this.rtPool.length, pooledImages: this.imagePool.length };
  }
}

/**
 * Sort depth of an object. Floors lie flat: just above the raised tile they
 * cover, below anything standing on them. Roofs sit over the walls of their
 * tile, under what stands on the tiles in front.
 */
export function propDepth(prop) {
  const slot = prop.def.build?.slot;
  if (slot === 'floor') return objectDepth(prop.tx + 0.25, prop.ty + 0.25) + 0.0005;
  if (slot === 'roof') return objectDepth(prop.tx + 0.8, prop.ty + 0.8);
  return objectDepth(prop.x, prop.y);
}
