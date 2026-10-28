import { describe, it, expect } from 'vitest';
import { IsoProjection } from '../../src/iso/projection.js';
import cfg from '../../src/data/game.json';

const p = new IsoProjection(cfg.iso);

describe('IsoProjection', () => {
  it('projette les axes du monde selon la règle 2:1', () => {
    expect(p.worldToScreen(1, 0)).toEqual({ x: 16, y: 8 });
    expect(p.worldToScreen(0, 1)).toEqual({ x: -16, y: 8 });
    expect(p.worldToScreen(1, 1)).toEqual({ x: 0, y: 16 });
    expect(p.worldToScreen(0, 0, 1)).toEqual({ x: 0, y: -16 });
  });

  it('screenToWorld est l’inverse exact de worldToScreen (avec hauteur)', () => {
    for (const [x, y, z] of [[0, 0, 0], [3.25, -7.5, 0], [-120.1, 44.9, 2], [1e5, 1e5 + 3, 0.5]]) {
      const s = p.worldToScreen(x, y, z);
      const w = p.screenToWorld(s.x, s.y, z);
      expect(w.x).toBeCloseTo(x, 6);
      expect(w.y).toBeCloseTo(y, 6);
    }
  });

  it('les directions clavier suivent l’écran et sont normalisées', () => {
    const up = p.screenDirToWorld(0, -1);
    const sUp = p.worldToScreen(up.x, up.y);
    expect(sUp.x).toBeCloseTo(0, 9);
    expect(sUp.y).toBeLessThan(0);
    const right = p.screenDirToWorld(1, 0);
    const sRight = p.worldToScreen(right.x, right.y);
    expect(sRight.y).toBeCloseTo(0, 9);
    expect(sRight.x).toBeGreaterThan(0);
    for (const [ix, iy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1]]) {
      const d = p.screenDirToWorld(ix, iy);
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
    }
    expect(p.screenDirToWorld(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('calcule l’orientation sur 8 directions telle que vue à l’écran', () => {
    const f = (ix, iy) => {
      const d = p.screenDirToWorld(ix, iy);
      return p.facingFromWorldDir(d.x, d.y);
    };
    expect(f(1, 0)).toBe(0); // est
    expect(f(1, 1)).toBe(1);
    expect(f(0, 1)).toBe(2); // sud
    expect(f(-1, 1)).toBe(3);
    expect(f(-1, 0)).toBe(4); // ouest
    expect(f(-1, -1)).toBe(5);
    expect(f(0, -1)).toBe(6); // nord
    expect(f(1, -1)).toBe(7);
  });

  it('donne la bonne tuile pour des coordonnées négatives', () => {
    expect(p.tileAt(-0.1, 2.9)).toEqual({ x: -1, y: 2 });
  });
});
