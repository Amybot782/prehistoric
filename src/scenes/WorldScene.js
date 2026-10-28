import Phaser from 'phaser';
import gameCfg from '../data/game.json';
import terrain from '../data/terrain.json';
import props from '../data/props.json';
import biomes from '../data/biomes.json';
import worldgen from '../data/worldgen.json';
import bindings from '../data/keybindings.json';
import { IsoProjection } from '../iso/projection.js';
import { FixedStepClock } from '../core/FixedStepClock.js';
import { InputMap } from '../input/InputMap.js';
import { ChunkedWorld } from '../world/ChunkedWorld.js';
import { ProceduralGenerator } from '../world/generation/ProceduralGenerator.js';
import { TestMapGenerator } from '../world/testMap.js';
import { resolveWorldChoice, rememberWorld, newRandomWorldSettings } from '../world/worldSession.js';
import { Player } from '../entities/Player.js';
import { ChunkRenderer } from '../render/ChunkRenderer.js';
import { PlayerView } from '../render/PlayerView.js';
import { CameraController } from '../render/CameraController.js';
import { DebugDraw } from '../debug/DebugDraw.js';
import { DepthLayer } from '../iso/depth.js';
import { logger } from '../core/Logger.js';

const log = logger.scope('world');
const BIOME_KEYS = biomes.biomes.map((b) => b.key);

/**
 * Main gameplay scene. It owns the simulation objects and wires them to the
 * renderers; the per-frame flow is:
 *   1. read input,
 *   2. run 0..n fixed simulation steps (FixedStepClock),
 *   3. stream chunks around the camera,
 *   4. render the interpolated state and update the camera.
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

    // F9 stores the next world in the registry, so it wins over the URL.
    const choice = this.registry.get('nextWorld') ?? resolveWorldChoice(window.location.search);
    this.registry.remove('nextWorld');
    this.worldChoice = choice;
    const generator = choice.mode === 'test'
      ? new TestMapGenerator(worldgen.chunkSize)
      : new ProceduralGenerator({ settings: choice.settings, cfg: worldgen, terrainTypes: terrain.types, biomes: biomes.biomes });
    if (choice.mode === 'procedural') rememberWorld(choice.settings);

    this.world = new ChunkedWorld({
      generator,
      terrainTypes: terrain.types,
      propDefs: props,
      physicsCfg: gameCfg.physics,
      levelHeight: worldgen.levelHeight,
      streaming: worldgen.streaming,
    });
    const spawn = generator.findSpawn();
    this.player = this.world.addEntity(new Player(spawn.x, spawn.y, gameCfg.player));
    this.streamAround(spawn.x, spawn.y, Infinity);
    this.player.placeAt(spawn.x, spawn.y, this.world.groundZ(spawn.x, spawn.y));

    this.chunkView = new ChunkRenderer(this, this.world, this.projection, origins);
    this.playerView = new PlayerView(this, this.player, this.projection, origins, this.world);
    const co = origins.ui_tile_cursor ?? { x: 0.5, y: 0.5 };
    this.cursor = this.add.image(0, 0, 'ui_tile_cursor').setOrigin(co.x, co.y).setDepth(DepthLayer.OVERLAY - 1);
    this.debugDraw = new DebugDraw(this, this.world, this.projection);

    this.cameraCtl = new CameraController(this.cameras.main, gameCfg.camera);
    this.cameraCtl.onResize(this.scale.height);
    this.snap = (v) => this.cameraCtl.snap(v);
    this.playerView.update(1, this.snap);
    this.cameraCtl.follow(this.playerView.screen.x, this.playerView.screen.y);
    const onResize = (size) => this.cameraCtl.onResize(size.height);
    this.scale.on('resize', onResize);
    this.input.on('wheel', (_p, _o, _dx, dy) => this.cameraCtl.zoomBy(dy > 0 ? -1 : 1));

    this.mouse = { tx: 0, ty: 0, x: 0, y: 0, h: 0 };
    this._dir = { x: 0, y: 0 };
    this._axes = { x: 0, y: 0 };
    this._m = { x: 0, y: 0 };
    this._w = { x: 0, y: 0 };
    this._box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    this.frameMs = 16.7;
    this.streamMs = 0;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputMap.detach(window);
      this.scale.off('resize', onResize);
      this.chunkView.destroy();
      this.scene.stop('UI');
    });
    this.scene.launch('UI', { worldScene: this });
    const where = choice.mode === 'test' ? 'zone de test' : `seed « ${choice.settings.seed} »`;
    log.info(`Monde prêt (${where}) : départ (${spawn.x}, ${spawn.y}), ${this.world.loadedCount} chunks chargés`);
    this.exposeDebugApi();
    // Tells the desktop app the game started, so a freshly installed update is kept.
    window.prehistoric?.gameReady?.();
  }

  update(_time, delta) {
    this.frameMs = this.frameMs * 0.9 + delta * 0.1;
    const input = this.inputMap;

    if (input.justPressed('debugColliders')) this.debugDraw.showColliders = !this.debugDraw.showColliders;
    if (input.justPressed('debugGrid')) this.debugDraw.showGrid = !this.debugDraw.showGrid;
    if (input.justPressed('debugChunks')) this.debugDraw.showChunks = !this.debugDraw.showChunks;
    if (input.justPressed('debugOverlay')) this.events.emit('toggle-debug');
    if (input.justPressed('toggleMinimap')) this.events.emit('toggle-minimap');
    if (input.justPressed('zoomIn')) this.cameraCtl.zoomBy(1);
    if (input.justPressed('zoomOut')) this.cameraCtl.zoomBy(-1);
    if (input.justPressed('zoomReset')) this.cameraCtl.resetZoom();
    if (input.justPressed('debugNewWorld')) {
      input.endFrame();
      this.newRandomWorld();
      return;
    }

    // Simulation: fixed steps, independent of the frame rate.
    const axes = input.moveAxes(this._axes);
    const dir = this.projection.screenDirToWorld(axes.x, axes.y, this._dir);
    const run = input.isDown('run');
    const steps = this.clock.advance(delta);
    const p = this.player;
    for (let i = 0; i < steps; i++) {
      p.snapshot();
      p.step(this.clock.stepSeconds, dir, run, this.world.collisions, this.projection);
      p.followGround(this.world.groundZ(p.x, p.y), this.clock.stepSeconds);
    }
    input.endFrame();

    // Rendering: interpolated between the last two simulation states.
    this.playerView.update(this.clock.alpha, this.snap);
    this.cameraCtl.follow(this.playerView.screen.x, this.playerView.screen.y);
    const view = this.currentView();
    const t0 = performance.now();
    this.streamView(view);
    this.streamMs = this.streamMs * 0.9 + (performance.now() - t0) * 0.1;
    this.chunkView.update(view, {
      x: this.playerView.screen.x,
      y: this.playerView.screen.y - 10,
      depth: this.playerView.depth,
    });
    this.updateMouse();
    this.debugDraw.draw(view, this.player);
  }

  /**
   * Area the camera shows this frame. Phaser's `worldView` is only refreshed
   * at render time, so right after a teleport it still describes the old
   * place; it is rebuilt here from the position the camera just locked on.
   */
  currentView() {
    const cam = this.cameras.main;
    const w = cam.width / cam.zoom, h = cam.height / cam.zoom;
    const v = this._view ?? (this._view = { x: 0, y: 0, right: 0, bottom: 0, width: 0, height: 0 });
    v.x = this.playerView.screen.x - w / 2;
    v.y = this.playerView.screen.y - h / 2;
    v.width = w;
    v.height = h;
    v.right = v.x + w;
    v.bottom = v.y + h;
    return v;
  }

  /** Tile box seen by the camera, including ground raised up to the top level. */
  viewBox(view) {
    const p = this.projection;
    const maxZ = (this.world.generator.levels ?? 0) * this.world.levelHeight;
    const b = this._box;
    b.minX = b.minY = Infinity;
    b.maxX = b.maxY = -Infinity;
    for (const sx of [view.x, view.right]) {
      for (const sy of [view.y, view.bottom]) {
        for (const z of [0, maxZ]) {
          const w = p.screenToWorld(sx, sy, z, this._w);
          b.minX = Math.min(b.minX, w.x); b.maxX = Math.max(b.maxX, w.x);
          b.minY = Math.min(b.minY, w.y); b.maxY = Math.max(b.maxY, w.y);
        }
      }
    }
    return b;
  }

  streamView(view, budget) {
    return this.world.stream(this.viewBox(view), budget);
  }

  /** Loads everything around a point at once (spawn, teleport). */
  streamAround(x, y, budget = Infinity) {
    const r = 24;
    return this.world.stream({ minX: x - r, minY: y - r, maxX: x + r, maxY: y + r }, budget);
  }

  newRandomWorld() {
    const settings = newRandomWorldSettings(this.worldChoice.settings);
    log.info(`Nouveau monde aléatoire (F9) : seed « ${settings.seed} »`);
    this.registry.set('nextWorld', { mode: 'procedural', settings });
    this.scene.restart();
  }

  /**
   * Tile under the mouse. Raised ground is drawn higher on screen, so each
   * height level is tried from the top down; the first tile whose height
   * matches the tested level is the visible one.
   */
  updateMouse() {
    const ptr = this.input.activePointer;
    const cam = this.cameras.main;
    const wp = cam.getWorldPoint(ptr.x, ptr.y, this._m);
    const levels = this.world.generator.levels ?? 0;
    const lh = this.world.levelHeight;
    let found = null;
    for (let h = levels; h >= 0 && !found; h--) {
      const w = this.projection.screenToWorld(wp.x, wp.y, h * lh, this._w);
      const tx = Math.floor(w.x), ty = Math.floor(w.y);
      if (this.world.chunkOf(tx, ty) && this.world.heightAt(tx, ty) === h) found = { x: w.x, y: w.y, tx, ty, h };
    }
    this.cursor.setVisible(!!found);
    if (!found) return;
    Object.assign(this.mouse, found);
    const c = this.projection.worldToScreen(found.tx + 0.5, found.ty + 0.5, found.h * lh);
    this.cursor.setPosition(c.x, c.y);
  }

  /** Snapshot read by the debug overlay and by automated end-to-end tests. */
  getDebugState() {
    const p = this.player;
    const w = this.world;
    const s = this.projection.worldToScreen(p.x, p.y, p.z);
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    const tid = w.tileAt(tx, ty);
    const bid = w.biomeAt(tx, ty);
    const n = w.size;
    let props = 0;
    for (const c of w.chunks.values()) props += c.props.length;
    return {
      fps: this.game.loop.actualFps,
      frameMs: this.frameMs,
      tick: this.clock.tick,
      tickRate: gameCfg.simulation.tickRate,
      timeScale: this.clock.timeScale,
      world: {
        mode: this.worldChoice.mode,
        seed: this.worldChoice.settings.seed,
        loadedChunks: w.loadedCount,
        generated: w.stats.generated,
        unloaded: w.stats.unloaded,
        lastGenMs: w.stats.lastGenMs,
        streamMs: this.streamMs,
        modifiedChunks: w.deltas.size ?? 0,
      },
      player: { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, facing: p.facing, running: p.running, moving: p.moving, radius: p.radius },
      playerScreen: { x: s.x, y: s.y },
      tile: {
        tx, ty,
        terrain: tid >= 0 ? w.terrainTypes[tid].key : null,
        biome: bid >= 0 && w.generator instanceof ProceduralGenerator ? BIOME_KEYS[bid] : null,
        height: w.heightAt(tx, ty),
      },
      chunk: { cx: Math.floor(tx / n), cy: Math.floor(ty / n) },
      mouse: { ...this.mouse },
      zoom: this.cameraCtl.zoom,
      baseZoom: this.cameraCtl.baseZoom,
      props,
      colliders: w.collisions.staticCount,
      visibleProps: this.chunkView.visibleCount,
      render: this.chunkView.stats,
      overlapping: w.collisions.overlaps(p.x, p.y, p.radius - 1e-3),
    };
  }

  /**
   * Where the player sprite and one fixed world point land on the canvas, in
   * whole device pixels, as the renderer draws them. Used to detect jitter.
   */
  renderProbe() {
    const cam = this.cameras.main;
    const z = cam.zoom;
    const toScreen = (x, y) => ({
      x: (x - cam.scrollX - cam.width * 0.5) * z + cam.width * 0.5,
      y: (y - cam.scrollY - cam.height * 0.5) * z + cam.height * 0.5,
    });
    const fixed = this.projection.worldToScreen(0, 0, 0);
    return {
      zoom: z,
      player: toScreen(this.playerView.sprite.x, this.playerView.sprite.y),
      playerIso: { x: this.playerView.screen.x * z, y: this.playerView.screen.y * z },
      prop: toScreen(fixed.x, fixed.y),
    };
  }

  exposeDebugApi() {
    window.__PREHISTORIC__ = {
      state: () => this.getDebugState(),
      teleport: (x, y) => {
        this.streamAround(x, y, Infinity);
        this.player.placeAt(x, y, this.world.groundZ(x, y));
      },
      tileAt: (tx, ty) => ({ ground: this.world.tileAt(tx, ty), height: this.world.heightAt(tx, ty), biome: this.world.biomeAt(tx, ty) }),
      newWorld: () => this.newRandomWorld(),
      logs: () => logger.entries.slice(-50),
      renderProbe: () => this.renderProbe(),
    };
  }
}
