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
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(repoRoot, relative);

  // Path traversal guard: a static host would not serve outside its root.
  if (candidate !== repoRoot && !candidate.startsWith(repoRoot + path.sep)) {
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
  console.log(`GolfTrainer served from ${repoRoot} at http://127.0.0.1:${shown}`);
}
