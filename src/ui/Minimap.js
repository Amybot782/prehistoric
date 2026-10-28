/**
 * First minimap: the explored world around the player, drawn in the same
 * isometric orientation as the game view (north-west at the top-left).
 *
 * Each loaded chunk is rendered once into a small canvas (one pixel per
 * tile, ground colour shaded by height, trees and rocks as darker dots).
 * Those canvases are kept after the chunk unloads, so explored areas stay
 * on the map; the map itself is redrawn a few times per second only.
 * Pure canvas 2D: no Phaser objects except the texture that shows it.
 */
const MAX_REMEMBERED_CHUNKS = 4096; // ~4 MB of 32x32 canvases

export class Minimap {
  /**
   * @param {import('../world/ChunkedWorld.js').ChunkedWorld} world
   * @param {{size?:number, tilesAcross?:number}} [opts]
   */
  constructor(world, { size = 200, tilesAcross = 200 } = {}) {
    this.world = world;
    this.n = world.size;
    this.size = size;
    this.k = size / tilesAcross; // screen pixels per tile along a diagonal
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.chunkCanvases = new Map();
    this.colors = world.terrainTypes.map((t) => hexToRgb(t.minimap));
    const ev = world.events;
    this._off = [
      ev.on('chunk:loaded', (c) => this.drawChunk(c)),
      ev.on('chunk:changed', (c) => this.drawChunk(c)),
      ev.on('prop:removed', (p) => {
        const c = world.chunks.get(p.chunk);
        if (c) this.drawChunk(c);
      }),
    ];
    for (const c of world.chunks.values()) this.drawChunk(c);
  }

  destroy() {
    for (const off of this._off) off();
    this.chunkCanvases.clear();
  }

  get rememberedChunks() {
    return this.chunkCanvases.size;
  }

  drawChunk(chunk) {
    const n = this.n;
    let canvas = this.chunkCanvases.get(chunk.key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = n;
      canvas.height = n;
      if (this.chunkCanvases.size >= MAX_REMEMBERED_CHUNKS) {
        // Forget the oldest explored chunk (Map keeps insertion order).
        this.chunkCanvases.delete(this.chunkCanvases.keys().next().value);
      }
    } else {
      this.chunkCanvases.delete(chunk.key); // re-insert as most recent
    }
    this.chunkCanvases.set(chunk.key, canvas);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(n, n);
    const d = img.data;
    for (let i = 0; i < n * n; i++) {
      const c = this.colors[chunk.ground[i]] ?? [255, 0, 255];
      const shade = 1 + (chunk.height[i] - 1) * 0.06;
      d[i * 4] = Math.min(255, c[0] * shade);
      d[i * 4 + 1] = Math.min(255, c[1] * shade);
      d[i * 4 + 2] = Math.min(255, c[2] * shade);
      d[i * 4 + 3] = 255;
    }
    for (const p of chunk.props) {
      if (!p.def.collider) continue; // grass and flowers are not worth a dot
      const i = (p.ty - chunk.cy * n) * n + (p.tx - chunk.cx * n);
      d[i * 4] *= 0.55;
      d[i * 4 + 1] *= 0.55;
      d[i * 4 + 2] *= 0.55;
    }
    ctx.putImageData(img, 0, 0);
  }

  /** Redraws the map centred on the player (world position px, py). */
  render(px, py, facing = null) {
    const { ctx, size, k, n } = this;
    const half = size / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,14,9,0.85)';
    ctx.fill();
    ctx.clip();
    // Tile (x, y) -> map ((x - y) * k, (x + y) * k / 2), centred on the player.
    ctx.setTransform(k, k / 2, -k, k / 2, half - (px - py) * k, half - (px + py) * k / 2);
    ctx.imageSmoothingEnabled = false;
    const reach = size / k; // tiles from the centre to the corner, generously
    const cx0 = Math.floor((px - reach) / n), cx1 = Math.floor((px + reach) / n);
    const cy0 = Math.floor((py - reach) / n), cy1 = Math.floor((py + reach) / n);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunkCanvases.get(`${cx},${cy}`);
        if (c) ctx.drawImage(c, cx * n, cy * n);
      }
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Player marker.
    ctx.fillStyle = '#fff3c4';
    ctx.strokeStyle = '#1a1208';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(half, half, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (facing !== null) {
      const a = (facing * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(half + Math.cos(a) * 4, half + Math.sin(a) * 4);
      ctx.lineTo(half + Math.cos(a) * 8, half + Math.sin(a) * 8);
      ctx.strokeStyle = '#fff3c4';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232,240,216,0.7)';
    ctx.stroke();
  }
}

function hexToRgb(hex) {
  const v = parseInt(String(hex).replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
