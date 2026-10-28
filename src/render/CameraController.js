/**
 * Pixel-perfect camera.
 *
 * - Zoom is always a whole number, so every texel of the pixel art covers the
 *   same number of screen pixels (a zoom of 2.5 makes texels alternate between
 *   2 and 3 pixels, which shimmers when scrolling). The default zoom follows
 *   the window height: 360 reference pixels -> x2 at 720p-900p, x3 at 1080p,
 *   x4 at 1440p, x6 at 2160p (4K).
 * - The camera is locked on the target, and both the target and the camera
 *   scroll are snapped to the same screen-pixel grid. The character therefore
 *   stays on exactly the same screen pixel while the world scrolls under it;
 *   a smoothed (lagging) camera rounded independently from the character made
 *   the image tremble while walking.
 */
export class CameraController {
  constructor(camera, cfg) {
    this.camera = camera;
    this.cfg = cfg;
    this.offset = 0; // zoom steps added by the player (wheel, +/-)
    this.baseZoom = 1;
    // Phaser only floors the scroll in world pixels when `roundPixels` is set,
    // which is the wrong grid at zoom > 1. We snap the scroll ourselves and
    // just ask the renderer to round vertices whenever the zoom is whole.
    camera.roundPixels = false;
    const preRender = camera.preRender.bind(camera);
    camera.preRender = () => {
      preRender();
      camera.renderRoundPixels = Number.isInteger(camera.zoomX) && Number.isInteger(camera.zoomY);
    };
  }

  computeBaseZoom(viewHeight) {
    return Math.max(1, Math.floor(viewHeight / this.cfg.referenceHeight));
  }

  onResize(viewHeight) {
    this.baseZoom = this.computeBaseZoom(viewHeight);
    this.apply();
  }

  get minZoom() {
    return Math.max(1, Math.floor(this.baseZoom * this.cfg.minZoomFactor));
  }

  get maxZoom() {
    return Math.max(this.baseZoom + 1, Math.ceil(this.baseZoom * this.cfg.maxZoomFactor));
  }

  get zoom() {
    return Math.min(this.maxZoom, Math.max(this.minZoom, this.baseZoom + this.offset));
  }

  zoomBy(steps) {
    // Keep the offset within reach so zooming back is immediate after hitting a limit.
    this.offset = this.zoom + steps - this.baseZoom;
    this.offset = this.zoom - this.baseZoom;
    this.apply();
  }

  resetZoom() {
    this.offset = 0;
    this.apply();
  }

  apply() {
    this.camera.setZoom(this.zoom);
  }

  /** Rounds a coordinate (iso screen space) to the current screen-pixel grid. */
  snap(v) {
    const z = this.zoom;
    return Math.round(v * z) / z;
  }

  /** Centres the camera on (sx, sy); pass values already snapped with `snap`. */
  follow(sx, sy) {
    const cam = this.camera;
    cam.centerOn(sx, sy);
    cam.scrollX = this.snap(cam.scrollX);
    cam.scrollY = this.snap(cam.scrollY);
  }
}
