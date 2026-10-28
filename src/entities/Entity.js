let nextId = 1;

/**
 * Base class for every simulated thing that moves (player, later animals and
 * villagers). Holds world-space state only; the renderer reads it but the
 * entity never references Phaser objects, so the simulation runs headless in
 * tests and, later, in simplified off-screen simulation.
 */
export class Entity {
  constructor(kind, x, y, radius) {
    this.id = nextId++;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.z = 0;
    this.prevX = x;
    this.prevY = y;
    this.radius = radius;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
  }

  /** Stores the state used by render interpolation; call before each step. */
  snapshot() {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  /** Teleports without interpolation (spawn, respawn, chunk transitions). */
  placeAt(x, y) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vx = this.vy = 0;
  }

  interpolated(alpha, out = { x: 0, y: 0 }) {
    out.x = this.prevX + (this.x - this.prevX) * alpha;
    out.y = this.prevY + (this.y - this.prevY) * alpha;
    return out;
  }
}
