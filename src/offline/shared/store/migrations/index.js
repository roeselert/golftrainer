/**
 * The ordered migration list.
 *
 * Rules, because getting these wrong is unrecoverable once a round exists on a
 * real device:
 *
 *   - Append only. Never edit or renumber a migration that has shipped.
 *   - Versions are strictly ascending integers with no gaps reused.
 *   - A migration is applied in a transaction with its version bump.
 *
 * Deliberately empty, and no longer blocked. The domain tables (courses,
 * rounds, holes, strokes) are specified — `docs/use cases/README.md` holds the
 * shared model, including the twelve-value `club` enumeration that had to be
 * settled before a column could depend on it. The first migration lands with
 * UC5, the course catalogue, because nothing else works without a course. The
 * runner and its tests exist so it has somewhere safe to land.
 *
 * @type {readonly import('../migrations.js').Migration[]}
 */
export const migrations = [];
