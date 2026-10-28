import { t } from '../i18n/index.js';
import { itemTextureKey } from '../assets/assetCatalog.js';
import { craftBlocker, missingFor } from '../crafting/crafting.js';

/**
 * Crafting menu (C): every recipe with its cost, what is missing and the
 * workshop it needs. A click crafts at once (Shift + click: five times).
 * Part of the survival interface, which gives it its scale (`hud.s`).
 */
const FONT = 'Consolas, "DejaVu Sans Mono", monospace';
const ROW_W = 185;
const ROW_H = 22;
const PER_COL = 7;
const DEPTH = 3;

export class CraftingPanel {
  constructor(scene, survival, recipes, hud) {
    this.scene = scene;
    this.sv = survival;
    this.list = recipes.recipes;
    this.hud = hud;
    this.open = false;
    const text = (style = {}) => scene.add.text(0, 0, '', { fontFamily: FONT, color: '#e8f0d8', ...style }).setVisible(false).setDepth(DEPTH + 1);
    this.g = scene.add.graphics().setVisible(false).setDepth(DEPTH);
    this.title = text();
    this.stationsText = text({ color: '#b8c4a8' });
    this.help = text({ color: '#b8c4a8' });
    this.rows = this.list.map((recipe) => ({
      recipe,
      icon: scene.add.image(0, 0, itemTextureKey(recipe.id)).setOrigin(0, 0).setVisible(false).setDepth(DEPTH + 1),
      name: text(),
      cost: text(),
      x: 0,
      y: 0,
    }));
  }

  toggle(open = !this.open) {
    this.open = open;
    for (const o of [this.g, this.title, this.stationsText, this.help]) o.setVisible(open);
    for (const r of this.rows) for (const o of [r.icon, r.name, r.cost]) o.setVisible(open);
  }

  layout() {
    const s = this.hud.s;
    const { width, height } = this.scene.scale;
    const cols = Math.ceil(this.rows.length / PER_COL);
    const w = cols * ROW_W * s + 16 * s;
    const h = 30 * s + PER_COL * ROW_H * s + 16 * s;
    this.box = { x: Math.round(width / 2 - w / 2), y: Math.round(height / 2 - h / 2 - 20 * s), w, h };
    const { x, y } = this.box;
    this.title.setFontSize(`${Math.round(7 * s)}px`).setPosition(x + 8 * s, y + 6 * s);
    this.stationsText.setFontSize(`${Math.round(5.5 * s)}px`).setPosition(x + 8 * s, y + 17 * s);
    this.help.setFontSize(`${Math.round(5.5 * s)}px`).setPosition(x + 8 * s, y + h - 11 * s);
    this.rows.forEach((r, i) => {
      r.x = x + 8 * s + Math.floor(i / PER_COL) * ROW_W * s;
      r.y = y + 28 * s + (i % PER_COL) * ROW_H * s;
      r.icon.setScale(s).setPosition(r.x + 3 * s, r.y + 3 * s);
      r.name.setFontSize(`${Math.round(6 * s)}px`).setPosition(r.x + 22 * s, r.y + 2 * s);
      r.cost.setFontSize(`${Math.round(5 * s)}px`).setPosition(r.x + 22 * s, r.y + 11 * s);
    });
  }

  rowAt(px, py) {
    const s = this.hud.s;
    return this.rows.find((r) => px >= r.x && px < r.x + (ROW_W - 4) * s && py >= r.y && py < r.y + (ROW_H - 2) * s) ?? null;
  }

  contains(px, py) {
    const b = this.box;
    return this.open && px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h;
  }

  /** Returns true when the click was for the panel. */
  onPointerDown(p) {
    if (!this.open) return false;
    const row = this.rowAt(p.x, p.y);
    if (row && !p.rightButtonDown()) this.sv.craft(row.recipe.id, p.event?.shiftKey ? 5 : 1);
    return true;
  }

  update() {
    if (!this.open) return;
    const s = this.hud.s;
    const g = this.g.clear();
    const b = this.box;
    g.fillStyle(0x10140e, 0.94).fillRect(b.x, b.y, b.w, b.h);
    g.lineStyle(s, 0x8a6a40, 1).strokeRect(b.x, b.y, b.w, b.h);
    const stations = this.sv.stations();
    this.title.setText(t('craft.title'));
    this.stationsText.setText(t('craft.stations', { list: stations.size ? [...stations].map((k) => t(`prop.${k}`)).join(', ') : t('craft.none') }));
    this.help.setText(t('craft.help'));
    const p = this.scene.input.activePointer;
    const hover = this.rowAt(p.x, p.y);
    const inv = this.sv.inventory;
    for (const r of this.rows) {
      const rc = r.recipe;
      const why = craftBlocker(rc, inv, stations);
      g.fillStyle(why ? 0x1a1c16 : 0x24301c, 1).fillRect(r.x, r.y, (ROW_W - 4) * s, (ROW_H - 2) * s);
      if (r === hover) g.lineStyle(s, 0xffe680, 1).strokeRect(r.x + s / 2, r.y + s / 2, (ROW_W - 5) * s, (ROW_H - 3) * s);
      const count = rc.count > 1 ? ` x${rc.count}` : '';
      setText(r.name, `${t(`item.${rc.id}`)}${count}`, why ? '#9aa090' : '#e8f0d8');
      const miss = missingFor(rc, inv);
      const cost = Object.entries(rc.cost).map(([item, n]) => `${t(`item.${item}`)} ${Math.min(inv.count(item), n)}/${n}`).join(' · ');
      const needs = why === 'craft.needStation' ? `${t('craft.needs', { station: t(`prop.${rc.station}`) })} · ` : '';
      setText(r.cost, needs + cost, why === 'craft.needStation' ? '#ff9a7a' : Object.keys(miss).length ? '#d8b070' : '#a8d890');
      r.icon.setAlpha(why ? 0.5 : 1);
    }
  }
}

function setText(tx, value, color) {
  if (tx.text !== value) tx.setText(value);
  if (tx.style.color !== color) tx.setColor(color);
}
