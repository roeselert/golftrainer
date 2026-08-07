import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { jsModulesUnder, repoRoot } from '../tools/source-modules.mjs';

/**
 * Guards QG1 against the quietest possible failure.
 *
 * With no build step there is nothing to derive the precache list from, so
 * `app-shell.json` is maintained by hand. A module added to `src/` but not to
 * that list still works in development — the network serves it — and then fails
 * on the first tee, where there is no network and no way to diagnose it.
 *
 * The list has a second job now that the online half exists. It is not "every
 * module"; it is "the offline shell". Precaching `src/online/` would drag a map
 * library the golfer cannot use into the download they make before teeing off,
 * so this file checks the boundary in both directions.
 */

/**
 * Root entries that must be cached for a cold start in airplane mode.
 * Relative, because the app is served from a subpath on GitHub Pages.
 */
const requiredRootEntries = ['./', 'index.html', 'manifest.webmanifest', 'app-shell.json'];

/** @returns {Promise<string[]>} */
async function shellManifest() {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'app-shell.json'), 'utf8'));
  return manifest.shell;
}

test('every offline module is listed in the precache manifest', async () => {
  const listed = new Set(await shellManifest());
  const onDisk = (await jsModulesUnder('src')).filter((url) => !url.startsWith('src/online/'));

  const missing = onDisk.filter((url) => !listed.has(url));
  assert.deepEqual(
    missing,
    [],
    `These modules exist but are not precached, so the app would break offline:\n  ${missing.join('\n  ')}\nAdd them to app-shell.json.`,
  );
});

test('no online capability is precached', async () => {
  const listed = await shellManifest();

  const online = listed.filter((url) => url.startsWith('src/online/'));
  assert.deepEqual(
    online,
    [],
    `The precache is the offline shell (CLAUDE.md §1.4). These are online capabilities and must be loaded on navigation instead:\n  ${online.join('\n  ')}`,
  );
});

test('the precache manifest lists no file that has been deleted', async () => {
  const listed = await shellManifest();
  const onDisk = new Set(await jsModulesUnder('src'));

  const stale = listed
    .filter((/** @type {string} */ url) => url.startsWith('src/'))
    .filter((/** @type {string} */ url) => !onDisk.has(url));

  assert.deepEqual(
    stale,
    [],
    `app-shell.json lists files that no longer exist. Service worker installation is atomic, so these would fail the whole precache:\n  ${stale.join('\n  ')}`,
  );
});

test('the precache manifest covers the app shell entry points', async () => {
  const listed = new Set(await shellManifest());

  for (const entry of requiredRootEntries) {
    assert.ok(listed.has(entry), `${entry} must be precached for a cold start with no network.`);
  }
});

test('the offline core imports nothing from the online half', async () => {
  // ESLint enforces this too (TD10). Checking it here as well costs nothing and
  // catches the case where someone relaxes the lint rule rather than the code.
  const offline = (await jsModulesUnder('src')).filter(
    (url) => url.startsWith('src/offline/') || url.startsWith('src/shell/'),
  );

  for (const relative of offline) {
    const source = await readFile(path.join(repoRoot, relative), 'utf8');
    const importsOnline = /^\s*import\s[^;]*['"][^'"]*\/online\//m.test(source);
    assert.ok(
      !importsOnline,
      `${relative} statically imports an online capability. Dependencies point one way only (CLAUDE.md §1.4).`,
    );
  }
});
