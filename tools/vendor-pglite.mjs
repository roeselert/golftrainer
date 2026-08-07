/**
 * Copies the PGlite runtime out of node_modules into `vendor/pglite/`, so the
 * app is served entirely from its own origin.
 *
 * Why this exists (TD9): a CDN import would put a network fetch on the offline
 * critical path, which the dependency rule in CLAUDE.md §1.4 forbids. PGlite
 * resolves `pglite.wasm` / `pglite.data` relative to `import.meta.url`, so the
 * relative layout of the copied files must be preserved exactly.
 *
 * Emits `assets.json` alongside the copy — the service worker reads it at
 * install time to precache every file, rather than hard-coding a list that
 * would silently rot on the next PGlite upgrade.
 */

import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');

// PGlite's `exports` map does not expose ./package.json, so resolve the entry
// point and walk up from `dist/` instead.
const sourceDir = path.dirname(require.resolve('@electric-sql/pglite'));
const pgliteRoot = path.dirname(sourceDir);
const targetDir = path.join(repoRoot, 'vendor', 'pglite');
const publicPrefix = '/vendor/pglite';

/** Files PGlite needs in a browser using the `idb://` filesystem. */
const required = ['pglite.wasm', 'pglite.data', 'initdb.wasm'];

/**
 * The extension tarballs (~1.5 MB) and sourcemaps are deliberately excluded:
 * nothing in the offline core loads a Postgres extension, and shipping them
 * would inflate the precache the golfer downloads before teeing off.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isWanted(name) {
  if (required.includes(name)) return true;
  if (name.endsWith('.map')) return false;
  if (name.endsWith('.tar.gz')) return false;
  if (name.endsWith('.cjs')) return false;
  if (name.endsWith('.d.ts') || name.endsWith('.d.cts')) return false;
  return name.endsWith('.js');
}

/**
 * Type declarations are copied too, but never served and never precached.
 *
 * Without them `tsc` would try to type-check PGlite's minified bundle, which
 * produces thousands of meaningless errors. With `index.d.ts` sitting next to
 * `index.js`, TypeScript resolves the declaration and skips the JS entirely.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isTypeDeclaration(name) {
  return name.endsWith('.d.ts');
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(pgliteRoot, 'package.json'), 'utf8'));
  const version = manifest.version;

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  /** @type {string[]} */
  const copied = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    if (isTypeDeclaration(entry.name)) {
      await copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
      continue;
    }

    if (!isWanted(entry.name)) continue;
    await copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
    copied.push(entry.name);
  }

  const missing = required.filter((name) => !copied.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `PGlite ${version} did not ship the expected runtime assets: ${missing.join(', ')}. ` +
        `The vendoring rules in ${path.relative(repoRoot, import.meta.filename)} need updating.`,
    );
  }

  copied.sort();
  const assets = copied.map((name) => `${publicPrefix}/${name}`);
  await writeFile(
    path.join(targetDir, 'assets.json'),
    `${JSON.stringify({ version, assets }, null, 2)}\n`,
    'utf8',
  );

  let bytes = 0;
  for (const name of copied) {
    bytes += (await stat(path.join(targetDir, name))).size;
  }

  const megabytes = (bytes / 1024 / 1024).toFixed(1);
  console.log(`Vendored PGlite ${version}: ${copied.length} files, ${megabytes} MB uncompressed.`);
}

await main();
