/**
 * Assembles the deployable site into `_site/`.
 *
 * Not a build step in the TD2 sense — nothing is transformed, compiled or
 * bundled. It is a copy, and what it copies is decided by the same two
 * manifests the service worker precaches from:
 *
 *   app-shell.json            the app shell
 *   vendor/pglite/assets.json the database engine
 *
 * Deriving the deployment from the precache list keeps one list honest instead
 * of two. A file that is not precached is a file that does not work on the
 * course, so publishing it would be pointless anyway.
 */

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const siteDir = path.join(repoRoot, '_site');

/**
 * Files that belong in the deployment but are not listed by either manifest.
 *
 *   sw.js                      A service worker must not cache itself: the
 *                              browser fetches it fresh to discover updates,
 *                              and a self-cached worker can never be replaced.
 *   vendor/pglite/assets.json  A manifest lists its contents, not itself. The
 *                              service worker reads it during install, so
 *                              omitting it breaks the whole precache.
 */
const extras = ['sw.js', 'vendor/pglite/assets.json'];

/**
 * @param {string} name
 * @returns {Promise<string[]>}
 */
async function readManifest(name) {
  const body = JSON.parse(await readFile(path.join(repoRoot, name), 'utf8'));
  return body.shell ?? body.assets ?? [];
}

async function main() {
  const [shell, pglite] = await Promise.all([
    readManifest('app-shell.json'),
    readManifest(path.join('vendor', 'pglite', 'assets.json')),
  ]);

  // "./" is the directory itself, served as index.html — nothing to copy.
  const files = [...shell, ...pglite, ...extras].filter((entry) => entry !== './');

  await rm(siteDir, { recursive: true, force: true });
  await mkdir(siteDir, { recursive: true });

  let bytes = 0;
  for (const relative of new Set(files)) {
    const source = path.join(repoRoot, relative);
    const target = path.join(siteDir, relative);

    try {
      await stat(source);
    } catch {
      throw new Error(
        `${relative} is listed in a manifest but does not exist. ` +
          `Run \`npm run vendor\` if this is a PGlite asset.`,
      );
    }

    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    bytes += (await stat(target)).size;
  }

  // Tell GitHub Pages not to run the artifact through Jekyll, which would
  // otherwise drop files and directories beginning with an underscore.
  await writeFile(path.join(siteDir, '.nojekyll'), '', 'utf8');

  const megabytes = (bytes / 1024 / 1024).toFixed(1);
  console.log(`Assembled _site: ${new Set(files).size} files, ${megabytes} MB uncompressed.`);
}

await main();
