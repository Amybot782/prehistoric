import Phaser from 'phaser';
import gameCfg from '../data/game.json';
import terrain from '../data/terrain.json';
import props from '../data/props.json';
import bindings from '../data/keybindings.json';
import { IsoProjection } from '../iso/projection.js';
import { FixedStepClock } from '../core/FixedStepClock.js';
import { InputMap } from '../input/InputMap.js';
import { World } from '../world/World.js';
import { populateTestMap, TEST_MAP_SIZE, TEST_MAP_SPAWN } from '../world/testMap.js';
import { Player } from '../entities/Player.js';
import { GroundRenderer } from '../render/GroundRenderer.js';
import { PropRenderer } from '../render/PropRenderer.js';
import { PlayerView } from '../render/PlayerView.js';
import { CameraController } from '../render/CameraController.js';
import { DebugDraw } from '../debug/DebugDraw.js';
import { DepthLayer } from '../iso/depth.js';
import { logger } from '../core/Logger.js';

const log = logger.scope('world');

/**
 * Main gameplay scene. It owns the simulation objects and wires them to the
 * renderers; the per-frame flow is:
 *   1. read input,
 *   2. run 0..n fixed simulation steps (FixedStepClock),
 *   3. render the interpolated state and update the camera.
 */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  create() {
    const origins = this.registry.get('textureOrigins') ?? {};
    this.projection = new IsoProjection(gameCfg.iso);
    this.clock = new FixedStepClock(gameCfg.simulation);
    this.inputMap = new InputMap(bindings);
    this.inputMap.attach(window);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.inputMap.detach(window));

    this.world = new World({
      width: TEST_MAP_SIZE,
      height: TEST_MAP_SIZE,
      terrainTypes: terrain.types,
      propDefs: props,
      physicsCfg: gameCfg.physics,
    });
    populateTestMap(this.world);
    this.player = this.world.addEntity(new Player(TEST_MAP_SPAWN.x, TEST_MAP_SPAWN.y, gameCfg.player));

    this.ground = new GroundRenderer(this, this.world, this.projection);
    this.ground.buildAll();
    this.propsView = new PropRenderer(this, this.world, this.projection, origins);
    this.propsView.buildAll();
    this.playerView = new PlayerView(this, this.player, this.projection, origins, this.world.collisions);
    const co = origins.ui_tile_cursor ?? { x: 0.5, y: 0.5 };
    this.cursor = this.add.image(0, 0, 'ui_tile_cursor').setOrigin(co.x, co.y).setDepth(DepthLayer.GROUND_DECAL);
    this.debugDraw = new DebugDraw(this, this.world, this.projection);

    this.cameraCtl = new CameraController(this.cameras.main, gameCfg.camera);
    this.cameraCtl.onResize(this.scale.height);
    this.snap = (v) => this.cameraCtl.snap(v);
    this.playerView.update(1, this.snap);
    this.cameraCtl.follow(this.playerView.screen.x, this.playerView.screen.y);
    this.scale.on('resize', (size) => this.cameraCtl.onResize(size.height));
    this.input.on('wheel', (_p, _o, _dx, dy) => this.cameraCtl.zoomBy(dy > 0 ? -1 : 1));

    this.mouse = { tx: 0, ty: 0, x: 0, y: 0 };
    this._dir = { x: 0, y: 0 };
    this._axes = { x: 0, y: 0 };
    this._m = { x: 0, y: 0 };
    this.frameMs = 16.7;

    this.scene.launch('UI', { worldScene: this });
    log.info(`Monde de test prêt : ${this.world.props.length} objets, ${this.world.collisions.staticCount} colliders`);
    this.exposeDebugApi();
    // Tells the desktop app the game started, so a freshly installed update is kept.
    window.prehistoric?.gameReady?.();
  }

  update(_time, delta) {
    this.frameMs = this.frameMs * 0.9 + delta * 0.1;
    const input = this.inputMap;

    if (input.justPressed('debugColliders')) this.debugDraw.showColliders = !this.debugDraw.showColliders;
    if (input.justPressed('debugGrid')) this.debugDraw.showGrid = !this.debugDraw.showGrid;
    if (input.justPressed('debugOverlay')) this.events.emit('toggle-debug');
    if (input.justPressed('zoomIn')) this.cameraCtl.zoomBy(1);
    if (input.justPressed('zoomOut')) this.cameraCtl.zoomBy(-1);
    if (input.justPressed('zoomReset')) this.cameraCtl.resetZoom();

    // Simulation: fixed steps, independent of the frame rate.
    const axes = input.moveAxes(this._axes);
    const dir = this.projection.screenDirToWorld(axes.x, axes.y, this._dir);
    const run = input.isDown('run');
    const steps = this.clock.advance(delta);
    for (let i = 0; i < steps; i++) {
      this.player.snapshot();
      this.player.step(this.clock.stepSeconds, dir, run, this.world.collisions, this.projection);
    }
    input.endFrame();

    // Rendering: interpolated between the last two simulation states.
    this.playerView.update(this.clock.alpha, this.snap);
    this.cameraCtl.follow(this.playerView.screen.x, this.playerView.screen.y);
    const view = this.cameras.main.worldView;
    this.propsView.update(view, {
      x: this.playerView.screen.x,
      y: this.playerView.screen.y - 10,
      depth: this.playerView.depth,
    });
    this.updateMouse();
    this.debugDraw.draw(view, this.player);
  }

  updateMouse() {
    const ptr = this.input.activePointer;
    const cam = this.cameras.main;
    const wp = cam.getWorldPoint(ptr.x, ptr.y, this._m);
    const w = this.projection.screenToWorld(wp.x, wp.y);
    this.mouse.x = w.x;
    this.mouse.y = w.y;
    this.mouse.tx = Math.floor(w.x);
    this.mouse.ty = Math.floor(w.y);
    const inside = this.world.inBounds(this.mouse.tx, this.mouse.ty);
    this.cursor.setVisible(inside);
    if (inside) {
      const c = this.projection.worldToScreen(this.mouse.tx + 0.5, this.mouse.ty + 0.5);
      this.cursor.setPosition(c.x, c.y);
    }
  }

  /** Snapshot read by the debug overlay and by automated end-to-end tests. */
  getDebugState() {
    const p = this.player;
    const s = this.projection.worldToScreen(p.x, p.y);
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    const tid = this.world.tileAt(tx, ty);
    return {
      fps: this.game.loop.actualFps,
      frameMs: this.frameMs,
      tick: this.clock.tick,
      tickRate: gameCfg.simulation.tickRate,
      timeScale: this.clock.timeScale,
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing, running: p.running, moving: p.moving, radius: p.radius },
      playerScreen: { x: s.x, y: s.y },
      tile: { tx, ty, terrain: tid >= 0 ? this.world.terrainTypes[tid].key : null },
      mouse: { ...this.mouse },
      zoom: this.cameraCtl.zoom,
      baseZoom: this.cameraCtl.baseZoom,
      props: this.world.props.length,
      colliders: this.world.collisions.staticCount,
      visibleProps: this.propsView.visibleCount,
      overlapping: this.world.collisions.overlaps(p.x, p.y, p.radius - 1e-3),
    };
  }

  /**
   * Where the player sprite and one fixed prop land on the canvas, in whole
   * device pixels, as the renderer draws them. Used to detect camera jitter.
   */
  renderProbe() {
    const cam = this.cameras.main;
    const z = cam.zoom;
    const toScreen = (x, y) => ({
      x: (x - cam.scrollX - cam.width * 0.5) * z + cam.width * 0.5,
      y: (y - cam.scrollY - cam.height * 0.5) * z + cam.height * 0.5,
    });
    const prop = this.propsView.views[0].sprite;
    return {
      zoom: z,
      player: toScreen(this.playerView.sprite.x, this.playerView.sprite.y),
      playerIso: { x: this.playerView.screen.x * z, y: this.playerView.screen.y * z },
      prop: toScreen(prop.x, prop.y),
    };
  }

  exposeDebugApi() {
    window.__PREHISTORIC__ = {
      state: () => this.getDebugState(),
      teleport: (x, y) => this.player.placeAt(x, y),
      logs: () => logger.entries.slice(-50),
      renderProbe: () => this.renderProbe(),
    };
  }
}
