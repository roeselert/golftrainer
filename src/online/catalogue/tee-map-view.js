/**
 * UC5 A2 — place a course's tee positions on a map.
 *
 * The offline half already captures a tee from the current fix, which is the
 * right thing when you are standing on it (UC5 main flow). This is the other
 * half of that alternative flow: eighteen tees, from the couch, in a minute,
 * without walking the course twice.
 *
 * It lives in `src/online/` because it needs the map, and Manage courses
 * reaches it by *navigating* rather than importing — so the offline catalogue
 * screen still has no idea an online capability exists (§1.4). Every write goes
 * through the same `setTeePosition` the on-course capture uses; this screen
 * owns no data of its own.
 */

import { courseById, listHoles, setTeePosition } from '../../offline/shared/catalogue/courses.js';
import { clear, describeError, el, notice, screenHeader } from '../../shell/dom.js';
import { createMap } from '../map/map-view.js';

/**
 * @param {HTMLElement} outlet
 * @param {any} context
 */
export async function render(outlet, context) {
  const { db, navigate, params } = context;
  const courseId = params.get('course');

  if (!courseId) {
    outlet.append(screenHeader({ title: 'Tee positions' }), notice('warn', 'No course chosen.'));
    return;
  }

  let course;
  try {
    course = await courseById(db, courseId);
  } catch (error) {
    outlet.append(
      screenHeader({ title: 'Tee positions', onBack: () => navigate('courses') }),
      notice('fail', describeError(error)),
    );
    return;
  }

  const messages = el('div', { class: 'messages' });
  const container = el('div', { class: 'map', id: 'tee-map' });
  const attribution = el('p', { class: 'attribution' });
  const holeStrip = el('div', { class: 'hole-strip', id: 'tee-holes' });
  const status = el('p', { class: 'tally', id: 'tee-status' });

  let holes = await listHoles(db, courseId);

  /** The hole the next tap on the map will place. */
  let selected = holes.find((hole) => !hole.teePosition)?.number ?? 1;

  outlet.append(
    screenHeader({
      title: course.name,
      subtitle: 'Tap a hole, then tap its tee on the map.',
      onBack: () => navigate('courses', { course: courseId }),
    }),
    messages,
    holeStrip,
    status,
    container,
    attribution,
  );

  /** @type {any} */ let map;
  /** @type {any} */ let leaflet;
  /** @type {any} */ let markers;

  const placed = holes.filter((hole) => hole.teePosition);
  const centre = placed[0]?.teePosition ?? null;

  try {
    const created = await createMap(container, {
      centre: centre ? { latitude: centre.latitude, longitude: centre.longitude } : null,
      zoom: centre ? 16 : 6,
      onTrouble: (message) => messages.append(notice('warn', message)),
    });
    map = created.map;
    leaflet = created.leaflet;
    markers = leaflet.layerGroup().addTo(map);
    attribution.textContent = created.basemap.attribution;
  } catch (error) {
    messages.append(notice('fail', `The map could not be loaded: ${describeError(error)}`));
    return;
  }

  function paintStrip() {
    clear(holeStrip);
    for (const hole of holes) {
      holeStrip.append(
        el('button', {
          class: `hole-chip${hole.number === selected ? ' hole-chip--on' : ''}${
            hole.teePosition ? ' hole-chip--set' : ''
          }`,
          type: 'button',
          dataset: { teeHole: String(hole.number) },
          'aria-pressed': String(hole.number === selected),
          text: String(hole.number),
          onclick: () => {
            selected = hole.number;
            paintStrip();
            paintStatus();
            const target = holes.find((candidate) => candidate.number === selected)?.teePosition;
            if (target) map.panTo([target.latitude, target.longitude]);
          },
        }),
      );
    }
  }

  function paintStatus() {
    const known = holes.filter((hole) => hole.teePosition).length;
    const current = holes.find((hole) => hole.number === selected);
    status.textContent =
      `${known} of ${holes.length} tees placed · ` +
      `hole ${selected} ${current?.teePosition ? 'is set — tap to move it' : 'is not set yet'}`;
  }

  function paintMarkers() {
    markers.clearLayers();
    for (const hole of holes) {
      if (!hole.teePosition) continue;
      const { latitude, longitude } = hole.teePosition;
      leaflet
        .marker([latitude, longitude], { draggable: true })
        .bindTooltip(`Tee ${hole.number}`, { permanent: true, direction: 'top' })
        .on('dragend', async (/** @type {any} */ event) => {
          const { lat, lng } = event.target.getLatLng();
          await place(hole.number, lat, lng);
        })
        .addTo(markers);
    }
  }

  /**
   * @param {number} number
   * @param {number} latitude
   * @param {number} longitude
   */
  async function place(number, latitude, longitude) {
    clear(messages);
    try {
      // No accuracy: nothing measured this. A tee placed by eye on imagery is
      // not a GNSS fix and should not claim to be one.
      await setTeePosition(db, courseId, number, {
        latitude,
        longitude,
        accuracy: null,
        fixedAt: new Date(),
      });
      holes = await listHoles(db, courseId);

      // Move to the next hole without a tee, so eighteen taps place eighteen
      // tees with no other interaction.
      const next = holes.find((hole) => !hole.teePosition);
      if (next) selected = next.number;

      paintStrip();
      paintStatus();
      paintMarkers();
    } catch (error) {
      messages.append(notice('fail', `Could not store the tee: ${describeError(error)}`));
    }
  }

  map.on('click', (/** @type {any} */ event) => {
    void place(selected, event.latlng.lat, event.latlng.lng);
  });

  paintStrip();
  paintStatus();
  paintMarkers();
}
