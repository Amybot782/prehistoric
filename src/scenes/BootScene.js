import Phaser from 'phaser';
import { buildCatalog, generatePlaceholder } from '../assets/assetCatalog.js';
import { logger } from '../core/Logger.js';
import { t } from '../i18n/index.js';
import terrain from '../data/terrain.json';
import items from '../data/items.json';
import creatures from '../data/creatures.json';

const log = logger.scope('assets');

/**
 * Loads the asset manifest, then each overridden file, then generates a
 * placeholder for every texture that has no real file. Origins (ground
 * anchor) are stored per texture in `registry.textureOrigins`.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const { width, height } = this.scale;
    this.loadingText = this.add
      .text(width / 2, height / 2, t('boot.loading'), { fontFamily: 'monospace', fontSize: '18px', color: '#d8e0c8' })
      .setOrigin(0.5);
    this.load.json('manifest', 'assets/manifest.json');
  }

  create() {
    const manifest = this.cache.json.get('manifest') ?? { overrides: {} };
    this.catalog = buildCatalog(terrain.types, items, creatures.species);
    this.origins = {};
    this.failed = new Set();
    const overrides = manifest.overrides ?? {};
    let queued = 0;
    for (const entry of this.catalog) {
      const o = overrides[entry.key];
      if (!o || !o.file) continue;
      entry.override = o;
      queued++;
      if (o.frameWidth) {
        this.load.spritesheet(entry.key, o.file, { frameWidth: o.frameWidth, frameHeight: o.frameHeight });
      } else {
        this.load.image(entry.key, o.file);
      }
    }
    this.load.on('loaderror', (file) => {
      this.failed.add(file.key);
      log.warn(`Fichier introuvable ou invalide, graphisme provisoire utilisé : ${file.src}`);
    });
    if (queued === 0) {
      this.finish();
      return;
    }
    this.load.once('complete', () => this.finish());
    this.load.start();
  }

  finish() {
    let generated = 0;
    let loaded = 0;
    for (const entry of this.catalog) {
      const useFile = entry.override && !this.failed.has(entry.key) && this.textures.exists(entry.key);
      if (useFile) {
        loaded++;
        this.origins[entry.key] = { x: entry.override.originX ?? 0.5, y: entry.override.originY ?? 1 };
        continue;
      }
      const res = generatePlaceholder(entry);
      const canvas = res.pc.toCanvas(document);
      if (this.textures.exists(entry.key)) this.textures.remove(entry.key);
      if (res.frameWidth) {
        this.textures.addSpriteSheet(entry.key, canvas, { frameWidth: res.frameWidth, frameHeight: res.frameHeight });
      } else {
        this.textures.addCanvas(entry.key, canvas);
      }
      this.origins[entry.key] = { x: res.originX, y: res.originY };
      generated++;
    }
    this.registry.set('textureOrigins', this.origins);
    log.info(`Textures prêtes : ${loaded} fichier(s), ${generated} provisoire(s)`);
    this.scene.start('World');
  }
}
