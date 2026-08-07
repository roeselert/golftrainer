import base from './playwright.config.js';

/**
 * Runs the same offline suite against the assembled site, mounted at a subpath.
 *
 * This is the GitHub Pages rehearsal. A project repository is published under
 * `https://<user>.github.io/<repo>/`, so anything the app resolves from "/"
 * lands outside itself — the service worker scope, the precache manifests, the
 * PGlite WASM. Verifying it here means a broken deployment fails in CI rather
 * than on a phone.
 *
 * Configuration lives in the config rather than in shell environment variables
 * so the command works the same on every platform.
 */

const port = 8081;
const basePath = 'golftrainer';
const baseURL = `http://127.0.0.1:${port}/${basePath}/`;

export default {
  ...base,
  use: { ...base.use, baseURL },
  webServer: {
    command: 'node tools/serve.mjs',
    url: `${baseURL}index.html`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(port),
      SITE_ROOT: '_site',
      BASE_PATH: basePath,
    },
  },
};
