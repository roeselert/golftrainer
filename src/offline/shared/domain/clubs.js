/**
 * The bag (UC1 BR11, the answer to OPEN-8).
 *
 * Twelve clubs, fixed, not configurable. Twelve is a car-mode layout number
 * before it is a data one: three across and four down fits a phone with targets
 * a gloved thumb can hit, and fourteen does not (QG2).
 *
 * The order is the order the bag is used — driver, irons, wedges, putter — so
 * the grid reads the way the round plays.
 *
 * Adding a club is a migration, because `strokes.club` is a column on every
 * stroke. That is why this list is settled here rather than grown later.
 */

/**
 * @typedef {object} Club
 * @property {string} id     Stored in `strokes.club`. Never changes.
 * @property {string} label  Shown on the grid. Short enough for a small target.
 * @property {string} name   Spoken form, for the table in UC2 and for a11y.
 */

/** @type {readonly Club[]} */
export const CLUBS = Object.freeze([
  { id: 'DRIVER', label: 'Dr', name: 'Driver' },
  { id: 'IRON_4', label: '4', name: '4 iron' },
  { id: 'IRON_5', label: '5', name: '5 iron' },
  { id: 'IRON_6', label: '6', name: '6 iron' },
  { id: 'IRON_7', label: '7', name: '7 iron' },
  { id: 'IRON_8', label: '8', name: '8 iron' },
  { id: 'IRON_9', label: '9', name: '9 iron' },
  { id: 'PITCHING_WEDGE', label: 'PW', name: 'Pitching wedge' },
  { id: 'GAP_WEDGE', label: 'GW', name: 'Gap wedge' },
  { id: 'SAND_WEDGE', label: 'SW', name: 'Sand wedge' },
  { id: 'LOB_WEDGE', label: 'LW', name: 'Lob wedge' },
  // On the grid, and a stroke recorded with it is one played from *off* the
  // green (UC1 BR13). Putts on the green stay a count.
  { id: 'PUTTER', label: 'Pt', name: 'Putter' },
]);

/** @type {ReadonlyMap<string, Club>} */
const BY_ID = new Map(CLUBS.map((club) => [club.id, club]));

/**
 * @param {string} id
 * @returns {Club | undefined}
 */
export function clubById(id) {
  return BY_ID.get(id);
}

/**
 * The spoken name, or the raw id if the bag ever changes under stored data.
 * Showing `IRON_4` is ugly; hiding a stroke because its club is unknown would
 * be worse (UC2 BR1 — the viewer never repairs what it displays).
 *
 * @param {string} id
 * @returns {string}
 */
export function clubName(id) {
  return BY_ID.get(id)?.name ?? id;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isKnownClub(id) {
  return BY_ID.has(id);
}
