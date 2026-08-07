/**
 * Course Catalogue (CLAUDE.md §1.4 — shared foundation, UC5).
 *
 * The golfer enters their courses; nothing is fetched (UC5 BR1, the resolution
 * of OPEN-4). That is why this module sits in the offline core with no notion
 * of a network: there is no provider to be offline from.
 *
 * A course is usable the moment it has a name and a hole count. Tee positions
 * are optional forever (UC5 BR2) — requiring eighteen of them before the first
 * round would mean walking the course twice.
 */

/** Raised for the refusals UC5 specifies, so a view can explain rather than crash. */
export class CatalogueError extends Error {
  /**
   * @param {'duplicate-name' | 'empty-name' | 'course-in-use' | 'unknown-course'} code
   * @param {string} message  Shown to the golfer as-is.
   */
  constructor(code, message) {
    super(message);
    this.name = 'CatalogueError';
    this.code = code;
  }
}

/**
 * @typedef {import('../../positioning/positioning.js').Position} Position
 *
 * @typedef {object} Course
 * @property {string} id
 * @property {string} name
 * @property {number} holeCount
 * @property {Date} createdAt
 *
 * @typedef {Course & { teeCount: number, roundCount: number }} CourseSummary
 *
 * @typedef {object} CourseHole
 * @property {string} id
 * @property {number} number
 * @property {Position | null} teePosition
 */

/**
 * @param {any} row
 * @returns {Course}
 */
function toCourse(row) {
  return {
    id: row.id,
    name: row.name,
    holeCount: Number(row.hole_count),
    createdAt: new Date(row.created_at),
  };
}

/**
 * @param {any} row
 * @returns {CourseHole}
 */
function toHole(row) {
  return {
    id: row.id,
    number: Number(row.number),
    teePosition:
      row.tee_latitude === null || row.tee_latitude === undefined
        ? null
        : {
            latitude: Number(row.tee_latitude),
            longitude: Number(row.tee_longitude),
            accuracy: row.tee_accuracy === null ? null : Number(row.tee_accuracy),
            fixedAt: row.tee_fixed_at ? new Date(row.tee_fixed_at) : null,
          },
  };
}

/**
 * Every course, with enough context for the list screen to be useful: how many
 * tees are known, and whether deleting is even possible (UC5 BR5).
 *
 * @param {any} db
 * @returns {Promise<CourseSummary[]>}
 */
export async function listCourses(db) {
  const { rows } = await db.query(`
    SELECT c.id,
           c.name,
           c.hole_count,
           c.created_at,
           (SELECT count(*) FROM course_holes h
             WHERE h.course_id = c.id AND h.tee_latitude IS NOT NULL) AS tee_count,
           (SELECT count(*) FROM rounds r WHERE r.course_id = c.id)   AS round_count,
           (SELECT max(r.started_at) FROM rounds r WHERE r.course_id = c.id) AS last_played
      FROM courses c
     -- Most recently played first (UC1 step 2): the course you are standing on
     -- is nearly always the one you played last. Never-played courses sort by
     -- name behind them rather than disappearing to the bottom in insert order.
     ORDER BY last_played DESC NULLS LAST, lower(c.name)
  `);

  return rows.map((/** @type {any} */ row) => ({
    ...toCourse(row),
    teeCount: Number(row.tee_count),
    roundCount: Number(row.round_count),
  }));
}

/**
 * @param {any} db
 * @param {string} id
 * @returns {Promise<Course>}
 */
export async function courseById(db, id) {
  const { rows } = await db.query('SELECT * FROM courses WHERE id = $1', [id]);
  if (rows.length === 0) {
    throw new CatalogueError('unknown-course', 'That course is no longer in the catalogue.');
  }
  return toCourse(rows[0]);
}

/**
 * Creates the course and its holes in one transaction.
 *
 * The holes are created up front rather than on demand, so hole 14 exists
 * before anyone stands on it and a tee position always has a row to land in
 * (UC5 BR4).
 *
 * @param {any} db
 * @param {object} input
 * @param {string} input.name
 * @param {9 | 18} input.holeCount
 * @returns {Promise<Course>}
 */
export async function addCourse(db, { name, holeCount }) {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new CatalogueError('empty-name', 'A course needs a name.');
  }

  return db.transaction(async (/** @type {any} */ tx) => {
    const existing = await tx.query('SELECT 1 FROM courses WHERE lower(trim(name)) = lower($1)', [
      trimmed,
    ]);
    if (existing.rows.length > 0) {
      throw new CatalogueError('duplicate-name', `There is already a course called ${trimmed}.`);
    }

    const { rows } = await tx.query(
      'INSERT INTO courses (name, hole_count) VALUES ($1, $2) RETURNING *',
      [trimmed, holeCount],
    );
    const course = toCourse(rows[0]);

    for (let number = 1; number <= holeCount; number += 1) {
      await tx.query('INSERT INTO course_holes (course_id, number) VALUES ($1, $2)', [
        course.id,
        number,
      ]);
    }

    return course;
  });
}

/**
 * @param {any} db
 * @param {string} courseId
 * @returns {Promise<CourseHole[]>}
 */
export async function listHoles(db, courseId) {
  const { rows } = await db.query(
    'SELECT * FROM course_holes WHERE course_id = $1 ORDER BY number',
    [courseId],
  );
  return rows.map(toHole);
}

/**
 * Writes a tee position, overwriting whatever was there (UC5 A3).
 *
 * There is no history: a tee that moved was never in two places, and keeping
 * the old one would only raise the question of which is current.
 *
 * @param {any} db
 * @param {string} courseId
 * @param {number} number
 * @param {Position} position
 * @returns {Promise<void>}
 */
export async function setTeePosition(db, courseId, number, position) {
  await db.query(
    `UPDATE course_holes
        SET tee_latitude = $3, tee_longitude = $4, tee_accuracy = $5, tee_fixed_at = $6
      WHERE course_id = $1 AND number = $2`,
    [
      courseId,
      number,
      position.latitude,
      position.longitude,
      position.accuracy,
      position.fixedAt?.toISOString() ?? null,
    ],
  );
}

/**
 * @param {any} db
 * @param {string} id
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function renameCourse(db, id, name) {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new CatalogueError('empty-name', 'A course needs a name.');
  }

  const clash = await db.query(
    'SELECT 1 FROM courses WHERE lower(trim(name)) = lower($1) AND id <> $2',
    [trimmed, id],
  );
  if (clash.rows.length > 0) {
    throw new CatalogueError('duplicate-name', `There is already a course called ${trimmed}.`);
  }

  await db.query('UPDATE courses SET name = $2 WHERE id = $1', [id, trimmed]);
}

/**
 * Deletes a course, but only while no round references it (UC5 BR5, E3).
 *
 * The count is looked up so the refusal can say what is actually at stake. The
 * schema refuses this too (ON DELETE RESTRICT); this check exists to produce a
 * sentence rather than a constraint violation.
 *
 * @param {any} db
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteCourse(db, id) {
  const { rows } = await db.query('SELECT count(*) AS n FROM rounds WHERE course_id = $1', [id]);
  const rounds = Number(rows[0].n);
  if (rounds > 0) {
    throw new CatalogueError(
      'course-in-use',
      `${rounds} ${rounds === 1 ? 'round was' : 'rounds were'} played or planned on this course. ` +
        'Deleting it would delete them too.',
    );
  }

  await db.query('DELETE FROM courses WHERE id = $1', [id]);
}
