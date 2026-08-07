/**
 * UC2 — Show round. The use case that pays for UC1: capture is a chore, and
 * this is what makes the chore worth doing.
 *
 * Read-only throughout (BR1). It never edits, repairs or normalises a round it
 * displays — including rounds that disagree with the scorecard, which are shown
 * as they were recorded (BR4).
 *
 * Played and planned rounds go through the same three views (BR2). One model,
 * one renderer, and the only visible difference is that a planned stroke has no
 * accuracy to show.
 */

import { clubName } from '../../offline/shared/domain/clubs.js';
import { describeAccuracy } from '../../offline/positioning/positioning.js';
import { holeTotal, holesOf, listRounds, roundById } from '../../offline/shared/rounds/rounds.js';
import {
  clear,
  describeError,
  el,
  formatCoordinate,
  formatDate,
  notice,
  screenHeader,
} from '../../shell/dom.js';
import { createMap, drawHole } from '../map/map-view.js';

/**
 * @param {HTMLElement} outlet
 * @param {any} context
 */
export async function render(outlet, context) {
  const roundId = context.params.get('round');
  if (roundId) {
    await renderRound(outlet, context, roundId);
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
  const rounds = await listRounds(db);

  if (rounds.length === 0) {
    outlet.append(
      screenHeader({ title: 'Rounds' }),
      notice('info', 'No rounds yet. Track one on the course, or plan one here.'),
    );
    return;
  }

  outlet.append(
    screenHeader({ title: 'Rounds', subtitle: 'Played and planned, newest first.' }),
    el(
      'ul',
      { class: 'list', id: 'round-list' },
      rounds.map((round) =>
        el('li', {}, [
          el(
            'button',
            {
              class: 'list__item',
              type: 'button',
              dataset: { round: round.id },
              onclick: () => navigate('rounds', { round: round.id }),
            },
            [
              el('span', {
                class: 'list__title',
                text: `${round.courseName} — ${formatDate(round.startedAt)}`,
              }),
              el('span', {
                class: 'list__detail',
                text:
                  `${round.kind === 'PLANNED' ? 'Planned' : 'Played'} · ` +
                  `${round.holeCount} holes · ${round.strokeCount + round.putts} strokes` +
                  (round.finishedAt ? '' : ' · unfinished'),
              }),
            ],
          ),
        ]),
      ),
    ),
  );
}

/**
 * @param {HTMLElement} outlet
 * @param {any} context
 * @param {string} roundId
 */
async function renderRound(outlet, context, roundId) {
  const { db, navigate } = context;

  let round;
  try {
    round = await roundById(db, roundId);
  } catch (error) {
    outlet.append(
      screenHeader({ title: 'Rounds', onBack: () => navigate('rounds') }),
      notice('fail', describeError(error)),
    );
    return;
  }

  const holes = await holesOf(db, roundId);
  const strokes = holes.reduce((sum, hole) => sum + hole.strokes.length, 0);
  const putts = holes.reduce((sum, hole) => sum + (hole.putts ?? 0), 0);

  outlet.append(
    screenHeader({
      title: round.courseName,
      subtitle:
        `${round.kind === 'PLANNED' ? 'Planned' : 'Played'} ${formatDate(round.startedAt)} · ` +
        `${strokes + putts} strokes over ${holes.length} holes` +
        (round.finishedAt ? '' : ' · unfinished'),
      onBack: () => navigate('rounds'),
    }),
  );

  if (holes.length === 0) {
    outlet.append(notice('info', 'This round has no holes recorded yet.'));
    return;
  }

  outlet.append(overviewSection(holes), tableSection(holes, round));
  await mapSection(outlet, holes);
}

/**
 * @param {any[]} holes
 * @returns {HTMLElement}
 */
function overviewSection(holes) {
  return el('section', {}, [
    el('h3', { class: 'card__title', text: 'Overview' }),
    el('div', { class: 'scroll-x' }, [
      el('table', { class: 'table', id: 'overview-table' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', { text: 'Hole' }),
            el('th', { text: 'Strokes' }),
            el('th', { text: 'Putts' }),
            el('th', { text: 'Total' }),
          ]),
        ]),
        el(
          'tbody',
          {},
          holes.map((hole) =>
            el('tr', { dataset: { hole: String(hole.number) } }, [
              el('td', { text: String(hole.number) }),
              el('td', {
                // A hole played with no strokes recorded is shown as such, not
                // as a zero (UC1 A5, UC2 E6).
                text: hole.strokes.length === 0 ? 'not recorded' : String(hole.strokes.length),
              }),
              el('td', { text: hole.putts === null ? '—' : String(hole.putts) }),
              el('td', { text: String(holeTotal(hole)) }),
            ]),
          ),
        ),
      ]),
    ]),
  ]);
}

/**
 * One row per stroke. A stroke with no position keeps its row and says so
 * (UC2 AC3) — hiding it would quietly rewrite the round.
 *
 * @param {any[]} holes
 * @param {any} round
 * @returns {HTMLElement}
 */
function tableSection(holes, round) {
  const rows = [];
  for (const hole of holes) {
    for (const stroke of hole.strokes) {
      rows.push(
        el('tr', { dataset: { hole: String(hole.number), sequence: String(stroke.sequence) } }, [
          el('td', { text: String(hole.number) }),
          el('td', { text: String(stroke.sequence) }),
          el('td', { text: clubName(stroke.club) }),
          el('td', {
            text: stroke.position
              ? `${formatCoordinate(stroke.position.latitude)}, ${formatCoordinate(stroke.position.longitude)}`
              : 'no position',
          }),
          el('td', {
            // Planned strokes have no accuracy to show, and an empty cell says
            // that more honestly than a zero would (BR2, UC3 BR2).
            text: round.kind === 'PLANNED' ? '' : describeAccuracy(stroke.position),
          }),
        ]),
      );
    }
  }

  return el('section', {}, [
    el('h3', { class: 'card__title', text: 'Every stroke' }),
    el('div', { class: 'scroll-x' }, [
      el('table', { class: 'table', id: 'stroke-table' }, [
        el('thead', {}, [
          el('tr', {}, [
            el('th', { text: 'Hole' }),
            el('th', { text: '#' }),
            el('th', { text: 'Club' }),
            el('th', { text: 'Position' }),
            el('th', { text: 'Accuracy' }),
          ]),
        ]),
        el('tbody', {}, rows),
      ]),
    ]),
  ]);
}

/**
 * @param {HTMLElement} outlet
 * @param {any[]} holes
 */
async function mapSection(outlet, holes) {
  const drawable = holes.filter(
    (hole) => hole.teePosition !== null || hole.strokes.some((/** @type {any} */ s) => s.position),
  );

  outlet.append(el('h3', { class: 'card__title', text: 'On the map' }));

  if (drawable.length === 0) {
    outlet.append(
      notice('info', 'No positions were recorded for this round, so there is nothing to draw.'),
    );
    return;
  }

  const container = el('div', { class: 'map', id: 'round-map' });
  const attribution = el('p', { class: 'attribution' });
  const holeButtons = el('div', { class: 'hole-nav', id: 'map-holes' });
  const missing = el('div', {});

  outlet.append(holeButtons, container, attribution, missing);

  let current = drawable[0];
  const first = current.teePosition ?? current.strokes.find((/** @type {any} */ s) => s.position);

  /** @type {any} */ let map;
  /** @type {any} */ let leaflet;
  try {
    const created = await createMap(container, {
      centre: first ? { latitude: first.latitude, longitude: first.longitude } : null,
      onTrouble: (message) => outlet.insertBefore(notice('warn', message), container),
    });
    map = created.map;
    leaflet = created.leaflet;
    attribution.textContent = created.basemap.attribution;
  } catch (error) {
    outlet.replaceChild(
      notice('warn', `The map could not be loaded: ${describeError(error)}`),
      container,
    );
    return;
  }

  /** @type {any} */ let layer;
  /** @param {any} hole */
  function show(hole) {
    current = hole;
    if (layer) layer.remove();
    layer = drawHole(
      leaflet,
      map,
      hole,
      (stroke) => `${stroke.sequence}. ${clubName(stroke.club)}`,
    );

    clear(missing);
    const unpositioned = hole.strokes.filter((/** @type {any} */ s) => s.position === null).length;
    if (unpositioned > 0) {
      missing.append(
        notice(
          'warn',
          `${unpositioned} ${unpositioned === 1 ? 'stroke has' : 'strokes have'} no position on this hole, so the line skips ${unpositioned === 1 ? 'it' : 'them'}.`,
        ),
      );
    }
  }

  for (const hole of drawable) {
    holeButtons.append(
      el('button', {
        class: 'action action--quiet',
        type: 'button',
        dataset: { mapHole: String(hole.number) },
        text: `Hole ${hole.number}`,
        onclick: () => show(hole),
      }),
    );
  }

  show(current);
}
