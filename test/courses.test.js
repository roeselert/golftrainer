import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CatalogueError,
  addCourse,
  courseById,
  deleteCourse,
  listCourses,
  listHoles,
  renameCourse,
  setHolePar,
  setTeePosition,
} from '../src/offline/shared/catalogue/courses.js';
import { migratedDatabase, positionAt } from './support/database.js';

/**
 * UC5 — the acceptance criteria that can be checked without a browser. The
 * screen itself is covered by e2e; these are the rules underneath it.
 */

test('AC1 — a course is created with its holes, none of which has a tee', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const course = await addCourse(db, { name: 'Gut Kaden', holeCount: 18 });
  const holes = await listHoles(db, course.id);

  assert.equal(course.name, 'Gut Kaden');
  assert.equal(course.holeCount, 18);
  assert.deepEqual(
    holes.map((hole) => hole.number),
    Array.from({ length: 18 }, (_, index) => index + 1),
  );
  assert.ok(holes.every((hole) => hole.teePosition === null));
});

test('AC3/AC4 — a tee position is captured, and capturing again overwrites it', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const course = await addCourse(db, { name: 'Hamburger Land', holeCount: 9 });

  await setTeePosition(db, course.id, 3, positionAt(53.6, 9.9, 4));
  await setTeePosition(db, course.id, 3, positionAt(53.61, 9.91, 6));

  const holes = await listHoles(db, course.id);
  const third = holes.find((hole) => hole.number === 3);

  assert.equal(third?.teePosition?.latitude, 53.61);
  assert.equal(third?.teePosition?.accuracy, 6);
  // Exactly one: the tee moved, it was never in two places (UC5 A3).
  assert.equal(holes.filter((hole) => hole.teePosition !== null).length, 1);
});

test('AC5 — a duplicate name is refused, whatever its casing', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  await addCourse(db, { name: 'Gut Kaden', holeCount: 18 });

  await assert.rejects(
    () => addCourse(db, { name: '  gut kaden ', holeCount: 9 }),
    (error) => error instanceof CatalogueError && error.code === 'duplicate-name',
  );

  assert.equal((await listCourses(db)).length, 1);
});

test('an empty name is refused before it reaches the database', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  await assert.rejects(
    () => addCourse(db, { name: '   ', holeCount: 9 }),
    (error) => error instanceof CatalogueError && error.code === 'empty-name',
  );
});

test('AC6 — a course with rounds cannot be deleted, and the refusal counts them', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const course = await addCourse(db, { name: 'Treudelberg', holeCount: 18 });
  await db.query(`INSERT INTO rounds (course_id, kind) VALUES ($1, 'PLAYED'), ($1, 'PLANNED')`, [
    course.id,
  ]);

  await assert.rejects(
    () => deleteCourse(db, course.id),
    (error) =>
      error instanceof CatalogueError &&
      error.code === 'course-in-use' &&
      error.message.includes('2 rounds'),
  );

  // Untouched: both the course and the rounds that reference it.
  assert.equal((await listCourses(db)).length, 1);
  const { rows } = await db.query('SELECT count(*) AS n FROM rounds');
  assert.equal(Number(rows[0].n), 2);
});

test('a course with no rounds is deleted, and takes its holes with it', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const course = await addCourse(db, { name: 'Ammersbek', holeCount: 9 });
  await deleteCourse(db, course.id);

  assert.deepEqual(await listCourses(db), []);
  const { rows } = await db.query('SELECT count(*) AS n FROM course_holes');
  assert.equal(Number(rows[0].n), 0);
});

test('the list reports tee coverage and round count, which the screen needs', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const course = await addCourse(db, { name: 'Wendlohe', holeCount: 18 });
  await setTeePosition(db, course.id, 1, positionAt(53.6, 9.9));
  await setTeePosition(db, course.id, 2, positionAt(53.601, 9.901));
  await db.query(`INSERT INTO rounds (course_id, kind) VALUES ($1, 'PLAYED')`, [course.id]);

  const [summary] = await listCourses(db);
  assert.ok(summary);
  assert.equal(summary.teeCount, 2);
  assert.equal(summary.roundCount, 1);
});

test('renaming keeps the rounds attached, and still refuses a clash', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const kaden = await addCourse(db, { name: 'Gut Kaden', holeCount: 18 });
  await addCourse(db, { name: 'Treudelberg', holeCount: 18 });

  await renameCourse(db, kaden.id, 'Gut Kaden (Platz B)');
  assert.equal((await courseById(db, kaden.id)).name, 'Gut Kaden (Platz B)');

  await assert.rejects(
    () => renameCourse(db, kaden.id, 'Treudelberg'),
    (error) => error instanceof CatalogueError && error.code === 'duplicate-name',
  );
});

test('AC9 — a hole has no par until the golfer sets one, and setting it is enough', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const course = await addCourse(db, { name: 'Gut Kaden', holeCount: 9 });
  assert.ok((await listHoles(db, course.id)).every((hole) => hole.par === null));

  await setHolePar(db, course.id, 1, 4);
  await setHolePar(db, course.id, 2, 3);
  await setHolePar(db, course.id, 2, 5); // changed its mind; the hole keeps one par

  const holes = await listHoles(db, course.id);
  assert.equal(holes.find((hole) => hole.number === 1)?.par, 4);
  assert.equal(holes.find((hole) => hole.number === 2)?.par, 5);
  assert.equal(holes.filter((hole) => hole.par !== null).length, 2);
});

test('AC10 — a par can be cleared, and a par nobody plays is refused', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const course = await addCourse(db, { name: 'Treudelberg', holeCount: 9 });
  await setHolePar(db, course.id, 7, 5);
  await setHolePar(db, course.id, 7, null);

  const holes = await listHoles(db, course.id);
  assert.equal(holes.find((hole) => hole.number === 7)?.par, null);

  for (const par of [2, 7, 4.5]) {
    await assert.rejects(
      () => setHolePar(db, course.id, 7, par),
      (error) => error instanceof CatalogueError && error.code === 'bad-par',
    );
  }
});

test("AC11 — a course's par is reported only once every hole has one", async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  const course = await addCourse(db, { name: 'Wendlohe', holeCount: 9 });
  for (const number of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await setHolePar(db, course.id, number, 4);
  }

  // Eight of nine: a total of 32 next to a nine-hole round would read as the
  // course's par, so there is none to report yet.
  assert.equal((await listCourses(db))[0]?.par, null);

  await setHolePar(db, course.id, 9, 3);
  assert.equal((await listCourses(db))[0]?.par, 35);
});

test('the schema refuses a hole count nobody plays', async (t) => {
  const db = await migratedDatabase();
  t.after(() => db.close());

  await assert.rejects(() =>
    addCourse(db, { name: 'Six holes', holeCount: /** @type {any} */ (6) }),
  );
});
