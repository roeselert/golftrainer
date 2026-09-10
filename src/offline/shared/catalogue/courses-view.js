/**
 * UC5 — Manage courses.
 *
 * The entry point of the whole product: with an empty catalogue this is the
 * only screen that can do anything, because a round needs a course.
 *
 * Typing is allowed here and nowhere on the course (UC5 BR6). A course name is
 * typed once, sitting down; QG2's no-typing rule governs capture during play.
 */

import { clear, describeError, el, formatDate, notice, screenHeader } from '../../../shell/dom.js';
import { currentFix, describeAccuracy } from '../../positioning/positioning.js';
import { deleteRound, listRounds } from '../rounds/rounds.js';
import {
  HOLE_PARS,
  addCourse,
  courseById,
  deleteCourse,
  listCourses,
  listHoles,
  renameCourse,
  setHolePar,
  setTeePosition,
} from './courses.js';

/**
 * @param {HTMLElement} outlet
 * @param {any} context
 */
export async function render(outlet, context) {
  const { params } = context;
  const courseId = params.get('course');
  if (courseId) {
    await renderCourse(outlet, context, courseId);
    return;
  }
  await renderList(outlet, context);
}

/**
 * @param {HTMLElement} outlet
 * @param {any} context
 */
async function renderList(outlet, context) {
  const { db, navigate } = context;
  const courses = await listCourses(db);

  const messages = el('div', { class: 'messages' });
  const nameField = el('input', {
    class: 'field',
    id: 'course-name',
    type: 'text',
    autocomplete: 'off',
    placeholder: 'Course name',
    'aria-label': 'Course name',
  });

  /**
   * @param {9 | 18} holeCount
   */
  async function add(holeCount) {
    clear(messages);
    try {
      const course = await addCourse(db, {
        name: /** @type {HTMLInputElement} */ (nameField).value,
        holeCount,
      });
      navigate('courses', { course: course.id });
    } catch (error) {
      messages.append(notice('fail', describeError(error)));
      nameField.focus();
    }
  }

  outlet.append(
    screenHeader({
      title: 'Courses',
      subtitle: 'Add the courses you play. Tee positions can wait until you are standing on them.',
    }),
    messages,
    el('section', { class: 'card' }, [
      el('h3', { class: 'card__title', text: 'Add a course' }),
      nameField,
      el('p', { class: 'hint', text: 'How many holes?' }),
      el('div', { class: 'choices' }, [
        el('button', {
          class: 'choice',
          type: 'button',
          id: 'add-9',
          text: '9',
          onclick: () => void add(9),
        }),
        el('button', {
          class: 'choice',
          type: 'button',
          id: 'add-18',
          text: '18',
          onclick: () => void add(18),
        }),
      ]),
    ]),
    courses.length === 0
      ? notice('info', 'No courses yet. Add one above, then you can track a round on it.')
      : el(
          'ul',
          { class: 'list', id: 'course-list' },
          courses.map((course) =>
            el('li', {}, [
              el(
                'button',
                {
                  class: 'list__item',
                  type: 'button',
                  dataset: { course: course.id },
                  onclick: () => navigate('courses', { course: course.id }),
                },
                [
                  el('span', { class: 'list__title', text: course.name }),
                  el('span', {
                    class: 'list__detail',
                    text:
                      `${course.holeCount} holes · ${course.teeCount} of ${course.holeCount} tees known` +
                      // Only once every hole has one: a par summed over half a
                      // course is a number that looks like a par (UC5 BR9).
                      (course.par === null ? '' : ` · par ${course.par}`) +
                      (course.roundCount > 0
                        ? ` · ${course.roundCount} ${course.roundCount === 1 ? 'round' : 'rounds'}`
                        : ''),
                  }),
                ],
              ),
            ]),
          ),
        ),
  );
}

/**
 * One course: rename it, capture its tees, delete the rounds played or planned
 * on it, or delete the course itself.
 *
 * The rounds are here rather than only on the review screen because this is
 * where the golfer arrives with the intention — "get rid of this course and
 * everything on it" — and because deleting a round is the one thing about a
 * round that must work with no network (§1.4).
 *
 * @param {HTMLElement} outlet
 * @param {any} context
 * @param {string} courseId
 */
async function renderCourse(outlet, context, courseId) {
  const { db, navigate } = context;

  /** @type {import('./courses.js').Course} */
  let course;
  try {
    course = await courseById(db, courseId);
  } catch (error) {
    outlet.append(
      screenHeader({ title: 'Courses', onBack: () => navigate('courses') }),
      notice('fail', describeError(error)),
    );
    return;
  }

  const messages = el('div', { class: 'messages' });
  const holesList = el('ul', { class: 'list', id: 'hole-list' });
  const parSummary = el('p', { class: 'tally', id: 'course-par' });

  async function paintHoles() {
    const holes = await listHoles(db, courseId);
    const known = holes.filter((hole) => hole.par !== null);
    const total = known.reduce((sum, hole) => sum + (hole.par ?? 0), 0);

    parSummary.textContent =
      known.length === holes.length
        ? `Par ${total}`
        : `${known.length} of ${holes.length} pars set${known.length > 0 ? ` · ${total} so far` : ''}`;

    clear(holesList);
    for (const hole of holes) {
      holesList.append(
        el('li', { class: 'row row--hole', dataset: { hole: String(hole.number) } }, [
          el('span', { class: 'row__label', text: `Hole ${hole.number}` }),
          el('span', {
            class: `row__detail${hole.teePosition ? '' : ' row__detail--muted'}`,
            text: hole.teePosition
              ? `Tee set · ${describeAccuracy(hole.teePosition)}`
              : 'No tee position',
          }),
          el(
            'div',
            { class: 'par-picker', role: 'group', 'aria-label': `Par for hole ${hole.number}` },
            HOLE_PARS.map((par) =>
              el('button', {
                class: `par${hole.par === par ? ' par--on' : ''}`,
                type: 'button',
                dataset: { par: String(par) },
                'aria-pressed': String(hole.par === par),
                text: String(par),
                // Tapping the par already set clears it. A par is three taps
                // away from being wrong and there is nowhere else to undo it.
                onclick: () => void setPar(hole.number, hole.par === par ? null : par),
              }),
            ),
          ),
          el('button', {
            class: 'row__action',
            type: 'button',
            dataset: { captureTee: String(hole.number) },
            text: hole.teePosition ? 'Recapture' : 'Capture tee',
            onclick: () => void capture(hole.number),
          }),
        ]),
      );
    }
  }

  /**
   * @param {number} number
   * @param {number | null} par
   */
  async function setPar(number, par) {
    clear(messages);
    try {
      await setHolePar(db, courseId, number, par);
      await paintHoles();
    } catch (error) {
      messages.append(notice('fail', `Could not store the par: ${describeError(error)}`));
    }
  }

  /**
   * @param {number} number
   */
  async function capture(number) {
    clear(messages);
    const fix = await currentFix();

    if (!fix.position) {
      // A tee that goes unrecorded now can be recorded next round, so there is
      // nothing to salvage by storing a bad one (UC5 E2).
      messages.append(notice('warn', `${fix.explanation} The tee position was not changed.`));
      return;
    }

    try {
      await setTeePosition(db, courseId, number, fix.position);
      messages.append(
        notice('ok', `Hole ${number} tee recorded (${describeAccuracy(fix.position)}).`),
      );
      await paintHoles();
    } catch (error) {
      messages.append(notice('fail', `Could not store the tee: ${describeError(error)}`));
    }
  }

  const roundsList = el('ul', { class: 'list', id: 'course-rounds' });
  const roundsSummary = el('p', { class: 'tally', id: 'course-round-count' });

  /**
   * The rounds played or planned here, newest first, each with a way to delete
   * it (UC5 A8).
   *
   * Repainted after every delete rather than removing the row by hand: the
   * count in the summary and the sentence the course delete asks for both come
   * from this list, and three places counting rounds separately is three
   * places that can disagree.
   */
  async function paintRounds() {
    const rounds = await listRounds(db, courseId);

    roundsSummary.textContent =
      rounds.length === 0
        ? 'No rounds on this course yet.'
        : `${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'} played or planned here`;

    clear(roundsList);
    for (const round of rounds) {
      roundsList.append(
        el('li', { class: 'row', dataset: { round: round.id } }, [
          el('span', {
            class: 'row__label',
            text: round.kind === 'PLANNED' ? 'Planned' : 'Played',
          }),
          el('span', {
            class: 'row__detail',
            text:
              `${formatDate(round.startedAt)} · ${round.holeCount} holes · ` +
              `${round.strokeCount + round.putts} strokes` +
              (round.finishedAt ? '' : ' · unfinished'),
          }),
          el('button', {
            class: 'row__action row__action--danger',
            type: 'button',
            dataset: { deleteRound: round.id },
            text: 'Delete',
            onclick: () => void removeRound(round),
          }),
        ]),
      );
    }
  }

  /**
   * Deletes one round, once the golfer has said so twice (UC5 A8, E6, E7).
   *
   * A round is unrepeatable and there is no undo anywhere behind this button,
   * so the confirmation names what is about to be destroyed — kind, date and
   * how many strokes — rather than asking "are you sure?" about nothing in
   * particular. Cancelling is the default: nothing happens on a stray tap.
   *
   * @param {any} round
   */
  async function removeRound(round) {
    clear(messages);
    const strokes = round.strokeCount + round.putts;
    const label = `${round.kind === 'PLANNED' ? 'planned' : 'played'} round of ${formatDate(round.startedAt)}`;

    const confirmed = window.confirm(
      `Delete the ${label}? Its ${strokes} ${strokes === 1 ? 'stroke' : 'strokes'} ` +
        'will be deleted with it, and this cannot be undone.',
    );
    if (!confirmed) return;

    try {
      await deleteRound(db, round.id);
      messages.append(notice('ok', `The ${label} was deleted.`));
      await paintRounds();
    } catch (error) {
      messages.append(notice('fail', `Could not delete the round: ${describeError(error)}`));
    }
  }

  /**
   * Deletes the course, and its rounds with it when it has any (UC5 A9, E3).
   *
   * The count is read here rather than taken from the last paint: this is the
   * sentence the golfer is being asked to agree to, and it has to describe the
   * catalogue as it is at the moment of the tap.
   */
  async function removeCourse() {
    clear(messages);

    let rounds;
    try {
      rounds = await listRounds(db, courseId);
    } catch (error) {
      messages.append(notice('fail', describeError(error)));
      return;
    }

    const confirmed = window.confirm(
      rounds.length === 0
        ? `Delete ${course.name}? Its holes and tee positions go with it.`
        : `Delete ${course.name} and the ${rounds.length} ` +
            `${rounds.length === 1 ? 'round' : 'rounds'} played or planned on it? ` +
            'The rounds cannot be recovered.',
    );
    if (!confirmed) return;

    try {
      await deleteCourse(db, courseId, { withRounds: rounds.length > 0 });
      navigate('courses');
    } catch (error) {
      messages.append(notice('fail', describeError(error)));
    }
  }

  const nameField = el('input', {
    class: 'field',
    type: 'text',
    id: 'rename-field',
    value: course.name,
    'aria-label': 'Course name',
  });

  outlet.append(
    screenHeader({
      title: course.name,
      subtitle: `${course.holeCount} holes`,
      onBack: () => navigate('courses'),
    }),
    messages,
    el('section', { class: 'card' }, [
      nameField,
      el('div', { class: 'card__actions' }, [
        el('button', {
          class: 'action',
          type: 'button',
          id: 'rename-course',
          text: 'Rename',
          onclick: async () => {
            clear(messages);
            try {
              await renameCourse(db, courseId, /** @type {HTMLInputElement} */ (nameField).value);
              navigate('courses', { course: courseId });
            } catch (error) {
              messages.append(notice('fail', describeError(error)));
            }
          },
        }),
        el('button', {
          class: 'action action--danger',
          type: 'button',
          id: 'delete-course',
          text: 'Delete',
          onclick: () => void removeCourse(),
        }),
      ]),
    ]),
    el('h3', { class: 'card__title', text: 'Holes' }),
    el('p', {
      class: 'hint',
      text: 'Tap a par to set it, and tap it again to clear it. Stand on a tee and capture it, or place them all on a map from home. The course works without any of these.',
    }),
    parSummary,
    // Navigation, not an import: the map screen is an online capability and
    // this file is in the offline core (§1.4). Tapping it loads that screen;
    // being offline refuses it at the door, with the course still usable here.
    el('button', {
      class: 'action',
      type: 'button',
      id: 'place-tees-on-map',
      text: 'Place tees on a map',
      onclick: () => navigate('tees', { course: courseId }),
    }),
    holesList,
    el('h3', { class: 'card__title', text: 'Rounds on this course' }),
    el('p', {
      class: 'hint',
      text: 'Delete a round you never want to see again — a practice loop, a round you abandoned, a plan you have played out. Deleting one is permanent.',
    }),
    roundsSummary,
    roundsList,
  );

  await paintHoles();
  await paintRounds();
}
