import { DepthLayer } from '../iso/depth.js';

/**
 * World-space debug drawing: colliders (as they exist in the logical world,
 * projected to the screen) and the tile grid. Only the area around the
 * camera is drawn, and only when the corresponding toggle is on.
 */
export class DebugDraw {
  constructor(scene, world, projection) {
    this.world = world;
    this.proj = projection;
    this.g = scene.add.graphics().setDepth(DepthLayer.OVERLAY);
    this.showColliders = false;
    this.showGrid = false;
    this._a = { x: 0, y: 0 };
    this._b = { x: 0, y: 0 };
    this._list = [];
  }

  draw(view, player) {
    this.g.clear();
    if (!this.showColliders && !this.showGrid) return;
    const p = this.proj;
    // World area covering the view: un-project the 4 view corners.
    const corners = [
      p.screenToWorld(view.x, view.y), p.screenToWorld(view.right, view.y),
      p.screenToWorld(view.x, view.bottom), p.screenToWorld(view.right, view.bottom),
    ];
    const minX = Math.floor(Math.min(...corners.map((c) => c.x))) - 1;
    const maxX = Math.ceil(Math.max(...corners.map((c) => c.x))) + 1;
    const minY = Math.floor(Math.min(...corners.map((c) => c.y))) - 1;
    const maxY = Math.ceil(Math.max(...corners.map((c) => c.y))) + 1;

    if (this.showGrid) {
      this.g.lineStyle(1, 0xffffff, 0.18);
      for (let x = Math.max(0, minX); x <= Math.min(this.world.width, maxX); x++) {
        this.line(x, Math.max(0, minY), x, Math.min(this.world.height, maxY));
      }
      for (let y = Math.max(0, minY); y <= Math.min(this.world.height, maxY); y++) {
        this.line(Math.max(0, minX), y, Math.min(this.world.width, maxX), y);
      }
    }
    if (this.showColliders) {
      const list = this.world.collisions.hash.query(minX, minY, maxX, maxY, this._list);
      this.g.lineStyle(1, 0xff4d4d, 0.9);
      for (const c of list) this.shape(c.shape);
      this.g.lineStyle(1, 0x4dff88, 1);
      this.shape({ type: 'circle', x: player.x, y: player.y, r: player.radius });
    }
  }

  line(x0, y0, x1, y1) {
    const a = this.proj.worldToScreen(x0, y0, 0, this._a);
    const b = this.proj.worldToScreen(x1, y1, 0, this._b);
    this.g.lineBetween(a.x, a.y, b.x, b.y);
  }

  shape(s) {
    if (s.type === 'aabb') {
      this.line(s.minX, s.minY, s.maxX, s.minY);
      this.line(s.maxX, s.minY, s.maxX, s.maxY);
      this.line(s.maxX, s.maxY, s.minX, s.maxY);
      this.line(s.minX, s.maxY, s.minX, s.minY);
      return;
    }
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      this.line(s.x + Math.cos(a0) * s.r, s.y + Math.sin(a0) * s.r, s.x + Math.cos(a1) * s.r, s.y + Math.sin(a1) * s.r);
    }
  }
}
