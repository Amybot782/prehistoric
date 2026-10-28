import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { UIScene } from './scenes/UIScene.js';
import { logger, installGlobalErrorHandlers } from './core/Logger.js';

/**
 * Entry point. In the desktop app, the preload script exposes a minimal,
 * validated bridge (`window.prehistoric`) used to write logs to disk; in a
 * plain browser the bridge is absent and logs stay in the console.
 */
const bridge = window.prehistoric;
if (bridge && typeof bridge.log === 'function') logger.setSink((entry) => bridge.log(entry));
installGlobalErrorHandlers(window);
logger.scope('app').info(`Démarrage de Prehistoric ${__APP_VERSION__} (${bridge ? 'application' : 'navigateur'})`);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#10140f',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  fps: { smoothStep: false },
  input: { keyboard: false, mouse: { preventDefaultWheel: true } },
  disableContextMenu: true,
  scene: [BootScene, WorldScene, UIScene],
});

window.addEventListener('contextmenu', (e) => e.preventDefault());
export default game;
