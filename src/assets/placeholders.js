import { PixelCanvas, shade } from './PixelCanvas.js';
import { hash2 } from '../core/random.js';
import { creatureSheet, creatureDead } from './creatureArt.js';

/**
 * Generators for provisional pixel art. Each generator returns a PixelCanvas
 * plus the anchor ("origin") that must sit on the entity's ground position.
 * Real art replaces any of them by setting `file` in public/assets/manifest.json;
 * the game code does not change.
 *
 * Every generator projects its shapes with the same 2:1 rules as the game
 * (32x16 tiles, 16 px per height unit) so placeholders already respect the
 * isometric perspective.
 */
const TW = 32;
const TH = 16;
const HU = 16;

/** Projects a point relative to the anchor (world dx, dy, z) to canvas pixels. */
function proj(ax, ay, dx, dy, z = 0) {
  return { x: ax + (dx - dy) * (TW / 2), y: ay + (dx + dy) * (TH / 2) - z * HU };
}

/** Draws an isometric box: footprint half sizes (hw, hh) around the anchor, height h. */
function isoBox(pc, ax, ay, hw, hh, h, colors) {
  const top = [proj(ax, ay, -hw, -hh, h), proj(ax, ay, hw, -hh, h), proj(ax, ay, hw, hh, h), proj(ax, ay, -hw, hh, h)];
  // Face along +y (screen bottom-left) and face along +x (screen bottom-right).
  const left = [proj(ax, ay, -hw, hh, h), proj(ax, ay, hw, hh, h), proj(ax, ay, hw, hh, 0), proj(ax, ay, -hw, hh, 0)];
  const right = [proj(ax, ay, hw, -hh, h), proj(ax, ay, hw, hh, h), proj(ax, ay, hw, hh, 0), proj(ax, ay, hw, -hh, 0)];
  pc.polygon(left, colors.left);
  pc.polygon(right, colors.right);
  pc.polygon(top, colors.top);
}

export function groundTile(colors, variant) {
  const pc = new PixelCanvas(TW, TH);
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      // Diamond covering exactly half the rectangle so neighbours tile without gaps.
      const dx = Math.abs(x + 0.5 - TW / 2) / (TW / 2);
      const dy = Math.abs(y + 0.5 - TH / 2) / (TH / 2);
      if (dx + dy > 1) continue;
      const r = hash2(x, y, variant * 97 + 13);
      const c = r < 0.6 ? colors[0] : r < 0.85 ? colors[1] : colors[2];
      pc.set(x, y, c);
    }
  }
  return { pc, originX: 0.5, originY: 0.5 };
}

export function tileCursor() {
  const pc = new PixelCanvas(TW, TH);
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      const dx = Math.abs(x + 0.5 - TW / 2) / (TW / 2);
      const dy = Math.abs(y + 0.5 - TH / 2) / (TH / 2);
      const d = dx + dy;
      if (d <= 1 && d > 0.84) pc.set(x, y, '#ffe680');
      else if (d <= 0.84) pc.set(x, y, 'rgba(255,230,128,0.18)');
    }
  }
  return { pc, originX: 0.5, originY: 0.5 };
}

export function shadow() {
  const pc = new PixelCanvas(16, 8);
  pc.ellipse(8, 4, 7, 3.2, 'rgba(0,0,0,0.32)');
  return { pc, originX: 0.5, originY: 0.5 };
}

export function tree() {
  const pc = new PixelCanvas(32, 50);
  const ax = 16, ay = 46;
  pc.rect(ax - 2, ay - 16, 4, 16, '#6b4a2b');
  pc.rect(ax - 2, ay - 16, 1, 16, '#80593a');
  pc.rect(ax + 1, ay - 16, 1, 16, '#563a20');
  const leaf = (dx, dy, x, y) => {
    const light = -dx * 0.6 - dy * 0.8;
    const n = hash2(x, y, 7);
    if (light + n * 0.5 > 0.55) return '#8cc65a';
    if (light + n * 0.5 > -0.1) return '#5e9e3c';
    return '#3f7a2a';
  };
  pc.ellipse(ax, ay - 30, 13, 12, leaf);
  pc.ellipse(ax - 6, ay - 22, 8, 6, leaf);
  pc.ellipse(ax + 6, ay - 23, 8, 6, leaf);
  pc.outline('#1e2d14');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function pine() {
  const pc = new PixelCanvas(28, 56);
  const ax = 14, ay = 52;
  pc.rect(ax - 2, ay - 10, 4, 10, '#5d3f24');
  const layers = [[ay - 8, 12, 12], [ay - 18, 10, 12], [ay - 27, 8, 11], [ay - 36, 5, 9]];
  for (const [base, half, h] of layers) {
    pc.polygon([{ x: ax, y: base - h - 4 }, { x: ax + half + 1, y: base }, { x: ax - half - 1, y: base }], (x, y) => {
      const n = hash2(x, y, 3);
      if (x < ax - 1 && n > 0.35) return '#4f8f4a';
      return n > 0.8 ? '#3a7038' : '#2f5f30';
    });
  }
  pc.outline('#14261a');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function rock() {
  const pc = new PixelCanvas(28, 22);
  const ax = 14, ay = 17;
  pc.ellipse(ax, ay - 5, 12, 8, (dx, dy, x, y) => {
    const light = -dx * 0.5 - dy * 0.9 + hash2(x, y, 5) * 0.3;
    return light > 0.5 ? '#b8b9b2' : light > -0.2 ? '#93958c' : '#6d6f68';
  });
  pc.outline('#2e302c');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function boulder() {
  const pc = new PixelCanvas(34, 40);
  const ax = 17, ay = 28;
  isoBox(pc, ax, ay, 0.45, 0.45, 1.0, { top: '#a3a59c', left: '#7c7e76', right: '#62645d' });
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash2(i, 1, 11) * 30) + 2;
    const y = Math.floor(hash2(i, 2, 11) * 30) + 2;
    if (pc.get(x, y) > 0) pc.set(x, y, 'rgba(40,40,36,0.35)');
  }
  pc.outline('#2a2b27');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function bush() {
  const pc = new PixelCanvas(20, 14);
  const ax = 10, ay = 12;
  pc.ellipse(ax, ay - 5, 8, 5, (dx, dy, x, y) => {
    const n = hash2(x, y, 9);
    if (-dx - dy + n > 0.9) return '#7fb954';
    return n > 0.6 ? '#4f8a35' : '#5d9c3e';
  });
  pc.outline('#1f3315');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function berryBush() {
  const pc = new PixelCanvas(20, 15);
  const ax = 10, ay = 13;
  pc.ellipse(ax, ay - 5, 8, 5.5, (dx, dy, x, y) => {
    const n = hash2(x, y, 19);
    if (-dx - dy + n > 0.9) return '#76ad4c';
    return n > 0.6 ? '#46802f' : '#548f38';
  });
  for (let i = 0; i < 9; i++) {
    const x = ax - 6 + Math.floor(hash2(i, 3, 23) * 12);
    const y = ay - 9 + Math.floor(hash2(i, 4, 23) * 7);
    if (pc.get(x, y) > 0) pc.set(x, y, i % 3 === 0 ? '#5a3a8f' : '#c93a3a');
  }
  pc.outline('#1f3315');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function birch() {
  const pc = new PixelCanvas(26, 50);
  const ax = 13, ay = 46;
  pc.rect(ax - 1, ay - 20, 3, 20, '#e8e4d8');
  for (let y = ay - 20; y < ay; y += 4) pc.set(ax - 1 + (y % 3), y, '#3b3a36');
  const leaf = (dx, dy, x, y) => {
    const n = hash2(x, y, 29);
    const l = -dx * 0.6 - dy * 0.8 + n * 0.5;
    return l > 0.55 ? '#b8d86a' : l > -0.1 ? '#8fbf4c' : '#6a9a38';
  };
  pc.ellipse(ax, ay - 31, 9, 13, leaf);
  pc.outline('#24331a');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function swampTree() {
  const pc = new PixelCanvas(34, 48);
  const ax = 17, ay = 44;
  pc.rect(ax - 2, ay - 18, 5, 18, '#4a3b2a');
  pc.rect(ax - 4, ay - 3, 9, 3, '#4a3b2a'); // roots
  const leaf = (dx, dy, x, y) => {
    const n = hash2(x, y, 31);
    return -dy + n * 0.6 > 0.6 ? '#6f8a44' : n > 0.5 ? '#4c6a32' : '#3f5a2a';
  };
  pc.ellipse(ax, ay - 28, 15, 9, leaf);
  // Hanging moss
  for (let i = 0; i < 10; i++) {
    const x = ax - 13 + Math.floor(hash2(i, 5, 37) * 26);
    const len = 4 + Math.floor(hash2(i, 6, 37) * 8);
    for (let k = 0; k < len; k++) if (pc.get(x, ay - 22 + k) === 0 || k < 2) pc.set(x, ay - 22 + k, '#5d7a3c');
  }
  pc.outline('#1b2614');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function outcrop() {
  const pc = new PixelCanvas(36, 52);
  const ax = 18, ay = 40;
  isoBox(pc, ax, ay, 0.46, 0.46, 1.6, { top: '#9a9b94', left: '#7a7b74', right: '#5f605a' });
  // Jagged top
  for (let i = 0; i < 5; i++) {
    const x = ax - 10 + i * 5;
    const h = 3 + Math.floor(hash2(i, 9, 41) * 6);
    const base = ay - 26 - Math.abs(i - 2) * 2;
    pc.polygon([{ x, y: base }, { x: x + 3, y: base - h }, { x: x + 6, y: base }], '#a7a8a0');
  }
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(hash2(i, 1, 43) * 34) + 1;
    const y = Math.floor(hash2(i, 2, 43) * 48) + 2;
    if (pc.get(x, y) > 0) pc.set(x, y, 'rgba(30,30,28,0.35)');
  }
  pc.outline('#262724');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function flint() {
  const pc = new PixelCanvas(16, 9);
  const ax = 8, ay = 7;
  pc.ellipse(ax - 3, ay - 2, 3, 2, '#4b4f57');
  pc.ellipse(ax + 3, ay - 1, 2.5, 1.8, '#5b6069');
  pc.ellipse(ax, ay - 3, 2, 1.5, '#3c4048');
  pc.set(ax - 4, ay - 3, '#9aa3b0');
  pc.set(ax + 2, ay - 2, '#9aa3b0');
  pc.outline('#1d1f23');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function tallGrass() {
  const pc = new PixelCanvas(18, 16);
  const ax = 9, ay = 14;
  for (let i = 0; i < 9; i++) {
    const x = ax - 6 + Math.floor(hash2(i, 1, 47) * 13);
    const h = 6 + Math.floor(hash2(i, 2, 47) * 7);
    const lean = hash2(i, 3, 47) < 0.5 ? -1 : 1;
    for (let k = 0; k < h; k++) pc.set(x + (k > h * 0.6 ? lean : 0), ay - k, k > h - 3 ? '#a8c45a' : '#6d9a3a');
  }
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function reeds() {
  const pc = new PixelCanvas(16, 22);
  const ax = 8, ay = 20;
  for (let i = 0; i < 6; i++) {
    const x = ax - 5 + Math.floor(hash2(i, 1, 53) * 11);
    const h = 12 + Math.floor(hash2(i, 2, 53) * 7);
    for (let k = 0; k < h; k++) pc.set(x, ay - k, '#7d8f45');
    if (i % 2 === 0) pc.rect(x - 1, ay - h - 3, 3, 4, '#6b4a2b'); // cattail head
  }
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function flowers() {
  const pc = new PixelCanvas(16, 8);
  const ax = 8, ay = 6;
  const colors = ['#f2d14b', '#e8e8f0', '#d76fb0', '#7fa8e8'];
  for (let i = 0; i < 6; i++) {
    const x = ax - 6 + Math.floor(hash2(i, 1, 59) * 12);
    const y = ay - 4 + Math.floor(hash2(i, 2, 59) * 4);
    pc.set(x, y + 1, '#4f7d2f');
    pc.set(x, y, colors[i % colors.length]);
  }
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

/**
 * Side face of a raised tile, one height level tall (8 px). 'left' is the
 * face along the tile's +y edge (bottom-left on screen), 'right' the +x edge.
 * The origin is the tile centre at the top height.
 */
export function cliffFace(colors, side) {
  const pc = new PixelCanvas(16, 16);
  const pts = side === 'left'
    ? [{ x: 0, y: 0 }, { x: 16, y: 8 }, { x: 16, y: 16 }, { x: 0, y: 8 }]
    : [{ x: 0, y: 8 }, { x: 16, y: 0 }, { x: 16, y: 8 }, { x: 0, y: 16 }];
  const base = side === 'left' ? colors[0] : colors[1];
  pc.polygon(pts, (x, y) => (hash2(x, y, side === 'left' ? 61 : 67) > 0.8 ? shade(base, -0.15) : base));
  // Lit top edge
  for (let x = 0; x < 16; x++) {
    const y = side === 'left' ? Math.floor(x / 2) : 8 - Math.ceil((x + 1) / 2);
    pc.set(x, y, shade(base, 0.18));
  }
  return { pc, originX: side === 'left' ? 1 : 0, originY: 0 };
}

function wall(alongX) {
  const pc = new PixelCanvas(36, 44);
  const ax = 18, ay = 26;
  const hw = alongX ? 0.5 : 0.12;
  const hh = alongX ? 0.12 : 0.5;
  isoBox(pc, ax, ay, hw, hh, 1.15, { top: '#b08a5a', left: '#8a6a43', right: '#6f5335' });
  // Log lines on the long face.
  for (let k = 1; k < 4; k++) {
    const z = (1.15 * k) / 4;
    const a = alongX ? proj(ax, ay, -hw, hh, z) : proj(ax, ay, hw, -hh, z);
    const b = alongX ? proj(ax, ay, hw, hh, z) : proj(ax, ay, hw, hh, z);
    const steps = Math.ceil(Math.abs(b.x - a.x));
    for (let s = 0; s <= steps; s++) {
      const t = steps ? s / steps : 0;
      pc.set(Math.round(a.x + (b.x - a.x) * t - 0.5), Math.round(a.y + (b.y - a.y) * t - 0.5), '#5a4128');
    }
  }
  pc.outline('#2b1f12');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function stump() {
  const pc = new PixelCanvas(16, 12);
  const ax = 8, ay = 9;
  pc.rect(ax - 4, ay - 5, 8, 5, '#6b4a2b');
  pc.rect(ax + 1, ay - 5, 3, 5, '#563a20');
  pc.ellipse(ax, ay - 5, 4, 2, '#c49a64');
  pc.set(ax, ay - 5, '#8a5a32');
  pc.outline('#2b1f12');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function branch() {
  const pc = new PixelCanvas(18, 8);
  const ax = 9, ay = 6;
  for (let i = -6; i <= 6; i++) pc.set(ax + i, ay - 2 + Math.round(i / 4), '#7a5230');
  pc.set(ax - 2, ay - 3, '#7a5230');
  pc.set(ax - 3, ay - 4, '#7a5230');
  pc.set(ax + 3, ay - 1, '#5d9c3e');
  pc.outline('#2b1f12');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function pebble() {
  const pc = new PixelCanvas(14, 8);
  const ax = 7, ay = 6;
  pc.ellipse(ax - 2, ay - 2, 3, 2, '#9a9b94');
  pc.ellipse(ax + 3, ay - 1, 2, 1.5, '#85877f');
  pc.outline('#2e302c');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function mushroomProp() {
  const pc = new PixelCanvas(14, 12);
  const ax = 7, ay = 10;
  for (const [dx, h] of [[-3, 4], [2, 6]]) {
    pc.rect(ax + dx, ay - h, 2, h, '#f0e2c8');
    pc.ellipse(ax + dx + 1, ay - h, 3.2, 2, '#b8643a');
    pc.set(ax + dx, ay - h - 1, '#f0e2c8');
  }
  pc.outline('#3a2414');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

/** 16x16 inventory icon, also used for items lying on the ground. */
export function itemIcon(shape, [a, b]) {
  const pc = new PixelCanvas(16, 16);
  switch (shape) {
    case 'log':
      pc.rect(2, 6, 11, 5, a);
      pc.rect(2, 10, 11, 1, shade(a, -0.25));
      pc.ellipse(13, 8.5, 2, 2.6, b);
      pc.set(13, 8, shade(b, -0.3));
      break;
    case 'stick':
      for (let i = 0; i < 12; i++) pc.set(2 + i, 13 - i, i % 4 === 0 ? b : a);
      for (let i = 0; i < 12; i++) pc.set(3 + i, 13 - i, b);
      pc.set(9, 9, a); pc.set(10, 10, a);
      break;
    case 'stone':
      pc.ellipse(8, 9, 6, 4.5, (dx, dy) => (-dx - dy > 0.3 ? shade(a, 0.15) : dy > 0.3 ? b : a));
      break;
    case 'flint':
      pc.polygon([{ x: 3, y: 12 }, { x: 8, y: 2 }, { x: 13, y: 9 }, { x: 9, y: 14 }], a);
      pc.polygon([{ x: 7, y: 5 }, { x: 8, y: 3 }, { x: 10, y: 7 }], b);
      break;
    case 'fiber':
      for (let i = 0; i < 5; i++) for (let k = 0; k < 11; k++) pc.set(4 + i * 2 + (k > 7 ? 1 : 0), 14 - k, k > 8 ? a : b);
      pc.rect(3, 9, 11, 1, shade(b, -0.3));
      break;
    case 'reed':
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 12; k++) pc.set(5 + i * 3, 15 - k, a);
        pc.rect(4 + i * 3, 2 + i, 3, 4, b);
      }
      break;
    case 'drop':
      pc.ellipse(8, 10, 4.5, 4.5, a);
      pc.polygon([{ x: 4, y: 9 }, { x: 8, y: 2 }, { x: 12, y: 9 }], a);
      pc.set(6, 9, shade(a, 0.4));
      pc.rect(8, 12, 3, 1, b);
      break;
    case 'lump':
      pc.ellipse(8, 10, 6, 4, a);
      pc.ellipse(6, 8, 3, 2, shade(a, 0.12));
      pc.rect(9, 12, 3, 1, b);
      break;
    case 'berries':
      for (const [x, y, c] of [[5, 9, a], [9, 8, a], [7, 12, b], [11, 11, a], [4, 13, b]]) {
        pc.ellipse(x, y, 2.2, 2.2, c);
        pc.set(x - 1, y - 1, '#ffffff');
      }
      pc.rect(7, 3, 1, 5, '#4f7d2f');
      pc.rect(8, 4, 3, 1, '#4f7d2f');
      break;
    case 'mushroom':
      pc.rect(7, 8, 3, 6, b);
      pc.ellipse(8.5, 7, 6, 3.5, a);
      pc.set(6, 6, b); pc.set(10, 5, b);
      break;
    case 'rope':
      pc.ellipse(8, 9, 6, 4.5, (dx, dy) => (dx * dx + dy * dy < 0.3 ? null : a)); // a coil
      for (let x = 3; x < 14; x += 2) pc.set(x, 6 + (x % 4 === 1 ? 1 : 0), b);
      pc.rect(12, 11, 3, 1, b);
      break;
    case 'axe':
    case 'pick':
      for (let i = 0; i < 12; i++) pc.rect(3 + i, 14 - i, 2, 1, a);
      if (shape === 'axe') {
        pc.polygon([{ x: 9, y: 2 }, { x: 15, y: 4 }, { x: 13, y: 9 }, { x: 9, y: 6 }], b);
      } else {
        pc.polygon([{ x: 6, y: 3 }, { x: 12, y: 2 }, { x: 15, y: 7 }, { x: 13, y: 5 }, { x: 9, y: 5 }], b);
      }
      pc.rect(10, 5, 2, 2, '#c9b27a'); // binding
      break;
    case 'cloth':
      pc.polygon([{ x: 2, y: 4 }, { x: 14, y: 4 }, { x: 12, y: 13 }, { x: 8, y: 11 }, { x: 4, y: 13 }], a);
      pc.rect(2, 4, 12, 2, b);
      pc.set(6, 8, b); pc.set(10, 9, b);
      break;
    case 'spear':
      for (let i = 0; i < 11; i++) pc.set(2 + i, 14 - i, a);
      for (let i = 0; i < 11; i++) pc.set(3 + i, 14 - i, shade(a, -0.25));
      pc.polygon([{ x: 11, y: 4 }, { x: 15, y: 1 }, { x: 13, y: 6 }], b);
      pc.rect(10, 5, 2, 2, '#c9b27a');
      break;
    case 'club':
      for (let i = 0; i < 8; i++) pc.rect(3 + i, 14 - i, 2, 1, a);
      pc.ellipse(11, 5, 3.6, 3.6, (dx, dy) => (-dx - dy > 0.4 ? shade(b, 0.2) : b));
      pc.rect(8, 8, 2, 2, '#c9b27a');
      break;
    case 'meat':
      pc.ellipse(9, 8, 5.5, 4.5, (dx, dy) => (-dx - dy > 0.6 ? shade(a, 0.2) : a));
      pc.rect(2, 11, 5, 2, b);
      pc.ellipse(2.5, 12, 1.6, 1.8, b);
      break;
    case 'cloak':
      pc.polygon([{ x: 5, y: 2 }, { x: 11, y: 2 }, { x: 15, y: 14 }, { x: 1, y: 14 }], a);
      pc.rect(5, 2, 6, 2, b);
      for (let x = 2; x < 15; x += 3) pc.set(x, 13, b);
      break;
    default:
      pc.rect(4, 4, 8, 8, '#ff00ff');
  }
  pc.outline('#1a120a');
  return { pc, originX: 0.5, originY: 0.75 };
}

export const wallX = () => wall(true);
export const wallY = () => wall(false);

// ---- Built pieces (phase 4) ------------------------------------------------
// Edge pieces (walls, doors) are drawn around the middle of a tile side, the
// rest around the tile centre. WALL_H is the wall height in world units.
const WALL_H = 1.5;

/** Box from height z0 to z1 whose footprint centre is (cx, cy) relative to the anchor. */
function box(pc, ax, ay, cx, cy, hw, hh, z0, z1, colors) {
  const a = proj(ax, ay, cx, cy, z0);
  isoBox(pc, a.x, a.y, hw, hh, z1 - z0, colors);
}

/** Same along a piece's own axis: `a` along it, `p` across it. */
function edgeBox(pc, ax, ay, alongX, a, p, ha, hp, z0, z1, colors) {
  if (alongX) box(pc, ax, ay, a, p, ha, hp, z0, z1, colors);
  else box(pc, ax, ay, p, a, hp, ha, z0, z1, colors);
}

/** Flat diamond piece lying on a tile; `paint(x, y)` gets world coordinates in [-0.5, 0.5]. */
function flatPiece(paint, size = 1) {
  const pc = new PixelCanvas(TW, TH);
  for (let py = 0; py < TH; py++) {
    for (let px = 0; px < TW; px++) {
      const a = (px + 0.5 - TW / 2) / (TW / 2);
      const b = (py + 0.5 - TH / 2) / (TH / 2);
      const x = (a + b) / 2, y = (b - a) / 2;
      if (Math.abs(x) > size / 2 || Math.abs(y) > size / 2) continue;
      const rim = Math.max(Math.abs(x), Math.abs(y)) > size / 2 - 0.06;
      pc.set(px, py, paint(x, y, rim));
    }
  }
  return { pc, originX: 0.5, originY: 0.5 };
}

export function woodFloor() {
  return flatPiece((x, y, rim) => {
    if (rim) return '#5a3e24';
    const k = Math.floor((y + 0.5) * 4);
    const along = (x + 0.5) * 2 + (k % 2) * 0.5;
    if ((y + 0.5) * 4 - k < 0.12 || along % 1 < 0.06) return '#6b4a2b';
    return ['#a87a4a', '#9a6c3e', '#b08250', '#946638'][k] ?? '#a87a4a';
  });
}

export function stoneFloor() {
  return flatPiece((x, y, rim) => {
    if (rim) return '#4e4b45';
    const ky = Math.floor((y + 0.5) * 3);
    const u = (x + 0.5) * 2.5 + (ky % 2) * 0.5;
    const kx = Math.floor(u);
    if ((y + 0.5) * 3 - ky < 0.1 || u - kx < 0.07) return '#5e5a52';
    const r = hash2(kx, ky, 71);
    return r < 0.33 ? '#a09a8e' : r < 0.66 ? '#928c80' : '#aaa498';
  });
}

function woodWall(alongX) {
  const pc = new PixelCanvas(40, 46);
  const ax = 20, ay = 38;
  const hw = alongX ? 0.62 : 0.12, hh = alongX ? 0.12 : 0.62;
  // Horizontal logs, five per wall. `foot(x)` is the screen row of the face's bottom at column x.
  const logs = (base, foot) => (x, y) => {
    const k = ((foot(x) - y) / HU / WALL_H) * 5;
    return k % 1 < 0.18 ? shade(base, -0.35) : shade(base, Math.floor(k) % 2 ? -0.06 : 0.05);
  };
  const leftFoot = (x) => ay + ((x + 0.5 - ax) / (TW / 2) + 2 * hh) * (TH / 2);
  const rightFoot = (x) => ay + (2 * hw - (x + 0.5 - ax) / (TW / 2)) * (TH / 2);
  isoBox(pc, ax, ay, hw, hh, WALL_H, { top: '#c49a64', left: logs('#a0743f', leftFoot), right: logs('#8a6233', rightFoot) });
  pc.outline('#2b1f12');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

function woodDoor(alongX, open) {
  const pc = new PixelCanvas(40, 46);
  const ax = 20, ay = 38;
  const post = { top: '#b08a5a', left: '#7a5634', right: '#644528' };
  const plank = { top: '#b88a52', left: (x) => (x % 3 === 0 ? '#6e4c2c' : '#9a6c3e'), right: (x) => (x % 3 === 0 ? '#5a3e24' : '#84592f') };
  edgeBox(pc, ax, ay, alongX, -0.5, 0, 0.12, 0.14, 0, WALL_H, post);
  if (open) edgeBox(pc, ax, ay, alongX, -0.34, 0.36, 0.04, 0.34, 0, WALL_H - 0.3, plank);
  else edgeBox(pc, ax, ay, alongX, 0, 0, 0.38, 0.05, 0, WALL_H - 0.3, plank);
  edgeBox(pc, ax, ay, alongX, 0.5, 0, 0.12, 0.14, 0, WALL_H, post);
  edgeBox(pc, ax, ay, alongX, 0, 0, 0.62, 0.12, WALL_H - 0.3, WALL_H, post);
  pc.outline('#2b1f12');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function thatchRoof() {
  const pc = new PixelCanvas(42, 46);
  const ax = 21, ay = 44; // the roof floats at wall height above its anchor
  const straw = (x, y) => (hash2(x, y, 83) > 0.78 ? '#b89a4a' : (x + y) % 4 === 0 ? '#c9ab58' : '#d6b864');
  box(pc, ax, ay, 0, 0, 0.62, 0.62, WALL_H, WALL_H + 0.22, { top: straw, left: '#9a7a34', right: '#7f6428' });
  pc.outline('#3a2a10');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function workbench() {
  const pc = new PixelCanvas(30, 28);
  const ax = 15, ay = 20;
  const leg = { top: '#6b4a2b', left: '#5a3e24', right: '#4a321c' };
  for (const [x, y] of [[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.2], [0.28, 0.2]]) box(pc, ax, ay, x, y, 0.05, 0.05, 0, 0.5, leg);
  box(pc, ax, ay, 0, 0, 0.34, 0.26, 0.5, 0.62, { top: (x, y) => ((x + 2 * y) % 5 === 0 ? '#9a6c3e' : '#b88a52'), left: '#7a5634', right: '#644528' });
  const top = proj(ax, ay, 0.05, -0.05, 0.62);
  pc.ellipse(top.x - 3, top.y - 1, 2.5, 1.5, '#8d9099'); // a stone tool lying on it
  pc.rect(top.x + 1, top.y - 1, 5, 1, '#6b4a2b');
  pc.outline('#2b1f12');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function campfire() {
  const pc = new PixelCanvas(26, 28);
  const ax = 13, ay = 22;
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    ring.push(proj(ax, ay, Math.cos(ang) * 0.26, Math.sin(ang) * 0.26));
  }
  const stone = (p, i) => pc.ellipse(p.x, p.y - 1, 2.4, 1.7, i % 2 ? '#8d8f88' : '#a3a59c');
  ring.forEach((p, i) => { if (p.y <= ay) stone(p, i); }); // stones behind the fire
  for (const [x0, y0, x1, y1] of [[-0.2, 0, 0.2, 0], [0, -0.2, 0, 0.2]]) {
    const a = proj(ax, ay, x0, y0, 0.06), b = proj(ax, ay, x1, y1, 0.06);
    for (let t = 0; t <= 1; t += 0.05) pc.rect(Math.round(a.x + (b.x - a.x) * t) - 1, Math.round(a.y + (b.y - a.y) * t) - 1, 2, 2, '#5a3a20');
  }
  pc.polygon([{ x: ax - 5, y: ay - 2 }, { x: ax - 2, y: ay - 13 }, { x: ax, y: ay - 8 }, { x: ax + 2, y: ay - 16 }, { x: ax + 5, y: ay - 2 }], '#e8742a');
  pc.polygon([{ x: ax - 3, y: ay - 2 }, { x: ax, y: ay - 10 }, { x: ax + 3, y: ay - 2 }], '#f8c84a');
  ring.forEach((p, i) => { if (p.y > ay) stone(p, i); }); // stones in front
  pc.outline('#21160d');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function torch() {
  const pc = new PixelCanvas(10, 24);
  const ax = 5, ay = 22;
  pc.rect(ax - 1, ay - 14, 2, 14, '#7a5230');
  pc.rect(ax - 1, ay - 15, 2, 2, '#c9b27a'); // fibre wrapping
  pc.ellipse(ax, ay - 18, 2.6, 3.6, '#e8742a');
  pc.ellipse(ax, ay - 17, 1.3, 2, '#f8d65a');
  pc.outline('#21160d');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export function fiberMat() {
  return flatPiece((x, y, rim) => {
    if (rim) return '#7a6a34';
    const u = Math.floor((x + 0.5) * 8), v = Math.floor((y + 0.5) * 8);
    return (u + v) % 2 ? '#b8a45a' : '#a08c46';
  }, 0.8);
}

export function standingStone() {
  const pc = new PixelCanvas(16, 34);
  const ax = 8, ay = 31;
  pc.polygon([{ x: ax - 5, y: ay }, { x: ax - 6, y: ay - 18 }, { x: ax - 3, y: ay - 28 }, { x: ax + 2, y: ay - 29 }, { x: ax + 5, y: ay - 20 }, { x: ax + 5, y: ay }], (x, y) => {
    const n = hash2(x, y, 89);
    if (x < ax - 2) return n > 0.8 ? '#8d8f88' : '#a3a59c';
    return n > 0.85 ? '#5f605a' : x > ax + 2 ? '#6d6f68' : '#7c7e76';
  });
  pc.outline('#262724');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
}

export const woodWallX = () => woodWall(true);
export const woodWallY = () => woodWall(false);
export const woodDoorX = () => woodDoor(true, false);
export const woodDoorY = () => woodDoor(false, false);
export const woodDoorXOpen = () => woodDoor(true, true);
export const woodDoorYOpen = () => woodDoor(false, true);

/** Inventory icon of a building piece: its world graphic, cropped and shrunk to 16x16. */
export function pieceIcon(gen) {
  const src = GENERATORS[gen]().pc;
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (src.get(x, y) === 0) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = Math.min(1, 15 / w, 15 / h);
  const pc = new PixelCanvas(16, 16);
  const ox = Math.floor((16 - w * k) / 2), oy = Math.floor((16 - h * k) / 2);
  for (let y = 0; y < Math.round(h * k); y++) {
    for (let x = 0; x < Math.round(w * k); x++) {
      const i = ((y0 + Math.floor(y / k)) * src.width + x0 + Math.floor(x / k)) * 4;
      if (src.data[i + 3] === 0) continue;
      const j = ((oy + y) * 16 + ox + x) * 4;
      for (let c = 0; c < 4; c++) pc.data[j + c] = src.data[i + c];
    }
  }
  return { pc, originX: 0.5, originY: 0.75 };
}

/**
 * Player sprite sheet: 5 drawn directions x 4 walk frames (16x26 each).
 * Rows: 0 = east, 1 = south-east, 2 = south, 3 = north, 4 = north-east.
 * West-facing directions reuse east-facing rows mirrored (see FACING_FRAMES).
 */
export const PLAYER_FRAME = { width: 16, height: 26, originX: 0.5, originY: 24 / 26 };

export function playerSheet() {
  const fw = PLAYER_FRAME.width, fh = PLAYER_FRAME.height;
  const pc = new PixelCanvas(fw * 4, fh * 5);
  const pal = {
    skin: '#d9a066', skinDark: '#b07a45', hair: '#4a2c17', fur: '#8f5a2e', furDark: '#6e4220',
    furLight: '#b57a45', leg: '#c48a55', eye: '#1b1b1b', outline: '#21160d',
  };
  const rows = ['e', 'se', 's', 'n', 'ne'];
  rows.forEach((dir, row) => {
    for (let f = 0; f < 4; f++) {
      const frame = new PixelCanvas(fw, fh);
      drawCharacter(frame, dir, f, pal);
      frame.outline(pal.outline);
      pc.blit(frame, f * fw, row * fh);
    }
  });
  return { pc, frameWidth: fw, frameHeight: fh, originX: PLAYER_FRAME.originX, originY: PLAYER_FRAME.originY };
}

function drawCharacter(pc, dir, frame, pal) {
  // frame 0 = idle/contact, 1..3 = walk cycle (legs alternate, body bobs).
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const stride = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const cx = 8;
  const base = 24;
  const side = dir === 'e' || dir === 'ne' || dir === 'se';
  // Legs
  const legY = base - 6;
  if (side && dir === 'e') {
    pc.rect(cx - 1 + stride, legY, 2, 6, pal.leg);
    pc.rect(cx - 1 - stride, legY, 2, 6, shade(pal.leg, -0.2));
  } else {
    pc.rect(cx - 3, legY - (stride > 0 ? 1 : 0), 2, 6, pal.leg);
    pc.rect(cx + 1, legY - (stride < 0 ? 1 : 0), 2, 6, pal.leg);
  }
  // Fur tunic
  const bodyTop = base - 14 + bob;
  pc.rect(cx - 4, bodyTop, 8, 9, pal.fur);
  pc.rect(cx - 4, bodyTop, 2, 9, pal.furLight);
  pc.rect(cx + 2, bodyTop, 2, 9, pal.furDark);
  for (let x = cx - 4; x < cx + 4; x += 2) pc.set(x, bodyTop + 9, pal.furDark);
  // Arms swing opposite to legs
  const arm = -stride;
  if (dir !== 'n' && dir !== 'ne') pc.rect(cx + 4, bodyTop + 1 + arm, 2, 6, pal.skinDark);
  if (dir !== 'e') pc.rect(cx - 6, bodyTop + 1 - arm, 2, 6, pal.skin);
  if (dir === 'n' || dir === 'ne') pc.rect(cx + 4, bodyTop + 1 + arm, 2, 6, pal.skin);
  // Head
  const headY = bodyTop - 8;
  pc.rect(cx - 3, headY, 6, 7, pal.skin);
  pc.rect(cx + 2, headY + 1, 1, 6, pal.skinDark);
  // Hair and face depending on direction
  if (dir === 'n') {
    pc.rect(cx - 4, headY - 1, 8, 7, pal.hair);
  } else if (dir === 'ne') {
    pc.rect(cx - 4, headY - 1, 8, 4, pal.hair);
    pc.rect(cx - 4, headY + 3, 5, 3, pal.hair);
    pc.set(cx + 2, headY + 3, pal.skinDark);
  } else if (dir === 's') {
    pc.rect(cx - 4, headY - 1, 8, 3, pal.hair);
    pc.set(cx - 4, headY + 2, pal.hair);
    pc.set(cx + 3, headY + 2, pal.hair);
    pc.set(cx - 2, headY + 3, pal.eye);
    pc.set(cx + 1, headY + 3, pal.eye);
  } else if (dir === 'se') {
    pc.rect(cx - 4, headY - 1, 8, 3, pal.hair);
    pc.rect(cx - 4, headY + 2, 2, 3, pal.hair);
    pc.set(cx, headY + 3, pal.eye);
    pc.set(cx + 2, headY + 3, pal.eye);
  } else {
    // east profile
    pc.rect(cx - 4, headY - 1, 7, 3, pal.hair);
    pc.rect(cx - 4, headY + 2, 3, 4, pal.hair);
    pc.set(cx + 2, headY + 3, pal.eye);
    pc.set(cx + 3, headY + 4, pal.skin);
  }
}

/** Maps the 8 facing indices (0 = east, clockwise) to [sheet row, flipX]. */
export const FACING_FRAMES = [
  [0, false], // E
  [1, false], // SE
  [2, false], // S
  [1, true], // SW
  [0, true], // W
  [4, true], // NW
  [3, false], // N
  [4, false], // NE
];

export const GENERATORS = {
  groundTile,
  tileCursor,
  shadow,
  tree,
  pine,
  rock,
  boulder,
  bush,
  berryBush,
  birch,
  swampTree,
  outcrop,
  flint,
  tallGrass,
  reeds,
  flowers,
  cliffFace,
  stump,
  branch,
  pebble,
  mushroomProp,
  itemIcon,
  wallX,
  wallY,
  woodFloor,
  stoneFloor,
  woodWallX,
  woodWallY,
  woodDoorX,
  woodDoorY,
  woodDoorXOpen,
  woodDoorYOpen,
  thatchRoof,
  workbench,
  campfire,
  torch,
  fiberMat,
  standingStone,
  pieceIcon,
  playerSheet,
  creatureSheet,
  creatureDead,
};
