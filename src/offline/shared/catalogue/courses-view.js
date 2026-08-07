/**
 * UC5 — Manage courses.
 *
 * The entry point of the whole product: with an empty catalogue this is the
 * only screen that can do anything, because a round needs a course.
 *
 * Typing is allowed here and nowhere on the course (UC5 BR6). A course name is
 * typed once, sitting down; QG2's no-typing rule governs capture during play.
 */

import { clear, describeError, el, notice, screenHeader } from '../../../shell/dom.js';
import { currentFix, describeAccuracy } from '../../positioning/positioning.js';
import {
  addCourse,
  courseById,
  deleteCourse,
  listCourses,
  listHoles,
  renameCourse,
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
 * One course: rename it, capture its tees, or delete it.
 *
 * @param {HTMLElement} outlet
 * @param {any} context
 * @param {string} courseId
 */
async function renderCourse(outlet, context, courseId) {
  const { db, navigate } = context;

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

  async function paintHoles() {
    const holes = await listHoles(db, courseId);
    clear(holesList);
    for (const hole of holes) {
      holesList.append(
        el('li', { class: 'row' }, [
          el('span', { class: 'row__label', text: `Hole ${hole.number}` }),
          el('span', {
            class: `row__detail${hole.teePosition ? '' : ' row__detail--muted'}`,
            text: hole.teePosition
              ? `Tee set · ${describeAccuracy(hole.teePosition)}`
              : 'No tee position',
          }),
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
          onclick: async () => {
            clear(messages);
            try {
              await deleteCourse(db, courseId);
              navigate('courses');
            } catch (error) {
              messages.append(notice('fail', describeError(error)));
            }
          },
        }),
      ]),
    ]),
    el('h3', { class: 'card__title', text: 'Tee positions' }),
    el('p', {
      class: 'hint',
      text: 'Stand on the tee and capture it. The course works without any of these.',
    }),
    holesList,
  );

  await paintHoles();
}
