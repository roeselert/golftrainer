/**
 * Par per hole (UC5 BR9).
 *
 * Nullable, deliberately. Par follows the tee position: a course is usable the
 * moment it has a name and a hole count (UC5 BR2), and a par nobody entered is
 * not a par — it is a guess the review screen would then present as a fact. An
 * unknown par is shown as unknown.
 *
 * 3..6 rather than 3..5: par 6 holes exist, and the schema is the wrong place
 * to argue about it. The catalogue screen offers 3, 4 and 5 because those are
 * the ones a golfer taps.
 *
 * @type {import('../migrations.js').Migration}
 */
export const holePar = {
  version: 2,
  name: 'par per course hole',
  sql: `
    ALTER TABLE course_holes
      ADD COLUMN par integer
      CONSTRAINT course_holes_par_is_golf CHECK (par IS NULL OR par BETWEEN 3 AND 6);
  `,
};
