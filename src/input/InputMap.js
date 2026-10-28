/**
 * Action-based keyboard input.
 *
 * Systems ask for actions ("moveUp", "run"...), never for keys. Bindings use
 * physical key codes (KeyboardEvent.code), so the same defaults give ZQSD on
 * AZERTY and WASD on QWERTY. Bindings are data (src/data/keybindings.json)
 * and can be changed at runtime with `rebind`, which the settings menu of a
 * later phase will use. The class does not touch the DOM: `attach` wires it
 * to any EventTarget, which keeps it testable.
 */
export class InputMap {
  constructor(bindings) {
    this.bindings = new Map();
    this.down = new Set();
    this.pressedThisFrame = new Set();
    this.setBindings(bindings);
    this._onDown = (e) => this.handleKeyDown(e);
    this._onUp = (e) => this.handleKeyUp(e);
    this._onBlur = () => this.releaseAll();
  }

  setBindings(bindings) {
    this.bindings.clear();
    for (const [action, codes] of Object.entries(bindings)) {
      if (action.startsWith('_')) continue;
      this.bindings.set(action, [...codes]);
    }
  }

  /** Replaces the keys of one action; returns actions that lost a key to it. */
  rebind(action, codes) {
    const stolen = [];
    for (const [other, list] of this.bindings) {
      if (other === action) continue;
      const kept = list.filter((c) => !codes.includes(c));
      if (kept.length !== list.length) {
        this.bindings.set(other, kept);
        stolen.push(other);
      }
    }
    this.bindings.set(action, [...codes]);
    return stolen;
  }

  exportBindings() {
    return Object.fromEntries([...this.bindings].map(([a, c]) => [a, [...c]]));
  }

  isBound(code) {
    for (const list of this.bindings.values()) if (list.includes(code)) return true;
    return false;
  }

  handleKeyDown(e) {
    if (!this.isBound(e.code)) return;
    if (e.preventDefault) e.preventDefault();
    if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code);
    this.down.add(e.code);
  }

  handleKeyUp(e) {
    this.down.delete(e.code);
  }

  /** Called when the window loses focus so keys never stay "stuck". */
  releaseAll() {
    this.down.clear();
    this.pressedThisFrame.clear();
  }

  isDown(action) {
    const codes = this.bindings.get(action);
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** True once per key press (edge-triggered); reset by `endFrame`. */
  justPressed(action) {
    const codes = this.bindings.get(action);
    if (!codes) return false;
    for (const c of codes) if (this.pressedThisFrame.has(c)) return true;
    return false;
  }

  endFrame() {
    this.pressedThisFrame.clear();
  }

  /** Movement intent in screen space: x right, y down, each in [-1, 1]. */
  moveAxes(out = { x: 0, y: 0 }) {
    out.x = (this.isDown('moveRight') ? 1 : 0) - (this.isDown('moveLeft') ? 1 : 0);
    out.y = (this.isDown('moveDown') ? 1 : 0) - (this.isDown('moveUp') ? 1 : 0);
    return out;
  }

  attach(target) {
    target.addEventListener('keydown', this._onDown);
    target.addEventListener('keyup', this._onUp);
    target.addEventListener('blur', this._onBlur);
  }

  detach(target) {
    target.removeEventListener('keydown', this._onDown);
    target.removeEventListener('keyup', this._onUp);
    target.removeEventListener('blur', this._onBlur);
  }
}
