import { PixelCanvas, shade } from './PixelCanvas.js';
import { hash2 } from '../core/random.js';

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
  pc.set(ax - 3, ay - 7, '#d24c4c');
  pc.set(ax + 2, ay - 5, '#d24c4c');
  pc.outline('#1f3315');
  return { pc, originX: ax / pc.width, originY: ay / pc.height };
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
export const wallX = () => wall(true);
export const wallY = () => wall(false);

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
  wallX,
  wallY,
  playerSheet,
};
