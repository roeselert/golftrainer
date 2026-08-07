/**
 * Schema migrations for the shared store (CLAUDE.md §1.4, TD5).
 *
 * The domain model is a SQL schema now, so a round captured under an old schema
 * has to survive an app update. QG3 says a round is unrepeatable; that covers
 * upgrades, not just crashes. Hence: migrations from the first table, never an
 * ad-hoc `CREATE TABLE IF NOT EXISTS` at startup.
 */

/**
 * @typedef {object} Migration
 * @property {number} version   Strictly increasing. Never reused, never reordered.
 * @property {string} name      Human-readable; appears in failure messages.
 * @property {string} sql       Applied inside a transaction with the version bump.
 */

const REGISTRY_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     integer     PRIMARY KEY,
    name        text        NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )
`;

/**
 * @param {import('../../../../vendor/pglite/index.js').PGlite} db
 * @returns {Promise<Set<number>>}
 */
async function appliedVersions(db) {
  await db.exec(REGISTRY_SQL);
  const result = await db.query('SELECT version FROM schema_migrations');
  return new Set(result.rows.map((/** @type {{ version: number }} */ row) => Number(row.version)));
}

/**
 * Rejects a migration list that would produce an ambiguous or unrepeatable
 * order. Cheap to check, and the failure mode it prevents — two devices
 * disagreeing about what version 3 means — is unrecoverable.
 *
 * @param {readonly Migration[]} migrations
 */
function assertWellOrdered(migrations) {
  const seen = new Set();
  let previous = 0;

  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error(`Migration version must be a positive integer, got ${migration.version}.`);
    }
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version}.`);
    }
    if (migration.version <= previous) {
      throw new Error(
        `Migrations must be listed in ascending version order; ${migration.version} follows ${previous}.`,
      );
    }
    seen.add(migration.version);
    previous = migration.version;
  }
}

/**
 * Applies every migration not yet recorded, in order.
 *
 * Each migration and its version bump share one transaction, so an interrupted
 * upgrade leaves the database at a known version rather than half-migrated.
 *
 * @param {import('../../../../vendor/pglite/index.js').PGlite} db
 * @param {readonly Migration[]} migrations
 * @returns {Promise<number[]>} versions applied by this call, in order
 */
export async function migrate(db, migrations) {
  assertWellOrdered(migrations);

  const applied = await appliedVersions(db);
  const pending = migrations.filter((migration) => !applied.has(migration.version));
  /** @type {number[]} */
  const runNow = [];

  for (const migration of pending) {
    try {
      await db.transaction(async (/** @type {{ exec: Function, query: Function }} */ tx) => {
        await tx.exec(migration.sql);
        await tx.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
          migration.version,
          migration.name,
        ]);
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${reason}`, {
        cause,
      });
    }
    runNow.push(migration.version);
  }

  return runNow;
}

/**
 * @param {import('../../../../vendor/pglite/index.js').PGlite} db
 * @returns {Promise<number>} highest applied version, or 0 on a fresh database
 */
export async function currentVersion(db) {
  const applied = await appliedVersions(db);
  return applied.size === 0 ? 0 : Math.max(...applied);
}
