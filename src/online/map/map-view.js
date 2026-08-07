/**
 * Map Visualisation (CLAUDE.md §1.4) — Leaflet, wrapped thinly.
 *
 * Thin on purpose. Leaflet is here to put imagery under a polyline and turn
 * taps into coordinates; everything about what a stroke *means* stays in the
 * domain. Keeping the wrapper this thin is what makes TD7's seam real: swapping
 * the library would rewrite this file and nothing else.
 */

import { basemapFor, isWms, wmsLayerName } from './tile-access.js';

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
 * @returns {Promise<{ map: any, leaflet: any, basemap: import('./tile-access.js').BasemapLayer }>}
 */
export async function createMap(container, { centre, zoom = 16 }) {
  const leaflet = await loadLeaflet();
  const basemap = basemapFor(centre);

  const map = leaflet.map(container, {
    center: [centre?.latitude ?? 51.163, centre?.longitude ?? 10.448],
    zoom: centre ? zoom : 6,
  });

  const layer = isWms(basemap)
    ? leaflet.tileLayer.wms(basemap.url, {
        layers: wmsLayerName(basemap),
        format: 'image/jpeg',
        maxZoom: basemap.maxZoom,
        attribution: basemap.attribution,
      })
    : leaflet.tileLayer(basemap.url, {
        maxZoom: basemap.maxZoom,
        attribution: basemap.attribution,
      });

  layer.addTo(map);
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
 * @returns {any} the layer group, so the caller can remove it
 */
export function drawHole(leaflet, map, hole, label) {
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
      .bindTooltip('Tee', { permanent: false })
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

  if (line.length > 0) {
    map.fitBounds(leaflet.latLngBounds(line).pad(0.25));
  }

  return group;
}
