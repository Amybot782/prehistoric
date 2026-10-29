import { PixelCanvas, shade } from './PixelCanvas.js';

/**
 * Provisional pixel art of the animals and dinosaurs, seen from the side and
 * facing right (the game mirrors them to face left). A sheet is one row of 4
 * frames: 0 = standing, 1..3 = walk cycle. The ground point is the bottom of
 * the feet, at the centre of the frame. Real art replaces a sheet with an
 * override of `creature_<species>` in public/assets/manifest.json (same frame
 * size), and the carcass with `creature_<species>_dead`.
 */
const OUTLINE = '#1e140c';
const STRIDE = [0, 1, 0, -1];

/** A leg from (x, y0) to (x + off, y1), `w` pixels wide. */
function leg(pc, x, y0, y1, w, off, color) {
  for (let y = y0; y <= y1; y++) {
    const k = y1 === y0 ? 1 : (y - y0) / (y1 - y0);
    pc.rect(Math.round(x + off * k), y, w, 1, color);
  }
}

const lit = (c, l) => (dx, dy) => (dy < -0.45 ? l : dy > 0.5 ? shade(c, -0.18) : c);

const SPECIES = {
  rabbit: {
    w: 12, h: 10,
    draw(pc, s, bob) {
      const c = '#9a8064', y = bob;
      leg(pc, 3, 6 + y, 8, 2, -s, shade(c, -0.25));
      leg(pc, 8, 7 + y, 8, 1, s, shade(c, -0.25));
      pc.ellipse(5, 5.5 + y, 3.6, 2.6, lit(c, shade(c, 0.2)));
      pc.ellipse(8.8, 4 + y, 2, 1.8, c);
      pc.rect(7, 0 + y, 1, 3, shade(c, -0.1));
      pc.rect(8, 0 + y, 1, 3, '#d8a8a0');
      pc.set(10, 3 + y, '#1b1b1b');
      pc.set(1, 4 + y, '#f2efe6');
      pc.set(1, 5 + y, '#f2efe6');
    },
  },
  deer: {
    w: 24, h: 24,
    draw(pc, s, bob) {
      const c = '#a0703e', d = shade(c, -0.3), y = bob;
      for (const [x, off] of [[6, -s], [8, s], [15, s], [17, -s]]) leg(pc, x, 12 + y, 22, 1, off, x === 8 || x === 17 ? d : shade(c, -0.15));
      pc.ellipse(11, 10.5 + y, 7, 3.6, lit(c, shade(c, 0.18)));
      pc.rect(7, 12 + y, 8, 1, '#d8bc90');
      pc.polygon([{ x: 15, y: 9 + y }, { x: 18, y: 3 + y }, { x: 20, y: 4 + y }, { x: 18, y: 10 + y }], c);
      pc.ellipse(20, 4.2 + y, 2.6, 1.6, c);
      pc.rect(22, 4 + y, 1, 2, '#3a2a1a');
      pc.set(20, 3 + y, '#1b1b1b');
      pc.rect(18, 1 + y, 1, 2, '#e0d2b0');
      leg(pc, 17, -1 + y, 1 + y, 1, -2, '#e0d2b0');
      leg(pc, 19, -1 + y, 1 + y, 1, 2, '#e0d2b0');
      pc.ellipse(4, 9 + y, 1.4, 1.4, '#f2efe6');
    },
  },
  boar: {
    w: 20, h: 14,
    draw(pc, s, bob) {
      const c = '#5e4630', y = bob;
      for (const [x, off] of [[4, -s], [6, s], [12, s], [14, -s]]) leg(pc, x, 9 + y, 12, 2, off, shade(c, -0.25));
      pc.ellipse(9, 7 + y, 7, 4, lit(c, shade(c, 0.12)));
      for (let x = 4; x < 14; x += 2) pc.set(x, 3 + y, shade(c, -0.35));
      pc.polygon([{ x: 13, y: 4 + y }, { x: 18, y: 6 + y }, { x: 19, y: 10 + y }, { x: 13, y: 10 + y }], c);
      pc.rect(18, 7 + y, 2, 3, '#8a6a52');
      pc.set(18, 10 + y, '#f2efe6');
      pc.set(18, 9 + y, '#f2efe6');
      pc.set(15, 6 + y, '#1b1b1b');
      pc.rect(14, 3 + y, 2, 2, shade(c, -0.2));
      pc.set(1, 6 + y, shade(c, -0.2));
    },
  },
  wolf: {
    w: 22, h: 15,
    draw(pc, s, bob) {
      const c = '#7d7f86', y = bob;
      for (const [x, off] of [[5, -s], [7, s], [13, s], [15, -s]]) leg(pc, x, 9 + y, 13, 1, off, x === 7 || x === 15 ? shade(c, -0.3) : shade(c, -0.12));
      pc.polygon([{ x: 4, y: 6 + y }, { x: 0, y: 9 + y }, { x: 1, y: 10 + y }, { x: 5, y: 8 + y }], shade(c, -0.1));
      pc.ellipse(10, 7 + y, 6.5, 3, lit(c, shade(c, 0.2)));
      pc.rect(7, 9 + y, 6, 1, '#c8c6be');
      pc.ellipse(16.5, 5 + y, 2.6, 2.3, c);
      pc.rect(18, 5 + y, 3, 2, shade(c, 0.1));
      pc.set(21, 5 + y, '#1b1b1b');
      pc.set(17, 4 + y, '#e8d040');
      pc.polygon([{ x: 15, y: 3 + y }, { x: 16, y: 0 + y }, { x: 17.5, y: 3 + y }], shade(c, -0.2));
    },
  },
  compsognathus: {
    w: 14, h: 12,
    draw(pc, s, bob) {
      const c = '#6f8a3a', y = bob;
      leg(pc, 6, 7 + y, 10, 1, -s, shade(c, -0.3));
      leg(pc, 8, 7 + y, 10, 1, s, shade(c, -0.15));
      pc.polygon([{ x: 5, y: 5 + y }, { x: 0, y: 7 + y }, { x: 5, y: 7 + y }], shade(c, -0.1));
      pc.ellipse(7, 6 + y, 3, 2, lit(c, shade(c, 0.2)));
      pc.rect(9, 2 + y, 2, 4, c);
      pc.ellipse(11.5, 2.5 + y, 2, 1.4, c);
      pc.set(12, 2 + y, '#1b1b1b');
      pc.set(10, 7 + y, shade(c, -0.25));
      pc.rect(6, 4 + y, 3, 1, '#a0b860');
    },
  },
  raptor: {
    w: 24, h: 20,
    draw(pc, s, bob) {
      const c = '#8a6a3a', d = shade(c, -0.35), y = bob;
      leg(pc, 10, 12 + y, 18, 2, -s * 2, d);
      leg(pc, 12, 12 + y, 18, 2, s * 2, shade(c, -0.15));
      pc.polygon([{ x: 7, y: 8 + y }, { x: 0, y: 7 + y }, { x: 0, y: 8 + y }, { x: 7, y: 11 + y }], c);
      pc.ellipse(11, 10 + y, 5, 3, lit(c, shade(c, 0.18)));
      for (let x = 8; x < 15; x += 2) pc.rect(x, 8 + y, 1, 2, d);
      pc.polygon([{ x: 14, y: 8 + y }, { x: 17, y: 4 + y }, { x: 18, y: 6 + y }, { x: 16, y: 10 + y }], c);
      pc.ellipse(19, 4.5 + y, 3.4, 1.8, c);
      pc.rect(19, 6 + y, 4, 1, shade(c, -0.2));
      pc.set(19, 4 + y, '#e8c040');
      pc.rect(15, 11 + y, 2, 1, d);
      pc.set(17, 12 + y, '#e8e0c8');
      pc.set(13 + s * 2, 18, '#e8e0c8');
    },
  },
  triceratops: {
    w: 40, h: 26,
    draw(pc, s, bob) {
      const c = '#7a8a5a', d = shade(c, -0.3), y = bob;
      for (const [x, off] of [[8, -s], [12, s], [21, s], [25, -s]]) leg(pc, x, 17 + y, 24, 3, off, x === 12 || x === 25 ? d : shade(c, -0.15));
      pc.polygon([{ x: 6, y: 11 + y }, { x: 0, y: 16 + y }, { x: 1, y: 17 + y }, { x: 7, y: 16 + y }], c);
      pc.ellipse(16, 13 + y, 11.5, 6.5, lit(c, shade(c, 0.15)));
      for (let x = 9; x < 24; x += 3) pc.set(x, 8 + y, d);
      pc.ellipse(28, 9 + y, 4, 6.5, (dx, dy) => (dx * dx + dy * dy > 0.7 ? '#8a4a2a' : '#b07a4a'));
      pc.ellipse(32, 14 + y, 5, 3.6, c);
      pc.polygon([{ x: 35, y: 13 + y }, { x: 39, y: 15 + y }, { x: 36, y: 17 + y }], shade(c, -0.25));
      pc.set(33, 13 + y, '#1b1b1b');
      leg(pc, 30, 6 + y, 11 + y, 1, -0, '#efe6cc');
      for (let i = 0; i < 6; i++) pc.set(31 + i, 11 + y - i, '#efe6cc');
      for (let i = 0; i < 6; i++) pc.set(31 + i, 12 + y - i, '#d8ccaa');
      pc.set(37, 12 + y, '#efe6cc');
      pc.set(38, 11 + y, '#efe6cc');
    },
  },
};

export const CREATURE_SPECIES = Object.keys(SPECIES);

/** Frame size and ground anchor of a species' sheet. */
export function creatureFrame(species) {
  const { w, h } = SPECIES[species];
  return { width: w, height: h, originX: 0.5, originY: (h - 1) / h };
}

function frame(species, f) {
  const sp = SPECIES[species];
  const pc = new PixelCanvas(sp.w, sp.h);
  sp.draw(pc, STRIDE[f], f === 2 ? -1 : 0);
  pc.outline(OUTLINE);
  return pc;
}

export function creatureSheet(species) {
  const sp = SPECIES[species];
  const pc = new PixelCanvas(sp.w * 4, sp.h);
  for (let f = 0; f < 4; f++) pc.blit(frame(species, f), f * sp.w, 0);
  const fr = creatureFrame(species);
  return { pc, frameWidth: sp.w, frameHeight: sp.h, originX: fr.originX, originY: fr.originY };
}

/** The carcass: the standing frame upside down, lying on its back on the ground. */
export function creatureDead(species) {
  const src = frame(species, 0);
  const { width: w, height: h } = src;
  let top = h;
  for (let y = 0; y < h && top === h; y++) for (let x = 0; x < w; x++) if (src.get(x, y)) { top = y; break; }
  const pc = new PixelCanvas(w, h);
  for (let y = top; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!src.data[i + 3]) continue;
      const ty = h - 1 - (y - top);
      const j = (ty * w + x) * 4;
      for (let k = 0; k < 3; k++) pc.data[j + k] = src.data[i + k] * 0.8;
      pc.data[j + 3] = src.data[i + 3];
    }
  }
  return { pc, originX: 0.5, originY: (h - 1) / h };
}
