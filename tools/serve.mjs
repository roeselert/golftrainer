/**
 * Static file server for development and for the end-to-end tests.
 *
 * Deliberately dependency-free and deliberately dumb: it serves the repository
 * exactly as a static host would. TD2 says no build step, and the value of that
 * decision is lost if what runs locally is not what ships.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(import.meta.dirname, '..');

/**
 * What to serve, and where to mount it.
 *
 * `SITE_ROOT` / `BASE_PATH` exist so the end-to-end suite can reproduce the
 * GitHub Pages layout, where the app lives under /<repo>/ rather than at the
 * root. That difference has broken the app once already; being able to test it
 * locally is the point.
 */
const documentRoot = path.resolve(repoRoot, process.env.SITE_ROOT ?? '.');
const basePath = `/${(process.env.BASE_PATH ?? '/').replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '');

/** @type {Record<string, string>} */
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Resolves a request path to a file inside the repository, or null if it
 * escapes the root or does not exist.
 *
 * @param {string} urlPath
 * @returns {Promise<string | null>}
 */
async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');

  // Strip the mount point. Anything outside it is not ours to serve, which is
  // exactly how GitHub Pages treats requests outside /<repo>/.
  if (basePath !== '' && !decoded.startsWith(`${basePath}/`) && decoded !== basePath) {
    return null;
  }
  const withinSite = decoded.slice(basePath.length) || '/';

  const relative = withinSite === '/' ? 'index.html' : withinSite.replace(/^\/+/, '');
  const candidate = path.resolve(documentRoot, relative);

  // Path traversal guard: a static host would not serve outside its root.
  if (candidate !== documentRoot && !candidate.startsWith(documentRoot + path.sep)) {
    return null;
  }

  try {
    const stats = await stat(candidate);
    if (stats.isDirectory()) {
      const index = path.join(candidate, 'index.html');
      await stat(index);
      return index;
    }
    return candidate;
  } catch {
    return null;
  }
}

/**
 * @param {number} port
 * @returns {Promise<http.Server>}
 */
export function startServer(port = 0) {
  const server = http.createServer((request, response) => {
    void (async () => {
      const file = await resolveFile(request.url ?? '/');

      if (!file) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      response.writeHead(200, {
        'content-type': contentTypes[path.extname(file)] ?? 'application/octet-stream',
        // The service worker must see fresh bytes; caching is its job, not the
        // dev server's.
        'cache-control': 'no-cache',
      });
      createReadStream(file).pipe(response);
    })();
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const port = Number(process.env.PORT ?? 8080);
  const server = await startServer(port);
  const address = server.address();
  const shown = typeof address === 'object' && address !== null ? address.port : port;
  console.log(`GolfTrainer served from ${documentRoot} at http://127.0.0.1:${shown}${basePath}/`);
}
