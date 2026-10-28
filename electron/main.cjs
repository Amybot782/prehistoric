/**
 * Electron main process: creates the game window and provides the few
 * services the game needs from the operating system (log files, user data
 * folder). The game itself runs sandboxed in the renderer with no Node.js
 * access; it is served from the packaged `dist/` folder through a private
 * `app://` protocol, so the distributed build never needs a local server.
 */
const { app, BrowserWindow, protocol, net, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// ---- Persistent user folders (never deleted by updates) -------------------
// Windows: %APPDATA%\Prehistoric\ (logs\, saves\)
function userDir(name) {
  const dir = path.join(app.getPath('userData'), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let logStream = null;
function writeLog(entry) {
  try {
    if (!logStream) {
      const day = new Date().toISOString().slice(0, 10);
      logStream = fs.createWriteStream(path.join(userDir('logs'), `prehistoric-${day}.log`), { flags: 'a' });
    }
    const data = entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : '';
    logStream.write(`[${entry.t}] ${entry.level.toUpperCase()} ${entry.scope}: ${entry.message}${data}\n`);
  } catch (err) {
    console.error('Impossible d’écrire le journal', err);
  }
}

function mainLog(level, message, data) {
  writeLog({ t: new Date().toISOString(), level, scope: 'main', message, data });
}

// Renderer -> main log messages are validated: only plain, bounded entries.
const LEVELS = new Set(['debug', 'info', 'warn', 'error']);
function validEntry(e) {
  return e && typeof e === 'object' && LEVELS.has(e.level) && typeof e.message === 'string'
    && typeof e.scope === 'string' && typeof e.t === 'string' && e.message.length < 10000;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#10140f',
    title: 'Prehistoric',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged || process.argv.includes('--debug'),
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());

  // The game never navigates nor opens windows; external links go to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  win.webContents.on('render-process-gone', (_e, details) => mainLog('error', 'Processus de rendu arrêté', details));

  // F11: plein écran. F12: outils de développement (hors version distribuée, sauf --debug).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12') {
      if (!app.isPackaged || process.argv.includes('--debug')) win.webContents.toggleDevTools();
    }
  });

  win.loadURL('app://game/index.html');
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      const target = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
      if (!target.startsWith(DIST + path.sep)) return new Response('Interdit', { status: 403 });
      return net.fetch(pathToFileURL(target).toString());
    });
    // No camera, microphone, notifications... the game asks for nothing.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    ipcMain.on('log', (_e, entry) => {
      if (validEntry(entry)) writeLog(entry);
    });
    ipcMain.handle('app-info', () => ({
      version: app.getVersion(),
      packaged: app.isPackaged,
      savesDir: userDir('saves'),
      logsDir: userDir('logs'),
    }));

    userDir('saves');
    mainLog('info', `Démarrage ${app.getVersion()} (${process.platform}, Electron ${process.versions.electron})`);
    createWindow();
  });

  app.on('window-all-closed', () => {
    mainLog('info', 'Fermeture');
    app.quit();
  });

  process.on('uncaughtException', (err) => mainLog('error', 'Exception non gérée (main)', { message: err.message, stack: err.stack }));
}
