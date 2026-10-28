import Phaser from 'phaser';
import { t } from '../i18n/index.js';
import { Minimap } from '../ui/Minimap.js';

/**
 * Screen-space interface drawn above the world, unaffected by camera zoom.
 * Content: the debug panel (F3), the minimap (M), a controls hint and the
 * version. Sizes follow the window height so they stay readable up to 4K.
 */
export class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  init(data) {
    this.worldScene = data.worldScene;
  }

  create() {
    this.showDebug = false;
    this.panel = this.add.text(0, 0, '', {
      fontFamily: 'Consolas, "DejaVu Sans Mono", monospace',
      color: '#e8f0d8',
      backgroundColor: 'rgba(12,16,10,0.72)',
      padding: { x: 8, y: 6 },
    }).setVisible(false);
    this.hint = this.add.text(0, 0, t('hint.controls'), {
      fontFamily: 'Consolas, "DejaVu Sans Mono", monospace',
      color: '#e8f0d8',
      backgroundColor: 'rgba(12,16,10,0.55)',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1);
    const onToggleDebug = () => {
      this.showDebug = !this.showDebug;
      this.panel.setVisible(this.showDebug);
    };
    this.worldScene.events.on('toggle-debug', onToggleDebug);
    this.version = this.add.text(0, 0, `v${__APP_VERSION__}`, {
      fontFamily: 'Consolas, "DejaVu Sans Mono", monospace',
      color: 'rgba(232,240,216,0.6)',
    }).setOrigin(1, 1);
    this.notice = this.add.text(0, 0, '', {
      fontFamily: 'Consolas, "DejaVu Sans Mono", monospace',
      color: '#fff3c4',
      backgroundColor: 'rgba(40,52,24,0.9)',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 0).setVisible(false);
    this.showUpdateNotice();

    this.minimap = new Minimap(this.worldScene.world);
    if (this.textures.exists('minimap')) this.textures.remove('minimap');
    this.minimapTexture = this.textures.addCanvas('minimap', this.minimap.canvas);
    this.minimapImage = this.add.image(0, 0, 'minimap').setOrigin(1, 0);
    this.showMinimap = true;
    this.nextMinimap = 0;
    const onToggleMinimap = () => {
      this.showMinimap = !this.showMinimap;
      this.minimapImage.setVisible(this.showMinimap);
    };
    this.worldScene.events.on('toggle-minimap', onToggleMinimap);
    const onResize = () => this.layout();
    this.scale.on('resize', onResize);
    // The world scene restarts on a new world: drop listeners so they do not pile up.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.worldScene.events.off('toggle-debug', onToggleDebug);
      this.worldScene.events.off('toggle-minimap', onToggleMinimap);
      this.scale.off('resize', onResize);
      this.minimap.destroy();
      this.textures.remove('minimap');
    });
    this.layout();
    this.nextRefresh = 0;
  }

  /** Tells the player when the desktop app installed (or undid) an update. */
  async showUpdateNotice() {
    const bridge = window.prehistoric;
    if (!bridge?.appInfo) return;
    try {
      const info = await bridge.appInfo();
      const u = info?.update ?? {};
      let msg = null;
      if (u.updatedTo) msg = t('update.installed', { version: u.updatedTo });
      else if (u.rolledBack) msg = t('update.rolledBack');
      else if (u.needsNewShell) msg = t('update.needsNewShell', { version: u.needsNewShell });
      if (!msg) return;
      this.notice.setText(msg).setVisible(true);
      this.time.delayedCall(8000, () => this.notice.setVisible(false));
    } catch {
      // Information only: never block the game.
    }
  }

  layout() {
    const { width, height } = this.scale;
    const ui = Math.max(1, height / 720);
    const fs = `${Math.round(13 * ui)}px`;
    this.panel.setFontSize(fs).setPosition(Math.round(8 * ui), Math.round(8 * ui));
    this.hint.setFontSize(fs).setPosition(width / 2, height - Math.round(8 * ui));
    this.version.setFontSize(fs).setPosition(width - Math.round(8 * ui), height - Math.round(8 * ui));
    this.notice.setFontSize(fs).setPosition(width / 2, Math.round(8 * ui));
    // Whole-number scale keeps the minimap pixels crisp.
    this.minimapImage.setScale(Math.max(1, Math.round(ui))).setPosition(width - Math.round(8 * ui), Math.round(8 * ui));
  }

  update(time) {
    if (this.showMinimap && time >= this.nextMinimap) {
      this.nextMinimap = time + 200;
      const p = this.worldScene.player;
      this.minimap.render(p.x, p.y, p.facing);
      this.minimapTexture.refresh();
    }
    if (!this.showDebug || time < this.nextRefresh) return;
    this.nextRefresh = time + 100; // 10 refreshes per second is enough for text.
    const s = this.worldScene.getDebugState();
    const f2 = (v) => v.toFixed(2);
    const speed = Math.hypot(s.player.vx, s.player.vy);
    const state = s.player.running ? t('debug.running') : s.player.moving ? t('debug.walking') : t('debug.idle');
    this.panel.setText([
      t('debug.title'),
      t('debug.fps', { fps: s.fps.toFixed(0), ms: s.frameMs.toFixed(1) }),
      t('debug.tick', { tick: s.tick, rate: s.tickRate, scale: s.timeScale }),
      t('debug.player', { x: f2(s.player.x), y: f2(s.player.y) }),
      s.world.mode === 'test' ? t('debug.worldTest') : t('debug.seed', { seed: s.world.seed }),
      t('debug.tile', { tx: s.tile.tx, ty: s.tile.ty, terrain: s.tile.terrain ? t(`terrain.${s.tile.terrain}`) : '-' }),
      t('debug.biome', { biome: s.tile.biome ? t(`biome.${s.tile.biome}`) : '-', h: s.tile.height, z: f2(s.player.z) }),
      t('debug.chunk', { cx: s.chunk.cx, cy: s.chunk.cy, loaded: s.world.loadedChunks, gen: s.world.lastGenMs.toFixed(1), stream: s.world.streamMs.toFixed(2) }),
      t('debug.screen', { sx: s.playerScreen.x.toFixed(1), sy: s.playerScreen.y.toFixed(1) }),
      t('debug.mouse', { tx: s.mouse.tx, ty: s.mouse.ty, x: f2(s.mouse.x), y: f2(s.mouse.y) }),
      t('debug.speed', { speed: f2(speed), state }),
      t('debug.camera', { zoom: s.zoom.toFixed(2), base: s.baseZoom }),
      t('debug.world', { props: s.props, colliders: s.colliders, visible: s.visibleProps }),
      t('debug.render', { sprites: s.render.sprites, pooled: s.render.pooledImages, explored: this.minimap.rememberedChunks }),
      t('debug.help'),
    ]);
  }
}
