import { DepthLayer } from '../iso/depth.js';
import { terrainTextureKey, TERRAIN_VARIANTS } from '../assets/assetCatalog.js';
import { hash2 } from '../core/random.js';

/**
 * Draws the ground into one RenderTexture per block of BLOCK x BLOCK tiles,
 * so thousands of tiles cost a handful of draw calls. Blocks are rebuilt only
 * when their tiles change (`invalidateTile`). Phase 2 maps blocks onto world
 * chunks and creates/destroys them as chunks stream in and out.
 */
export const BLOCK = 16;

export class GroundRenderer {
  constructor(scene, world, projection) {
    this.scene = scene;
    this.world = world;
    this.proj = projection;
    this.blocks = new Map();
    this.tw = projection.tileWidth;
    this.th = projection.tileHeight;
    this.rtWidth = BLOCK * this.tw;
    this.rtHeight = BLOCK * this.th;
    this._p = { x: 0, y: 0 };
  }

  buildAll() {
    const bw = Math.ceil(this.world.width / BLOCK);
    const bh = Math.ceil(this.world.height / BLOCK);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) this.buildBlock(bx, by);
  }

  buildBlock(bx, by) {
    const key = `${bx},${by}`;
    let rt = this.blocks.get(key);
    const origin = this.proj.worldToScreen(bx * BLOCK + 0.5, by * BLOCK + 0.5, 0, this._p);
    const left = origin.x - this.rtWidth / 2;
    const top = origin.y - this.th / 2;
    if (!rt) {
      rt = this.scene.add.renderTexture(left, top, this.rtWidth, this.rtHeight).setOrigin(0, 0);
      rt.setDepth(DepthLayer.GROUND);
      this.blocks.set(key, rt);
    } else {
      rt.clear();
    }
    const types = this.world.terrainTypes;
    rt.beginDraw();
    for (let ly = 0; ly < BLOCK; ly++) {
      for (let lx = 0; lx < BLOCK; lx++) {
        const tx = bx * BLOCK + lx;
        const ty = by * BLOCK + ly;
        const id = this.world.tileAt(tx, ty);
        if (id < 0) continue;
        const variant = Math.floor(hash2(tx, ty, 41) * TERRAIN_VARIANTS);
        const tex = terrainTextureKey(types[id].key, variant);
        const x = (lx - ly) * (this.tw / 2) + this.rtWidth / 2 - this.tw / 2;
        const y = (lx + ly) * (this.th / 2);
        rt.batchDrawFrame(tex, undefined, x, y);
      }
    }
    rt.endDraw();
  }

  invalidateTile(tx, ty) {
    this.buildBlock(Math.floor(tx / BLOCK), Math.floor(ty / BLOCK));
  }

  get blockCount() {
    return this.blocks.size;
  }
}
