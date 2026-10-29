import { Inventory } from '../inventory/Inventory.js';
import { Equipment } from '../inventory/Equipment.js';
import { Vitals } from '../survival/Vitals.js';
import { airTemperature } from '../survival/climate.js';
import { hitProp, pickTarget, waterInFront } from '../survival/harvest.js';
import { craftBlocker, consumeCost, stationsNear } from '../crafting/crafting.js';
import { checkPlacement, spotAt } from '../building/placement.js';
import { circleVsShape } from '../physics/shapes.js';
import { EventBus } from '../core/EventBus.js';
import { strikeTargets } from '../creatures/combat.js';

/**
 * The player's survival loop: needs, inventory, equipment and actions on
 * the world (harvest, pick up, drink, eat, drop, craft, build, open doors,
 * dismantle), combat (strike, throw, dodge, being hurt), death and respawn.
 * No Phaser here: the scene feeds it input and the interface listens to
 * `events`:
 *   gain {item, count}   message {key, params}   hit {prop, depleted}
 *   death {cause}        respawn                 drink
 *   built {prop}         dismantled {prop}       crafting (open the menu)
 *   swing {dirX, dirY, reach, hit}   hurt {amount, cause}   dodge
 * `creatures` (the CreatureSystem) is set by that system when it starts.
 */
export class PlayerSurvival {
  constructor({ world, player, cfg, itemDefs, biomeKeys, recipes = { recipes: [], stationRange: 3 } }) {
    this.world = world;
    this.recipes = recipes;
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
    this.attackCd = 0;
    this.dodgeCd = 0;
    this.hurtCd = 0;
    this.creatures = null;
    this._wasDead = false;
    this.target = null;
    this.water = null;
    this.dismantleTarget = null;
    this.rot = 'x'; // rotation chosen for the next piece (R)
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
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.eatCooldown = Math.max(0, this.eatCooldown - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    const p = this.player;
    this.vitals.step(dt, {
      running: p.running,
      airTemp: airTemperature(this.world, p.x, p.y, this.cfg, this.biomeKeys),
      insulation: this.equipment.insulation(),
    });
    // Kept between steps: a creature's bite can kill between two survival steps.
    if (this.dead) {
      this.deadFor += dt;
      if (!this._wasDead) this.events.emit('death', { cause: this.vitals.lastDamage });
    }
    this._wasDead = this.dead;
  }

  // ---- Combat ------------------------------------------------------------------

  /** Stats of the weapon in hand (an item with 'weapon'), else the fists. */
  weapon() {
    return this.defs[this.equipment.slots.hand]?.weapon ?? this.cfg.combat.fists;
  }

  /** True when a living creature is close enough for a click to mean a strike. */
  inFight() {
    const p = this.player, r = this.cfg.combat.fightRange;
    return !!this.creatures?.creatures.some((c) => !c.dead && Math.hypot(c.x - p.x, c.y - p.y) <= r);
  }

  /** Melee strike towards a world direction (the mouse). Returns 'hit', 'miss' or null. */
  attack(dirX, dirY) {
    if (this.dead || this.attackCd > 0 || this.player.invulnerable) return null;
    const c = this.cfg.combat;
    const w = this.weapon();
    if (!this.vitals.spendStamina(c.staminaCost)) {
      this.attackCd = w.cooldown;
      this.message('action.tooTired');
      return 'tired';
    }
    const l = Math.hypot(dirX, dirY) || 1;
    dirX /= l; dirY /= l;
    const p = this.player;
    p.dirX = dirX; p.dirY = dirY;
    p.loud = 0.6;
    this.attackCd = w.cooldown;
    const hit = strikeTargets(p, dirX, dirY, w.reach, c.arc, this.creatures?.creatures ?? [], this.world.collisions)[0] ?? null;
    if (hit) this.creatures.hurtByPlayer(hit, w.damage, dirX * w.knockback, dirY * w.knockback);
    this.events.emit('swing', { dirX, dirY, reach: w.reach, hit });
    return hit ? 'hit' : 'miss';
  }

  /** Throws the item in hand (spear, stone) towards a world direction. */
  throwHeld(dirX, dirY) {
    if (this.dead || this.attackCd > 0 || !this.creatures || this.player.invulnerable) return null;
    const item = this.equipment.slots.hand;
    const spec = this.defs[item]?.throw;
    if (!spec) {
      this.message('combat.cannotThrow');
      return null;
    }
    const c = this.cfg.combat;
    if (!this.vitals.spendStamina(c.throwCost)) {
      this.attackCd = c.throwCooldown;
      this.message('action.tooTired');
      return 'tired';
    }
    // The hand takes the next one from the bag, if any.
    if (this.inventory.count(item) > 0) this.inventory.remove(item, 1);
    else {
      this.equipment.slots.hand = null;
      this.equipment.version++;
    }
    const p = this.player;
    const l = Math.hypot(dirX, dirY) || 1;
    p.dirX = dirX / l; p.dirY = dirY / l;
    this.attackCd = c.throwCooldown; // a throw is quiet: the prey may be hit before it hears anything
    return this.creatures.throwFrom(p, dirX, dirY, item, spec);
  }

  /** Quick dash along a direction; untouchable while it lasts. */
  dodge(dirX, dirY) {
    if (this.dead || this.dodgeCd > 0 || this.player.invulnerable) return false;
    const d = this.cfg.combat.dodge;
    if (!this.vitals.spendStamina(d.stamina)) {
      this.message('action.tooTired');
      this.dodgeCd = d.cooldown;
      return false;
    }
    const l = Math.hypot(dirX, dirY) || 1;
    this.player.startDodge(dirX / l, dirY / l, d.speed, d.seconds);
    this.dodgeCd = d.cooldown;
    this.events.emit('dodge');
    return true;
  }

  /** Damage from a creature. Ignored while dodging and just after a hit. Returns true when it landed. */
  takeDamage(amount, cause, kx = 0, ky = 0) {
    if (this.dead || this.player.invulnerable || this.hurtCd > 0) return false;
    const v = this.vitals;
    v.health = Math.max(0, v.health - amount);
    v.lastDamage = cause;
    this.player.vx += kx;
    this.player.vy += ky;
    this.hurtCd = this.cfg.combat.hurtInvulnerable;
    this.events.emit('hurt', { amount, cause });
    return true;
  }

  /** Chooses what an action would apply to (call once per frame). */
  updateTarget(hovered = null) {
    const p = this.player;
    const a = this.cfg.actions;
    this.target = this.dead ? null : pickTarget(this.world, p.x, p.y, p.dirX, p.dirY, a.reach, hovered, this._near);
    this.water = this.dead || this.target ? null : waterInFront(this.world, p.x, p.y, p.dirX, p.dirY);
    // What X would take down: the built piece under the mouse, else the one in front.
    const far = hovered?.built && Math.hypot(hovered.x - p.x, hovered.y - p.y) <= a.buildReach ? hovered : null;
    this.dismantleTarget = this.dead ? null : far ?? pickTarget(this.world, p.x, p.y, p.dirX, p.dirY, a.reach, null, this._near, isBuilt);
    return this.target;
  }

  // ---- Crafting and building -------------------------------------------------

  stations() {
    return stationsNear(this.world, this.player.x, this.player.y, this.recipes.stationRange);
  }

  /** Crafts a recipe by id, `times` in a row while possible. Returns how many were made. */
  craft(id, times = 1) {
    const recipe = this.recipes.recipes.find((r) => r.id === id);
    if (!recipe || this.dead) return 0;
    const stations = this.stations();
    let made = 0;
    for (; made < times; made++) {
      const why = craftBlocker(recipe, this.inventory, stations);
      if (why) {
        if (made === 0) this.message(why, { station: recipe.station });
        break;
      }
      const out = consumeCost(recipe, this.inventory);
      this.give({ [out.item]: out.count }, this.player.x, this.player.y);
    }
    return made;
  }

  /** Item of the selected quick-bar slot when it is a building piece, else null. */
  selectedPiece() {
    const s = this.inventory.get(this.selected);
    return s && this.defs[s.item]?.place && this.world.propDefs[s.item]?.build ? s.item : null;
  }

  /** Where the selected piece would go for a world point, and why it cannot (null = it can). */
  previewAt(wx, wy) {
    const type = this.selectedPiece();
    if (!type || this.dead) return null;
    const def = this.world.propDefs[type];
    const spot = spotAt(def, wx, wy, this.rot);
    const why = checkPlacement(this.world, def, spot, this.player, this.cfg.actions.buildReach);
    return { type, def, spot, why };
  }

  rotate() {
    this.rot = this.rot === 'x' ? 'y' : 'x';
  }

  /** Builds the selected piece at a world point. Returns the new prop or null. */
  placeAt(wx, wy) {
    const pv = this.previewAt(wx, wy);
    if (!pv) return null;
    if (pv.why) {
      this.message('build.cannot', { why: pv.why });
      return null;
    }
    const prop = this.world.placeBuilt(pv.type, pv.spot);
    if (!prop) return null;
    this.inventory.remove(pv.type, 1);
    this.events.emit('built', { prop });
    return prop;
  }

  /** Takes a built piece down; the piece goes back to the inventory (or the ground). */
  dismantle(prop = this.dismantleTarget) {
    if (!prop?.built || this.dead) return false;
    if (!this.world.removeProp(prop)) return false;
    this.give({ [prop.type]: 1 }, prop.x, prop.y);
    this.dismantleTarget = null;
    if (this.target === prop) this.target = null;
    this.events.emit('dismantled', { prop });
    return true;
  }

  /** Opens or closes a door; a door does not close on someone standing in it. */
  toggleDoor(prop) {
    if (prop.open && this.world.entities.some((e) => circleVsShape(e.x, e.y, e.radius, prop.collider.shape, {}))) {
      this.message('build.doorBlocked');
      return 'blocked';
    }
    this.world.setDoorOpen(prop, !prop.open);
    return prop.open ? 'open' : 'close';
  }

  /** Main action (E or left click): harvest, pick up or drink. Returns what happened. */
  interact() {
    if (this.dead || this.cooldown > 0) return null;
    const a = this.cfg.actions;
    const prop = this.target;
    if (prop) {
      const kind = prop.def.harvest.kind;
      if (kind === 'pickup') return this.pickUp(prop);
      if (kind === 'door') {
        this.cooldown = a.drinkCooldown;
        return this.toggleDoor(prop);
      }
      if (kind === 'station') {
        this.cooldown = a.drinkCooldown;
        this.events.emit('crafting');
        return 'station';
      }
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

  // ---- Saving ------------------------------------------------------------------

  toJSON() {
    const v = this.vitals;
    return {
      inventory: this.inventory.toJSON(),
      equipment: this.equipment.toJSON(),
      vitals: { health: v.health, hunger: v.hunger, thirst: v.thirst, stamina: v.stamina, bodyTemp: v.bodyTemp },
      selected: this.selected,
    };
  }

  /** Restores a saved state; a player saved dead comes back with the respawn minimums. */
  restore(json) {
    if (!json) return;
    this.inventory = Inventory.fromJSON(json.inventory, this.cfg.inventory.slots, this.defs);
    this.equipment = Equipment.fromJSON(json.equipment, this.defs);
    const v = this.vitals;
    for (const k of ['health', 'hunger', 'thirst', 'stamina', 'bodyTemp']) {
      if (Number.isFinite(json.vitals?.[k])) v[k] = json.vitals[k];
    }
    if (v.dead) this.vitals.revive(this.cfg.respawn.minHunger, this.cfg.respawn.minThirst);
    this.selectHotbar(json.selected ?? 0);
  }

  /** Back to life at (x, y); the inventory is kept (penalties: difficulty settings, phase 7). */
  respawn(x, y, z) {
    const r = this.cfg.respawn;
    this.vitals.revive(r.minHunger, r.minThirst);
    this.deadFor = 0;
    this.player.placeAt(x, y, z);
    this.player.dodgeLeft = 0;
    this.events.emit('respawn');
  }
}

function isBuilt(p) {
  return !!p.built;
}
