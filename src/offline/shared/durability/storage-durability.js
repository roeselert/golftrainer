/**
 * Storage durability (CLAUDE.md TD8, serving QG3).
 *
 * A round is unrepeatable, so the app has to know whether the browser has
 * actually promised to keep it. Two conditions take iOS eviction off the table:
 * the app is installed to the home screen, and the origin is in persistent mode.
 *
 * The honest-reporting rule matters here. If persistence is refused we say so,
 * rather than letting the golfer believe a round is safe when it is merely
 * best-effort.
 */

/**
 * @typedef {object} DurabilityStatus
 * @property {boolean} persisted   Origin is in persistent mode; only the user can clear it.
 * @property {boolean} installed   Running as an installed app rather than a browser tab.
 * @property {boolean} supported   The Storage API is available at all.
 * @property {'safe' | 'at-risk' | 'unknown'} verdict
 * @property {string} explanation  Plain-language reason, suitable for display.
 */

/**
 * True when running as an installed app rather than a Safari tab. The seven-day
 * cap on script-writable storage applies to origins *in Safari*; home-screen
 * web apps are exempt and keep their own days-of-use counter.
 *
 * @returns {boolean}
 */
export function isInstalled() {
  // iOS reports installation through a non-standard navigator flag; other
  // browsers report it through the display-mode media query.
  if ('standalone' in navigator && typeof navigator.standalone === 'boolean') {
    return navigator.standalone;
  }
  return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Requests persistent storage and reports what the browser actually granted.
 *
 * Safe to call on every start: once an origin is persistent the call is a
 * no-op, and browsers that refuse simply keep refusing.
 *
 * @returns {Promise<DurabilityStatus>}
 */
export async function ensureDurableStorage() {
  const installed = isInstalled();

  if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
    return {
      persisted: false,
      installed,
      supported: false,
      verdict: 'unknown',
      explanation:
        'This browser does not support the Storage API, so it cannot promise to keep your rounds. Export after each round.',
    };
  }

  const alreadyPersisted = await navigator.storage.persisted();
  const persisted = alreadyPersisted || (await navigator.storage.persist());

  if (persisted) {
    return {
      persisted: true,
      installed,
      supported: true,
      verdict: 'safe',
      explanation: 'Your rounds are stored persistently. Only you can clear them.',
    };
  }

  return {
    persisted: false,
    installed,
    supported: true,
    verdict: 'at-risk',
    explanation: installed
      ? 'The browser would not grant persistent storage. Rounds are kept on a best-effort basis and could be cleared if the device runs low on space.'
      : 'Add GolfTrainer to your home screen. In a browser tab, rounds can be cleared after seven days without use.',
  };
}
