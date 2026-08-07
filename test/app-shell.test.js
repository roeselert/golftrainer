import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * Guards QG1 against the quietest possible failure.
 *
 * With no build step there is nothing to derive the precache list from, so
 * `app-shell.json` is maintained by hand. A module added to `src/` but not to
 * that list still works in development — the network serves it — and then fails
 * on the first tee, where there is no network and no way to diagnose it.
 *
 * This test is the thing that makes the hand-maintained list safe.
 */

const repoRoot = path.resolve(import.meta.dirname, '..');

/** Root files that must be cached for a cold start in airplane mode. */
const requiredRootEntries = ['/', '/index.html', '/manifest.webmanifest', '/app-shell.json'];

/**
 * @param {string} dir
 * @returns {Promise<string[]>} public URLs of every .js file below `dir`
 */
async function jsModulesUnder(dir) {
  const entries = await readdir(path.join(repoRoot, dir), {
    withFileTypes: true,
    recursive: true,
  });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.relative(repoRoot, path.join(entry.parentPath, entry.name)))
    .map((relative) => `/${relative.split(path.sep).join('/')}`);
}

test('every source module is listed in the precache manifest', async () => {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'app-shell.json'), 'utf8'));
  const listed = new Set(manifest.shell);
  const onDisk = await jsModulesUnder('src');

  const missing = onDisk.filter((/** @type {string} */ url) => !listed.has(url));
  assert.deepEqual(
    missing,
    [],
    `These modules exist but are not precached, so the app would break offline:\n  ${missing.join('\n  ')}\nAdd them to app-shell.json.`,
  );
});

test('the precache manifest lists no file that has been deleted', async () => {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'app-shell.json'), 'utf8'));
  const onDisk = new Set(await jsModulesUnder('src'));

  const stale = manifest.shell
    .filter((/** @type {string} */ url) => url.startsWith('/src/'))
    .filter((/** @type {string} */ url) => !onDisk.has(url));

  assert.deepEqual(
    stale,
    [],
    `app-shell.json lists files that no longer exist. Service worker installation is atomic, so these would fail the whole precache:\n  ${stale.join('\n  ')}`,
  );
});

test('the precache manifest covers the app shell entry points', async () => {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'app-shell.json'), 'utf8'));
  const listed = new Set(manifest.shell);

  for (const entry of requiredRootEntries) {
    assert.ok(listed.has(entry), `${entry} must be precached for a cold start with no network.`);
  }
});
