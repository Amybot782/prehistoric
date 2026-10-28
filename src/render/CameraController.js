/**
 * Camera that follows a target in iso screen space with frame-rate
 * independent smoothing, and zooms in discrete steps around a base zoom
 * derived from the window height (so the game looks the same on 1080p and
 * 4K: 360 reference pixels -> x3 at 1080p, x6 at 2160p).
 */
export class CameraController {
  constructor(camera, cfg) {
    this.camera = camera;
    this.cfg = cfg;
    this.factor = 1;
    this.baseZoom = 1;
    this.x = 0;
    this.y = 0;
    camera.roundPixels = true;
  }

  computeBaseZoom(viewHeight) {
    const raw = viewHeight / this.cfg.referenceHeight;
    return Math.max(1, Math.round(raw * 2) / 2);
  }

  onResize(viewHeight) {
    this.baseZoom = this.computeBaseZoom(viewHeight);
    this.apply();
  }

  zoomBy(steps) {
    const { zoomStep, minZoomFactor, maxZoomFactor } = this.cfg;
    const next = this.factor + steps * zoomStep * (this.factor < 1 || (this.factor === 1 && steps < 0) ? 0.5 : 1);
    this.factor = Math.min(maxZoomFactor, Math.max(minZoomFactor, Math.round(next * 4) / 4));
    this.apply();
  }

  resetZoom() {
    this.factor = 1;
    this.apply();
  }

  get zoom() {
    return this.baseZoom * this.factor;
  }

  apply() {
    this.camera.setZoom(this.zoom);
  }

  snapTo(sx, sy) {
    this.x = sx;
    this.y = sy;
    this.camera.centerOn(sx, sy);
  }

  /** Smoothly follows (sx, sy); `dtSeconds` is the real frame time. */
  follow(sx, sy, dtSeconds) {
    const k = 1 - Math.exp(-dtSeconds * this.cfg.followSharpness);
    this.x += (sx - this.x) * k;
    this.y += (sy - this.y) * k;
    this.camera.centerOn(this.x, this.y);
  }
}
