import { Inventory } from '../inventory/Inventory.js';
import { Equipment } from '../inventory/Equipment.js';
import { Vitals } from '../survival/Vitals.js';
import { airTemperature } from '../survival/climate.js';
import { hitProp, pickTarget, waterInFront } from '../survival/harvest.js';
import { EventBus } from '../core/EventBus.js';

/**
 * The player's survival loop: needs, inventory, equipment and actions on
 * the world (harvest, pick up, drink, eat, drop), plus death and respawn.
 * No Phaser here: the scene feeds it input and the interface listens to
 * `events`:
 *   gain {item, count}   message {key, params}   hit {prop, depleted}
 *   death {cause}        respawn                 drink
 */
export class PlayerSurvival {
  constructor({ world, player, cfg, itemDefs, biomeKeys }) {
    this.world = world;
    this.player = player;
    this.cfg = cfg;
    this.defs = itemDefs;
    this.biomeKeys = biomeKeys;
    this.events = new EventBus();
    this.inventory = new Inventory(cfg.inventory.slots, itemDefs);
    this.equipment = new Equipment(itemDefs);
    this.vitals = new Vitals(cfg);
    this.selected = 0;
    this.cooldown = 0; // between actions on the world
    this.eatCooldown = 0;
    this.deadFor = 0;
    this.target = null;
    this.water = null;
    this._near = [];
    for (const [item, n] of cfg.start.items ?? []) this.inventory.add(item, n);
    for (const item of Object.values(cfg.start.equipped ?? {})) {
      const i = this.inventory.slots.findIndex((s) => s?.item === item);
      if (i >= 0) this.equipment.equipFrom(this.inventory, i);
    }
  }

  get dead() {
    return this.vitals.dead;
  }

  get airTemp() {
    return this.vitals.airTemp;
  }

  /** One fixed simulation step, after the player moved. */
  step(dt) {
    const wasDead = this.dead;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.eatCooldown = Math.max(0, this.eatCooldown - dt);
    const p = this.player;
    this.vitals.step(dt, {
      running: p.running,
      airTemp: airTemperature(this.world, p.x, p.y, this.cfg, this.biomeKeys),
      insulation: this.equipment.insulation(),
    });
    if (this.dead) {
      this.deadFor += dt;
      if (!wasDead) this.events.emit('death', { cause: this.vitals.lastDamage });
    }
  }

  /** Chooses what an action would apply to (call once per frame). */
  updateTarget(hovered = null) {
    const p = this.player;
    const reach = this.cfg.actions.reach;
    this.target = this.dead ? null : pickTarget(this.world, p.x, p.y, p.dirX, p.dirY, reach, hovered, this._near);
    this.water = this.dead || this.target ? null : waterInFront(this.world, p.x, p.y, p.dirX, p.dirY);
    return this.target;
  }

  /** Main action (E or left click): harvest, pick up or drink. Returns what happened. */
  interact() {
    if (this.dead || this.cooldown > 0) return null;
    const a = this.cfg.actions;
    const prop = this.target;
    if (prop) {
      const kind = prop.def.harvest.kind;
      if (kind === 'pickup') return this.pickUp(prop);
      if (!this.vitals.spendStamina(this.cfg.stamina.hitCost)) {
        this.cooldown = a.hitCooldown;
        this.message('action.tooTired');
        return 'tired';
      }
      const power = a.baseHitPower * this.equipment.toolMultiplier(kind);
      const res = hitProp(this.world, prop, power);
      this.cooldown = a.hitCooldown;
      this.give(res.gained, prop.x, prop.y);
      this.events.emit('hit', { prop, depleted: res.depleted });
      if (res.depleted) this.target = null;
      return 'hit';
    }
    if (this.water) {
      this.vitals.drink(a.drinkAmount);
      this.cooldown = a.drinkCooldown;
      this.events.emit('drink', this.water);
      return 'drink';
    }
    return null;
  }

  pickUp(prop) {
    this.cooldown = this.cfg.actions.eatCooldown;
    if (prop.type === 'dropped') {
      const take = Math.min(prop.count, this.inventory.room(prop.item));
      if (take <= 0) return this.full();
      this.inventory.add(prop.item, take);
      if (take < prop.count) this.world.setDroppedCount(prop, prop.count - take);
      else this.world.removeProp(prop);
      this.events.emit('gain', { item: prop.item, count: take });
      return 'pickup';
    }
    const res = hitProp(this.world, prop, Infinity);
    this.give(res.gained, prop.x, prop.y);
    this.target = null;
    return 'pickup';
  }

  /** Adds items; what does not fit is put on the ground, never lost. */
  give(gained, x, y) {
    for (const [item, n] of Object.entries(gained)) {
      const left = this.inventory.add(item, n);
      if (n - left > 0) this.events.emit('gain', { item, count: n - left });
      if (left > 0) {
        this.world.dropItem(item, left, x, y);
        this.full();
      }
    }
  }

  full() {
    this.message('action.inventoryFull');
    return 'full';
  }

  message(key, params) {
    this.events.emit('message', { key, params });
  }

  selectHotbar(i) {
    if (i >= 0 && i < this.cfg.inventory.hotbar) this.selected = i;
  }

  /** Uses an inventory slot: eat food, equip a tool or clothing. */
  useSlot(i) {
    if (this.dead) return null;
    const s = this.inventory.get(i);
    if (!s) return null;
    const def = this.defs[s.item];
    if (def.food) {
      if (this.eatCooldown > 0) return null;
      this.inventory.takeAt(i, 1);
      this.vitals.eat(def.food);
      this.eatCooldown = this.cfg.actions.eatCooldown;
      this.message('action.ate', { item: s.item });
      return 'eat';
    }
    if (def.equip) {
      if (!this.equipment.equipFrom(this.inventory, i)) return this.full();
      this.message('action.equipped', { item: s.item });
      return 'equip';
    }
    return null;
  }

  useSelected() {
    return this.useSlot(this.selected);
  }

  unequip(slot) {
    if (!this.equipment.unequip(slot, this.inventory)) return this.full();
    return 'unequip';
  }

  /** Puts items from a slot on the ground in front of the character. */
  dropSlot(i, count = 1) {
    const stack = this.inventory.takeAt(i, count);
    if (!stack) return null;
    this.dropStack(stack);
    return 'drop';
  }

  dropStack(stack) {
    const p = this.player;
    let x = p.x + p.dirX * 0.45, y = p.y + p.dirY * 0.45;
    if (!this.world.chunkOf(Math.floor(x), Math.floor(y))) { x = p.x; y = p.y; }
    this.world.dropItem(stack.item, stack.count, x, y);
  }

  canRespawn() {
    return this.dead && this.deadFor >= this.cfg.respawn.delay;
  }

  /** Back to life at (x, y); the inventory is kept (penalties: difficulty settings, phase 7). */
  respawn(x, y, z) {
    const r = this.cfg.respawn;
    this.vitals.revive(r.minHunger, r.minThirst);
    this.deadFor = 0;
    this.player.placeAt(x, y, z);
    this.events.emit('respawn');
  }
}
