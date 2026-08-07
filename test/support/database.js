import { PGlite } from '../../vendor/pglite/index.js';
import { migrate } from '../../src/offline/shared/store/migrations.js';
import { migrations } from '../../src/offline/shared/store/migrations/index.js';

/**
 * A migrated, isolated database per test.
 *
 * `memory://` rather than `idb://`: no IndexedDB in Node, and an isolated
 * database per test is worth more than the milliseconds a shared one saves.
 *
 * @returns {Promise<any>}
 */
export async function migratedDatabase() {
  const db = await PGlite.create({ dataDir: 'memory://' });
  await migrate(db, migrations);
  return db;
}

/**
 * @param {number} latitude
 * @param {number} longitude
 * @param {number | null} [accuracy]
 * @returns {import('../../src/offline/positioning/positioning.js').Position}
 */
export function positionAt(latitude, longitude, accuracy = 4) {
  return { latitude, longitude, accuracy, fixedAt: new Date('2026-08-07T09:00:00Z') };
}
