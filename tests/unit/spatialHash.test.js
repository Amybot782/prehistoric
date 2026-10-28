import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../../src/physics/SpatialHash.js';

describe('SpatialHash', () => {
  it('retrouve les éléments d’une zone, sans doublon, y compris en coordonnées négatives', () => {
    const h = new SpatialHash(2);
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' };
    h.insert(a, 0, 0, 5, 5); // couvre plusieurs cellules
    h.insert(b, -10, -10, -9, -9);
    h.insert(c, 100, 100, 101, 101);
    expect(h.query(1, 1, 4, 4).map((i) => i.id)).toEqual(['a']);
    expect(h.query(-11, -11, 6, 6).map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(h.query(50, 50, 60, 60)).toEqual([]);
  });

  it('supprime et réinsère proprement', () => {
    const h = new SpatialHash(2);
    const a = { id: 'a' };
    h.insert(a, 0, 0, 1, 1);
    h.insert(a, 10, 10, 11, 11); // réinsertion = déplacement
    expect(h.query(0, 0, 1, 1)).toEqual([]);
    expect(h.query(10, 10, 11, 11)).toEqual([a]);
    expect(h.remove(a)).toBe(true);
    expect(h.size).toBe(0);
    expect(h.cells.size).toBe(0);
  });
});
