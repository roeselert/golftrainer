/**
 * Rounds, holes and strokes (CLAUDE.md §1.4 — shared foundation).
 *
 * Both contexts live on this module, which is the point of §1.4: UC1 writes
 * `PLAYED` rounds on the course, UC3 writes `PLANNED` ones from the couch, and
 * UC2 reads both through the same queries. A planned stroke and a captured
 * stroke are the same row.
 *
 * It sits in the offline core because capture must reach it with no network.
 * The online half may import it; the reverse fails the build (TD10).
 */

/**
 * @typedef {import('../../positioning/positioning.js').Position} Position
 *
 * @typedef {'PLAYED' | 'PLANNED'} RoundKind
 *
 * @typedef {object} Round
 * @property {string} id
 * @property {string} courseId
 * @property {string} courseName
 * @property {RoundKind} kind
 * @property {Date} startedAt
 * @property {Date | null} finishedAt
 *
 * @typedef {object} Stroke
 * @property {string} id
 * @property {number} sequence
 * @property {string} club
 * @property {Position | null} position
 *
 * @typedef {object} HolePlay
 * @property {string} id
 * @property {number} number
 * @property {Date | null} finishedAt
 * @property {number | null} putts
 * @property {number | null} par        From the catalogue, null when unknown (UC5 BR9)
 * @property {Position | null} teePosition
 * @property {Stroke[]} strokes
 */

/** Raised for refusals the use cases specify, so a view can explain them. */
export class RoundError extends Error {
  /**
   * @param {'round-in-progress' | 'unknown-round' | 'wrong-kind'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'RoundError';
    this.code = code;
  }
}

/**
 * @param {any} row
 * @returns {Round}
 */
function toRound(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    courseName: row.course_name,
    kind: row.kind,
    startedAt: new Date(row.started_at),
    finishedAt: row.finished_at === null ? null : new Date(row.finished_at),
  };
}

/**
 * @param {any} row
 * @param {string} prefix
 * @returns {Position | null}
 */
function toPosition(row, prefix) {
  const latitude = row[`${prefix}latitude`];
  if (latitude === null || latitude === undefined) return null;
  return {
    latitude: Number(latitude),
    longitude: Number(row[`${prefix}longitude`]),
    accuracy: row[`${prefix}accuracy`] === null ? null : Number(row[`${prefix}accuracy`]),
    fixedAt: row[`${prefix}fixed_at`] ? new Date(row[`${prefix}fixed_at`]) : null,
  };
}

const ROUND_COLUMNS = `
  r.id, r.course_id, r.kind, r.started_at, r.finished_at, c.name AS course_name
`;

/**
 * The round still being played, if there is one (UC1 A1).
 *
 * This is what makes an app kill survivable: nothing is "in memory and
 * unsaved", so recovery is a query rather than a replay.
 *
 * @param {any} db
 * @param {RoundKind} [kind]
 * @returns {Promise<Round | null>}
 */
export async function roundInProgress(db, kind = 'PLAYED') {
  const { rows } = await db.query(
    `SELECT ${ROUND_COLUMNS}
       FROM rounds r JOIN courses c ON c.id = r.course_id
      WHERE r.finished_at IS NULL AND r.kind = $1
      ORDER BY r.started_at DESC
      LIMIT 1`,
    [kind],
  );
  return rows.length === 0 ? null : toRound(rows[0]);
}

/**
 * Opens a round on a course.
 *
 * Refuses while another round of the same kind is unfinished (UC1 BR10). Two
 * open rounds would make "the round" ambiguous everywhere downstream, and the
 * golfer is only ever playing one.
 *
 * @param {any} db
 * @param {string} courseId
 * @param {RoundKind} [kind]
 * @returns {Promise<Round>}
 */
export async function openRound(db, courseId, kind = 'PLAYED') {
  const existing = await roundInProgress(db, kind);
  if (existing) {
    throw new RoundError(
      'round-in-progress',
      `A round at ${existing.courseName} is still open. Finish it before starting another.`,
    );
  }

  const { rows } = await db.query(
    `WITH inserted AS (
       INSERT INTO rounds (course_id, kind) VALUES ($1, $2) RETURNING *
     )
     SELECT ${ROUND_COLUMNS} FROM inserted r JOIN courses c ON c.id = r.course_id`,
    [courseId, kind],
  );
  return toRound(rows[0]);
}

/**
 * @param {any} db
 * @param {string} roundId
 * @returns {Promise<Round>}
 */
export async function roundById(db, roundId) {
  const { rows } = await db.query(
    `SELECT ${ROUND_COLUMNS} FROM rounds r JOIN courses c ON c.id = r.course_id WHERE r.id = $1`,
    [roundId],
  );
  if (rows.length === 0) throw new RoundError('unknown-round', 'That round no longer exists.');
  return toRound(rows[0]);
}

/**
 * Opens a hole, or returns the one already open at that number.
 *
 * Idempotent on purpose: the golfer may back out of a hole screen and return to
 * it, and that must not create a second hole 7 or lose the strokes on the first.
 *
 * @param {any} db
 * @param {string} roundId
 * @param {number} number
 * @returns {Promise<string>} the round-hole id
 */
export async function openHole(db, roundId, number) {
  const { rows } = await db.query(
    `INSERT INTO round_holes (round_id, number) VALUES ($1, $2)
       ON CONFLICT (round_id, number) DO UPDATE SET number = EXCLUDED.number
     RETURNING id`,
    [roundId, number],
  );
  return rows[0].id;
}

/**
 * Records one stroke — the whole of UC1's interaction budget (BR2).
 *
 * The sequence is computed inside the transaction that writes the row, so it
 * is contiguous (BR6) without a read-then-write race. The transaction is the
 * point: there is no "save round" step, because a save step is a thing that
 * can fail to happen (BR5, QG3).
 *
 * @param {any} db
 * @param {string} roundHoleId
 * @param {string} club
 * @param {Position | null} position
 * @returns {Promise<Stroke>}
 */
export async function appendStroke(db, roundHoleId, club, position) {
  return db.transaction(async (/** @type {any} */ tx) => {
    const { rows } = await tx.query(
      `INSERT INTO strokes (round_hole_id, sequence, club, latitude, longitude, accuracy, fixed_at)
       SELECT $1,
              coalesce(max(sequence), 0) + 1,
              $2, $3, $4, $5, $6
         FROM strokes WHERE round_hole_id = $1
       RETURNING id, sequence, club, latitude, longitude, accuracy, fixed_at`,
      [
        roundHoleId,
        club,
        position?.latitude ?? null,
        position?.longitude ?? null,
        position?.accuracy ?? null,
        position?.fixedAt?.toISOString() ?? null,
      ],
    );

    const row = rows[0];
    return {
      id: row.id,
      sequence: Number(row.sequence),
      club: row.club,
      position: toPosition(row, ''),
    };
  });
}

/**
 * Removes the last stroke of a hole (UC1 A3).
 *
 * A gloved mis-tap is the expected error, not an exotic one. Deleting the
 * highest sequence keeps the numbering contiguous with no renumbering, which
 * is why undo is cheap enough to always offer.
 *
 * @param {any} db
 * @param {string} roundHoleId
 * @returns {Promise<boolean>} whether there was anything to undo
 */
export async function undoLastStroke(db, roundHoleId) {
  const { rows } = await db.query(
    `DELETE FROM strokes
      WHERE id = (SELECT id FROM strokes WHERE round_hole_id = $1
                   ORDER BY sequence DESC LIMIT 1)
      RETURNING id`,
    [roundHoleId],
  );
  return rows.length > 0;
}

/**
 * @param {any} db
 * @param {string} roundHoleId
 * @param {number | null} putts
 * @returns {Promise<void>}
 */
export async function finishHole(db, roundHoleId, putts) {
  await db.query('UPDATE round_holes SET putts = $2, finished_at = now() WHERE id = $1', [
    roundHoleId,
    putts,
  ]);
}

/**
 * @param {any} db
 * @param {string} roundId
 * @returns {Promise<void>}
 */
export async function finishRound(db, roundId) {
  await db.query('UPDATE rounds SET finished_at = now() WHERE id = $1', [roundId]);
}

/**
 * Every hole of a round, with its strokes and the tee it started from.
 *
 * One query per level rather than a join with duplicated hole rows: the volumes
 * are tiny (18 holes, a hundred strokes) and the shape is what the screens
 * actually want.
 *
 * @param {any} db
 * @param {string} roundId
 * @returns {Promise<HolePlay[]>}
 */
export async function holesOf(db, roundId) {
  const { rows: holeRows } = await db.query(
    `SELECT h.id, h.number, h.finished_at, h.putts, ch.par,
            ch.tee_latitude, ch.tee_longitude, ch.tee_accuracy, ch.tee_fixed_at
       FROM round_holes h
       JOIN rounds r ON r.id = h.round_id
       LEFT JOIN course_holes ch ON ch.course_id = r.course_id AND ch.number = h.number
      WHERE h.round_id = $1
      ORDER BY h.number`,
    [roundId],
  );

  const { rows: strokeRows } = await db.query(
    `SELECT s.round_hole_id, s.id, s.sequence, s.club,
            s.latitude, s.longitude, s.accuracy, s.fixed_at
       FROM strokes s JOIN round_holes h ON h.id = s.round_hole_id
      WHERE h.round_id = $1
      ORDER BY h.number, s.sequence`,
    [roundId],
  );

  /** @type {Map<string, Stroke[]>} */
  const byHole = new Map();
  for (const row of strokeRows) {
    const list = byHole.get(row.round_hole_id) ?? [];
    list.push({
      id: row.id,
      sequence: Number(row.sequence),
      club: row.club,
      position: toPosition(row, ''),
    });
    byHole.set(row.round_hole_id, list);
  }

  return holeRows.map((/** @type {any} */ row) => ({
    id: row.id,
    number: Number(row.number),
    finishedAt: row.finished_at === null ? null : new Date(row.finished_at),
    putts: row.putts === null ? null : Number(row.putts),
    // Read live from the catalogue rather than copied onto the round: a par
    // entered after the round was played still describes the hole that was
    // played, and copying it would mean two answers to one question.
    par: row.par === null || row.par === undefined ? null : Number(row.par),
    teePosition: toPosition(row, 'tee_'),
    strokes: byHole.get(row.id) ?? [],
  }));
}

/**
 * @param {any} db
 * @param {string} roundId
 * @param {number} number
 * @returns {Promise<HolePlay | undefined>}
 */
export async function holeOf(db, roundId, number) {
  const holes = await holesOf(db, roundId);
  return holes.find((hole) => hole.number === number);
}

/**
 * Rounds for the list screen, newest first, played and planned together (UC2).
 *
 * @param {any} db
 * @returns {Promise<(Round & { strokeCount: number, putts: number, holeCount: number })[]>}
 */
export async function listRounds(db) {
  const { rows } = await db.query(`
    SELECT ${ROUND_COLUMNS},
           (SELECT count(*) FROM round_holes h WHERE h.round_id = r.id) AS hole_count,
           (SELECT coalesce(sum(h.putts), 0) FROM round_holes h WHERE h.round_id = r.id) AS putts,
           (SELECT count(*) FROM strokes s
              JOIN round_holes h ON h.id = s.round_hole_id
             WHERE h.round_id = r.id) AS stroke_count
      FROM rounds r JOIN courses c ON c.id = r.course_id
     ORDER BY r.started_at DESC
  `);

  return rows.map((/** @type {any} */ row) => ({
    ...toRound(row),
    holeCount: Number(row.hole_count),
    putts: Number(row.putts),
    strokeCount: Number(row.stroke_count),
  }));
}

/**
 * Moves a placed stroke (UC3 A1). Only the position changes — never the
 * sequence, never the club.
 *
 * @param {any} db
 * @param {string} strokeId
 * @param {{ latitude: number, longitude: number }} at
 * @returns {Promise<void>}
 */
export async function moveStroke(db, strokeId, at) {
  await db.query('UPDATE strokes SET latitude = $2, longitude = $3 WHERE id = $1', [
    strokeId,
    at.latitude,
    at.longitude,
  ]);
}

/**
 * Clears a hole's strokes (UC3 A4). The hole survives; its strokes do not.
 *
 * @param {any} db
 * @param {string} roundHoleId
 * @returns {Promise<void>}
 */
export async function clearStrokes(db, roundHoleId) {
  await db.query('DELETE FROM strokes WHERE round_hole_id = $1', [roundHoleId]);
}

/**
 * A hole's total: recorded strokes plus putts (UC1 BR4).
 *
 * Never adjusted to look plausible. A round that disagrees with the scorecard
 * is shown as it was recorded.
 *
 * @param {HolePlay} hole
 * @returns {number}
 */
export function holeTotal(hole) {
  return hole.strokes.length + (hole.putts ?? 0);
}
