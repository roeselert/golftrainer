import { expect, test } from '@playwright/test';

/**
 * UC2 and UC3 in a real browser.
 *
 * One honest limitation, stated here rather than discovered later: the
 * orthophoto services are not reachable from CI, so these tests verify the map
 * is built, centred and drawn — the geometry, the attribution, the stroke
 * stacking — and never that a tile arrived. Whether the imagery is any good on
 * a real course is a question for a human with a browser (TD7a, OPEN-10).
 */

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 53.7, longitude: 9.95, accuracy: 5 },
});

/**
 * Captures a small round through the UI, so the review screens read exactly
 * what UC1 wrote rather than a fixture that might drift from it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {boolean} [options.withPenalty]
 */
async function captureRound(page, { withPenalty = false } = {}) {
  const context = page.context();

  await page.goto('index.html#/courses');
  await page.locator('#course-name').fill('Gut Kaden');
  await page.locator('#add-18').click();
  await page.locator('[data-capture-tee="1"]').click();
  await expect(page.locator('.notice--ok')).toBeVisible();

  await page.goto('index.html#/track');
  await page.locator('#course-choice [data-course]').first().click();
  await page.locator('[data-club="DRIVER"]').click();
  await expect(page.locator('#tally')).toHaveText('1 stroke recorded');

  if (withPenalty) {
    // Same spot, same club, no movement: a penalty (UC1 A6). The golfer has to
    // actually not move for this to be the thing it claims to be, so the
    // geolocation is left exactly where the previous stroke was.
    await page.locator('[data-club="DRIVER"]').click();
    await expect(page.locator('#tally')).toHaveText('2 strokes recorded');
  }

  // And then they walk to the ball — otherwise every stroke of the round lands
  // on one spot and the stacking assertion below would mean nothing.
  await context.setGeolocation({ latitude: 53.704, longitude: 9.954, accuracy: 5 });
  await page.locator('[data-club="IRON_7"]').click();
  await expect(page.locator('#tally')).toHaveText(
    withPenalty ? '3 strokes recorded' : '2 strokes recorded',
  );

  await page.locator('[data-putts="2"]').click();
  await expect(page.locator('.screen__title')).toHaveText('Hole 2');
}

test('UC2 AC1 — a captured round is shown as overview, table and map', async ({ page }) => {
  await captureRound(page);

  await page.goto('index.html#/rounds');
  await expect(page.locator('#round-list li')).toHaveCount(1);
  await page.locator('#round-list [data-round]').first().click();

  await expect(page.locator('.screen__subtitle')).toContainText('Played');
  await expect(page.locator('.screen__subtitle')).toContainText('4 strokes');

  // Overview: one row per hole, with the total that includes putts.
  const overview = page.locator('#overview-table tbody tr');
  await expect(overview).toHaveCount(1);
  await expect(overview.first()).toContainText('4');

  // Table: one row per recorded stroke, with its club.
  await expect(page.locator('#stroke-table tbody tr')).toHaveCount(2);
  await expect(page.locator('#stroke-table tbody')).toContainText('Driver');
  await expect(page.locator('#stroke-table tbody')).toContainText('7 iron');

  // Map: built and attributed, whether or not a tile ever arrives.
  await expect(page.locator('#round-map')).toBeVisible();
  await expect(page.locator('.attribution')).toContainText('Esri');
  await expect(page.locator('#round-map .leaflet-marker-icon').first()).toBeVisible();
});

test('UC2 AC7 — a penalty is two rows in the table and one stack on the map', async ({ page }) => {
  await captureRound(page, { withPenalty: true });

  await page.goto('index.html#/rounds');
  await page.locator('#round-list [data-round]').first().click();

  // Both strokes are their own row: nothing merged them.
  await expect(page.locator('#stroke-table tbody tr')).toHaveCount(3);
  const driverRows = page.locator('#stroke-table tbody tr', { hasText: 'Driver' });
  await expect(driverRows).toHaveCount(2);

  // And the map says the spot carries two, rather than drawing one marker.
  await expect(page.locator('#round-map')).toContainText('2 strokes here');
});

test('UC2 AC3 — a stroke with no position keeps its row and says so', async ({ page, context }) => {
  await page.goto('index.html#/courses');
  await page.locator('#course-name').fill('Treudelberg');
  await page.locator('#add-9').click();
  await page.locator('[data-capture-tee="1"]').click();
  await expect(page.locator('.notice--ok')).toBeVisible();

  await page.goto('index.html#/track');
  await page.locator('#course-choice [data-course]').first().click();
  await page.locator('[data-club="DRIVER"]').click();
  await expect(page.locator('#tally')).toHaveText('1 stroke recorded');

  await context.setGeolocation(undefined);
  await page.locator('[data-club="IRON_9"]').click();
  await expect(page.locator('#tally')).toHaveText('2 strokes recorded', { timeout: 15_000 });

  await page.goto('index.html#/rounds');
  await page.locator('#round-list [data-round]').first().click();

  await expect(page.locator('#stroke-table tbody tr')).toHaveCount(2);
  await expect(page.locator('#stroke-table tbody')).toContainText('no position');
  await expect(page.locator('.notice--warn')).toContainText('no position on this hole');
});

test('UC3 AC1/AC2 — a hole is planned on the map, and stored as a plan', async ({ page }) => {
  await page.goto('index.html#/courses');
  await page.locator('#course-name').fill('Gut Kaden');
  await page.locator('#add-18').click();
  await page.locator('[data-capture-tee="1"]').click();
  await expect(page.locator('.notice--ok')).toBeVisible();

  await page.goto('index.html#/plan');
  await page.locator('#plan-course-choice [data-course]').first().click();
  await expect(page.locator('.screen__title')).toHaveText('Plan hole 1');
  await expect(page.locator('#plan-map')).toBeVisible();

  // Pick a club, then tap where the ball should finish.
  await page.locator('#plan-clubs [data-club="DRIVER"]').click();
  await page.locator('#plan-map').click({ position: { x: 200, y: 150 } });
  await expect(page.locator('#plan-strokes li')).toHaveCount(1);

  await page.locator('#plan-clubs [data-club="IRON_8"]').click();
  await page.locator('#plan-map').click({ position: { x: 260, y: 120 } });
  await expect(page.locator('#plan-strokes li')).toHaveCount(2);
  await expect(page.locator('#plan-strokes')).toContainText('8 iron');

  await page.locator('.putts__grid [data-putts="2"]').click();
  await expect(page.locator('.screen__title')).toHaveText('Plan hole 2');

  // Read back: a plan, with no accuracy on its strokes (BR2).
  await page.goto('index.html#/rounds');
  await expect(page.locator('#round-list')).toContainText('Planned');
  await page.locator('#round-list [data-round]').first().click();

  const rows = page.locator('#stroke-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('td').nth(4)).toHaveText('');
});

test('UC3 AC5 — a hole with no tee asks for one and writes it to the catalogue', async ({
  page,
}) => {
  await page.goto('index.html#/courses');
  await page.locator('#course-name').fill('Wendlohe');
  await page.locator('#add-9').click();
  await page.locator('[data-capture-tee="1"]').click();
  await expect(page.locator('.notice--ok')).toBeVisible();

  await page.goto('index.html#/plan');
  await page.locator('#plan-course-choice [data-course]').first().click();
  await page.locator('.putts__grid [data-putts="0"]').click();

  // Hole 2 has no tee, so the planner asks for one rather than guessing.
  await expect(page.locator('.screen__title')).toHaveText('Plan hole 2');
  await expect(page.locator('.notice--info')).toContainText('no tee position yet');

  await page.locator('#plan-map').click({ position: { x: 220, y: 160 } });

  // It went to the catalogue, where UC1 will find it on the course.
  await page.goto('index.html#/courses');
  await page.locator('#course-list [data-course]').first().click();
  await expect(page.locator('#hole-list li').nth(1)).toContainText('Tee set');
});

test('UC3 AC3 — planning refuses to run offline instead of opening a mapless fallback', async ({
  page,
  context,
}) => {
  await page.goto('index.html');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 90_000,
  });

  await context.setOffline(true);
  await page.goto('index.html#/plan');

  await expect(page.locator('.screen__title')).toHaveText('Not available');
  await expect(page.locator('#plan-map')).toHaveCount(0);

  await context.setOffline(false);
});

test('UC3 BR10 — each planned stroke shows how far it has to carry', async ({ page }) => {
  await page.goto('index.html#/courses');
  await page.locator('#course-name').fill('Gut Kaden');
  await page.locator('#add-18').click();
  await page.locator('[data-capture-tee="1"]').click();
  await expect(page.locator('.notice--ok')).toBeVisible();

  await page.goto('index.html#/plan');
  await page.locator('#plan-course-choice [data-course]').first().click();
  await expect(page.locator('#plan-map')).toBeVisible();

  const box = await page.locator('#plan-map').boundingBox();
  const centreX = (box?.width ?? 400) / 2;
  const centreY = (box?.height ?? 400) / 2;

  // The map opens centred on the tee, so a tap at the centre is a stroke of
  // roughly zero — and one a little away from it is a measurable distance.
  await page.locator('#plan-map').click({ position: { x: centreX + 60, y: centreY } });
  await page.locator('#plan-map').click({ position: { x: centreX + 100, y: centreY } });

  const first = page.locator('#plan-strokes [data-sequence="1"] .row__distance');
  const second = page.locator('#plan-strokes [data-sequence="2"] .row__distance');

  // The first leg names the tee; the rest are from the stroke before.
  await expect(first).toContainText('from tee');
  await expect(first).toContainText('m');
  await expect(second).not.toContainText('from tee');
  await expect(second).toContainText('m');

  /** @param {string | null} text */
  const metres = (text) => Number((text ?? '').replace(/[^0-9.]/g, ''));

  const firstLeg = metres(await first.textContent());
  const secondLeg = metres(await second.textContent());

  // Both taps were on the same horizontal line, the second 40 px further out
  // than the first was from the tee — so the second leg is the shorter one.
  expect(firstLeg).toBeGreaterThan(0);
  expect(secondLeg).toBeGreaterThan(0);
  expect(secondLeg).toBeLessThan(firstLeg);

  // And the total is the sum of the legs, not a separate guess.
  const total = metres(await page.locator('#plan-total .row__distance').textContent());
  expect(Math.abs(total - (firstLeg + secondLeg))).toBeLessThanOrEqual(1);
});

test('a planned stroke keeps its distance when the marker is dragged', async ({ page }) => {
  await page.goto('index.html#/courses');
  await page.locator('#course-name').fill('Treudelberg');
  await page.locator('#add-9').click();
  await page.locator('[data-capture-tee="1"]').click();
  await expect(page.locator('.notice--ok')).toBeVisible();

  await page.goto('index.html#/plan');
  await page.locator('#plan-course-choice [data-course]').first().click();
  await page.locator('#plan-map').click({ position: { x: 220, y: 150 } });

  const distance = page.locator('#plan-strokes [data-sequence="1"] .row__distance');
  const before = await distance.textContent();

  // Drag the placed stroke further from the tee; the distance must follow.
  const marker = page.locator('#plan-map .leaflet-marker-draggable').first();
  await marker.dragTo(page.locator('#plan-map'), { targetPosition: { x: 320, y: 150 } });

  await expect(distance).not.toHaveText(before ?? '');
  await expect(distance).toContainText('from tee');
});
