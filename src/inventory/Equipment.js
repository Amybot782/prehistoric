/**
 * Equipped items: one per slot ('hand' for a tool, 'body' for clothing).
 * Equipping takes one item out of the inventory, unequipping puts it back;
 * items are never duplicated or lost. There is no durability (design rule).
 */
export const EQUIP_SLOTS = ['hand', 'body'];

export class Equipment {
  constructor(itemDefs) {
    this.defs = itemDefs;
    this.slots = { hand: null, body: null };
    this.version = 0;
  }

  /** Equips one item from an inventory slot; the previous item goes back to the inventory. */
  equipFrom(inventory, index) {
    const s = inventory.get(index);
    const slot = s && this.defs[s.item]?.equip;
    if (!slot) return false;
    const previous = this.slots[slot];
    if (previous === s.item) return true;
    const item = s.item;
    inventory.takeAt(index, 1);
    if (previous && inventory.add(previous, 1) > 0) {
      inventory.add(item, 1); // no room for the previous item: nothing changes
      return false;
    }
    this.slots[slot] = item;
    this.version++;
    return true;
  }

  /** Puts the item of `slot` back into the inventory; false when there is no room. */
  unequip(slot, inventory) {
    const item = this.slots[slot];
    if (!item) return false;
    if (inventory.add(item, 1) > 0) return false;
    this.slots[slot] = null;
    this.version++;
    return true;
  }

  /** Harvest speed multiplier of the tool in hand for a kind of resource. */
  toolMultiplier(kind) {
    const item = this.slots.hand;
    return (item && this.defs[item]?.tool?.[kind]) ?? 1;
  }

  insulation() {
    let n = 0;
    for (const item of Object.values(this.slots)) if (item) n += this.defs[item]?.insulation ?? 0;
    return n;
  }

  toJSON() {
    return { ...this.slots };
  }

  static fromJSON(json, itemDefs) {
    const eq = new Equipment(itemDefs);
    for (const slot of EQUIP_SLOTS) {
      const item = json?.[slot];
      if (item && itemDefs[item]?.equip === slot) eq.slots[slot] = item;
    }
    return eq;
  }
}
