/**
 * "Load new version" — discard the cached app shell and reinstall it.
 *
 * With no build step and no version banner, there is nothing to tell a golfer
 * that the copy on their phone is stale. This is the manual escape hatch.
 *
 * Two properties matter more than the feature itself:
 *
 * **It must not touch the golfer's data.** Only the Cache Storage API is
 * cleared — the precached app shell and the PGlite runtime. Rounds live in
 * IndexedDB and are never referenced here. QG3 says a round is unrepeatable, so
 * an update button that could eat one would be worse than no update button.
 *
 * **It must refuse to run offline.** Deleting the precache with no network
 * leaves nothing to reinstall from: the app would be bricked until the golfer
 * found reception. That is the exact failure QG1 exists to prevent, so being
 * offline is a hard refusal rather than a warning.
 *
 * The browser APIs are injected rather than reached for, so the refusal and the
 * ordering can be tested without a browser.
 */

/**
 * @typedef {object} UpdateEnvironment
 * @property {Pick<CacheStorage, 'keys' | 'delete'> | undefined} cacheStorage
 * @property {{ getRegistrations: () => Promise<readonly { unregister: () => Promise<boolean> }[]> } | undefined} serviceWorker
 * @property {() => boolean} isOnline
 * @property {() => void} reload
 */

/**
 * @typedef {object} UpdateOutcome
 * @property {'reloading' | 'refused-offline' | 'unsupported'} status
 * @property {number} cachesCleared
 * @property {string} message  Plain language, suitable for display.
 */

/**
 * @param {UpdateEnvironment} environment
 * @returns {Promise<UpdateOutcome>}
 */
export async function loadNewVersion(environment) {
  if (!environment.isOnline()) {
    return {
      status: 'refused-offline',
      cachesCleared: 0,
      message:
        'You are offline. Loading a new version would delete the copy on this device with nothing to replace it from — try again when you have a connection.',
    };
  }

  if (!environment.cacheStorage) {
    return {
      status: 'unsupported',
      cachesCleared: 0,
      message: 'This browser does not support the Cache API, so there is nothing to clear.',
    };
  }

  const names = await environment.cacheStorage.keys();
  await Promise.all(names.map((name) => environment.cacheStorage?.delete(name)));

  // Unregistering matters as much as clearing. A worker left active with an
  // empty cache would serve from the network and never rebuild the precache,
  // so the app would look fine until the golfer next lost reception. On reload
  // a fresh worker installs and precaches from scratch.
  if (environment.serviceWorker) {
    const registrations = await environment.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  environment.reload();

  return {
    status: 'reloading',
    cachesCleared: names.length,
    message: 'Reloading and reinstalling the latest version. Your rounds are not affected.',
  };
}

/**
 * The real browser environment. Kept separate so `loadNewVersion` stays a pure
 * function of its inputs.
 *
 * @returns {UpdateEnvironment}
 */
export function browserEnvironment() {
  return {
    cacheStorage: 'caches' in globalThis ? caches : undefined,
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    isOnline: () => navigator.onLine,
    reload: () => window.location.reload(),
  };
}
