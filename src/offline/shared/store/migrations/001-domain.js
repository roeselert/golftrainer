/**
 * The domain model as a SQL schema (CLAUDE.md §1.4, TD5).
 *
 * One schema serves both contexts. A captured stroke and a planned stroke are
 * the same row with a different `rounds.kind`, which is what keeps plan-versus-
 * actual a query rather than a project.
 *
 * Three constraints here are load-bearing rather than decorative:
 *
 *   - `rounds.course_id` is ON DELETE RESTRICT. A course with rounds cannot be
 *     deleted (UC5 BR5) — deleting it would destroy the record of rounds that
 *     were actually played, which QG3 exists to prevent. The UI explains it;
 *     the database refuses it.
 *   - Positions are nullable *in pairs*. A stroke may have no position at all
 *     (UC1 E1: no fix, save the stroke anyway), but half a position is a bug.
 *   - `strokes` has no UNIQUE on position, and deliberately so. Two strokes at
 *     one spot is how a penalty is recorded (UC1 BR12).
 *
 * @type {import('../migrations.js').Migration}
 */
export const domainSchema = {
  version: 1,
  name: 'domain model: courses, rounds, holes, strokes',
  sql: `
    CREATE TABLE courses (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      name        text        NOT NULL CHECK (length(trim(name)) > 0),
      hole_count  integer     NOT NULL CHECK (hole_count IN (9, 18)),
      created_at  timestamptz NOT NULL DEFAULT now()
    );

    -- Case-insensitive: "Gut Kaden" and "gut kaden" are the same course, and
    -- two courses with one name is a way to lose a round (UC5 E1).
    CREATE UNIQUE INDEX courses_name_key ON courses (lower(trim(name)));

    CREATE TABLE course_holes (
      id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id      uuid    NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      number         integer NOT NULL CHECK (number BETWEEN 1 AND 18),
      tee_latitude   double precision,
      tee_longitude  double precision,
      tee_accuracy   double precision,
      tee_fixed_at   timestamptz,
      UNIQUE (course_id, number),
      CONSTRAINT course_holes_tee_is_whole
        CHECK ((tee_latitude IS NULL) = (tee_longitude IS NULL))
    );

    CREATE TABLE rounds (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id   uuid        NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
      kind        text        NOT NULL CHECK (kind IN ('PLAYED', 'PLANNED')),
      started_at  timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz
    );

    CREATE INDEX rounds_course_idx ON rounds (course_id);
    CREATE INDEX rounds_open_idx ON rounds (kind) WHERE finished_at IS NULL;

    CREATE TABLE round_holes (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      round_id    uuid        NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
      number      integer     NOT NULL CHECK (number BETWEEN 1 AND 18),
      started_at  timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      putts       integer     CHECK (putts IS NULL OR putts BETWEEN 0 AND 20),
      UNIQUE (round_id, number)
    );

    CREATE TABLE strokes (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      round_hole_id uuid        NOT NULL REFERENCES round_holes (id) ON DELETE CASCADE,
      sequence      integer     NOT NULL CHECK (sequence >= 1),
      club          text        NOT NULL,
      latitude      double precision,
      longitude     double precision,
      accuracy      double precision,
      fixed_at      timestamptz,
      recorded_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (round_hole_id, sequence),
      CONSTRAINT strokes_position_is_whole
        CHECK ((latitude IS NULL) = (longitude IS NULL))
    );

    CREATE INDEX strokes_hole_idx ON strokes (round_hole_id, sequence);
  `,
};
