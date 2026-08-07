import assert from 'node:assert/strict';
import test from 'node:test';

import { PGlite } from '../vendor/pglite/index.js';
import { currentVersion, migrate } from '../src/offline/shared/store/migrations.js';

/** @returns {Promise<PGlite>} an isolated in-memory database */
function freshDatabase() {
  return PGlite.create({ dataDir: 'memory://' });
}

/**
 * @param {number} version
 * @param {string} name
 * @param {string} sql
 * @returns {import('../src/offline/shared/store/migrations.js').Migration}
 */
function migration(version, name, sql) {
  return { version, name, sql };
}

test('a fresh database reports version 0', async (t) => {
  const db = await freshDatabase();
  t.after(() => db.close());

  assert.equal(await currentVersion(db), 0);
});

test('applies pending migrations in order and records them', async (t) => {
  const db = await freshDatabase();
  t.after(() => db.close());

  const applied = await migrate(db, [
    migration(
      1,
      'create courses',
      'CREATE TABLE courses (id serial PRIMARY KEY, name text NOT NULL)',
    ),
    migration(
      2,
      'add courses.holes',
      'ALTER TABLE courses ADD COLUMN holes integer NOT NULL DEFAULT 18',
    ),
  ]);

  assert.deepEqual(applied, [1, 2]);
  assert.equal(await currentVersion(db), 2);

  // The second migration must have run against the first one's table.
  await db.query("INSERT INTO courses (name) VALUES ('Ballybunion')");
  const { rows } = await db.query('SELECT name, holes FROM courses');
  assert.deepEqual(rows, [{ name: 'Ballybunion', holes: 18 }]);
});

test('is idempotent — a second run applies nothing', async (t) => {
  const db = await freshDatabase();
  t.after(() => db.close());

  const list = [migration(1, 'create courses', 'CREATE TABLE courses (id serial PRIMARY KEY)')];

  assert.deepEqual(await migrate(db, list), [1]);
  assert.deepEqual(await migrate(db, list), [], 'second run must be a no-op');
  assert.equal(await currentVersion(db), 1);
});

test('applies only the migrations added since the last run', async (t) => {
  const db = await freshDatabase();
  t.after(() => db.close());

  const first = migration(1, 'create courses', 'CREATE TABLE courses (id serial PRIMARY KEY)');
  await migrate(db, [first]);

  const second = migration(2, 'create rounds', 'CREATE TABLE rounds (id serial PRIMARY KEY)');
  assert.deepEqual(await migrate(db, [first, second]), [2]);
  assert.equal(await currentVersion(db), 2);
});

test('a failing migration leaves the database at the previous version', async (t) => {
  const db = await freshDatabase();
  t.after(() => db.close());

  await migrate(db, [
    migration(1, 'create courses', 'CREATE TABLE courses (id serial PRIMARY KEY)'),
  ]);

  await assert.rejects(
    () =>
      migrate(db, [
        migration(1, 'create courses', 'CREATE TABLE courses (id serial PRIMARY KEY)'),
        migration(2, 'broken', 'CREATE TABLE rounds (id serial PRIMARY KEY); NOT VALID SQL;'),
      ]),
    /Migration 2 \(broken\) failed/,
  );

  assert.equal(await currentVersion(db), 1, 'version must not advance past a failed migration');

  // The partial work must have rolled back with the version bump, or an upgrade
  // interrupted mid-flight would leave a half-built schema behind.
  const { rows } = await db.query("SELECT to_regclass('public.rounds') IS NOT NULL AS present");
  assert.equal(rows[0].present, false, 'a failed migration must not leave its tables behind');
});

test('rejects duplicate versions', async (t) => {
  const db = await freshDatabase();
  t.after(() => db.close());

  await assert.rejects(
    () => migrate(db, [migration(1, 'a', 'SELECT 1'), migration(1, 'b', 'SELECT 1')]),
    /Duplicate migration version 1/,
  );
});

test('rejects migrations listed out of order', async (t) => {
  const db = await freshDatabase();
  t.after(() => db.close());

  await assert.rejects(
    () => migrate(db, [migration(2, 'b', 'SELECT 1'), migration(1, 'a', 'SELECT 1')]),
    /ascending version order/,
  );
});

test('rejects a non-positive version', async (t) => {
  const db = await freshDatabase();
  t.after(() => db.close());

  await assert.rejects(() => migrate(db, [migration(0, 'zero', 'SELECT 1')]), /positive integer/);
});
