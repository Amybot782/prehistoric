/**
 * Survival needs of a character: health, hunger, thirst, stamina and body
 * temperature. Pure simulation driven by the fixed step; every value comes
 * from src/data/survival.json so balancing never touches code. The same
 * class will serve tribe members later (phase 6).
 *
 * Gauges go from 0 to 100. Hunger and thirst are "fullness": 100 = fed.
 */
export class Vitals {
  constructor(cfg, start = cfg.start) {
    this.cfg = cfg;
    this.health = start.health;
    this.hunger = start.hunger;
    this.thirst = start.thirst;
    this.stamina = start.stamina;
    this.bodyTemp = start.bodyTemp;
    this.airTemp = 20;
    this.exhausted = false;
    this.sinceExertion = 99;
    this.lastDamage = null; // cause of the last health loss, for the death message
  }

  get dead() {
    return this.health <= 0;
  }

  /** Current problems, read by the interface and by the rules below. */
  get status() {
    const t = this.cfg.temperature;
    const low = this.cfg.needsLow;
    return {
      hungry: this.hunger < low,
      starving: this.hunger <= 0,
      thirsty: this.thirst < low,
      dehydrated: this.thirst <= 0,
      exhausted: this.exhausted,
      cold: this.bodyTemp < t.coldBelow,
      freezing: this.bodyTemp < t.freezingBelow,
      hot: this.bodyTemp > t.hotAbove,
      overheating: this.bodyTemp > t.overheatAbove,
    };
  }

  canRun() {
    return !this.exhausted && this.stamina > 0 && !this.dead;
  }

  /** Spends stamina for an effort (hit, later dodge); false when too tired. */
  spendStamina(amount) {
    if (this.exhausted || this.stamina <= 0) return false;
    this.stamina = Math.max(0, this.stamina - amount);
    this.sinceExertion = 0;
    if (this.stamina === 0) this.exhausted = true;
    return true;
  }

  eat(food) {
    this.hunger = Math.min(100, this.hunger + (food.hunger ?? 0));
    this.thirst = Math.min(100, this.thirst + (food.thirst ?? 0));
  }

  drink(amount) {
    this.thirst = Math.min(100, this.thirst + amount);
  }

  /** Temperature the body tends towards for a felt temperature. */
  targetBodyTemp(felt) {
    const t = this.cfg.temperature;
    let target = t.coreTarget;
    if (felt < t.comfortMin) target -= (t.comfortMin - felt) * t.perDegreeOutside;
    else if (felt > t.comfortMax) target += (felt - t.comfortMax) * t.perDegreeOutside;
    return Math.min(t.maxTarget, Math.max(t.minTarget, target));
  }

  /**
   * One simulation step.
   * @param {number} dt seconds
   * @param {{running:boolean, airTemp:number, insulation:number}} ctx
   */
  step(dt, { running = false, airTemp = 20, insulation = 0 } = {}) {
    if (this.dead) return;
    const c = this.cfg;
    const st = this.status;
    this.airTemp = airTemp;

    // Body temperature: clothing raises the felt temperature in the cold only.
    const felt = airTemp < c.temperature.comfortMin ? airTemp + insulation : airTemp;
    const target = this.targetBodyTemp(felt);
    this.bodyTemp += (target - this.bodyTemp) * Math.min(1, c.temperature.approachRate * dt);

    // Hunger and thirst.
    let hungerRate = c.hunger.perMinute / 60;
    let thirstRate = c.thirst.perMinute / 60;
    if (running) {
      hungerRate *= c.hunger.runFactor;
      thirstRate *= c.thirst.runFactor;
    }
    if (st.cold) hungerRate *= c.hunger.coldFactor;
    if (st.hot) thirstRate *= c.thirst.heatFactor;
    this.hunger = Math.max(0, this.hunger - hungerRate * dt);
    this.thirst = Math.max(0, this.thirst - thirstRate * dt);

    // Stamina: running drains it; it comes back after a short rest.
    if (running) {
      this.stamina = Math.max(0, this.stamina - c.stamina.runDrain * dt);
      this.sinceExertion = 0;
      if (this.stamina === 0) this.exhausted = true;
    } else {
      this.sinceExertion += dt;
      if (this.sinceExertion >= c.stamina.regenDelay) {
        let regen = c.stamina.regen;
        if (st.hungry || st.thirsty || st.hot) regen *= c.stamina.lowNeedsRegenFactor;
        this.stamina = Math.min(100, this.stamina + regen * dt);
      }
    }
    if (this.exhausted && this.stamina >= c.stamina.recoverThreshold) this.exhausted = false;

    // Health: lost to starvation, thirst and extreme temperatures; regained when well.
    const h = c.health;
    let damage = 0;
    if (this.hunger <= 0) { damage += h.starveDamage; this.lastDamage = 'hunger'; }
    if (this.thirst <= 0) { damage += h.dehydrateDamage; this.lastDamage = 'thirst'; }
    if (this.bodyTemp < c.temperature.freezingBelow) { damage += h.coldDamage; this.lastDamage = 'cold'; }
    if (this.bodyTemp > c.temperature.overheatAbove) { damage += h.heatDamage; this.lastDamage = 'heat'; }
    if (damage > 0) {
      this.health = Math.max(0, this.health - damage * dt);
    } else if (this.hunger >= h.regenNeeds && this.thirst >= h.regenNeeds && !st.cold && !st.hot) {
      this.health = Math.min(100, this.health + h.regen * dt);
    }
  }

  /** Back on one's feet after death (penalties come with the difficulty settings). */
  revive(minHunger, minThirst) {
    this.health = 100;
    this.stamina = 100;
    this.hunger = Math.max(this.hunger, minHunger);
    this.thirst = Math.max(this.thirst, minThirst);
    this.bodyTemp = this.cfg.temperature.coreTarget;
    this.exhausted = false;
    this.lastDamage = null;
  }

  toJSON() {
    const { health, hunger, thirst, stamina, bodyTemp } = this;
    return { health, hunger, thirst, stamina, bodyTemp };
  }
}
