/**
 * Distances between positions.
 *
 * Domain logic, not map logic, which is why it is here and not in
 * `src/online/map/`: how far apart two strokes are is a fact about the round,
 * true whether or not anything is being drawn. The planner shows it today; the
 * review screen and a plan-versus-actual comparison (UC4) would want the same
 * function rather than their own.
 */

/** Mean Earth radius, metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * @param {number} degrees
 * @returns {number}
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two positions, in metres.
 *
 * Haversine rather than a planar approximation. Not because the curvature
 * matters over a golf hole — it does not, at these distances the difference is
 * millimetres — but because a formula that is right everywhere costs the same
 * as one that is right near the equator, and this one cannot be wrong at a
 * latitude nobody tested.
 *
 * @param {{ latitude: number, longitude: number } | null | undefined} from
 * @param {{ latitude: number, longitude: number } | null | undefined} to
 * @returns {number | null} null when either end is missing (UC1 E1)
 */
export function distanceInMetres(from, to) {
  if (!from || !to) return null;

  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Metres, rounded the way a golfer reads a yardage.
 *
 * Whole metres below 1 km: a golf shot is never interesting to a decimal place,
 * and a GNSS fix is not accurate to one either.
 *
 * @param {number | null} metres
 * @returns {string | null}
 */
export function formatDistance(metres) {
  if (metres === null) return null;
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

/**
 * The distance each stroke covered: from the tee for the first, from the
 * previous stroke for the rest.
 *
 * That is the same "where the ball came to rest" semantics the whole model
 * rests on (UC1 BR1) — stroke *n* travelled from wherever stroke *n-1* left the
 * ball. A stroke with no position breaks the chain rather than inventing one:
 * its own distance is null, and so is the next one's, because neither end of
 * that leg is known.
 *
 * @param {{ latitude: number, longitude: number } | null} teePosition
 * @param {{ position: { latitude: number, longitude: number } | null }[]} strokes
 * @returns {(number | null)[]} one entry per stroke, in order
 */
export function legDistances(teePosition, strokes) {
  let previous = teePosition;

  return strokes.map((stroke) => {
    const distance = distanceInMetres(previous, stroke.position);
    previous = stroke.position;
    return distance;
  });
}
