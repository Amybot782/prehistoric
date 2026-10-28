/**
 * Isometric projection (2:1 "pixel art" dimetric).
 *
 * World space is a right-handed ground plane measured in tiles:
 *   +x goes towards the bottom-right of the screen,
 *   +y goes towards the bottom-left of the screen,
 *   +z is height above the ground (in tiles, projected with `heightUnit`).
 * Screen space is in unscaled pixels; the camera applies zoom and scroll.
 *
 * Every system (physics, AI, building, saves) works in world space only.
 * Screen space exists solely for rendering and for picking under the mouse.
 */
export class IsoProjection {
  /**
   * @param {{tileWidth:number, tileHeight:number, heightUnit:number}} cfg
   */
  constructor({ tileWidth, tileHeight, heightUnit }) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.heightUnit = heightUnit;
    this.halfW = tileWidth / 2;
    this.halfH = tileHeight / 2;
  }

  /** World (x, y, z) -> screen pixels. Writes into `out` to avoid allocations. */
  worldToScreen(x, y, z = 0, out = { x: 0, y: 0 }) {
    out.x = (x - y) * this.halfW;
    out.y = (x + y) * this.halfH - z * this.heightUnit;
    return out;
  }

  /** Screen pixels -> world point on the ground plane at height `z`. */
  screenToWorld(sx, sy, z = 0, out = { x: 0, y: 0 }) {
    const a = sx / this.halfW; // x - y
    const b = (sy + z * this.heightUnit) / this.halfH; // x + y
    out.x = (a + b) / 2;
    out.y = (b - a) / 2;
    return out;
  }

  /** Integer tile containing a world point. */
  tileAt(x, y, out = { x: 0, y: 0 }) {
    out.x = Math.floor(x);
    out.y = Math.floor(y);
    return out;
  }

  /**
   * Converts an input direction expressed in screen space (right = +x,
   * down = +y) into a normalised world-space direction, so that "up" on the
   * keyboard moves the character straight up on screen.
   * Returns a zero vector when there is no input.
   */
  screenDirToWorld(ix, iy, out = { x: 0, y: 0 }) {
    // Screen right is world (1,-1); screen down is world (1,1).
    const dx = ix + iy;
    const dy = iy - ix;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      out.x = 0;
      out.y = 0;
    } else {
      out.x = dx / len;
      out.y = dy / len;
    }
    return out;
  }

  /**
   * 8-way facing index from a world direction, measured on screen so it
   * matches what the player sees: 0 = east (screen right), then clockwise
   * (1 = south-east, 2 = south, ... 6 = north, 7 = north-east).
   */
  facingFromWorldDir(dx, dy) {
    const sx = (dx - dy) * this.halfW;
    const sy = (dx + dy) * this.halfH * 2; // undo the 2:1 squash for angles
    const angle = Math.atan2(sy, sx);
    const idx = Math.round(angle / (Math.PI / 4));
    return (idx + 8) % 8;
  }
}
