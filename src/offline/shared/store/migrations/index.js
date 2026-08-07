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
 * Deliberately empty. The domain tables (courses, rounds, holes, strokes) are
 * now specified — `docs/use cases/README.md` holds the shared model — and the
 * first migration lands with UC5, the course catalogue, because nothing else
 * works without a course. It waits on OPEN-8: `club` is a column on every
 * stroke, and an enumeration is not a thing to guess at before the first
 * migration ships. The runner and its tests exist so it has somewhere safe to
 * land.
 *
 * @type {readonly import('../migrations.js').Migration[]}
 */
export const migrations = [];
