import { expect, test } from '@playwright/test';

/**
 * QG1, verified rather than asserted.
 *
 * The claim in CLAUDE.md is that the app launches from a cold start with no
 * network. Nothing short of a real browser going offline can check that, so
 * this is the test the whole offline architecture answers to.
 */

/**
 * Waits until the service worker is actually in charge of the page.
 *
 * The signal that matters is `navigator.serviceWorker.controller`, not the
 * worker's own state: a worker reports `activated` before `clients.claim()`
 * has resolved, and in that window nothing is intercepted yet. Waiting on the
 * state alone makes the offline test fail for a reason that has nothing to do
 * with being offline.
 *
 * Because `addAll` is atomic, a controlling worker also means the whole shell
 * and the PGlite runtime are on the device.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForServiceWorkerControl(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 90_000,
  });
}

test('reports a healthy stack when online', async ({ page }) => {
  await page.goto('index.html');

  await expect(page.locator('#status .status').first()).toBeVisible();
  await expect(page.locator('.status--fail')).toHaveCount(0);

  // The database really opened — the version string comes from Postgres itself.
  await expect(page.locator('#status')).toContainText('PostgreSQL');
});

test('launches from a cold start with no network', async ({ page, context }) => {
  await page.goto('index.html');
  await waitForServiceWorkerControl(page);

  // A cold start, not a reload of a warm page: close the page, cut the network,
  // then come back the way a golfer would after locking their phone.
  await context.setOffline(true);
  await page.close();

  const revisit = await context.newPage();
  await revisit.goto('index.html');

  await expect(revisit.locator('#status .status').first()).toBeVisible();
  await expect(revisit.locator('.status--fail')).toHaveCount(0);
  await expect(revisit.locator('#status')).toContainText('PostgreSQL');

  await context.setOffline(false);
});

test('the database survives being closed and reopened', async ({ page, context }) => {
  await page.goto('index.html');
  await waitForServiceWorkerControl(page);

  await page.evaluate(async () => {
    const { openDatabase } = await import('./src/offline/shared/store/database.js');
    const db = await openDatabase();
    await db.exec('CREATE TABLE IF NOT EXISTS durability_probe (note text)');
    await db.query('INSERT INTO durability_probe (note) VALUES ($1)', ['round in progress']);
  });

  const revisit = await context.newPage();
  await revisit.goto('index.html');

  const rows = await revisit.evaluate(async () => {
    const { openDatabase } = await import('./src/offline/shared/store/database.js');
    const db = await openDatabase();
    const result = await db.query('SELECT note FROM durability_probe');
    return result.rows;
  });

  expect(rows).toEqual([{ note: 'round in progress' }]);
});

test('the icons the home screen uses are real images, and survive going offline', async ({
  page,
  context,
}) => {
  await page.goto('index.html');
  await waitForServiceWorkerControl(page);

  // Installing to the home screen is a functional requirement (TD8), so a
  // corrupt or missing icon is a broken install rather than a cosmetic slip.
  // Every check before this one reads the file system; this one decodes.
  await context.setOffline(true);

  const decoded = await page.evaluate(async () => {
    const sources = [
      'icons/icon-180.png',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon.svg',
    ];

    return Promise.all(
      sources.map(
        (src) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve({ src, width: image.naturalWidth });
            image.onerror = () => resolve({ src, width: 0 });
            image.src = src;
          }),
      ),
    );
  });

  for (const image of decoded) {
    expect(image.width, `${image.src} did not decode`).toBeGreaterThan(0);
  }

  await context.setOffline(false);
});
