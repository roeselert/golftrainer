/**
 * "Which course?" — the screen UC1 and UC3 both open with.
 *
 * It lives with the catalogue rather than in either use case because it belongs
 * to neither: capture asks the question on the first tee and the planner asks it
 * on the couch, and the answer is the same list either way.
 *
 * That it is reachable from the online half is the dependency rule working as
 * intended (§1.4): the planner may import the offline core, and does.
 */

import { clear, describeError, el, notice, screenHeader } from '../../../shell/dom.js';
import { listCourses } from './courses.js';

/**
 * @param {HTMLElement} outlet
 * @param {object} options
 * @param {any} options.db
 * @param {(path: string, params?: Record<string, string>) => void} options.navigate
 * @param {string} options.title
 * @param {string} options.subtitle
 * @param {string} options.listId
 * @param {(courseId: string) => Promise<void>} options.onPick
 * @returns {Promise<void>}
 */
export async function renderCoursePicker(
  outlet,
  { db, navigate, title, subtitle, listId, onPick },
) {
  const courses = await listCourses(db);
  const messages = el('div', { class: 'messages' });

  if (courses.length === 0) {
    outlet.append(
      screenHeader({ title }),
      notice('info', 'You need a course first. Add one under Courses, then come back.'),
      el('button', {
        class: 'action',
        type: 'button',
        id: 'go-to-courses',
        text: 'Go to Courses',
        onclick: () => navigate('courses'),
      }),
    );
    return;
  }

  outlet.append(
    screenHeader({ title, subtitle }),
    messages,
    el(
      'ul',
      { class: 'list', id: listId },
      courses.map((course) =>
        el('li', {}, [
          el(
            'button',
            {
              class: 'list__item',
              type: 'button',
              dataset: { course: course.id },
              onclick: async () => {
                clear(messages);
                try {
                  await onPick(course.id);
                } catch (error) {
                  // Refusals are the interesting case here — a round already in
                  // progress (UC1 BR10) has to be explained, not swallowed.
                  messages.append(notice('fail', describeError(error)));
                }
              },
            },
            [
              el('span', { class: 'list__title', text: course.name }),
              el('span', {
                class: 'list__detail',
                text:
                  `${course.holeCount} holes` +
                  (course.teeCount > 0 ? ` · ${course.teeCount} tees known` : ''),
              }),
            ],
          ),
        ]),
      ),
    ),
  );
}
