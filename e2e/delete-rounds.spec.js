import { expect, test } from '@playwright/test';

/**
 * UC5 A8/A9 — deleting rounds, and deleting a course with them.
 *
 * The whole point of putting this on the catalogue screen rather than on the
 * review screen is that it works with no network (§1.4), so the first test
 * captures and deletes a round in airplane mode. The rest check the thing that
 * makes a destructive button safe: the confirmation, in both answers.
 */

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 53.7, longitude: 9.95, accuracy: 5 },
});

/**
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
 */
async function addCourse(page, name) {
  await page.goto('index.html#/courses');
  await page.locator('#course-name').fill(name);
  await page.locator('#add-9').click();
  await expect(page.locator('.screen__title')).toHaveText(name);
}

/**
 * Plays two strokes on hole 1 and walks away without finishing — the abandoned
 * round that is the commonest reason to want a delete.
 *
 * @param {import('@playwright/test').Page} page
 */
async function trackTwoStrokes(page) {
  await page.goto('index.html#/track');
  await page.locator('#course-choice [data-course]').first().click();
  await expect(page.locator('#club-grid')).toBeVisible();
  await page.locator('[data-club="DRIVER"]').click();
  await expect(page.locator('#tally')).toContainText('1 stroke recorded');
  await page.locator('[data-club="IRON_7"]').click();
  await expect(page.locator('#tally')).toContainText('2 strokes recorded');
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function openCourse(page, name) {
  await page.goto('index.html#/courses');
  await page.locator('#course-list [data-course]').first().click();
  await expect(page.locator('.screen__title')).toHaveText(name);
}

test('UC5 AC12 — a round is deleted from the course, with no network at all', async ({
  page,
  context,
}) => {
  await page.goto('index.html');
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);

  await addCourse(page, 'Gut Kaden');
  await trackTwoStrokes(page);
  await openCourse(page, 'Gut Kaden');

  await expect(page.locator('#course-round-count')).toHaveText('1 round played or planned here');
  const round = page.locator('#course-rounds li').first();
  await expect(round).toContainText('Played');
  await expect(round).toContainText('2 strokes');
  // Unfinished, and deletable anyway — otherwise an abandoned round could never
  // be removed, because it will never be finished.
  await expect(round).toContainText('unfinished');

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('2 strokes');
    return dialog.accept();
  });
  await round.locator('[data-delete-round]').click();

  await expect(page.locator('#course-rounds li')).toHaveCount(0);
  await expect(page.locator('#course-round-count')).toHaveText('No rounds on this course yet.');

  // Still offline, and the round is gone from the store rather than from the
  // screen: the capture screen offers a course to start on, not a round to
  // resume.
  await page.goto('index.html#/track');
  await expect(page.locator('#course-choice')).toBeVisible();
});

test('cancelling the confirmation keeps the round', async ({ page }) => {
  await addCourse(page, 'Treudelberg');
  await trackTwoStrokes(page);
  await openCourse(page, 'Treudelberg');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#course-rounds [data-delete-round]').first().click();

  await expect(page.locator('#course-rounds li')).toHaveCount(1);
  await expect(page.locator('#course-round-count')).toHaveText('1 round played or planned here');
});

test('UC5 A9 — a course is deleted with the rounds played on it, once confirmed', async ({
  page,
}) => {
  await addCourse(page, 'Wendlohe');
  await trackTwoStrokes(page);
  await openCourse(page, 'Wendlohe');

  page.once('dialog', (dialog) => {
    // The sentence names what is about to be destroyed, because the rounds are
    // the part that cannot come back.
    expect(dialog.message()).toContain('1 round');
    return dialog.accept();
  });
  await page.locator('#delete-course').click();

  await expect(page.locator('.screen__title')).toHaveText('Courses');
  await expect(page.locator('#course-list')).toHaveCount(0);
  await expect(page.locator('.notice')).toContainText('No courses yet');
});
