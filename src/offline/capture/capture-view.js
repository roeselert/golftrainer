/**
 * UC1 — Track round. Car mode (TD3): large targets, no map, no typing.
 *
 * The whole screen is built around one interaction. The golfer walks to their
 * ball and taps the club they just used; that tap is the stroke (BR2). There is
 * no confirm step, no separate "capture position" action, and no save button —
 * each stroke is committed as it is tapped (BR5), because a save step is a
 * thing that can fail to happen.
 *
 * Nothing here may touch the network (BR7). ESLint enforces it (TD10); the
 * reason is that this screen is the one used where there is none.
 */

import { clear, describeError, el, notice, screenHeader } from '../../shell/dom.js';
import { CLUBS, clubName } from '../shared/domain/clubs.js';
import { renderCoursePicker } from '../shared/catalogue/course-picker.js';
import { currentFix, describeAccuracy } from '../positioning/positioning.js';
import {
  appendStroke,
  finishHole,
  finishRound,
  holeOf,
  openHole,
  openRound,
  roundById,
  roundInProgress,
  undoLastStroke,
} from '../shared/rounds/rounds.js';

/**
 * @param {HTMLElement} outlet
 * @param {any} context
 */
export async function render(outlet, context) {
  const { db, params } = context;

  const requested = params.get('round');
  const round = requested ? await roundById(db, requested) : await roundInProgress(db);

  if (!round) {
    await renderCourseChoice(outlet, context);
    return;
  }

  const hole = Number(params.get('hole') ?? (await nextHoleNumber(db, round.id)));
  await renderHole(outlet, context, round, hole);
}

/**
 * The hole to propose: one past the last one finished, or the first unfinished.
 *
 * @param {any} db
 * @param {string} roundId
 * @returns {Promise<number>}
 */
async function nextHoleNumber(db, roundId) {
  const { rows } = await db.query(
    `SELECT number, finished_at FROM round_holes WHERE round_id = $1 ORDER BY number DESC LIMIT 1`,
    [roundId],
  );
  if (rows.length === 0) return 1;
  const last = Number(rows[0].number);
  return rows[0].finished_at === null ? last : Math.min(last + 1, 18);
}

/**
 * @param {HTMLElement} outlet
 * @param {any} context
 */
async function renderCourseChoice(outlet, context) {
  const { db, navigate } = context;
  await renderCoursePicker(outlet, {
    db,
    navigate,
    title: 'Track round',
    subtitle: 'Which course are you playing?',
    listId: 'course-choice',
    onPick: async (courseId) => {
      const round = await openRound(db, courseId);
      navigate('track', { round: round.id, hole: '1' });
    },
  });
}

/**
 * The hole screen — the club grid and everything around it.
 *
 * @param {HTMLElement} outlet
 * @param {any} context
 * @param {any} round
 * @param {number} number
 */
async function renderHole(outlet, context, round, number) {
  const { db, navigate, durability } = context;

  /**
   * The hole row is created by the first thing written to it, not by looking at
   * the screen.
   *
   * Creating it on arrival would mean walking to the eighteenth tee and
   * quitting left a round with an empty hole 18 in it — a hole the golfer never
   * played, counted in every total downstream. `openHole` is idempotent, so
   * calling it per write costs nothing.
   *
   * @returns {Promise<string>}
   */
  const holeId = () => openHole(db, round.id, number);

  const messages = el('div', { class: 'messages' });
  const tally = el('p', { class: 'tally', id: 'tally' });
  const lastStroke = el('div', { class: 'last-stroke', id: 'last-stroke' });

  /**
   * Positions are unavailable for the whole round once permission is refused,
   * so the warning is shown once and the round carries on (UC1 E3). Pretending
   * the round is complete would be the dishonest option.
   */
  let positioningRefused = false;

  async function paintTally() {
    const hole = await holeOf(db, round.id, number);
    const strokes = hole?.strokes.length ?? 0;
    tally.textContent =
      strokes === 0
        ? 'No strokes yet — tap the club you played.'
        : `${strokes} ${strokes === 1 ? 'stroke' : 'strokes'} recorded`;
    return hole;
  }

  /**
   * One tap: take the fix, append the stroke, confirm it, offer undo.
   *
   * @param {string} clubId
   */
  async function recordStroke(clubId) {
    clear(messages);
    const fix = positioningRefused
      ? { position: null, status: /** @type {const} */ ('denied'), explanation: '' }
      : await currentFix();

    if (fix.status === 'denied' && !positioningRefused) {
      positioningRefused = true;
      messages.append(
        notice(
          'warn',
          `${fix.explanation} Clubs and putts are still recorded — the round is kept, without positions.`,
        ),
      );
    }

    try {
      const stroke = await appendStroke(db, await holeId(), clubId, fix.position);
      await paintTally();
      showConfirmation(stroke);
    } catch (error) {
      // A stroke that did not save must never look like one that did (UC1 E5).
      clear(lastStroke);
      messages.append(notice('fail', `Stroke NOT saved: ${describeError(error)}`));
    }
  }

  /**
   * @param {any} stroke
   */
  function showConfirmation(stroke) {
    clear(lastStroke);
    lastStroke.append(
      el('span', { class: 'last-stroke__text' }, [
        el('strong', { text: `${stroke.sequence}. ${clubName(stroke.club)}` }),
        ' ',
        el('span', {
          class: stroke.position ? 'muted' : 'warn-text',
          text: describeAccuracy(stroke.position),
        }),
      ]),
      el('button', {
        class: 'undo',
        type: 'button',
        id: 'undo-stroke',
        text: 'Undo',
        onclick: async () => {
          await undoLastStroke(db, await holeId());
          clear(lastStroke);
          await paintTally();
        },
      }),
    );
  }

  /**
   * Putts close the hole. Six buttons rather than a number pad: no typing on
   * the course (BR2), and anything past five is rare enough to tap twice for.
   */
  function puttChooser() {
    const chooser = el('div', { class: 'putts', id: 'putt-chooser' }, [
      el('p', { class: 'hint', text: 'How many putts?' }),
    ]);
    const grid = el('div', { class: 'putts__grid' });

    for (const count of [0, 1, 2, 3, 4, 5]) {
      grid.append(
        el('button', {
          class: 'putt',
          type: 'button',
          dataset: { putts: String(count) },
          text: String(count),
          onclick: () => void closeHole(count),
        }),
      );
    }

    chooser.append(grid);
    return chooser;
  }

  /**
   * @param {number} putts
   */
  async function closeHole(putts) {
    clear(messages);
    try {
      await finishHole(db, await holeId(), putts);

      // The last hole of a full round ends it. Nine-hole loops and shotgun
      // starts finish through the explicit button instead (A2).
      if (number >= 18) {
        await finishRound(db, round.id);
        navigate('rounds');
        return;
      }
      navigate('track', { round: round.id, hole: String(number + 1) });
    } catch (error) {
      messages.append(notice('fail', `Could not finish the hole: ${describeError(error)}`));
    }
  }

  const grid = el(
    'div',
    { class: 'clubs', id: 'club-grid' },
    CLUBS.map((club) =>
      el(
        'button',
        {
          class: 'club',
          type: 'button',
          dataset: { club: club.id },
          'aria-label': club.name,
          onclick: () => void recordStroke(club.id),
        },
        [el('span', { class: 'club__label', text: club.label })],
      ),
    ),
  );

  outlet.append(
    screenHeader({
      title: `Hole ${number}`,
      subtitle: round.courseName,
      onBack: () => navigate('home'),
    }),
    durability?.verdict === 'at-risk'
      ? notice('warn', durability.explanation)
      : el('span', { hidden: true }),
    messages,
    tally,
    lastStroke,
    grid,
    el('div', { class: 'hole-nav' }, [
      number > 1 &&
        el('button', {
          class: 'action action--quiet',
          type: 'button',
          id: 'previous-hole',
          text: '‹ Hole ' + (number - 1),
          onclick: () => navigate('track', { round: round.id, hole: String(number - 1) }),
        }),
      el('button', {
        class: 'action action--quiet',
        type: 'button',
        id: 'next-hole',
        text: number < 18 ? `Hole ${number + 1} ›` : 'Hole 18',
        disabled: number >= 18,
        onclick: () => navigate('track', { round: round.id, hole: String(number + 1) }),
      }),
    ]),
    puttChooser(),
    el('button', {
      class: 'action action--danger',
      type: 'button',
      id: 'finish-round',
      text: 'Finish round',
      onclick: async () => {
        await finishRound(db, round.id);
        navigate('rounds');
      },
    }),
  );

  await paintTally();
}
