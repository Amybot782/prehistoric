/**
 * Game updater (I/O side). See updater-core.cjs for the rules.
 *
 * At launch: pick the game to load (bundled or downloaded), then ask GitHub
 * for the latest release. If it is newer, download game.asar (~2 MB), check
 * its size and SHA-256 against the release's game.json, and switch to it.
 * Every failure (offline, GitHub down, bad file) simply keeps the current
 * version: an update can never prevent the game from starting.
 */
const path = require('node:path');
const crypto = require('node:crypto');
const ofs = require('original-fs'); // plain file access, without Electron's .asar redirection
const { net } = require('electron');
const core = require('./updater-core.cjs');

const META_TIMEOUT_MS = 6000;
const DOWNLOAD_TIMEOUT_MS = 90000;

class Updater {
  constructor({ dir, bundledVersion, owner, repo, log, apiBase = 'https://api.github.com' }) {
    this.apiBase = apiBase;
    this.dir = dir;
    this.statePath = path.join(dir, 'state.json');
    this.bundledVersion = bundledVersion;
    this.owner = owner;
    this.repo = repo;
    this.log = log;
    ofs.mkdirSync(dir, { recursive: true });
  }

  readState() {
    try {
      return JSON.parse(ofs.readFileSync(this.statePath, 'utf8'));
    } catch {
      return core.emptyState();
    }
  }

  writeState(state) {
    const tmp = `${this.statePath}.tmp`;
    ofs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    ofs.renameSync(tmp, this.statePath);
  }

  /** Decides what to load now; returns { root, version, source, rolledBack }. */
  startup() {
    const r = core.chooseGameAtStartup(this.readState(), this.bundledVersion, (f) => ofs.existsSync(path.join(this.dir, f)));
    this.writeState(r.state);
    if (r.rolledBack) this.log('warn', 'La dernière mise à jour ne démarrait pas : retour à la version précédente');
    const root = r.source === 'downloaded' ? path.join(this.dir, r.file) : null;
    return { root, version: r.version, source: r.source, rolledBack: r.rolledBack };
  }

  /** Called when the game reports it started: the version is kept for good. */
  confirm() {
    const state = core.confirmStarted(this.readState());
    this.writeState(state);
    this.cleanup(state);
  }

  /** Removes downloaded games that are neither active nor the fallback. */
  cleanup(state) {
    const keep = new Set([state.active?.file, state.previous?.file].filter(Boolean));
    for (const name of ofs.readdirSync(this.dir)) {
      if (!/^game-.*\.asar(\.download)?$/.test(name) || keep.has(name)) continue;
      try {
        ofs.unlinkSync(path.join(this.dir, name));
      } catch {
        // In use or locked: retried next launch.
      }
    }
  }

  async fetchJson(url) {
    const res = await withTimeout(net.fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Prehistoric-game' },
    }), META_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
    return res.json();
  }

  /**
   * Checks GitHub and installs a newer game if there is one.
   * Returns { installed: version } | { needsNewShell: version } | null.
   */
  async checkAndInstall(currentVersion, onProgress = () => {}) {
    const release = await this.fetchJson(`${this.apiBase}/repos/${this.owner}/${this.repo}/releases/latest`);
    const manifestAsset = (release.assets ?? []).find((a) => a.name === 'game.json');
    if (!manifestAsset) return null;
    const manifest = await this.fetchJson(manifestAsset.browser_download_url);
    const plan = core.planUpdate(release, manifest, currentVersion, this.readState().bad ?? []);
    if (!plan) return null;
    if (plan.needsNewShell) {
      this.log('warn', `La version ${plan.needsNewShell} demande de retélécharger le jeu complet`);
      return plan;
    }
    onProgress(plan.version);
    this.log('info', `Téléchargement de la version ${plan.version}`);
    const res = await withTimeout(net.fetch(plan.url, { headers: { 'User-Agent': 'Prehistoric-game' } }), DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status} au téléchargement`);
    const data = Buffer.from(await withTimeout(res.arrayBuffer(), DOWNLOAD_TIMEOUT_MS));
    const sha = crypto.createHash('sha256').update(data).digest('hex');
    if (data.length !== plan.size || sha !== plan.sha256) throw new Error('Fichier de mise à jour corrompu (taille ou empreinte)');

    const file = `game-${plan.version}.asar`;
    const tmp = path.join(this.dir, `${file}.download`);
    ofs.writeFileSync(tmp, data);
    ofs.renameSync(tmp, path.join(this.dir, file));
    this.writeState(core.activate(this.readState(), plan.version, file));
    this.log('info', `Version ${plan.version} installée`);
    return { installed: plan.version, root: path.join(this.dir, file) };
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Délai dépassé')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = { Updater };
