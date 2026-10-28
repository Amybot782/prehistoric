import { DepthLayer, objectDepth } from '../iso/depth.js';
import { terrainTextureKey, faceTextureKey, TERRAIN_VARIANTS } from '../assets/assetCatalog.js';
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

    const ev = world.events;
    this._off = [
      ev.on('chunk:loaded', (c) => this.addChunk(c)),
      ev.on('chunk:unloaded', (c) => this.removeChunk(c)),
      ev.on('chunk:changed', (c) => this.redrawGround(c)),
      ev.on('prop:removed', (p) => this.removePropView(p)),
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
      .setAlpha(1).setVisible(true).setActive(true).setFlipX(false).clearTint();
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
        const variant = Math.floor(hash2(tx, ty, 41) * TERRAIN_VARIANTS);
        const tex = terrainTextureKey(types[chunk.ground[i]].key, variant);
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
        const key = types[chunk.ground[i]].key;
        const depth = objectDepth(tx + 0.25, ty + 0.25);
        const z = h * this.world.levelHeight;
        const c = this.proj.worldToScreen(tx + 0.5, ty + 0.5, z, this._p);
        const cx = c.x, cy = c.y;
        const tint = this.heightTint(h);
        if (hS < h) view.images.push(this._image(faceTextureKey(key, 'left'), cx, cy, this.origins[faceTextureKey(key, 'left')] ?? { x: 1, y: 0 }, depth - 0.002).setTint(tint));
        if (hE < h) view.images.push(this._image(faceTextureKey(key, 'right'), cx, cy, this.origins[faceTextureKey(key, 'right')] ?? { x: 0, y: 0 }, depth - 0.002).setTint(tint));
        const variant = Math.floor(hash2(tx, ty, 41) * TERRAIN_VARIANTS);
        view.images.push(this._image(terrainTextureKey(key, variant), cx, cy, tileOrigin, depth - 0.001).setTint(tint));
      }
    }
  }

  // ---- Props ---------------------------------------------------------------

  addPropView(view, prop) {
    const p = this.proj.worldToScreen(prop.x, prop.y, prop.z, this._p);
    const key = prop.def.texture;
    const sprite = this._image(key, p.x, p.y, this.origins[key] ?? { x: 0.5, y: 1 }, objectDepth(prop.x, prop.y));
    sprite.setFlipX(hash2(prop.tx, prop.ty, 77) < 0.5);
    view.props.set(prop.id, { prop, sprite, faded: false });
  }

  removePropView(prop) {
    const view = this.views.get(prop.chunk);
    const pv = view?.props.get(prop.id);
    if (!pv) return;
    this._release(pv.sprite);
    view.props.delete(prop.id);
  }

  /**
   * @param {Phaser.Geom.Rectangle} worldView camera view in screen pixels
   * @param {{x:number,y:number,depth:number}} focus player's screen position and depth
   */
  update(worldView, focus) {
    let visible = 0;
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
        const inView = chunkVisible && s.x > left && s.x < right && s.y > top && s.y < bottom;
        s.setVisible(inView);
        if (!inView) continue;
        visible++;
        let fade = false;
        if (pv.prop.def.occludes && s.depth > focus.depth) {
          const r = s.getBounds();
          fade = focus.x > r.x && focus.x < r.right && focus.y > r.y && focus.y < r.bottom;
        }
        if (fade !== pv.faded) {
          pv.faded = fade;
          s.setAlpha(fade ? 0.45 : 1);
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
