import { describe, it, expect } from 'vitest';
import { Player } from '../../src/entities/Player.js';
import { CollisionWorld } from '../../src/physics/CollisionWorld.js';
import { FixedStepClock } from '../../src/core/FixedStepClock.js';
import { IsoProjection } from '../../src/iso/projection.js';
import { aabb } from '../../src/physics/shapes.js';
import cfg from '../../src/data/game.json';

const proj = new IsoProjection(cfg.iso);

function simulate(fps, seconds, ix, iy, run = false, setup) {
  const world = new CollisionWorld(cfg.physics);
  if (setup) setup(world);
  const p = new Player(0, 0, cfg.player);
  const clock = new FixedStepClock(cfg.simulation);
  const dir = proj.screenDirToWorld(ix, iy);
  const frame = 1000 / fps;
  for (let t = 0; t < seconds * 1000 - 1e-6; t += frame) {
    const n = clock.advance(frame);
    for (let i = 0; i < n; i++) {
      p.snapshot();
      p.step(clock.stepSeconds, dir, run, world, proj);
    }
  }
  return p;
}

describe('Player', () => {
  it('parcourt la même distance à 30, 60 et 144 FPS', () => {
    const ref = simulate(60, 2, 1, 0);
    for (const fps of [30, 144]) {
      const p = simulate(fps, 2, 1, 0);
      expect(p.x).toBeCloseTo(ref.x, 1);
      expect(p.y).toBeCloseTo(ref.y, 1);
    }
  });

  it('atteint la vitesse de marche, et la course est plus rapide', () => {
    const walk = simulate(60, 2, 0, 1);
    const run = simulate(60, 2, 0, 1, true);
    expect(Math.hypot(walk.vx, walk.vy)).toBeCloseTo(cfg.player.walkSpeed, 1);
    expect(Math.hypot(run.vx, run.vy)).toBeCloseTo(cfg.player.runSpeed, 1);
  });

  it('ne va pas plus vite en diagonale', () => {
    const d = simulate(60, 2, 1, 1);
    expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(cfg.player.walkSpeed, 1);
  });

  it('s’arrête contre un mur et oriente le sprite vers la direction demandée', () => {
    const p = simulate(60, 3, 1, 1, true, (w) => w.addStatic({ shape: aabb(2, -50, 3, 50) }));
    expect(p.x).toBeLessThanOrEqual(2 - p.radius + 1e-3);
    expect(p.facing).toBe(1);
  });

  it('s’immobilise quand on relâche les touches', () => {
    const p = simulate(60, 1, 0, 0);
    expect(p.moving).toBe(false);
    expect(p.x).toBe(0);
  });
});
