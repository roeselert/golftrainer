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
 * @type {readonly import('../migrations.js').Migration[]}
 */
import { domainSchema } from './001-domain.js';

export const migrations = [domainSchema];
