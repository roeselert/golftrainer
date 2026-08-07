import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
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

test('every icon the manifest names exists and is precached', async () => {
  // The trap this closes has been sprung here once already: a manifest that
  // named a file nobody deployed made the service worker's install fetch 404,
  // and `addAll` is atomic, so *nothing* was cached. Icons are on the TD8 path
  // — installability is a functional requirement — so they get the same guard.
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'manifest.webmanifest'), 'utf8'));
  const listed = new Set(await shellManifest());

  assert.ok(manifest.icons.length > 0, 'An installable PWA needs icons (TD8).');

  for (const icon of manifest.icons) {
    await stat(path.join(repoRoot, icon.src));
    assert.ok(listed.has(icon.src), `${icon.src} is in the manifest but is not precached.`);
  }

  // Chrome's install criteria name these two sizes specifically.
  const sizes = new Set(manifest.icons.map((/** @type {any} */ icon) => icon.sizes));
  for (const required of ['192x192', '512x512']) {
    assert.ok(sizes.has(required), `A ${required} icon is required for installability.`);
  }

  // Android may crop to a circle; without this the flag loses its top.
  assert.ok(
    manifest.icons.some((/** @type {any} */ icon) => icon.purpose?.includes('maskable')),
    'One icon must be declared maskable.',
  );
});

test('iOS gets raster touch icons, because it never reads the manifest', async () => {
  const html = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
  const hrefs = [...html.matchAll(/<link rel="apple-touch-icon"[^>]*href="([^"]+)"/g)].map(
    (match) => match[1] ?? '',
  );

  assert.ok(
    hrefs.length > 0,
    'index.html must declare an apple-touch-icon: iOS ignores the manifest.',
  );

  const listed = new Set(await shellManifest());
  for (const href of hrefs) {
    assert.ok(href.endsWith('.png'), `apple-touch-icon must be raster, got ${href}.`);
    await stat(path.join(repoRoot, href));
    assert.ok(listed.has(href), `${href} is referenced by index.html but is not precached.`);
  }

  // 180 is the one an iPhone at @3x actually uses, and the phone is the device
  // UC1 is written for.
  assert.ok(
    hrefs.some((href) => href.includes('180')),
    'iOS needs a 180x180 icon for an iPhone at @3x.',
  );
});

test('the touch icons carry no alpha channel', async () => {
  // Not a nicety. iOS composites any transparency in an apple-touch-icon onto
  // black, so a corner the artwork failed to cover becomes a black corner on
  // the home screen — and nothing else in this repository would notice.
  const html = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
  const hrefs = [...html.matchAll(/<link rel="apple-touch-icon"[^>]*href="([^"]+)"/g)].map(
    (match) => match[1] ?? '',
  );

  for (const href of hrefs) {
    const png = await readFile(path.join(repoRoot, href));

    assert.equal(png.subarray(1, 4).toString(), 'PNG', `${href} is not a PNG.`);
    // IHDR: width at byte 16, colour type at byte 25. Types 4 and 6 carry alpha.
    const colourType = png[25];
    assert.ok(
      colourType === 0 || colourType === 2 || colourType === 3,
      `${href} has an alpha channel (PNG colour type ${colourType}); iOS would composite it onto black.`,
    );

    const declared = html.match(new RegExp(`sizes="(\\d+)x\\1"[^>]*href="${href}"`));
    if (declared) {
      assert.equal(
        png.readUInt32BE(16),
        Number(declared[1]),
        `${href} is not the size index.html says it is.`,
      );
    }
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
