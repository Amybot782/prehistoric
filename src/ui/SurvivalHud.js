import Phaser from 'phaser';
import { t } from '../i18n/index.js';
import { itemTextureKey } from '../assets/assetCatalog.js';
import { EQUIP_SLOTS } from '../inventory/Equipment.js';
import { CraftingPanel } from './CraftingPanel.js';

/**
 * Survival interface: need bars, temperature, quick bar, inventory panel,
 * action prompt, notifications and the death screen. Everything shown is
 * read from the real game state (PlayerSurvival); every click acts on it.
 *
 * Pixel sizes are multiplied by `s`, a whole number that follows the window
 * height (x2 at 720p-1079p, x3 at 1080p, x6 in 4K) so icons stay crisp.
 */
const FONT = 'Consolas, "DejaVu Sans Mono", monospace';
const SLOT = 20; // slot size in UI pixels (16 px icon + border)
const BAR_W = 70;
const BAR_H = 5;
const COLS = 8;
const BAR_COLORS = { health: 0xd84a4a, hunger: 0xd89a3a, thirst: 0x4a9ad8, stamina: 0x7cc45a };
// Draw order inside the interface scene.
const DEPTH = { panel: 3, panelText: 4, icons: 5, held: 6, notes: 7, death: 8 };
const SUPERSEDED = { hungry: 'starving', thirsty: 'dehydrated', cold: 'freezing', hot: 'overheating' };
const STATUS_ORDER = ['starving', 'dehydrated', 'freezing', 'overheating', 'hungry', 'thirsty', 'cold', 'hot', 'exhausted'];

export class SurvivalHud {
  constructor(scene, survival, itemDefs, recipes) {
    this.scene = scene;
    this.sv = survival;
    this.defs = itemDefs;
    this.s = 2;
    this.open = false;
    this.held = null; // stack carried by the mouse in the inventory
    this.hoverSlot = null;
    this.notes = [];
    this._seen = { inv: -1, eq: -1, sel: -1, held: null };

    this.g = scene.add.graphics();
    this.text = (style = {}) => scene.add.text(0, 0, '', { fontFamily: FONT, color: '#e8f0d8', ...style });
    this.barLabels = ['health', 'hunger', 'thirst', 'stamina'].map(() => this.text());
    this.tempText = this.text();
    this.statusText = this.text({ color: '#ffb070' });
    this.prompt = this.text({ backgroundColor: 'rgba(12,16,10,0.7)', padding: { x: 6, y: 3 } }).setOrigin(0.5, 1);
    this.noteTexts = [];

    // Quick bar and equipment: one icon + count per slot.
    this.hotbar = [];
    for (let i = 0; i < survival.cfg.inventory.hotbar; i++) this.hotbar.push(this.makeSlotView());
    this.equipViews = Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, this.makeSlotView()]));

    // Inventory panel (hidden until I / Tab).
    this.panelG = scene.add.graphics().setVisible(false).setDepth(DEPTH.panel);
    this.panelTitle = this.text().setVisible(false).setDepth(DEPTH.panelText);
    this.panelHelp = this.text({ color: '#b8c4a8', wordWrap: { width: 300 } }).setVisible(false).setDepth(DEPTH.panelText);
    this.panelInfo = this.text({ wordWrap: { width: 300 } }).setVisible(false).setDepth(DEPTH.panelText);
    this.equipLabels = Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, this.text({ color: '#b8c4a8' }).setVisible(false).setDepth(DEPTH.panelText)]));
    this.slotViews = [];
    for (let i = 0; i < survival.inventory.size; i++) this.slotViews.push(this.makeSlotView(false));
    this.heldView = this.makeSlotView(false);
    this.heldView.icon.setDepth(DEPTH.held);
    this.heldView.count.setDepth(DEPTH.held);

    // Death screen.
    this.deathG = scene.add.graphics().setVisible(false).setDepth(DEPTH.death);
    this.deathTitle = this.text({ color: '#ffd0c0' }).setOrigin(0.5).setVisible(false).setDepth(DEPTH.death);
    this.deathSub = this.text({ color: '#ffd0c0' }).setOrigin(0.5).setVisible(false).setDepth(DEPTH.death);

    this.crafting = new CraftingPanel(scene, survival, recipes, this);

    const ev = survival.events;
    this._off = [
      ev.on('gain', ({ item, count }) => this.note(t('gain', { count, item: t(`item.${item}`) }))),
      ev.on('message', ({ key, params }) => this.note(t(key, {
        ...params,
        item: params?.item && t(`item.${params.item}`),
        station: params?.station && t(`prop.${params.station}`),
        why: params?.why && t(params.why),
      }), '#ffe0a0')),
      ev.on('drink', () => this.note(t('action.drink'), '#a0d0ff')),
    ];
    scene.input.on('pointerdown', (p) => this.onPointerDown(p));
    this.layout();
  }

  destroy() {
    for (const off of this._off) off();
  }

  makeSlotView(visible = true) {
    const icon = this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setVisible(false).setDepth(DEPTH.icons);
    const count = this.text({ stroke: '#000000', strokeThickness: 3 }).setOrigin(1, 1).setVisible(visible).setDepth(DEPTH.icons);
    return { icon, count, x: 0, y: 0, visible };
  }

  /** True when the mouse is over a part of the interface that takes clicks. */
  pointerOverUi(p = this.scene.input.activePointer) {
    if (this.open || this.held || this.crafting.open) return true;
    const b = this.hotbarBox;
    return b && p.x >= b.x && p.x <= b.right && p.y >= b.y && p.y <= b.bottom;
  }

  toggleCrafting(open = !this.crafting.open) {
    if (open && this.open) this.toggleInventory();
    this.crafting.toggle(open);
  }

  toggleInventory() {
    if (!this.open && this.crafting.open) this.crafting.toggle(false);
    this.open = !this.open;
    if (!this.open && this.held) {
      // Put the carried stack back; what does not fit goes on the ground.
      const left = this.sv.inventory.add(this.held.item, this.held.count);
      if (left > 0) this.sv.dropStack({ item: this.held.item, count: left });
      this.held = null;
    }
    if (!this.open) this.restoreEquipIcons();
  }

  layout() {
    const { width, height } = this.scene.scale;
    const s = Math.max(1, Math.round(height / 360));
    this.s = s;
    const fs = `${Math.round(6 * s)}px`;
    const big = `${Math.round(7 * s)}px`;
    for (const tx of [...this.barLabels, this.tempText, this.statusText, this.prompt, ...this.noteTexts, this.panelHelp, this.panelInfo, ...Object.values(this.equipLabels)]) tx.setFontSize(fs);
    this.panelTitle.setFontSize(big);
    this.deathTitle.setFontSize(`${Math.round(16 * s)}px`);
    this.deathSub.setFontSize(big);
    for (const v of [...this.hotbar, ...Object.values(this.equipViews), ...this.slotViews, this.heldView]) {
      v.icon.setScale(s);
      v.count.setFontSize(`${Math.round(5.5 * s)}px`);
    }
    const pad = 6 * s;
    // Bars, bottom-left.
    this.barsOrigin = { x: pad, y: height - pad - 4 * 9 * s - 16 * s };
    this.barLabels.forEach((tx, i) => tx.setPosition(this.barsOrigin.x + (BAR_W + 4) * s, this.barsOrigin.y + i * 9 * s - 2 * s));
    this.tempText.setPosition(this.barsOrigin.x, this.barsOrigin.y + 4 * 9 * s);
    this.statusText.setPosition(this.barsOrigin.x, this.barsOrigin.y + 4 * 9 * s + 8 * s);
    // Quick bar, bottom centre, with the two equipment slots on its right.
    const n = this.hotbar.length;
    const total = (n + 2) * SLOT * s + 6 * s;
    const x0 = Math.round(width / 2 - total / 2);
    const y0 = height - pad - SLOT * s;
    this.hotbar.forEach((v, i) => this.placeSlot(v, x0 + i * SLOT * s, y0));
    EQUIP_SLOTS.forEach((slot, k) => this.placeSlot(this.equipViews[slot], x0 + (n + k) * SLOT * s + 6 * s, y0));
    this.hotbarBox = new Phaser.Geom.Rectangle(x0, y0, total, SLOT * s);
    this.prompt.setPosition(width / 2, y0 - 4 * s);
    this.notesOrigin = { x: pad, y: this.barsOrigin.y - 6 * s };
    // Inventory panel, centre.
    const rows = Math.ceil(this.slotViews.length / COLS);
    const pw = COLS * SLOT * s + 16 * s + SLOT * s + 30 * s;
    const ph = 22 * s + rows * SLOT * s + 6 * s + 46 * s;
    const px = Math.round(width / 2 - pw / 2), py = Math.round(height / 2 - ph / 2 - 20 * s);
    this.panelBox = new Phaser.Geom.Rectangle(px, py, pw, ph);
    this.panelTitle.setPosition(px + 8 * s, py + 6 * s);
    this.gridOrigin = { x: px + 8 * s, y: py + 22 * s };
    this.slotViews.forEach((v, i) => {
      const r = Math.floor(i / COLS), c = i % COLS;
      this.placeSlot(v, this.gridOrigin.x + c * SLOT * s, this.gridOrigin.y + r * SLOT * s + (r > 0 ? 4 * s : 0));
    });
    const ex = this.gridOrigin.x + COLS * SLOT * s + 16 * s;
    this.panelEquip = {};
    EQUIP_SLOTS.forEach((slot, k) => {
      const y = this.gridOrigin.y + k * (SLOT + 10) * s + 8 * s;
      this.panelEquip[slot] = { x: ex, y };
      this.equipLabels[slot].setPosition(ex, y - 8 * s);
    });
    const infoY = this.gridOrigin.y + rows * SLOT * s + 10 * s;
    this.panelInfo.setPosition(px + 8 * s, infoY).setWordWrapWidth(pw - 16 * s);
    this.panelHelp.setPosition(px + 8 * s, infoY + 22 * s).setWordWrapWidth(pw - 16 * s);
    this.deathTitle.setPosition(width / 2, height / 2 - 10 * s);
    this.deathSub.setPosition(width / 2, height / 2 + 12 * s);
    this.crafting.layout();
    this._seen.inv = -1; // force a redraw
  }

  placeSlot(v, x, y) {
    v.x = x;
    v.y = y;
    v.icon.setPosition(x + 2 * this.s, y + 2 * this.s);
    v.count.setPosition(x + (SLOT - 1) * this.s, y + (SLOT + 1) * this.s);
  }

  fillSlot(v, stack, visible = true) {
    if (!stack || !visible) {
      v.icon.setVisible(false);
      v.count.setVisible(false);
      return;
    }
    v.icon.setTexture(itemTextureKey(stack.item)).setVisible(true);
    v.count.setText(stack.count > 1 ? String(stack.count) : '').setVisible(true);
  }

  slotAt(px, py) {
    if (!this.open) {
      const i = this.hotbar.findIndex((v) => inside(px, py, v, SLOT * this.s));
      if (i >= 0) return { kind: 'hotbar', i };
      for (const slot of EQUIP_SLOTS) if (inside(px, py, this.equipViews[slot], SLOT * this.s)) return { kind: 'equip', slot };
      return null;
    }
    const i = this.slotViews.findIndex((v) => inside(px, py, v, SLOT * this.s));
    if (i >= 0) return { kind: 'inv', i };
    for (const slot of EQUIP_SLOTS) if (inside(px, py, this.panelEquip[slot], SLOT * this.s)) return { kind: 'equip', slot };
    return null;
  }

  onPointerDown(p) {
    if (this.crafting.onPointerDown(p)) return;
    const hit = this.slotAt(p.x, p.y);
    const inv = this.sv.inventory;
    const right = p.rightButtonDown();
    if (!this.open) {
      if (hit?.kind === 'hotbar') {
        if (right) this.sv.useSlot(hit.i);
        else this.sv.selectHotbar(hit.i);
      } else if (hit?.kind === 'equip' && right) {
        this.sv.unequip(hit.slot);
      }
      return;
    }
    if (!hit) {
      if (this.held && !Phaser.Geom.Rectangle.Contains(this.panelBox, p.x, p.y)) {
        this.sv.dropStack(this.held);
        this.held = null;
      }
      return;
    }
    if (hit.kind === 'equip') {
      if (this.held) {
        // Equip the carried item if it fits this slot.
        if (this.defs[this.held.item]?.equip !== hit.slot) return;
        const tmp = inv.slots.findIndex((x) => x === null);
        if (tmp < 0) return;
        inv.slots[tmp] = { ...this.held };
        this.held = null;
        this.sv.useSlot(tmp);
        const back = inv.get(tmp);
        if (back) this.held = inv.takeAt(tmp);
      } else {
        this.sv.unequip(hit.slot);
      }
      return;
    }
    if (right) {
      if (!this.held) this.sv.useSlot(hit.i);
      return;
    }
    if (this.held) this.held = inv.placeAt(hit.i, this.held);
    else this.held = inv.takeAt(hit.i);
  }

  note(msg, color = '#e8f0d8') {
    const tx = this.text({ color, stroke: '#000000', strokeThickness: 3 }).setFontSize(`${Math.round(6 * this.s)}px`).setDepth(DEPTH.notes);
    tx.setText(msg);
    this.noteTexts.push(tx);
    this.notes.push({ tx, until: this.scene.time.now + 3000 });
    if (this.notes.length > 6) {
      const old = this.notes.shift().tx;
      this.noteTexts.splice(this.noteTexts.indexOf(old), 1);
      old.destroy();
    }
  }

  update(time) {
    const sv = this.sv;
    const v = sv.vitals;
    const s = this.s;
    const g = this.g;
    g.clear();

    // Need bars, on a dark backing so they stay readable over any ground.
    const bo = this.barsOrigin;
    g.fillStyle(0x0c100a, 0.55).fillRect(bo.x - 3 * s, bo.y - 3 * s, (BAR_W + 52) * s, 4 * 9 * s + 20 * s);
    const values = { health: v.health, hunger: v.hunger, thirst: v.thirst, stamina: v.stamina };
    Object.entries(values).forEach(([k, val], i) => {
      const x = this.barsOrigin.x, y = this.barsOrigin.y + i * 9 * s;
      g.fillStyle(0x0c100a, 0.75).fillRect(x - s, y - s, (BAR_W + 2) * s, (BAR_H + 2) * s);
      const color = k === 'stamina' && v.exhausted ? 0x8a8a6a : BAR_COLORS[k];
      g.fillStyle(color, 1).fillRect(x, y, Math.round((BAR_W * s * Math.max(0, val)) / 100), BAR_H * s);
      this.barLabels[i].setText(`${t(`hud.${k}`)} ${Math.ceil(val)}`);
    });
    const st = v.status;
    this.tempText.setText(t('hud.temp', { air: Math.round(v.airTemp), body: v.bodyTemp.toFixed(1).replace('.', ',') }));
    this.tempText.setColor(st.freezing || st.overheating ? '#ff8a6a' : st.cold ? '#9ad0ff' : st.hot ? '#ffc070' : '#e8f0d8');
    // Only the worst state of each need (no "starving" and "hungry" together).
    const shown = STATUS_ORDER.filter((k) => st[k] && !(SUPERSEDED[k] && st[SUPERSEDED[k]]));
    this.statusText.setText(shown.map((k) => t(`status.${k}`)).join(' · '));

    // Quick bar and equipment.
    this.hotbar.forEach((view, i) => {
      g.fillStyle(0x0c100a, 0.72).fillRect(view.x, view.y, SLOT * s, SLOT * s);
      g.lineStyle(s, i === sv.selected ? 0xffe680 : 0x5a6450, 1).strokeRect(view.x + s / 2, view.y + s / 2, (SLOT - 1) * s, (SLOT - 1) * s);
    });
    for (const slot of EQUIP_SLOTS) {
      const view = this.equipViews[slot];
      g.fillStyle(0x1a140c, 0.78).fillRect(view.x, view.y, SLOT * s, SLOT * s);
      g.lineStyle(s, 0x8a6a40, 1).strokeRect(view.x + s / 2, view.y + s / 2, (SLOT - 1) * s, (SLOT - 1) * s);
    }
    const changed = this._seen.inv !== sv.inventory.version || this._seen.eq !== sv.equipment.version || this._seen.held !== this.held || this._seen.open !== this.open;
    if (changed) {
      this._seen = { inv: sv.inventory.version, eq: sv.equipment.version, held: this.held, open: this.open };
      this.hotbar.forEach((view, i) => this.fillSlot(view, sv.inventory.get(i)));
      for (const slot of EQUIP_SLOTS) {
        const item = sv.equipment.slots[slot];
        this.fillSlot(this.equipViews[slot], item ? { item, count: 1 } : null);
      }
    }

    // Action prompt.
    let prompt = '';
    let blocked = false;
    if (!sv.dead && !this.open && !this.crafting.open) {
      const tg = sv.target;
      const pv = sv.preview;
      if (pv) {
        blocked = !!pv.why;
        prompt = pv.why ? t('prompt.cannotPlace', { why: t(pv.why) }) : t('prompt.place', { name: t(`item.${pv.type}`) });
      } else if (tg) {
        const h = tg.def.harvest;
        const name = tg.type === 'dropped' ? `${t(`item.${tg.item}`)}${tg.count > 1 ? ` x${tg.count}` : ''}` : t(`prop.${tg.type}`);
        prompt = t(`prompt.${h.kind}`, { name, left: Math.round((tg.hpLeft / h.hp) * 100) });
      } else if (sv.water) {
        prompt = t('prompt.water');
      }
      const dt = sv.dismantleTarget;
      if (dt) prompt = [prompt, t('prompt.dismantle', { name: t(`prop.${dt.type}`) })].filter(Boolean).join('  ·  ');
    }
    this.prompt.setText(prompt).setVisible(prompt !== '').setColor(blocked ? '#ff9a7a' : '#e8f0d8');

    // Notifications fade out.
    this.notes = this.notes.filter((n) => {
      if (time < n.until) return true;
      n.tx.destroy();
      this.noteTexts.splice(this.noteTexts.indexOf(n.tx), 1);
      return false;
    });
    this.notes.forEach((n, i) => {
      n.tx.setPosition(this.notesOrigin.x, this.notesOrigin.y - (this.notes.length - i) * 9 * s);
      n.tx.setAlpha(Math.min(1, (n.until - time) / 600));
    });

    this.drawPanel(changed);
    this.crafting.update();
    this.drawDeath();
  }

  drawPanel(changed) {
    const show = this.open;
    for (const o of [this.panelG, this.panelTitle, this.panelHelp, this.panelInfo, ...Object.values(this.equipLabels)]) o.setVisible(show);
    if (!show) {
      for (const view of this.slotViews) this.fillSlot(view, null);
      this.fillSlot(this.heldView, null);
      return;
    }
    const s = this.s;
    const g = this.panelG;
    const sv = this.sv;
    g.clear();
    const b = this.panelBox;
    g.fillStyle(0x10140e, 0.94).fillRect(b.x, b.y, b.width, b.height);
    g.lineStyle(s, 0x8a6a40, 1).strokeRect(b.x, b.y, b.width, b.height);
    this.panelTitle.setText(`${t('hud.inventory')}  ·  ${t('hud.hotbarRow')}`);
    const p = this.scene.input.activePointer;
    const hover = this.slotAt(p.x, p.y);
    this.slotViews.forEach((view, i) => {
      g.fillStyle(i < sv.cfg.inventory.hotbar ? 0x24301c : 0x1a2014, 1).fillRect(view.x, view.y, SLOT * s, SLOT * s);
      const hl = hover?.kind === 'inv' && hover.i === i;
      g.lineStyle(s, hl ? 0xffe680 : i === sv.selected ? 0xb8a050 : 0x4a5440, 1).strokeRect(view.x + s / 2, view.y + s / 2, (SLOT - 1) * s, (SLOT - 1) * s);
    });
    for (const slot of EQUIP_SLOTS) {
      const pos = this.panelEquip[slot];
      g.fillStyle(0x2a2014, 1).fillRect(pos.x, pos.y, SLOT * s, SLOT * s);
      g.lineStyle(s, hover?.kind === 'equip' && hover.slot === slot ? 0xffe680 : 0x8a6a40, 1).strokeRect(pos.x + s / 2, pos.y + s / 2, (SLOT - 1) * s, (SLOT - 1) * s);
      this.equipLabels[slot].setText(t(`hud.${slot}`));
    }
    if (changed) this.slotViews.forEach((view, i) => this.fillSlot(view, sv.inventory.get(i)));
    // Equipment icons in the panel reuse the quick-bar views, moved for the time the panel is open.
    for (const slot of EQUIP_SLOTS) {
      const view = this.equipViews[slot];
      const pos = this.panelEquip[slot];
      view.icon.setPosition(pos.x + 2 * s, pos.y + 2 * s);
      view.count.setVisible(false);
    }
    // Info about the hovered item.
    let stack = null;
    if (hover?.kind === 'inv') stack = sv.inventory.get(hover.i);
    else if (hover?.kind === 'equip' && sv.equipment.slots[hover.slot]) stack = { item: sv.equipment.slots[hover.slot], count: 1 };
    this.panelInfo.setText(stack ? describe(stack, this.defs[stack.item]) : t('hud.empty'));
    this.panelHelp.setText(t('hud.inventoryHelp'));
    // Stack carried by the mouse.
    this.fillSlot(this.heldView, this.held);
    if (this.held) {
      this.heldView.icon.setPosition(p.x - 8 * s, p.y - 8 * s);
      this.heldView.count.setPosition(p.x + 9 * s, p.y + 10 * s);
    }
  }

  /** Called when the panel closes: equipment icons go back next to the quick bar. */
  restoreEquipIcons() {
    for (const slot of EQUIP_SLOTS) this.placeSlot(this.equipViews[slot], this.equipViews[slot].x, this.equipViews[slot].y);
  }

  drawDeath() {
    const dead = this.sv.dead;
    for (const o of [this.deathG, this.deathTitle, this.deathSub]) o.setVisible(dead);
    if (!dead) return;
    const { width, height } = this.scene.scale;
    this.deathG.clear().fillStyle(0x2a0606, 0.6).fillRect(0, 0, width, height);
    const cause = t(`death.cause.${this.sv.vitals.lastDamage}`);
    this.deathTitle.setText(`${t('death.title')} ${cause}`.trim());
    const left = Math.max(0, Math.ceil(this.sv.cfg.respawn.delay - this.sv.deadFor));
    this.deathSub.setText(t('death.respawn', { s: left }));
  }
}

function inside(px, py, v, size) {
  return px >= v.x && px < v.x + size && py >= v.y && py < v.y + size;
}

function describe(stack, def) {
  const lines = [`${t(`item.${stack.item}`)}${stack.count > 1 ? ` x${stack.count}` : ''} — ${t(`category.${def.category}`)}`];
  if (def.food) lines.push(t('effect.food', { hunger: def.food.hunger ?? 0, thirst: def.food.thirst ?? 0 }));
  if (def.tool) lines.push(t('effect.tool', { wood: def.tool.wood ?? 1, stone: def.tool.stone ?? 1, plant: def.tool.plant ?? 1 }));
  if (def.insulation) lines.push(t('effect.insulation', { insulation: def.insulation }));
  if (def.place) lines.push(t('effect.place'));
  return lines.join('\n');
}
