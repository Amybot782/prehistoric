import { describe, it, expect } from 'vitest';
import core from '../../electron/updater-core.cjs';

const { compareVersions, chooseGameAtStartup, activate, confirmStarted, planUpdate, emptyState } = core;
const all = () => true;
const none = () => false;

describe('versions', () => {
  it('compare les numéros de version', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1);
    expect(compareVersions('v0.2.0', '0.2.0')).toBe(0);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('n/a', '0.0.1')).toBe(-1);
  });
});

describe('choix de la version au démarrage', () => {
  it('sans mise à jour, charge la version incluse dans l’exe', () => {
    const r = chooseGameAtStartup(null, '0.1.2', all);
    expect(r.source).toBe('bundled');
    expect(r.version).toBe('0.1.2');
  });

  it('charge une version téléchargée plus récente', () => {
    const s = confirmStarted(activate(emptyState(), '0.1.3', 'game-0.1.3.asar'));
    const r = chooseGameAtStartup(s, '0.1.2', all);
    expect(r.source).toBe('downloaded');
    expect(r.version).toBe('0.1.3');
  });

  it('ignore une version téléchargée plus ancienne que l’exe ou dont le fichier manque', () => {
    const s = confirmStarted(activate(emptyState(), '0.1.3', 'game-0.1.3.asar'));
    expect(chooseGameAtStartup(s, '0.2.0', all).source).toBe('bundled');
    expect(chooseGameAtStartup(s, '0.1.2', none).source).toBe('bundled');
  });

  it('revient à la version précédente si la nouvelle ne démarre pas', () => {
    let s = confirmStarted(activate(emptyState(), '0.1.3', 'game-0.1.3.asar'));
    s = activate(s, '0.1.4', 'game-0.1.4.asar'); // installée, lancée, plantage avant démarrage
    let r = chooseGameAtStartup(s, '0.1.2', all); // 2e lancement : on réessaie une fois
    expect(r.version).toBe('0.1.4');
    r = chooseGameAtStartup(r.state, '0.1.2', all); // toujours pas confirmée : retour
    expect(r.rolledBack).toBe(true);
    expect(r.version).toBe('0.1.3');
    expect(r.state.confirmed).toBe(true);
  });

  it('revient à la version incluse si aucune version précédente n’a fonctionné', () => {
    let s = activate(emptyState(), '0.1.3', 'game-0.1.3.asar');
    s = chooseGameAtStartup(s, '0.1.2', all).state;
    const r = chooseGameAtStartup(s, '0.1.2', all);
    expect(r.rolledBack).toBe(true);
    expect(r.source).toBe('bundled');
  });

  it('une version confirmée est gardée définitivement', () => {
    let s = activate(emptyState(), '0.1.3', 'game-0.1.3.asar');
    s = confirmStarted(chooseGameAtStartup(s, '0.1.2', all).state);
    for (let i = 0; i < 5; i++) s = chooseGameAtStartup(s, '0.1.2', all).state;
    expect(s.active.version).toBe('0.1.3');
  });
});

describe('planification d’une mise à jour', () => {
  const sha = 'a'.repeat(64);
  const release = (tag, size = 100) => ({
    tag_name: tag, draft: false, prerelease: false,
    assets: [{ name: 'game.asar', size, browser_download_url: 'https://x/game.asar' }, { name: 'game.json', size: 10, browser_download_url: 'https://x/game.json' }],
  });

  it('propose une version plus récente et cohérente', () => {
    expect(planUpdate(release('v0.1.3'), { version: '0.1.3', sha256: sha, size: 100, minShell: 1 }, '0.1.2'))
      .toEqual({ version: '0.1.3', url: 'https://x/game.asar', sha256: sha, size: 100 });
  });

  it('refuse les versions égales ou anciennes, les brouillons et les fichiers incohérents', () => {
    const m = { version: '0.1.3', sha256: sha, size: 100 };
    expect(planUpdate(release('v0.1.3'), m, '0.1.3')).toBeNull();
    expect(planUpdate({ ...release('v0.1.3'), prerelease: true }, m, '0.1.2')).toBeNull();
    expect(planUpdate(release('v0.1.4'), m, '0.1.2')).toBeNull(); // étiquette ≠ manifeste
    expect(planUpdate(release('v0.1.3', 99), m, '0.1.2')).toBeNull(); // taille ≠
    expect(planUpdate(release('v0.1.3'), { ...m, sha256: 'xyz' }, '0.1.2')).toBeNull();
  });

  it('ne réinstalle jamais une version qui n’a pas démarré', () => {
    let s = confirmStarted(activate(emptyState(), '0.1.3', 'game-0.1.3.asar'));
    s = activate(s, '0.1.4', 'game-0.1.4.asar');
    s = chooseGameAtStartup(s, '0.1.2', all).state;
    const r = chooseGameAtStartup(s, '0.1.2', all);
    expect(r.state.bad).toEqual(['0.1.4']);
    const m = { version: '0.1.4', sha256: sha, size: 100 };
    expect(planUpdate(release('v0.1.4'), m, r.version, r.state.bad)).toBeNull();
    // Une version suivante corrigée est bien proposée.
    expect(planUpdate(release('v0.1.5'), { ...m, version: '0.1.5' }, r.version, r.state.bad)).not.toBeNull();
  });

  it('signale une version qui demande un nouvel exécutable', () => {
    expect(planUpdate(release('v0.2.0'), { version: '0.2.0', sha256: sha, size: 100, minShell: 2 }, '0.1.2'))
      .toEqual({ needsNewShell: '0.2.0' });
  });
});
