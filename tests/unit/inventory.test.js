import { describe, it, expect } from 'vitest';
import { Inventory } from '../../src/inventory/Inventory.js';
import { Equipment } from '../../src/inventory/Equipment.js';
import items from '../../src/data/items.json';

const inv = (n = 4) => new Inventory(n, items);

describe('inventaire', () => {
  it('remplit les piles existantes puis les emplacements vides, et rend le surplus', () => {
    const i = inv(2);
    expect(i.add('wood', 30)).toBe(0);
    expect(i.add('wood', 30)).toBe(0); // 50 + 10
    expect(i.get(0)).toEqual({ item: 'wood', count: 50 });
    expect(i.get(1)).toEqual({ item: 'wood', count: 10 });
    expect(i.add('stone', 5)).toBe(5); // plus de place
    expect(i.add('wood', 45)).toBe(5);
    expect(i.count('wood')).toBe(100);
    expect(i.room('wood')).toBe(0);
  });

  it('retire, déplace, fusionne et échange sans perte', () => {
    const i = inv(4);
    i.add('wood', 40);
    i.add('stone', 3);
    expect(i.remove('wood', 15)).toBe(15);
    expect(i.count('wood')).toBe(25);
    i.move(1, 3); // pierre -> emplacement 3
    expect(i.get(1)).toBe(null);
    expect(i.get(3)).toEqual({ item: 'stone', count: 3 });
    i.slots[2] = { item: 'wood', count: 40 };
    i.move(2, 0); // fusion 25 + 40 -> 50 et reste 15
    expect(i.get(0).count).toBe(50);
    expect(i.get(2)).toEqual({ item: 'wood', count: 15 });
    i.move(0, 3); // échange
    expect(i.get(0).item).toBe('stone');
    expect(i.get(3)).toEqual({ item: 'wood', count: 50 });
    expect(i.count('wood') + i.count('stone')).toBe(68);
  });

  it('refuse un objet inconnu et survit à une sauvegarde JSON', () => {
    const i = inv(3);
    expect(() => i.add('licorne', 1)).toThrow();
    i.add('berries', 4);
    const back = Inventory.fromJSON(JSON.parse(JSON.stringify(i.toJSON())), 3, items);
    expect(back.get(0)).toEqual({ item: 'berries', count: 4 });
    expect(Inventory.fromJSON([['ancien_objet', 2]], 3, items).get(0)).toBe(null);
  });
});

describe('équipement', () => {
  it('équipe un objet depuis l’inventaire, sans duplication', () => {
    const i = inv(3);
    const e = new Equipment(items);
    i.add('flint', 3);
    expect(e.equipFrom(i, 0)).toBe(true);
    expect(e.slots.hand).toBe('flint');
    expect(i.count('flint')).toBe(2);
    expect(e.toolMultiplier('wood')).toBeGreaterThan(1);
    expect(e.toolMultiplier('stone')).toBeGreaterThanOrEqual(1);
    // Changer d'outil remet l'ancien dans l'inventaire.
    i.add('stone', 1);
    expect(e.equipFrom(i, 1)).toBe(true);
    expect(e.slots.hand).toBe('stone');
    expect(i.count('flint')).toBe(3);
    expect(i.count('stone')).toBe(0);
    expect(e.unequip('hand', i)).toBe(true);
    expect(i.count('stone')).toBe(1);
  });

  it('les vêtements isolent du froid ; on ne déséquipe pas sans place', () => {
    const i = inv(1);
    const e = new Equipment(items);
    i.add('loincloth', 1);
    e.equipFrom(i, 0);
    expect(e.insulation()).toBeGreaterThan(0);
    i.add('wood', 1);
    expect(e.unequip('body', i)).toBe(false);
    expect(e.slots.body).toBe('loincloth');
  });

  it('un objet non équipable ne s’équipe pas', () => {
    const i = inv(2);
    const e = new Equipment(items);
    i.add('wood', 2);
    expect(e.equipFrom(i, 0)).toBe(false);
    expect(i.count('wood')).toBe(2);
  });
});
