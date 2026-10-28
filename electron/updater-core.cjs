/**
 * Pure decision logic of the game updater (no I/O, unit-tested).
 *
 * Only the game itself (the `dist` folder, packed as one `game.asar` file of
 * about 2 MB) is updated. The Windows shell (Prehistoric.exe + this Electron
 * code) stays the same; a release that needs a newer shell says so with
 * `minShell` and is not installed automatically.
 *
 * State file (%APPDATA%\Prehistoric\game\state.json):
 *   { active: {version, file} | null, previous: {version, file} | null,
 *     confirmed: boolean, attempts: number, bad: string[] }
 * A freshly installed version is "unconfirmed" until the game reports it has
 * started; if it fails to start again on the next launch, the updater falls back to the previous
 * working version (or the one bundled with the exe).
 */
const SHELL_VERSION = 1;
const MAX_UNCONFIRMED_ATTEMPTS = 1;

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1, 0 or 1; invalid versions sort lowest. */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

function emptyState() {
  return { active: null, previous: null, confirmed: true, attempts: 0, bad: [] };
}

/**
 * Chooses which game to load at startup and returns the updated state.
 * `exists(file)` tells whether a downloaded game file is still on disk.
 * Result: { source: 'bundled' | 'downloaded', version, file?, state, rolledBack }
 */
function chooseGameAtStartup(state, bundledVersion, exists) {
  const s = { ...emptyState(), ...(state ?? {}) };
  let rolledBack = false;

  const usable = (g) => g && g.file && exists(g.file) && compareVersions(g.version, bundledVersion) > 0;

  if (s.active && !s.confirmed && s.attempts >= MAX_UNCONFIRMED_ATTEMPTS) {
    // The new version never managed to start: go back, and never reinstall it.
    s.bad = [...new Set([...(s.bad ?? []), s.active.version])].slice(-20);
    s.active = usable(s.previous) ? s.previous : null;
    s.previous = null;
    s.confirmed = true;
    s.attempts = 0;
    rolledBack = true;
  }
  if (!usable(s.active)) {
    // Missing file, or the exe now bundles the same or a newer game.
    s.active = null;
    s.confirmed = true;
    s.attempts = 0;
  }
  if (!s.active) return { source: 'bundled', version: bundledVersion, state: s, rolledBack };
  if (!s.confirmed) s.attempts += 1;
  return { source: 'downloaded', version: s.active.version, file: s.active.file, state: s, rolledBack };
}

/** Marks the running version as working. */
function confirmStarted(state) {
  return { ...emptyState(), ...state, confirmed: true, attempts: 0 };
}

/** Records a newly downloaded version as the one to load next. */
function activate(state, version, file) {
  const s = { ...emptyState(), ...(state ?? {}) };
  const keepPrevious = s.active && s.confirmed ? s.active : s.previous;
  return { active: { version, file }, previous: keepPrevious ?? null, confirmed: false, attempts: 0, bad: s.bad ?? [] };
}

/**
 * Reads a GitHub "latest release" response and the release's game.json
 * manifest, and says whether to download. Returns null when nothing to do,
 * or { version, url, sha256, size } to download, or { needsNewShell: version }.
 */
function planUpdate(release, manifest, currentVersion, badVersions = []) {
  if (!release || release.draft || release.prerelease || !manifest) return null;
  const version = manifest.version;
  if (!parseVersion(version) || compareVersions(version, currentVersion) <= 0) return null;
  if (badVersions.includes(version)) return null; // failed to start here before
  if (compareVersions(release.tag_name, version) !== 0) return null; // inconsistent release
  if ((manifest.minShell ?? 1) > SHELL_VERSION) return { needsNewShell: version };
  const asset = (release.assets ?? []).find((a) => a.name === 'game.asar');
  if (!asset || !/^[0-9a-f]{64}$/.test(manifest.sha256 ?? '') || !(manifest.size > 0)) return null;
  if (asset.size !== manifest.size) return null;
  return { version, url: asset.browser_download_url, sha256: manifest.sha256, size: manifest.size };
}

module.exports = {
  SHELL_VERSION,
  MAX_UNCONFIRMED_ATTEMPTS,
  parseVersion,
  compareVersions,
  emptyState,
  chooseGameAtStartup,
  confirmStarted,
  activate,
  planUpdate,
};
