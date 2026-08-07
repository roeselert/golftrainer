/**
 * Positioning (CLAUDE.md §1.4, TD6) — the Geolocation API, wrapped.
 *
 * The wrapping earns its place by turning one API into the shape the use cases
 * actually need: **a fix attempt never fails, it only comes back empty**.
 *
 * That inversion is UC1 E1. A golfer taps a club, and the answer to "was there
 * a fix?" must never decide whether the stroke is recorded. Losing the stroke
 * to protect the data model is the worse failure (QG3), so callers get a result
 * they can store either way and a reason they can show.
 */

/**
 * @typedef {object} Position
 * @property {number} latitude
 * @property {number} longitude
 * @property {number | null} accuracy  Metres, as the device reports it.
 * @property {Date | null} fixedAt  Null when nothing measured it — a stroke
 *   placed on a map is a wish, not an observation (UC3 BR2).
 */

/**
 * @typedef {object} Fix
 * @property {Position | null} position
 * @property {'ok' | 'denied' | 'unavailable' | 'timeout' | 'unsupported'} status
 * @property {string} explanation  Plain enough to put on screen unedited.
 */

/**
 * How long the golfer waits before the stroke is recorded without a position.
 * Five seconds is a compromise between a usable fix and a group waiting on the
 * tee — UC1 E1 fixes the number so it is not quietly tuned away later.
 */
const FIX_TIMEOUT_MS = 5_000;

/** Beyond this the fix is worth recording but worth flagging too (UC1 E2). */
export const POOR_ACCURACY_METRES = 20;

/**
 * @param {GeolocationPosition} reading
 * @returns {Position}
 */
function toPosition(reading) {
  return {
    latitude: reading.coords.latitude,
    longitude: reading.coords.longitude,
    accuracy: Number.isFinite(reading.coords.accuracy) ? reading.coords.accuracy : null,
    fixedAt: new Date(reading.timestamp),
  };
}

/**
 * @param {GeolocationPositionError} error
 * @returns {Fix}
 */
function toFailure(error) {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      position: null,
      status: 'denied',
      explanation: 'Location permission is denied, so positions cannot be recorded.',
    };
  }
  if (error.code === error.TIMEOUT) {
    return {
      position: null,
      status: 'timeout',
      explanation: 'No position fix in time — the stroke was saved without one.',
    };
  }
  return {
    position: null,
    status: 'unavailable',
    explanation: 'The device could not produce a position fix.',
  };
}

/**
 * Takes a single fix. Resolves either way; never rejects.
 *
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {Geolocation} [options.geolocation] Injected by tests.
 * @returns {Promise<Fix>}
 */
export function currentFix(options = {}) {
  const timeoutMs = options.timeoutMs ?? FIX_TIMEOUT_MS;
  const geolocation = options.geolocation ?? navigator.geolocation;

  if (!geolocation) {
    return Promise.resolve({
      position: null,
      status: 'unsupported',
      explanation: 'This browser cannot report a position.',
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    /** @param {Fix} fix */
    const finish = (fix) => {
      if (settled) return;
      settled = true;
      resolve(fix);
    };

    // Belt and braces: some browsers have been known to honour neither the
    // `timeout` option nor the error callback when location is switched off at
    // the OS level, and a capture screen that hangs is a capture screen that
    // loses strokes.
    const timer = setTimeout(
      () =>
        finish({
          position: null,
          status: 'timeout',
          explanation: 'No position fix in time — the stroke was saved without one.',
        }),
      timeoutMs,
    );

    geolocation.getCurrentPosition(
      (reading) => {
        clearTimeout(timer);
        finish({ position: toPosition(reading), status: 'ok', explanation: 'Position recorded.' });
      },
      (error) => {
        clearTimeout(timer);
        finish(toFailure(error));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/**
 * @param {Position | null} position
 * @returns {string} a phrase for the screen, never an empty string
 */
export function describeAccuracy(position) {
  if (!position) return 'no position';
  if (position.accuracy === null) return 'accuracy unknown';
  const metres = Math.round(position.accuracy);
  return metres > POOR_ACCURACY_METRES ? `±${metres} m — poor` : `±${metres} m`;
}
