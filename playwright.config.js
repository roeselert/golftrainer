import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end suite exists for one reason: QG1 cannot be verified by unit
 * tests. "Works in airplane mode" is a claim about a real browser, a real
 * service worker and a real cold start.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // PGlite boots a Postgres instance in WASM; the first run is not quick.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CHROMIUM_PATH lets an environment with a preinstalled browser point
        // at it instead of downloading a matching build. Unset locally, where
        // `npx playwright install` has done the right thing already.
        ...(process.env.CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'node tools/serve.mjs',
    url: 'http://127.0.0.1:8080/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
