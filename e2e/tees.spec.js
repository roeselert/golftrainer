import { expect, test } from '@playwright/test';

/**
 * UC5 A2 — placing tee positions on a map, from the couch.
 *
 * The tile services are unreachable from CI, so these tests check the parts
 * that are ours: that the screen opens from the catalogue, that a tap writes a
 * tee, that the selection advances so eighteen taps place eighteen tees, and
 * that the write lands in the same catalogue the on-course capture writes to.
 */

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 53.7, longitude: 9.95, accuracy: 5 },
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {'9' | '18'} holes
 */
async function addCourse(page, name, holes) {
  await page.goto('index.html#/courses');
  await page.locator('#course-name').fill(name);
  await page.locator(`#add-${holes}`).click();
  await expect(page.locator('.screen__title')).toHaveText(name);
}

test('the tee map is reachable from the course, and places a tee per tap', async ({ page }) => {
  await addCourse(page, 'Gut Kaden', '9');

  await page.locator('#place-tees-on-map').click();

  await expect(page.locator('.screen__title')).toHaveText('Gut Kaden');
  await expect(page.locator('#tee-map')).toBeVisible();
  await expect(page.locator('#tee-holes .hole-chip')).toHaveCount(9);
  await expect(page.locator('#tee-status')).toContainText('0 of 9 tees placed');

  // Hole 1 is selected to begin with, because it is the first without a tee.
  await expect(page.locator('[data-tee-hole="1"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#tee-map').click({ position: { x: 200, y: 160 } });
  await expect(page.locator('#tee-status')).toContainText('1 of 9 tees placed');

  // The selection moved on by itself, so the next tap places the next tee.
  await expect(page.locator('[data-tee-hole="2"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#tee-map').click({ position: { x: 260, y: 200 } });
  await expect(page.locator('#tee-status')).toContainText('2 of 9 tees placed');
  await expect(page.locator('#tee-map .leaflet-marker-icon')).toHaveCount(2);
});

test('a tee placed on the map is the same tee the course screen shows', async ({ page }) => {
  await addCourse(page, 'Treudelberg', '9');
  await page.locator('#place-tees-on-map').click();

  await page.locator('[data-tee-hole="4"]').click();
  await page.locator('#tee-map').click({ position: { x: 220, y: 150 } });
  await expect(page.locator('#tee-status')).toContainText('1 of 9 tees placed');

  // Back to the offline catalogue screen: one write, one catalogue.
  await page.goto('index.html#/courses');
  await page.locator('#course-list [data-course]').first().click();
  await expect(page.locator('#hole-list li').nth(3)).toContainText('Tee set');
  await expect(page.locator('#hole-list li').first()).toContainText('No tee position');
});

test('the map screen is refused offline, and the course still works', async ({ page, context }) => {
  await addCourse(page, 'Wendlohe', '9');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 90_000,
  });

  await context.setOffline(true);
  await page.goto('index.html#/courses');
  await page.locator('#course-list [data-course]').first().click();
  await page.locator('#place-tees-on-map').click();

  await expect(page.locator('.screen__title')).toHaveText('Not available');
  await expect(page.locator('#tee-map')).toHaveCount(0);

  // The offline half is untouched: capturing a tee where you stand still works.
  await page.goto('index.html#/courses');
  await page.locator('#course-list [data-course]').first().click();
  await page.locator('[data-capture-tee="1"]').click();
  await expect(page.locator('.notice--ok')).toContainText('Hole 1 tee recorded');

  await context.setOffline(false);
});
