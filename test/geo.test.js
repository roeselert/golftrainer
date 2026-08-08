import assert from 'node:assert/strict';
import test from 'node:test';

import {
  distanceInMetres,
  formatDistance,
  legDistances,
} from '../src/offline/shared/domain/geo.js';

/**
 * @param {number} latitude
 * @param {number} longitude
 * @returns {{ latitude: number, longitude: number }}
 */
function at(latitude, longitude) {
  return { latitude, longitude };
}

test('one degree of latitude is the meridian distance, wherever you measure it', () => {
  // 2πR/360 for the mean Earth radius. True at the equator and at the pole,
  // which is the property a planar approximation would not have.
  const expected = 111_194.9;

  assert.ok(Math.abs(/** @type {number} */ (distanceInMetres(at(0, 0), at(1, 0))) - expected) < 1);
  assert.ok(
    Math.abs(/** @type {number} */ (distanceInMetres(at(53, 10), at(54, 10))) - expected) < 1,
  );
});

test('a degree of longitude shrinks with latitude', () => {
  const equator = /** @type {number} */ (distanceInMetres(at(0, 0), at(0, 1)));
  const hamburg = /** @type {number} */ (distanceInMetres(at(53.55, 10), at(53.55, 11)));

  assert.ok(Math.abs(equator - 111_194.9) < 1);
  // cos(53.55°) ≈ 0.5934
  assert.ok(Math.abs(hamburg - equator * Math.cos((53.55 * Math.PI) / 180)) < 60);
});

test('a drive is a plausible number of metres', () => {
  // Two points about 230 m apart on a Hamburg-latitude fairway.
  const distance = /** @type {number} */ (distanceInMetres(at(53.7, 9.95), at(53.702, 9.9508)));

  assert.ok(distance > 220 && distance < 240, `expected roughly 230 m, got ${distance}`);
});

test('the same position is zero, not a rounding artefact', () => {
  assert.equal(distanceInMetres(at(53.7, 9.95), at(53.7, 9.95)), 0);
});

test('a missing position has no distance rather than a wrong one', () => {
  assert.equal(distanceInMetres(null, at(53.7, 9.95)), null);
  assert.equal(distanceInMetres(at(53.7, 9.95), null), null);
  assert.equal(distanceInMetres(undefined, undefined), null);
});

test('distances read the way a golfer reads a yardage', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(212.4), '212 m');
  assert.equal(formatDistance(212.6), '213 m');
  assert.equal(formatDistance(1250), '1.3 km');
  assert.equal(formatDistance(null), null);
});

test('the first leg is measured from the tee, the rest from the stroke before', () => {
  const tee = at(53.7, 9.95);
  const strokes = [
    { position: at(53.702, 9.9508) },
    { position: at(53.7035, 9.9514) },
    { position: at(53.7038, 9.9515) },
  ];

  const legs = legDistances(tee, strokes).map((metres) => Math.round(metres ?? Number.NaN));
  const [drive, approach, chip] = legs;

  assert.equal(legs.length, 3);
  assert.ok(drive !== undefined && approach !== undefined && chip !== undefined);
  // Descending: a drive, an approach, a chip — each shorter than the last.
  assert.ok(drive > approach && approach > chip);
  assert.ok(drive > 200 && drive < 250);
  assert.ok(chip < 60);
});

test('a hole with no tee position still measures the legs between strokes', () => {
  const strokes = [{ position: at(53.7, 9.95) }, { position: at(53.702, 9.9508) }];

  const legs = legDistances(null, strokes);

  // The first leg is unknown — nothing says where the ball started.
  assert.equal(legs[0], null);
  assert.ok(/** @type {number} */ (legs[1]) > 200);
});

test('a stroke with no position breaks the chain rather than bridging it', () => {
  const tee = at(53.7, 9.95);
  const strokes = [
    { position: at(53.702, 9.9508) },
    { position: null },
    { position: at(53.7035, 9.9514) },
  ];

  const legs = legDistances(tee, strokes);

  assert.ok(/** @type {number} */ (legs[0]) > 200);
  // Neither end of the second leg is known, and nor is the third's start.
  assert.equal(legs[1], null);
  assert.equal(legs[2], null);
});
