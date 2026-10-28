/**
 * Preload bridge: the only door between the sandboxed game and Electron.
 * It exposes a tiny, explicit API; the game never gets ipcRenderer or Node.js.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prehistoric', {
  log: (entry) => ipcRenderer.send('log', entry),
  appInfo: () => ipcRenderer.invoke('app-info'),
  gameReady: () => ipcRenderer.send('game-ready'),
});
