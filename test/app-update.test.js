import assert from 'node:assert/strict';
import test from 'node:test';

import { loadNewVersion } from '../src/shell/app-update.js';

/**
 * A recording stand-in for the browser. Every call is logged in order, because
 * the ordering is the part that matters: unregistering before the caches are
 * gone, or reloading before either, would leave the app in a state the golfer
 * cannot recover from without reception.
 *
 * @param {object} [overrides]
 * @param {boolean} [overrides.online]
 * @param {string[]} [overrides.cacheNames]
 * @param {boolean} [overrides.supportsCaches]
 * @param {boolean} [overrides.supportsServiceWorker]
 */
function fakeBrowser({
  online = true,
  cacheNames = ['golftrainer-v1'],
  supportsCaches = true,
  supportsServiceWorker = true,
} = {}) {
  /** @type {string[]} */
  const calls = [];
  const remaining = new Set(cacheNames);
  let unregistered = 0;

  const environment = {
    cacheStorage: supportsCaches
      ? {
          keys: async () => {
            calls.push('caches.keys');
            return [...remaining];
          },
          delete: async (/** @type {string} */ name) => {
            calls.push(`caches.delete:${name}`);
            return remaining.delete(name);
          },
        }
      : undefined,
    serviceWorker: supportsServiceWorker
      ? {
          getRegistrations: async () => {
            calls.push('sw.getRegistrations');
            return [
              {
                unregister: async () => {
                  calls.push('sw.unregister');
                  unregistered += 1;
                  return true;
                },
              },
            ];
          },
        }
      : undefined,
    isOnline: () => online,
    reload: () => {
      calls.push('reload');
    },
  };

  return {
    environment,
    calls,
    remainingCaches: () => [...remaining],
    unregisteredCount: () => unregistered,
  };
}

test('clears every cache, unregisters the worker, then reloads — in that order', async () => {
  const browser = fakeBrowser({ cacheNames: ['golftrainer-v1', 'stale-v0'] });

  const outcome = await loadNewVersion(browser.environment);

  assert.equal(outcome.status, 'reloading');
  assert.equal(outcome.cachesCleared, 2);
  assert.deepEqual(browser.remainingCaches(), [], 'no cache may survive');
  assert.equal(browser.unregisteredCount(), 1);

  const order = browser.calls;
  assert.ok(
    order.indexOf('sw.unregister') < order.indexOf('reload'),
    'the worker must be unregistered before the reload, or the old one keeps serving',
  );
  assert.ok(
    order.indexOf('caches.delete:golftrainer-v1') < order.indexOf('sw.unregister'),
    'caches must be gone before the worker is released',
  );
  assert.equal(order.at(-1), 'reload', 'the reload must be last');
});

test('refuses when offline, and changes nothing', async () => {
  const browser = fakeBrowser({ online: false });

  const outcome = await loadNewVersion(browser.environment);

  assert.equal(outcome.status, 'refused-offline');
  assert.equal(outcome.cachesCleared, 0);
  assert.match(outcome.message, /offline/i);

  // This is the assertion the whole guard exists for. Deleting the precache
  // with no network would brick the app on the course.
  assert.deepEqual(browser.calls, [], 'nothing may be touched while offline');
  assert.deepEqual(browser.remainingCaches(), ['golftrainer-v1']);
  assert.equal(browser.unregisteredCount(), 0);
});

test('reports honestly when the Cache API is missing, and does not reload', async () => {
  const browser = fakeBrowser({ supportsCaches: false });

  const outcome = await loadNewVersion(browser.environment);

  assert.equal(outcome.status, 'unsupported');
  assert.equal(outcome.cachesCleared, 0);
  assert.ok(!browser.calls.includes('reload'), 'a pointless reload would just look broken');
});

test('still clears caches when service workers are unavailable', async () => {
  const browser = fakeBrowser({ supportsServiceWorker: false });

  const outcome = await loadNewVersion(browser.environment);

  assert.equal(outcome.status, 'reloading');
  assert.deepEqual(browser.remainingCaches(), []);
  assert.ok(browser.calls.includes('reload'));
});

test('succeeds when there is nothing cached yet', async () => {
  const browser = fakeBrowser({ cacheNames: [] });

  const outcome = await loadNewVersion(browser.environment);

  assert.equal(outcome.status, 'reloading');
  assert.equal(outcome.cachesCleared, 0);
  assert.ok(browser.calls.includes('reload'));
});
