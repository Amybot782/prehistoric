/**
 * Slot inventory. Each slot holds `{ item, count }` or null; stacks are
 * limited by the item's `stack` value (src/data/items.json). The first
 * `hotbar` slots are the quick bar. Pure data: the interface reads `slots`
 * and watches `version`, which changes on every modification.
 *
 * Nothing is ever lost silently: `add` returns what did not fit, so the
 * caller can drop it on the ground.
 */
export class Inventory {
  constructor(size, itemDefs) {
    this.defs = itemDefs;
    this.slots = new Array(size).fill(null);
    this.version = 0;
  }

  get size() {
    return this.slots.length;
  }

  def(item) {
    const d = this.defs[item];
    if (!d || item.startsWith('_')) throw new Error(`Objet inconnu : ${item}`);
    return d;
  }

  stackSize(item) {
    return Math.max(1, this.def(item).stack ?? 1);
  }

  get(i) {
    return this.slots[i] ?? null;
  }

  count(item) {
    let n = 0;
    for (const s of this.slots) if (s?.item === item) n += s.count;
    return n;
  }

  /** How many of `item` would fit right now. */
  room(item) {
    const max = this.stackSize(item);
    let n = 0;
    for (const s of this.slots) n += s === null ? max : s.item === item ? max - s.count : 0;
    return n;
  }

  /** Adds up to `count`; existing stacks are filled first. Returns the leftover. */
  add(item, count) {
    const max = this.stackSize(item);
    let left = count;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s?.item !== item || s.count >= max) continue;
      const k = Math.min(left, max - s.count);
      s.count += k;
      left -= k;
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i] !== null) continue;
      const k = Math.min(left, max);
      this.slots[i] = { item, count: k };
      left -= k;
    }
    if (left !== count) this.version++;
    return left;
  }

  /** Removes up to `count` of `item` (last slots first). Returns how many were removed. */
  remove(item, count) {
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s?.item !== item) continue;
      const k = Math.min(left, s.count);
      s.count -= k;
      left -= k;
      if (s.count === 0) this.slots[i] = null;
    }
    if (left !== count) this.version++;
    return count - left;
  }

  /** Takes up to `count` from one slot; returns the removed stack or null. */
  takeAt(i, count = Infinity) {
    const s = this.slots[i];
    if (!s) return null;
    const k = Math.min(count, s.count);
    s.count -= k;
    if (s.count === 0) this.slots[i] = null;
    this.version++;
    return { item: s.item, count: k };
  }

  /** Puts a stack into a slot: merges, fills an empty slot, or swaps. Returns what is left in hand. */
  placeAt(i, stack) {
    if (!stack) return null;
    const s = this.slots[i];
    this.version++;
    if (s === null) {
      const max = this.stackSize(stack.item);
      const k = Math.min(max, stack.count);
      this.slots[i] = { item: stack.item, count: k };
      return stack.count - k > 0 ? { item: stack.item, count: stack.count - k } : null;
    }
    if (s.item === stack.item) {
      const k = Math.min(this.stackSize(s.item) - s.count, stack.count);
      s.count += k;
      return stack.count - k > 0 ? { item: stack.item, count: stack.count - k } : null;
    }
    this.slots[i] = { ...stack };
    return { ...s };
  }

  /** Moves slot `from` onto slot `to` (merge when possible, swap otherwise). */
  move(from, to) {
    if (from === to || !this.slots[from]) return;
    const stack = this.takeAt(from);
    const rest = this.placeAt(to, stack);
    if (rest) this.slots[from] = rest;
  }

  toJSON() {
    return this.slots.map((s) => (s ? [s.item, s.count] : null));
  }

  /** Restores slots; unknown items are skipped (content removed in a later version). */
  static fromJSON(json, size, itemDefs) {
    const inv = new Inventory(size, itemDefs);
    (json ?? []).forEach((e, i) => {
      if (!e || i >= size || !itemDefs[e[0]]) return;
      inv.slots[i] = { item: e[0], count: Math.min(e[1], inv.stackSize(e[0])) };
    });
    return inv;
  }
}
