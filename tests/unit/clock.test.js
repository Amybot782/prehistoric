import { describe, it, expect } from 'vitest';
import { FixedStepClock } from '../../src/core/FixedStepClock.js';
import cfg from '../../src/data/game.json';

function runFor(seconds, fps, clockCfg = cfg.simulation) {
  const c = new FixedStepClock(clockCfg);
  let steps = 0;
  const frame = 1000 / fps;
  for (let t = 0; t < seconds * 1000 - 1e-6; t += frame) steps += c.advance(frame);
  return { steps, clock: c };
}

describe('FixedStepClock', () => {
  it('produit le même nombre de pas quel que soit le nombre d’images par seconde', () => {
    const expected = 2 * cfg.simulation.tickRate;
    for (const fps of [24, 30, 59.94, 60, 75, 144, 240]) {
      const { steps } = runFor(2, fps);
      expect(Math.abs(steps - expected)).toBeLessThanOrEqual(1);
    }
  });

  it('borne le nombre de pas lors d’une image très longue', () => {
    const c = new FixedStepClock(cfg.simulation);
    const steps = c.advance(5000);
    expect(steps).toBeLessThanOrEqual(cfg.simulation.maxStepsPerFrame);
    expect(c.alpha).toBeGreaterThanOrEqual(0);
    expect(c.alpha).toBeLessThan(1);
  });

  it('accélère le temps sans changer la taille du pas', () => {
    const c = new FixedStepClock(cfg.simulation);
    c.timeScale = 4;
    let steps = 0;
    for (let i = 0; i < 60; i++) steps += c.advance(1000 / 60);
    expect(steps).toBeGreaterThanOrEqual(239);
    expect(c.stepSeconds).toBeCloseTo(1 / cfg.simulation.tickRate);
  });

  it('ne produit aucun pas en pause ou avec un delta invalide', () => {
    const c = new FixedStepClock(cfg.simulation);
    c.paused = true;
    expect(c.advance(100)).toBe(0);
    c.paused = false;
    expect(c.advance(-5)).toBe(0);
    expect(c.advance(NaN)).toBe(0);
  });
});
