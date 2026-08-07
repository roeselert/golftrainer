/**
 * Tile Access (CLAUDE.md §1.4, TD7a).
 *
 * The whole decision behind TD7 lives in this file: the basemap is a URL
 * template and an attribution string, not an SDK the map code is written
 * inside. That is why Google was rejected — its terms forbid its content
 * appearing on or beside another map, which would have made this module
 * impossible and the provider unswappable.
 *
 * One rule is easy to break by accident and must not be:
 *
 *   **Which imagery covers a course is resolved here, from the position, at
 *   display time. It never becomes a column on `Course`.**
 *
 * `Course` lives in the offline core, and a tile provider is an online concern.
 * Putting it in the catalogue would breach the dependency rule (§1.4).
 */

/**
 * @typedef {object} BasemapLayer
 * @property {string} id
 * @property {string} url          XYZ template, consumed directly by Leaflet.
 * @property {string} attribution  Shown wherever the layer is (BR7 — CC BY 4.0).
 * @property {number} maxZoom
 * @property {boolean} imagery     False means "a street map, not a photograph".
 * @property {string} [note]       Shown to the golfer when it is not imagery.
 */

/**
 * Rough bounding boxes, deliberately generous at the edges.
 *
 * Coverage follows state borders, and a course near one is better served by
 * trying the imagery and falling back than by a precise polygon nobody
 * maintains. A wrong guess costs a blank tile, not a wrong map.
 *
 * @type {readonly { id: string, south: number, west: number, north: number, east: number, layer: BasemapLayer }[]}
 */
const IMAGERY_REGIONS = Object.freeze([
  {
    id: 'schleswig-holstein',
    south: 53.35,
    west: 7.85,
    north: 55.06,
    east: 11.32,
    layer: {
      id: 'dop20-sh',
      // WMS rather than WMTS until OPEN-10 is answered: whether the tile matrix
      // set is Web Mercator is unconfirmed, and WMS with EPSG:3857 works either
      // way. Leaflet's WMS support takes the same shape as an XYZ template.
      url: 'https://service.gdi-sh.de/WMS_SH_DOP20col_OpenGBD',
      attribution: 'Luftbilder DOP20 © GeoBasis-DE/LVermGeo SH (CC BY 4.0)',
      maxZoom: 20,
      imagery: true,
    },
  },
  {
    id: 'niedersachsen',
    south: 51.29,
    west: 6.65,
    north: 53.89,
    east: 11.6,
    layer: {
      id: 'dop20-ni',
      url: 'https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms',
      attribution: 'Luftbilder DOP20 © LGLN (CC BY 4.0)',
      maxZoom: 20,
      imagery: true,
    },
  },
]);

/**
 * Everywhere the orthophotos do not reach.
 *
 * OSM was never a candidate for the imagery itself — it has none, and a fairway
 * the golfer cannot see is not a basemap. It is a fallback that keeps the map
 * usable and says plainly that it is not a photograph (UC2 E7, UC3 E6).
 *
 * @type {BasemapLayer}
 */
export const FALLBACK_LAYER = Object.freeze({
  id: 'osm',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19,
  imagery: false,
  note: 'No aerial imagery covers this course, so this is a street map.',
});

/**
 * Picks the basemap for a position.
 *
 * @param {{ latitude: number, longitude: number } | null} position
 * @returns {BasemapLayer}
 */
export function basemapFor(position) {
  if (!position) return FALLBACK_LAYER;

  const region = IMAGERY_REGIONS.find(
    (candidate) =>
      position.latitude >= candidate.south &&
      position.latitude <= candidate.north &&
      position.longitude >= candidate.west &&
      position.longitude <= candidate.east,
  );

  return region ? region.layer : FALLBACK_LAYER;
}

/**
 * Whether a layer is served as WMS rather than as XYZ tiles.
 *
 * The German state services publish WMS endpoints; OSM publishes XYZ. Leaflet
 * needs to be told which, and this keeps that knowledge in Tile Access rather
 * than spread across the two screens that draw maps.
 *
 * @param {BasemapLayer} layer
 * @returns {boolean}
 */
export function isWms(layer) {
  return !layer.url.includes('{z}');
}

/**
 * The WMS layer name to request. Each state names its own.
 *
 * @param {BasemapLayer} layer
 * @returns {string}
 */
export function wmsLayerName(layer) {
  return layer.id === 'dop20-ni' ? 'ni_dop20' : 'sh_dop20col';
}
