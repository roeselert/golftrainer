/**
 * UC3 — Plan round. UC1 done backwards: the same strokes, placed by hand on a
 * map before the round instead of captured by GNSS during it.
 *
 * The symmetry is deliberate and load-bearing. A planned stroke means exactly
 * what a captured one means — where the ball comes to rest, and the club that
 * put it there (BR1) — which is what will make plan-versus-actual a query
 * rather than a project.
 *
 * A planned stroke carries no accuracy and no fix time (BR2). Those two nulls
 * are how a plan is told apart from a capture at the field level.
 */

import { CLUBS, clubName } from '../../offline/shared/domain/clubs.js';
import { formatDistance, legDistances } from '../../offline/shared/domain/geo.js';
import { listHoles, setTeePosition } from '../../offline/shared/catalogue/courses.js';
import { renderCoursePicker } from '../../offline/shared/catalogue/course-picker.js';
import {
  appendStroke,
  clearStrokes,
  finishHole,
  finishRound,
  holeOf,
  moveStroke,
  openHole,
  openRound,
  roundById,
  roundInProgress,
  undoLastStroke,
} from '../../offline/shared/rounds/rounds.js';
import { clear, describeError, el, notice, screenHeader } from '../../shell/dom.js';
import { createMap, drawHole } from '../map/map-view.js';

/**
 * @param {HTMLElement} outlet
 * @param {any} context
 */
export async function render(outlet, context) {
  const { db, params } = context;
  const requested = params.get('round');
  const plan = requested ? await roundById(db, requested) : await roundInProgress(db, 'PLANNED');

  if (!plan) {
    await renderCourseChoice(outlet, context);
    return;
  }

  await renderHole(outlet, context, plan, Number(params.get('hole') ?? 1));
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
    title: 'Plan round',
    subtitle: 'Which course are you planning?',
    listId: 'plan-course-choice',
    onPick: async (courseId) => {
      const plan = await openRound(db, courseId, 'PLANNED');
      navigate('plan', { round: plan.id, hole: '1' });
    },
  });
}

/**
 * @param {HTMLElement} outlet
 * @param {any} context
 * @param {any} plan
 * @param {number} number
 */
async function renderHole(outlet, context, plan, number) {
  const { db, navigate } = context;

  // Created by the first stroke placed on it, not by opening the screen — so
  // paging through holes while thinking does not litter the plan with empty
  // ones. `openHole` is idempotent.
  const holeId = () => openHole(db, plan.id, number);

  const messages = el('div', { class: 'messages' });
  const container = el('div', { class: 'map', id: 'plan-map' });
  const attribution = el('p', { class: 'attribution' });
  const strokeList = el('ul', { class: 'list', id: 'plan-strokes' });
  const planTotal = el('div', { class: 'row row--total', id: 'plan-total' });

  /** The club the next tap on the map will use. Driver, until told otherwise. */
  let selectedClub = CLUBS[0]?.id ?? 'DRIVER';

  const clubPicker = el(
    'div',
    { class: 'clubs', id: 'plan-clubs' },
    CLUBS.map((club) =>
      el('button', {
        class: 'club',
        type: 'button',
        dataset: { club: club.id },
        'aria-pressed': String(club.id === selectedClub),
        text: club.label,
        onclick: (/** @type {Event} */ event) => {
          selectedClub = club.id;
          for (const button of clubPicker.querySelectorAll('button')) {
            button.setAttribute('aria-pressed', 'false');
          }
          /** @type {HTMLElement} */ (event.currentTarget).setAttribute('aria-pressed', 'true');
        },
      }),
    ),
  );

  const courseHoles = await listHoles(db, plan.courseId);
  const teeHole = courseHoles.find((hole) => hole.number === number);

  outlet.append(
    screenHeader({
      title: `Plan hole ${number}`,
      // Par is what a plan is measured against — three strokes and two putts is
      // a good plan for a par 5 and a poor one for a par 3. Absent until the
      // golfer sets it in the catalogue (UC5 BR9), and silent when it is.
      subtitle: teeHole?.par ? `${plan.courseName} · par ${teeHole.par}` : plan.courseName,
      onBack: () => navigate('plan', { round: plan.id }),
    }),
    messages,
  );

  // Without a tee there is nowhere to centre the map, so the planner asks for
  // one and writes it to the catalogue (A2). Placing a tee from the couch is
  // easier than standing on it, and UC1 gets it on the course for free.
  if (!teeHole?.teePosition) {
    const centre = courseHoles.find((hole) => hole.teePosition)?.teePosition ?? null;
    messages.append(
      notice('info', `Hole ${number} has no tee position yet. Tap the map to place it.`),
    );

    outlet.append(container, attribution);

    try {
      const { map, basemap } = await createMap(container, {
        centre: centre ? { latitude: centre.latitude, longitude: centre.longitude } : null,
        zoom: centre ? 15 : 6,
      });
      attribution.textContent = basemap.attribution;
      map.on('click', async (/** @type {any} */ event) => {
        await setTeePosition(db, plan.courseId, number, {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
          accuracy: null,
          fixedAt: new Date(),
        });
        navigate('plan', { round: plan.id, hole: String(number) });
      });
    } catch (error) {
      messages.append(notice('warn', `The map could not be loaded: ${describeError(error)}`));
    }
    return;
  }

  outlet.append(
    el('p', { class: 'hint', text: 'Pick a club, then tap where you want the ball to finish.' }),
    clubPicker,
    container,
    attribution,
    strokeList,
    planTotal,
    el('div', { class: 'hole-nav' }, [
      el('button', {
        class: 'action action--quiet',
        type: 'button',
        id: 'plan-undo',
        text: 'Undo last',
        onclick: async () => {
          await undoLastStroke(db, await holeId());
          await repaint();
        },
      }),
      el('button', {
        class: 'action action--quiet',
        type: 'button',
        id: 'plan-clear',
        text: 'Clear hole',
        onclick: async () => {
          await clearStrokes(db, await holeId());
          await repaint();
        },
      }),
    ]),
    el('p', { class: 'hint', text: 'Intended putts' }),
    el(
      'div',
      { class: 'putts__grid' },
      [0, 1, 2, 3, 4, 5].map((count) =>
        el('button', {
          class: 'putt',
          type: 'button',
          dataset: { putts: String(count) },
          text: String(count),
          onclick: async () => {
            await finishHole(db, await holeId(), count);
            if (number >= courseHoles.length) {
              await finishRound(db, plan.id);
              navigate('rounds', { round: plan.id });
              return;
            }
            navigate('plan', { round: plan.id, hole: String(number + 1) });
          },
        }),
      ),
    ),
    el('button', {
      class: 'action',
      type: 'button',
      id: 'plan-finish',
      text: 'Finish plan',
      onclick: async () => {
        await finishRound(db, plan.id);
        navigate('rounds', { round: plan.id });
      },
    }),
  );

  // Bound once, past the guard above: from here on the hole has a tee, and it
  // is both where the map opens and where the plan's first leg is measured from.
  const tee = teeHole.teePosition;

  /** @type {any} */ let map;
  /** @type {any} */ let leaflet;
  try {
    const created = await createMap(container, {
      centre: { latitude: tee.latitude, longitude: tee.longitude },
      zoom: 16,
      onTrouble: (message) => messages.append(notice('warn', message)),
    });
    map = created.map;
    leaflet = created.leaflet;
    attribution.textContent = created.basemap.attribution;
  } catch (error) {
    messages.append(notice('warn', `The map could not be loaded: ${describeError(error)}`));
    return;
  }

  /** @type {any} */ let layer;

  async function repaint() {
    // A hole with nothing placed on it yet has no `round_holes` row — it is
    // created by the first stroke, not by looking at the hole. That is not an
    // empty map: the tee is known, and it is where the plan starts (BR11).
    const hole = (await holeOf(db, plan.id, number)) ?? {
      number,
      putts: null,
      teePosition: tee,
      strokes: [],
    };

    // How far each stroke is meant to carry: the first from the tee, the rest
    // from where the previous one leaves the ball (BR10). This is the number
    // that turns a plan from a shape into a club selection.
    const legs = legDistances(hole.teePosition, hole.strokes);
    /** @param {number} index */
    const legLabel = (index) => formatDistance(legs.at(index) ?? null);

    if (layer) layer.remove();
    layer = drawHole(
      leaflet,
      map,
      hole,
      (stroke) => {
        const distance = legLabel(stroke.sequence - 1);
        return `${stroke.sequence}. ${clubName(stroke.club)}${distance ? ` · ${distance}` : ''}`;
      },
      {
        // The golfer is aiming at the map; do not move it under them.
        fitBounds: false,
        teeLabel: `Tee · hole ${number} starts here`,
        permanentTee: true,
      },
    );

    // Placed strokes are draggable, and dragging changes the position and
    // nothing else (A1, AC4).
    for (const stroke of hole.strokes) {
      if (!stroke.position) continue;
      leaflet
        .marker([stroke.position.latitude, stroke.position.longitude], { draggable: true })
        .on('dragend', async (/** @type {any} */ event) => {
          const { lat, lng } = event.target.getLatLng();
          await moveStroke(db, stroke.id, { latitude: lat, longitude: lng });
          await repaint();
        })
        .addTo(layer);
    }

    clear(strokeList);
    hole.strokes.forEach((stroke, index) => {
      const distance = legLabel(index);
      strokeList.append(
        el('li', { class: 'row', dataset: { sequence: String(stroke.sequence) } }, [
          el('span', { class: 'row__label', text: `${stroke.sequence}.` }),
          el('span', { class: 'row__detail', text: clubName(stroke.club) }),
          el('span', {
            class: 'row__distance',
            // The first leg names the tee, because "212 m" on its own reads as
            // a distance from the previous stroke, and for stroke 1 there is
            // none. Without a tee position there is no first leg at all.
            text: distance
              ? index === 0
                ? `${distance} from tee`
                : distance
              : index === 0
                ? 'no tee position'
                : '—',
          }),
        ]),
      );
    });

    // Outside the stroke list, because the total is not a stroke — putting it
    // in the list would make "how many strokes are planned?" a question you
    // have to subtract one from.
    clear(planTotal);
    if (hole.strokes.length > 0) {
      const total = legs.reduce(
        (sum, leg) => (sum === null || leg === null ? null : sum + leg),
        /** @type {number | null} */ (0),
      );
      planTotal.append(
        el('span', { class: 'row__label', text: 'Total' }),
        el('span', {
          class: 'row__detail',
          text: `${hole.strokes.length} ${hole.strokes.length === 1 ? 'stroke' : 'strokes'} planned`,
        }),
        el('span', { class: 'row__distance', text: formatDistance(total) ?? '—' }),
      );
    }
  }

  map.on('click', async (/** @type {any} */ event) => {
    // No accuracy, no fix time: the two nulls that tell a plan from a capture
    // at the field level (BR2). Nothing measured this position — it is a wish.
    await appendStroke(db, await holeId(), selectedClub, {
      latitude: event.latlng.lat,
      longitude: event.latlng.lng,
      accuracy: null,
      fixedAt: null,
    });
    await repaint();
  });

  await repaint();
}
