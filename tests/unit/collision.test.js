import { describe, it, expect } from 'vitest';
import { CollisionWorld } from '../../src/physics/CollisionWorld.js';
import { circle, aabb, circleVsShape } from '../../src/physics/shapes.js';
import cfg from '../../src/data/game.json';

const body = (x, y, radius = 0.28) => ({ x, y, radius });

describe('formes de collision', () => {
  it('détecte et mesure la pénétration cercle/cercle et cercle/rectangle', () => {
    const hit = {};
    expect(circleVsShape(0, 0, 0.5, circle(0.8, 0, 0.5), hit)).toBe(true);
    expect(hit.nx).toBeCloseTo(-1);
    expect(hit.depth).toBeCloseTo(0.2);
    expect(circleVsShape(0, 0, 0.5, circle(1.01, 0, 0.5), hit)).toBe(false);
    expect(circleVsShape(1.2, 0.5, 0.3, aabb(0, 0, 1, 1), hit)).toBe(true);
    expect(hit.nx).toBeCloseTo(1);
    expect(hit.depth).toBeCloseTo(0.1);
    // Centre à l'intérieur : sortie par le côté le plus proche.
    expect(circleVsShape(0.9, 0.5, 0.3, aabb(0, 0, 1, 1), hit)).toBe(true);
    expect(hit.nx).toBe(1);
  });
});

describe('CollisionWorld.moveCircle', () => {
  const make = () => new CollisionWorld(cfg.physics);

  it('ne traverse jamais un mur fin, même à très grande vitesse', () => {
    const w = make();
    w.addStatic({ shape: aabb(5, -10, 5.1, 10) });
    const b = body(4, 0);
    w.moveCircle(b, 50, 0); // 50 tuiles en un seul pas
    expect(b.x).toBeLessThanOrEqual(5 - b.radius + 1e-4);
    expect(w.overlaps(b.x, b.y, b.radius - 1e-3)).toBe(false);
  });

  it('glisse le long d’un mur au lieu de s’y coller', () => {
    const w = make();
    w.addStatic({ shape: aabb(5, -10, 6, 10) });
    const b = body(4.7, 0);
    w.moveCircle(b, 0.5, 0.5); // diagonale contre le mur
    expect(b.x).toBeCloseTo(5 - b.radius, 3);
    expect(b.y).toBeCloseTo(0.5, 3);
  });

  it('bloque un passage plus étroit que le personnage et laisse passer un passage d’une tuile', () => {
    const w = make();
    // Passage étroit : deux blocs séparés de 0,1 tuile.
    w.addStatic({ shape: aabb(0.05, 0.05, 0.95, 0.95) });
    w.addStatic({ shape: aabb(1.05, 0.05, 1.95, 0.95) });
    const b = body(1, -1);
    for (let i = 0; i < 60; i++) w.moveCircle(b, 0, 0.05);
    expect(b.y).toBeLessThan(0.05);
    // Passage large : blocs séparés d'une tuile.
    const w2 = make();
    w2.addStatic({ shape: aabb(0.05, 0.05, 0.95, 0.95) });
    w2.addStatic({ shape: aabb(2.05, 0.05, 2.95, 0.95) });
    const b2 = body(1.5, -1);
    for (let i = 0; i < 60; i++) w2.moveCircle(b2, 0, 0.05);
    expect(b2.y).toBeGreaterThan(1.5);
  });

  it('contourne un tronc d’arbre (collider circulaire)', () => {
    const w = make();
    w.addStatic({ shape: circle(2, 0.05, 0.22) });
    const b = body(0, 0);
    for (let i = 0; i < 120; i++) w.moveCircle(b, 0.05, 0);
    expect(b.x).toBeGreaterThan(3); // a glissé autour du tronc
    expect(w.overlaps(b.x, b.y, b.radius - 1e-3)).toBe(false);
  });

  it('ignore les objets non solides et peut retirer un collider', () => {
    const w = make();
    const c = w.addStatic({ shape: aabb(1, -1, 2, 1) });
    w.addStatic({ shape: aabb(3, -1, 4, 1), solid: false });
    expect(w.removeStatic(c)).toBe(true);
    const b = body(0, 0);
    w.moveCircle(b, 5, 0);
    expect(b.x).toBeCloseTo(5);
  });
});
