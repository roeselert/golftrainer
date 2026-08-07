import { expect, test } from '@playwright/test';

/**
 * UC5 and UC1 in a real browser, in airplane mode.
 *
 * This is the suite that answers the central claim of the product: a golfer can
 * add a course and capture a whole round with no network at any point. Unit
 * tests cover the rules; only a browser can cover the promise.
 */

/**
 * A worker reports `activated` before `clients.claim()` resolves, and in that
 * window it intercepts nothing. Because `addAll` is atomic, a controlling
 * worker also means the whole shell is on the device.
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForServiceWorkerControl(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 90_000,
  });
}

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

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 53.7, longitude: 9.95, accuracy: 5 },
});

test('UC5 AC1 — a course is added with no network at all', async ({ page, context }) => {
  await page.goto('index.html');
  await waitForServiceWorkerControl(page);

  await context.setOffline(true);

  await addCourse(page, 'Gut Kaden', '18');
  await expect(page.locator('#hole-list li')).toHaveCount(18);
  await expect(page.locator('#hole-list li').first()).toContainText('No tee position');

  await context.setOffline(false);
});

test('UC5 AC3 — a tee is captured from the current fix', async ({ page }) => {
  await addCourse(page, 'Treudelberg', '9');

  await page.locator('[data-capture-tee="1"]').click();

  await expect(page.locator('.notice--ok')).toContainText('Hole 1 tee recorded');
  await expect(page.locator('#hole-list li').first()).toContainText('Tee set');
  await expect(page.locator('[data-capture-tee="1"]')).toHaveText('Recapture');
});

test('UC5 AC5 — a duplicate name is refused with a reason', async ({ page }) => {
  await addCourse(page, 'Gut Kaden', '18');

  await page.goto('index.html#/courses');
  await page.locator('#course-name').fill('gut kaden');
  await page.locator('#add-18').click();

  await expect(page.locator('.notice--fail')).toContainText('already a course called');
  await expect(page.locator('#course-list li')).toHaveCount(1);
});

test('UC1 AC2/AC9 — a hole is captured one tap at a time, offline', async ({ page, context }) => {
  await page.goto('index.html');
  await waitForServiceWorkerControl(page);
  await addCourse(page, 'Gut Kaden', '18');

  // Everything from here happens with the network cut.
  await context.setOffline(true);

  /** @type {string[]} */
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('index.html#/track');
  await page.locator('#course-choice [data-course]').first().click();
  await expect(page.locator('.screen__title')).toHaveText('Hole 1');

  await page.locator('[data-club="DRIVER"]').click();
  await expect(page.locator('#tally')).toHaveText('1 stroke recorded');
  await expect(page.locator('#last-stroke')).toContainText('1. Driver');

  await page.locator('[data-club="IRON_7"]').click();
  await page.locator('[data-club="SAND_WEDGE"]').click();
  await expect(page.locator('#tally')).toHaveText('3 strokes recorded');

  await page.locator('[data-putts="2"]').click();
  await expect(page.locator('.screen__title')).toHaveText('Hole 2');

  // No request left the app for anything but its own precached files.
  const external = requests.filter(
    (url) => !url.includes('127.0.0.1') && !url.includes('localhost'),
  );
  expect(external).toEqual([]);

  await context.setOffline(false);
});

test('UC1 AC8 — a mis-tap is undone before it becomes the record', async ({ page }) => {
  await addCourse(page, 'Gut Kaden', '18');
  await page.goto('index.html#/track');
  await page.locator('#course-choice [data-course]').first().click();

  await page.locator('[data-club="DRIVER"]').click();
  await page.locator('[data-club="LOB_WEDGE"]').click();
  await expect(page.locator('#tally')).toHaveText('2 strokes recorded');

  await page.locator('#undo-stroke').click();

  await expect(page.locator('#tally')).toHaveText('1 stroke recorded');
  await expect(page.locator('#last-stroke')).toBeHidden();
});

test('UC1 AC3 — a round in progress survives the page being closed', async ({ page, context }) => {
  await addCourse(page, 'Gut Kaden', '18');
  await page.goto('index.html#/track');
  await page.locator('#course-choice [data-course]').first().click();
  await page.locator('[data-club="DRIVER"]').click();
  await page.locator('[data-club="IRON_6"]').click();
  await expect(page.locator('#tally')).toHaveText('2 strokes recorded');

  await page.close();

  // A cold start, the way a golfer comes back after locking their phone.
  const revisit = await context.newPage();
  await revisit.goto('index.html#/track');

  await expect(revisit.locator('.screen__title')).toHaveText('Hole 1');
  await expect(revisit.locator('#tally')).toHaveText('2 strokes recorded');
});

test('UC1 AC10 — a penalty is one more tap and nothing else', async ({ page }) => {
  await addCourse(page, 'Gut Kaden', '18');
  await page.goto('index.html#/track');
  await page.locator('#course-choice [data-course]').first().click();

  await page.locator('[data-club="DRIVER"]').click();
  // Into the water: tap the same club again without moving.
  await page.locator('[data-club="DRIVER"]').click();

  await expect(page.locator('#tally')).toHaveText('2 strokes recorded');
  await expect(page.locator('#last-stroke')).toContainText('2. Driver');
});

test('UC1 AC11 — every club is reachable with a glove on', async ({ page }) => {
  await addCourse(page, 'Gut Kaden', '18');
  await page.goto('index.html#/track');
  await page.locator('#course-choice [data-course]').first().click();

  const clubs = page.locator('#club-grid .club');
  await expect(clubs).toHaveCount(12);

  // QG2 is a claim about physical size, so measure it rather than trust the CSS.
  for (const club of await clubs.all()) {
    const box = await club.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
  }

  // And all twelve are on screen without scrolling for the last one.
  await expect(clubs.last()).toBeInViewport();
});

test('UC1 AC5 — with no fix the stroke is still recorded, and says so', async ({
  page,
  context,
}) => {
  await addCourse(page, 'Gut Kaden', '18');

  // Permission granted but no position obtainable: the timeout path (E1).
  await context.setGeolocation(undefined);

  await page.goto('index.html#/track');
  await page.locator('#course-choice [data-course]').first().click();
  await page.locator('[data-club="IRON_5"]').click();

  await expect(page.locator('#tally')).toHaveText('1 stroke recorded', { timeout: 15_000 });
  await expect(page.locator('#last-stroke')).toContainText('no position');
});

test('the offline shell refuses the online screens rather than half-loading them', async ({
  page,
  context,
}) => {
  await page.goto('index.html');
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);

  await page.goto('index.html#/rounds');

  await expect(page.locator('.screen__title')).toHaveText('Not available');
  await expect(page.locator('.notice--warn')).toContainText('network');

  await context.setOffline(false);
});
