/**
 * Tiny pixel-exact raster used to generate placeholder sprites. Shapes are
 * rasterised per pixel (no anti-aliasing) so generated art stays crisp, like
 * hand-made pixel art, under nearest-neighbour scaling.
 */
export class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  set(x, y, color) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || !color) return;
    const [r, g, b, a] = parseColor(color);
    const i = (y * this.width + x) * 4;
    if (a >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
      return;
    }
    // Alpha blend over what is already there.
    const sa = a / 255;
    const da = this.data[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    this.data[i] = (r * sa + this.data[i] * da * (1 - sa)) / oa;
    this.data[i + 1] = (g * sa + this.data[i + 1] * da * (1 - sa)) / oa;
    this.data[i + 2] = (b * sa + this.data[i + 2] * da * (1 - sa)) / oa;
    this.data[i + 3] = oa * 255;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.data[(y * this.width + x) * 4 + 3];
  }

  rect(x, y, w, h, color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  /** Filled ellipse; `shade(dx, dy)` may return a colour per pixel. */
  ellipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, typeof color === 'function' ? color(dx, dy, x, y) : color);
      }
    }
  }

  /** Filled convex or concave polygon (even-odd rule), pixel centres sampled. */
  polygon(points, color) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
      for (let x = Math.floor(minX); x < Math.ceil(maxX); x++) {
        if (pointInPolygon(x + 0.5, y + 0.5, points)) {
          this.set(x, y, typeof color === 'function' ? color(x, y) : color);
        }
      }
    }
  }

  /** 1px dark outline around every opaque pixel (classic pixel-art readability). */
  outline(color) {
    const out = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) > 0) continue;
        if (this.get(x + 1, y) > 128 || this.get(x - 1, y) > 128 || this.get(x, y + 1) > 128 || this.get(x, y - 1) > 128) {
          out.push(x, y);
        }
      }
    }
    for (let i = 0; i < out.length; i += 2) this.set(out[i], out[i + 1], color);
  }

  /** Copies another PixelCanvas at (dx, dy), optionally mirrored horizontally. */
  blit(src, dx, dy, flipX = false) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const i = (y * src.width + x) * 4;
        if (src.data[i + 3] === 0) continue;
        const tx = flipX ? dx + src.width - 1 - x : dx + x;
        const j = ((dy + y) * this.width + tx) * 4;
        if (tx < 0 || tx >= this.width || dy + y < 0 || dy + y >= this.height) continue;
        this.data[j] = src.data[i];
        this.data[j + 1] = src.data[i + 1];
        this.data[j + 2] = src.data[i + 2];
        this.data[j + 3] = src.data[i + 3];
      }
    }
  }

  toCanvas(doc) {
    const canvas = doc.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(this.width, this.height);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const colorCache = new Map();
export function parseColor(c) {
  let v = colorCache.get(c);
  if (v) return v;
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const n = parseInt(h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/);
    const p = m ? m[1].split(',').map((s) => parseFloat(s)) : [255, 0, 255, 1];
    v = [p[0], p[1], p[2], p[3] === undefined ? 255 : Math.round(p[3] * 255)];
  }
  colorCache.set(c, v);
  return v;
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex colour. */
export function shade(hex, amount) {
  const [r, g, b] = parseColor(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
