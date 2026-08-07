/**
 * The shared store (CLAUDE.md §1.4 — "Shared foundation", TD5).
 *
 * One PGlite database backs both contexts. Round Capture writes to it with no
 * network; Round Simulation and Map Visualisation read and write the same
 * tables from the couch. That sharing is the point — a simulated stroke and a
 * captured stroke are the same kind of thing.
 *
 * Storage backend note: PGlite's OPFS filesystem needs a Web Worker and is not
 * supported by Safari, so on our target platform this is IndexedDB underneath.
 * Durability therefore rests on TD8 (installed to the home screen + persistent
 * storage granted), not on the backend choice.
 */

import { PGlite } from '../../../../vendor/pglite/index.js';
import { migrate } from './migrations.js';
import { migrations } from './migrations/index.js';

/** Data directory. `idb://` selects the IndexedDB filesystem. */
const DATA_DIR = 'idb://golftrainer';

/** @type {Promise<PGlite> | undefined} */
let opening;

/**
 * Opens the database and brings the schema up to date.
 *
 * Concurrent callers share one connection: PGlite runs Postgres in single-user
 * mode, so opening it twice is a corruption risk rather than a slow path.
 *
 * @param {object} [options]
 * @param {string} [options.dataDir] Override the data directory. Tests pass
 *   `memory://` to get an isolated database per test.
 * @returns {Promise<PGlite>}
 */
export function openDatabase(options = {}) {
  const dataDir = options.dataDir ?? DATA_DIR;

  opening ??= (async () => {
    const db = await PGlite.create({ dataDir });
    await migrate(db, migrations);
    return db;
  })();

  return opening;
}

/**
 * Closes the shared connection and forgets it, so the next `openDatabase` call
 * starts fresh. Intended for tests and for teardown; ordinary app code should
 * keep the connection open for the lifetime of the page.
 *
 * @returns {Promise<void>}
 */
export async function closeDatabase() {
  const pending = opening;
  opening = undefined;
  if (!pending) return;

  const db = await pending;
  await db.close();
}
