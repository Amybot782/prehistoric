/**
 * Packs the built game (dist/) into release/game.asar and writes
 * release/game.json (version, size, SHA-256, minimum shell version).
 * These two files are what the in-game updater downloads from a GitHub
 * release. Run after `vite build`.
 */
import { createPackage } from '@electron/asar';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const out = join(root, 'release');
const asarPath = join(out, 'game.asar');

await mkdir(out, { recursive: true });
await rm(asarPath, { force: true });
await createPackage(join(root, 'dist'), asarPath);
const data = await readFile(asarPath);
const manifest = {
  version: process.env.PREHISTORIC_VERSION ?? pkg.version,
  size: data.length,
  sha256: createHash('sha256').update(data).digest('hex'),
  // Version of the Electron shell (electron/updater-core.cjs SHELL_VERSION)
  // this game needs. Raise it when electron/ changes in a way old exes lack.
  minShell: 1,
};
await writeFile(join(out, 'game.json'), JSON.stringify(manifest, null, 2));
console.log(`game.asar ${manifest.version} : ${(data.length / 1024).toFixed(0)} Ko, sha256 ${manifest.sha256.slice(0, 12)}…`);
