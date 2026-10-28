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
const { Updater } = require('./updater.cjs');
const updateConfig = require('./update-config.json');

const BUNDLED_DIST = path.join(__dirname, '..', 'dist');
// Folder (or downloaded game.asar) the game is served from; set at startup.
let gameRoot = BUNDLED_DIST;
let gameInfo = { version: null, source: 'bundled', updatedTo: null, rolledBack: false, needsNewShell: null };
let updater = null;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};

const SPLASH = `<!doctype html><html lang="fr"><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#10140f;color:#d8e0c8;font:18px monospace"><div id="m">Recherche de mise à jour…</div></body></html>`;

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

  return win;
}

/**
 * Picks the game version, looks for an update (packaged app only, unless
 * --no-update), then loads the game. Never blocks the game on a network error.
 */
function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}

async function startGame(win) {
  gameInfo.version = app.getVersion();
  const allowUpdates = (app.isPackaged || process.argv.includes('--check-updates')) && !process.argv.includes('--no-update');
  if (allowUpdates) {
    try {
      updater = new Updater({
        dir: userDir('game'),
        bundledVersion: app.getVersion(),
        owner: updateConfig.owner,
        repo: updateConfig.repo,
        log: (level, message) => mainLog(level, message),
        // Test servers are only accepted in development builds.
        apiBase: !app.isPackaged ? argValue('--update-api') : undefined,
      });
      const start = updater.startup();
      if (start.root) gameRoot = start.root;
      Object.assign(gameInfo, { version: start.version, source: start.source, rolledBack: start.rolledBack });
      await win.loadURL('app://game/__splash.html');
      const result = await updater.checkAndInstall(gameInfo.version, (v) => {
        win.webContents.executeJavaScript(`document.getElementById('m').textContent = 'Mise à jour vers la version ${v}…'`).catch(() => {});
      });
      if (result?.installed) {
        gameRoot = result.root;
        Object.assign(gameInfo, { version: result.installed, source: 'downloaded', updatedTo: result.installed });
      } else if (result?.needsNewShell) {
        gameInfo.needsNewShell = result.needsNewShell;
      }
    } catch (err) {
      mainLog('warn', `Mise à jour impossible pour l'instant : ${err.message}`);
    }
  }
  mainLog('info', `Jeu ${gameInfo.version} (${gameInfo.source === 'downloaded' ? 'version téléchargée' : 'version incluse'})`);
  win.loadURL('app://game/index.html');
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
    protocol.handle('app', async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === '/__splash.html') return new Response(SPLASH, { headers: { 'content-type': 'text/html' } });
      const target = path.normalize(path.join(gameRoot, decodeURIComponent(pathname)));
      if (!target.startsWith(gameRoot + path.sep)) return new Response('Interdit', { status: 403 });
      try {
        // Electron's fs reads inside .asar archives, so the same code serves the
        // bundled dist folder and a downloaded game.asar.
        const data = await fs.promises.readFile(target);
        return new Response(data, { headers: { 'content-type': MIME[path.extname(target)] ?? 'application/octet-stream' } });
      } catch {
        return new Response('Introuvable', { status: 404 });
      }
    });
    // No camera, microphone, notifications... the game asks for nothing.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    ipcMain.on('log', (_e, entry) => {
      if (validEntry(entry)) writeLog(entry);
    });
    ipcMain.handle('app-info', () => ({
      version: gameInfo.version,
      shellVersion: app.getVersion(),
      packaged: app.isPackaged,
      update: { ...gameInfo },
      savesDir: userDir('saves'),
      logsDir: userDir('logs'),
    }));
    ipcMain.on('game-ready', () => {
      if (updater && gameInfo.source === 'downloaded') {
        try {
          updater.confirm();
        } catch (err) {
          mainLog('warn', 'Impossible de confirmer la version', { message: err.message });
        }
      }
    });

    userDir('saves');
    mainLog('info', `Démarrage ${app.getVersion()} (${process.platform}, Electron ${process.versions.electron})`);
    const win = createWindow();
    startGame(win);
  });

  app.on('window-all-closed', () => {
    mainLog('info', 'Fermeture');
    app.quit();
  });

  process.on('uncaughtException', (err) => mainLog('error', 'Exception non gérée (main)', { message: err.message, stack: err.stack }));
}
