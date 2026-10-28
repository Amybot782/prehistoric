import { describe, it, expect } from 'vitest';
import { Vitals } from '../../src/survival/Vitals.js';
import cfg from '../../src/data/survival.json';

const run = (v, seconds, ctx, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) v.step(dt, ctx);
};
const mild = { airTemp: 20, insulation: 0 };

describe('besoins de survie', () => {
  it('la faim et la soif baissent au rythme prévu, plus vite en courant', () => {
    const a = new Vitals(cfg), b = new Vitals(cfg);
    run(a, 60, { ...mild, running: false });
    expect(cfg.start.hunger - a.hunger).toBeCloseTo(cfg.hunger.perMinute, 1);
    expect(cfg.start.thirst - a.thirst).toBeCloseTo(cfg.thirst.perMinute, 1);
    b.exhausted = false;
    for (let i = 0; i < 60 * 60; i++) { b.stamina = 100; b.step(1 / 60, { ...mild, running: true }); }
    expect(cfg.start.thirst - b.thirst).toBeGreaterThan(cfg.start.thirst - a.thirst);
  });

  it('courir vide l’endurance, l’épuisement bloque la course jusqu’à récupération', () => {
    const v = new Vitals(cfg);
    let t = 0;
    while (v.canRun() && t < 60) { v.step(1 / 60, { ...mild, running: true }); t += 1 / 60; }
    expect(v.exhausted).toBe(true);
    expect(t).toBeCloseTo(100 / cfg.stamina.runDrain, 0);
    run(v, cfg.stamina.regenDelay + cfg.stamina.recoverThreshold / cfg.stamina.regen + 0.2, { ...mild, running: false });
    expect(v.canRun()).toBe(true);
  });

  it('sans manger ni boire, la santé baisse jusqu’à la mort', () => {
    const v = new Vitals(cfg);
    v.hunger = 0;
    v.thirst = 0;
    run(v, 300, mild, 0.1);
    expect(v.dead).toBe(true);
    expect(['hunger', 'thirst']).toContain(v.lastDamage);
  });

  it('bien nourri, la santé remonte ; manger et boire remplissent les jauges', () => {
    const v = new Vitals(cfg);
    v.health = 50;
    v.hunger = 90;
    v.thirst = 90;
    run(v, 20, mild, 0.1);
    expect(v.health).toBeGreaterThan(50);
    v.hunger = 10;
    v.eat({ hunger: 6, thirst: 2 });
    expect(v.hunger).toBe(16);
    v.drink(200);
    expect(v.thirst).toBe(100);
  });

  it('le froid refroidit le corps, fait perdre de la santé ; les vêtements aident', () => {
    const naked = new Vitals(cfg), dressed = new Vitals(cfg);
    for (const v of [naked, dressed]) { v.hunger = 100; v.thirst = 100; }
    run(naked, 240, { airTemp: -12, insulation: 0 }, 0.1);
    run(dressed, 240, { airTemp: -12, insulation: 8 }, 0.1);
    expect(naked.status.freezing).toBe(true);
    expect(naked.health).toBeLessThan(100);
    expect(dressed.bodyTemp).toBeGreaterThan(naked.bodyTemp);
    const warm = new Vitals(cfg);
    run(warm, 240, mild, 0.1);
    expect(warm.status.cold).toBe(false);
    expect(warm.bodyTemp).toBeCloseTo(37, 1);
  });

  it('la réapparition remet sur pied', () => {
    const v = new Vitals(cfg);
    v.health = 0;
    v.hunger = 0;
    v.revive(50, 50);
    expect(v.dead).toBe(false);
    expect(v.hunger).toBe(50);
  });
});
