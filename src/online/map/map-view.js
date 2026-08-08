/**
 * Map Visualisation (CLAUDE.md §1.4) — Leaflet, wrapped thinly.
 *
 * Thin on purpose. Leaflet is here to put imagery under a polyline and turn
 * taps into coordinates; everything about what a stroke *means* stays in the
 * domain. Keeping the wrapper this thin is what makes TD7's seam real: swapping
 * the library would rewrite this file and nothing else.
 */

import { BASEMAPS, defaultBasemap } from './tile-access.js';

/** @type {Promise<any> | undefined} */
let leafletModule;

/**
 * Loads Leaflet and its stylesheet, once.
 *
 * Both are fetched at this moment rather than imported by the shell, because
 * the shell boots on the first tee where neither can be reached and neither is
 * wanted (TD13).
 *
 * @returns {Promise<any>}
 */
export function loadLeaflet() {
  leafletModule ??= (async () => {
    const href = new URL('../../../vendor/leaflet/leaflet.css', import.meta.url).href;
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.append(link);
    }
    return import('../../../vendor/leaflet/leaflet-src.esm.js');
  })();

  return leafletModule;
}

/**
 * @param {{ latitude: number, longitude: number }[]} positions
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function centreOf(positions) {
  if (positions.length === 0) return null;
  const sum = positions.reduce(
    (acc, position) => ({
      latitude: acc.latitude + position.latitude,
      longitude: acc.longitude + position.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return { latitude: sum.latitude / positions.length, longitude: sum.longitude / positions.length };
}

/**
 * Groups points that land on the same spot, keeping the count.
 *
 * This is UC2 BR8, and it is the reason the function exists at all: two strokes
 * at one position is how a penalty is recorded (UC1 A6). A map that merged them
 * into one marker would silently delete a stroke the golfer actually took, so
 * they are merged *visually* and the count is carried.
 *
 * Six decimal places is about 0.1 m — far finer than any fix this app will see,
 * so nothing is grouped that was not recorded at the same place.
 *
 * @template {{ position: { latitude: number, longitude: number } }} T
 * @param {T[]} items
 * @returns {{ latitude: number, longitude: number, items: T[] }[]}
 */
export function groupCoincident(items) {
  /** @type {Map<string, { latitude: number, longitude: number, items: T[] }>} */
  const groups = new Map();

  for (const item of items) {
    const key = `${item.position.latitude.toFixed(6)},${item.position.longitude.toFixed(6)}`;
    const group = groups.get(key) ?? {
      latitude: item.position.latitude,
      longitude: item.position.longitude,
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }

  return [...groups.values()];
}

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {{ latitude: number, longitude: number } | null} options.centre
 * @param {number} [options.zoom]
 * @param {(message: string) => void} [options.onTrouble] Called once if imagery will not load.
 * @returns {Promise<{ map: any, leaflet: any, basemap: import('./tile-access.js').BasemapLayer }>}
 */
export async function createMap(container, { centre, zoom = 16, onTrouble }) {
  const leaflet = await loadLeaflet();
  const basemap = defaultBasemap();

  const map = leaflet.map(container, {
    center: [centre?.latitude ?? 51.163, centre?.longitude ?? 10.448],
    zoom: centre ? zoom : 6,
  });

  /** @type {Record<string, any>} */
  const choices = {};
  for (const definition of BASEMAPS) {
    choices[definition.label] = leaflet.tileLayer(definition.url, {
      maxZoom: definition.maxZoom,
      attribution: definition.attribution,
    });
  }

  const active = choices[basemap.label];
  active.addTo(map);

  // A layer switcher, because the golfer is the only one who can see whether
  // the imagery is any good on their course — and because a map that will not
  // load imagery should still be a usable map.
  leaflet.control.layers(choices, {}, { position: 'topright' }).addTo(map);

  /**
   * Imagery that fails to load is the failure this whole file exists to stop
   * being silent. One missing tile at the edge of coverage is normal; a wall of
   * them means the service is unreachable, and the golfer is owed a sentence
   * rather than a grey rectangle.
   */
  let failures = 0;
  let reported = false;
  active.on('tileerror', () => {
    failures += 1;
    if (failures < 4 || reported) return;
    reported = true;
    onTrouble?.(
      'The aerial imagery is not loading. Switch to "Map" with the control at the top right, or try again later.',
    );
  });

  return { map, leaflet, basemap };
}

/**
 * Draws a hole: the tee, then every stroke position in sequence order (UC2 BR3).
 *
 * @param {any} leaflet
 * @param {any} map
 * @param {object} hole
 * @param {{ latitude: number, longitude: number } | null} hole.teePosition
 * @param {{ sequence: number, club: string, position: any }[]} hole.strokes
 * @param {(stroke: any) => string} label
 * @param {object} [options]
 * @param {boolean} [options.fitBounds] Re-frame the map around the hole.
 * @param {string} [options.teeLabel] What the tee marker is called.
 * @param {boolean} [options.permanentTee] Show the tee label without hovering.
 * @returns {any} the layer group, so the caller can remove it
 */
export function drawHole(
  leaflet,
  map,
  hole,
  label,
  { fitBounds = true, teeLabel = 'Tee', permanentTee = false } = {},
) {
  const group = leaflet.layerGroup().addTo(map);
  const positioned = hole.strokes.filter((stroke) => stroke.position !== null);

  /** @type {[number, number][]} */
  const line = [];
  if (hole.teePosition) {
    line.push([hole.teePosition.latitude, hole.teePosition.longitude]);
    leaflet
      .circleMarker([hole.teePosition.latitude, hole.teePosition.longitude], {
        radius: 7,
        color: '#4ade80',
        fillColor: '#4ade80',
        fillOpacity: 1,
      })
      // Permanent when the golfer is planning: the tee is the point every
      // distance is measured from, and a label you have to hover to find is
      // not a starting point (UC3 BR11).
      .bindTooltip(teeLabel, { permanent: permanentTee, direction: 'top' })
      .addTo(group);
  }

  for (const stroke of positioned) {
    line.push([stroke.position.latitude, stroke.position.longitude]);
  }

  if (line.length > 1) {
    leaflet.polyline(line, { color: '#f2f7f3', weight: 3, opacity: 0.9 }).addTo(group);
  }

  for (const spot of groupCoincident(positioned)) {
    const many = spot.items.length > 1;
    leaflet
      .marker([spot.latitude, spot.longitude])
      .bindTooltip(many ? `${spot.items.length} strokes here` : label(spot.items[0]), {
        permanent: many,
        direction: 'top',
      })
      .addTo(group);
  }

  // Reviewing a finished hole wants the whole hole in frame. *Placing* strokes
  // does not: re-framing after each tap moves the map under the golfer's
  // finger, so the next tap lands somewhere they did not aim at.
  if (fitBounds && line.length > 0) {
    map.fitBounds(leaflet.latLngBounds(line).pad(0.25));
  }

  return group;
}
