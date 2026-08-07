import assert from 'node:assert/strict';
import test from 'node:test';

import { addCourse, setTeePosition } from '../src/offline/shared/catalogue/courses.js';
import {
  RoundError,
  appendStroke,
  clearStrokes,
  finishHole,
  finishRound,
  holeOf,
  holeTotal,
  holesOf,
  listRounds,
  moveStroke,
  openHole,
  openRound,
  roundInProgress,
  undoLastStroke,
} from '../src/offline/shared/rounds/rounds.js';
import { migratedDatabase, positionAt } from './support/database.js';

/**
 * UC1 and UC3 below the screen. What a browser is needed for — the club grid,
 * the map — is covered by e2e; these are the rules that decide whether a round
 * survives.
 */

/**
 * @param {any} db
 * @param {string} [name]
 * @returns {Promise<{ courseId: string, roundId: string }>}
 */
async function startedRound(db, name = 'Gut Kaden') {
  const course = await addCourse(db, { name, holeCount: 18 });
  const round = await openRound(db, course.id);
  return { courseId: course.id, roundId: round.id };
}

/**
 * A fresh database with a round open and one hole started — the state most of
 * these tests begin from.
 *
 * @param {import('node:test').TestContext} t
 * @param {number} [hole]
 * @returns {Promise<{ db: any, roundId: string, holeId: string }>}
 */
async function onTheTee(t, hole = 1) {
  const db = await migratedDatabase();
  t.after(() => db.close());
  const { roundId } = await startedRound(db);
  return { db, roundId, holeId: await openHole(db, roundId, hole) };
}

test('AC2 — one tap records a stroke, numbered from 1 and contiguous', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t);

  await appendStroke(db, holeId, 'DRIVER', positionAt(53.7, 9.95));
  await appendStroke(db, holeId, 'IRON_7', positionAt(53.701, 9.951));
  const third = await appendStroke(db, holeId, 'SAND_WEDGE', positionAt(53.702, 9.952));

  assert.equal(third.sequence, 3);
  const hole = await holeOf(db, roundId, 1);
  assert.deepEqual(
    hole?.strokes.map((stroke) => stroke.sequence),
    [1, 2, 3],
  );
  assert.deepEqual(
    hole?.strokes.map((stroke) => stroke.club),
    ['DRIVER', 'IRON_7', 'SAND_WEDGE'],
  );
});

test('AC5 — a stroke with no fix is still a stroke', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t);

  const stroke = await appendStroke(db, holeId, 'IRON_5', null);

  assert.equal(stroke.position, null);
  assert.equal(stroke.club, 'IRON_5');
  const hole = await holeOf(db, roundId, 1);
  assert.equal(hole?.strokes.length, 1);
});

test('AC6 — a poor fix is stored with its accuracy, not rejected', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t);

  await appendStroke(db, holeId, 'DRIVER', positionAt(53.7, 9.95, 35));

  const hole = await holeOf(db, roundId, 1);
  assert.equal(hole?.strokes[0]?.position?.accuracy, 35);
});

test('AC8 — undo removes the last stroke and nothing else', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t);
  await appendStroke(db, holeId, 'DRIVER', positionAt(53.7, 9.95));
  await appendStroke(db, holeId, 'IRON_9', positionAt(53.701, 9.951));

  assert.equal(await undoLastStroke(db, holeId), true);

  const hole = await holeOf(db, roundId, 1);
  assert.deepEqual(
    hole?.strokes.map((stroke) => stroke.club),
    ['DRIVER'],
  );

  // The next stroke takes sequence 2 again — contiguous, no gap left behind.
  const next = await appendStroke(db, holeId, 'IRON_8', null);
  assert.equal(next.sequence, 2);
});

test('undo on an empty hole says so rather than throwing', async (t) => {
  const { db, holeId } = await onTheTee(t, 4);

  assert.equal(await undoLastStroke(db, holeId), false);
});

test('AC9 — putts complete the hole and count towards its total', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t, 7);
  for (const club of ['DRIVER', 'IRON_6', 'IRON_9', 'PITCHING_WEDGE']) {
    await appendStroke(db, holeId, club, null);
  }

  await finishHole(db, holeId, 2);

  const hole = await holeOf(db, roundId, 7);
  assert.equal(hole?.putts, 2);
  assert.equal(holeTotal(/** @type {any} */ (hole)), 6);
  assert.ok(hole?.finishedAt instanceof Date);
});

test('AC10 — a penalty is a second stroke at the same position, and nothing else', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t, 12);

  const spot = positionAt(53.71, 9.96);
  await appendStroke(db, holeId, 'DRIVER', spot);
  await appendStroke(db, holeId, 'IRON_4', spot);
  await appendStroke(db, holeId, 'IRON_4', spot);

  const hole = await holeOf(db, roundId, 12);
  assert.equal(hole?.strokes.length, 3);

  // Two strokes at one spot survive as two rows: nothing dedupes them.
  const coincident = hole?.strokes.filter(
    (stroke) => stroke.position?.latitude === 53.71 && stroke.position?.longitude === 9.96,
  );
  assert.equal(coincident?.length, 3);

  // And no penalty-specific data was stored: the columns do not exist.
  const { rows } = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'strokes'`,
  );
  const columns = rows.map((/** @type {any} */ row) => row.column_name);
  assert.ok(!columns.includes('penalty'));
  assert.ok(!columns.includes('lie'));
});

test('AC3 — an interrupted round is found again, with its strokes', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t, 4);
  await appendStroke(db, holeId, 'DRIVER', positionAt(53.7, 9.95));
  await appendStroke(db, holeId, 'IRON_7', positionAt(53.701, 9.951));
  await appendStroke(db, holeId, 'GAP_WEDGE', null);

  // Nothing is "in memory and unsaved", so recovery is a query.
  const resumed = await roundInProgress(db);
  assert.equal(resumed?.id, roundId);
  assert.equal(resumed?.courseName, 'Gut Kaden');

  const hole = await holeOf(db, roundId, 4);
  assert.equal(hole?.strokes.length, 3);
});

test('BR10 — a second round cannot be opened while one is unfinished', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const { courseId } = await startedRound(db);

  await assert.rejects(
    () => openRound(db, courseId),
    (error) => error instanceof RoundError && error.code === 'round-in-progress',
  );
});

test('finishing a round clears the way for the next one', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const { courseId, roundId } = await startedRound(db);
  await finishRound(db, roundId);

  assert.equal(await roundInProgress(db), null);
  const second = await openRound(db, courseId);
  assert.notEqual(second.id, roundId);
});

test('a planned round does not block a played one, and vice versa', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const { courseId } = await startedRound(db);
  const plan = await openRound(db, courseId, 'PLANNED');

  assert.equal(plan.kind, 'PLANNED');
  assert.equal((await roundInProgress(db, 'PLAYED'))?.kind, 'PLAYED');
  assert.equal((await roundInProgress(db, 'PLANNED'))?.id, plan.id);
});

test('reopening a hole returns the same hole, keeping its strokes', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const { roundId } = await startedRound(db);
  const first = await openHole(db, roundId, 9);
  await appendStroke(db, first, 'DRIVER', null);

  const again = await openHole(db, roundId, 9);

  assert.equal(again, first);
  const hole = await holeOf(db, roundId, 9);
  assert.equal(hole?.strokes.length, 1);
});

test('A5 — a hole played with no strokes is valid data', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t, 3);
  await finishHole(db, holeId, 2);

  const hole = await holeOf(db, roundId, 3);
  assert.equal(hole?.strokes.length, 0);
  assert.equal(holeTotal(/** @type {any} */ (hole)), 2);
});

test('a hole carries the tee position of the course hole it corresponds to', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const { courseId, roundId } = await startedRound(db);
  await setTeePosition(db, courseId, 1, positionAt(53.69, 9.94));
  await openHole(db, roundId, 1);

  const hole = await holeOf(db, roundId, 1);
  assert.equal(hole?.teePosition?.latitude, 53.69);
});

test('UC3 — a placed stroke moves without changing its sequence or club', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const course = await addCourse(db, { name: 'Treudelberg', holeCount: 18 });
  const plan = await openRound(db, course.id, 'PLANNED');
  const holeId = await openHole(db, plan.id, 1);
  const stroke = await appendStroke(db, holeId, 'DRIVER', {
    latitude: 53.7,
    longitude: 9.95,
    accuracy: null,
    fixedAt: new Date(),
  });

  await moveStroke(db, stroke.id, { latitude: 53.705, longitude: 9.955 });

  const hole = await holeOf(db, plan.id, 1);
  assert.equal(hole?.strokes[0]?.position?.latitude, 53.705);
  assert.equal(hole?.strokes[0]?.sequence, 1);
  assert.equal(hole?.strokes[0]?.club, 'DRIVER');
});

test('UC3 A4 — clearing a hole keeps the hole and drops its strokes', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t, 2);
  await appendStroke(db, holeId, 'DRIVER', null);
  await appendStroke(db, holeId, 'IRON_7', null);

  await clearStrokes(db, holeId);

  const holes = await holesOf(db, roundId);
  assert.equal(holes.length, 1);
  assert.equal(holes[0]?.strokes.length, 0);
});

test('the round list carries what the overview shows, newest first', async (t) => {
  const { db, roundId, holeId } = await onTheTee(t);
  await appendStroke(db, holeId, 'DRIVER', null);
  await appendStroke(db, holeId, 'IRON_7', null);
  await finishHole(db, holeId, 2);
  await finishRound(db, roundId);

  const [summary] = await listRounds(db);
  assert.ok(summary);
  assert.equal(summary.strokeCount, 2);
  assert.equal(summary.putts, 2);
  assert.equal(summary.holeCount, 1);
  assert.equal(summary.courseName, 'Gut Kaden');
  assert.ok(summary.finishedAt instanceof Date);
});
