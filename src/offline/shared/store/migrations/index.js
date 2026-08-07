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
 * Deliberately empty. The domain tables (rounds, holes, strokes, positions)
 * wait on OPEN-3 in CLAUDE.md — how a stroke is actually recorded — which is
 * settled in the UC1 use-case spec, not guessed at here. The runner and its
 * tests exist now so the first real migration has somewhere safe to land.
 *
 * @type {readonly import('../migrations.js').Migration[]}
 */
export const migrations = [];
