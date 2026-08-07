import { expect, test } from '@playwright/test';

/**
 * The burger menu, and the one item behind it that does something.
 */

/** @param {import('@playwright/test').Page} page */
async function waitForServiceWorkerControl(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 90_000,
  });
}

test('opens, closes, and offers four destinations', async ({ page }) => {
  await page.goto('index.html');

  const toggle = page.locator('#menu-toggle');
  const menu = page.locator('#menu');

  await expect(menu).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();
  await expect(menu).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.locator('button[data-action]')).toHaveCount(4);

  // Escape closes and hands focus back, so the menu is escapable one-handed.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(5, 400);
  await expect(menu).toBeHidden();
});

test('shows the unbuilt destinations as disabled rather than pretending', async ({ page }) => {
  await page.goto('index.html');
  await page.locator('#menu-toggle').click();

  for (const action of ['track-round', 'plan-round', 'manage-courses']) {
    await expect(page.locator(`[data-action="${action}"]`)).toBeDisabled();
  }
  await expect(page.locator('[data-action="load-new-version"]')).toBeEnabled();
});

test('car mode: every menu target is big enough to hit with a glove on', async ({ page }) => {
  await page.goto('index.html');
  await page.locator('#menu-toggle').click();

  // QG2 is a claim about physical size, so measure it rather than trust the CSS.
  const items = await page.locator('#menu button[data-action]').all();
  for (const item of items) {
    const box = await item.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  }

  const burger = await page.locator('#menu-toggle').boundingBox();
  expect(burger?.height ?? 0).toBeGreaterThanOrEqual(48);
  expect(burger?.width ?? 0).toBeGreaterThanOrEqual(48);
});

test('loading a new version reinstalls the app and keeps the round', async ({ page }) => {
  await page.goto('index.html');
  await waitForServiceWorkerControl(page);

  // Stand in for a round in progress. This is the assertion that matters:
  // clearing the app cache must never touch what the golfer recorded (QG3).
  await page.evaluate(async () => {
    const { openDatabase } = await import('./src/offline/shared/store/database.js');
    const db = await openDatabase();
    await db.exec('CREATE TABLE IF NOT EXISTS update_probe (note text)');
    await db.query('INSERT INTO update_probe (note) VALUES ($1)', ['round in progress']);
  });

  // Stamp the current document so the reload can be detected. Waiting on the
  // service worker alone is not enough: the page being replaced is still
  // controlled by its own worker, so the controller check passes instantly and
  // everything after it races the navigation.
  await page.evaluate(() => {
    Object.assign(window, { __documentBeforeUpdate: true });
  });

  await page.locator('#menu-toggle').click();
  await page.locator('[data-action="load-new-version"]').click();

  // The reload replaces the document, then re-registers the worker and
  // precaches from scratch. Both have to finish before anything is asserted.
  await page.waitForFunction(() => !('__documentBeforeUpdate' in window), null, {
    timeout: 90_000,
  });
  await page.waitForLoadState('load');
  await waitForServiceWorkerControl(page);

  await expect(page.locator('.status--fail')).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('PostgreSQL');

  const rows = await page.evaluate(async () => {
    const { openDatabase } = await import('./src/offline/shared/store/database.js');
    const db = await openDatabase();
    const result = await db.query('SELECT note FROM update_probe');
    return result.rows;
  });

  expect(rows).toEqual([{ note: 'round in progress' }]);
});

test('refuses to load a new version while offline', async ({ page, context }) => {
  await page.goto('index.html');
  await waitForServiceWorkerControl(page);

  await context.setOffline(true);

  await page.locator('#menu-toggle').click();
  await page.locator('[data-action="load-new-version"]').click();

  // Deleting the precache with no network would brick the app until the golfer
  // found reception — exactly the failure QG1 exists to prevent.
  await expect(page.locator('#status')).toContainText('offline');

  const cacheCount = await page.evaluate(async () => (await caches.keys()).length);
  expect(cacheCount).toBeGreaterThan(0);

  const controller = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  expect(controller).toBe(true);

  await context.setOffline(false);
});
