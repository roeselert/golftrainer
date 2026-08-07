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
 *   **Which imagery covers a course is resolved here, at display time. It never
 *   becomes a column on `Course`.**
 *
 * `Course` lives in the offline core, and a tile provider is an online concern.
 *
 * ---
 *
 * A correction, recorded because the first version of this file shipped a map
 * with no imagery on it at all.
 *
 * TD7a chose the German state orthophotos, and they are still the best imagery
 * for the courses this app was built for: 20 cm, CC BY 4.0, no key. But they
 * are served as WMS, and a WMS request needs an exact `LAYERS` name that is
 * published in a GetCapabilities document. That document was not reachable from
 * the machine this was written on, so the names were guessed — and a WMS server
 * answers a wrong layer name with an XML exception, which Leaflet renders as
 * nothing whatsoever. A silent grey map.
 *
 * So the default is now a plain XYZ imagery service that needs no per-service
 * parameters to be guessed. The orthophotos come back the moment someone with a
 * browser can read the capabilities document and fill in one string — that is
 * OPEN-10, and it is now a smaller question than it was.
 */

/**
 * @typedef {object} BasemapLayer
 * @property {string} id
 * @property {string} label       Shown in the layer switcher.
 * @property {string} url         XYZ template, consumed directly by Leaflet.
 * @property {string} attribution Shown wherever the layer is (BR7).
 * @property {number} maxZoom
 * @property {boolean} imagery    False means "a street map, not a photograph".
 */

/**
 * Aerial imagery, worldwide, with no key and no billing account.
 *
 * Note the `{z}/{y}/{x}` order — this service puts row before column, and
 * getting it the usual way round yields tiles from the wrong hemisphere rather
 * than an error, which is a debugging afternoon nobody needs.
 *
 * @type {BasemapLayer}
 */
export const SATELLITE = Object.freeze({
  id: 'esri-world-imagery',
  label: 'Satellite',
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community',
  maxZoom: 19,
  imagery: true,
});

/**
 * The fallback, and the thing to show when imagery will not load.
 *
 * OSM was never a candidate for the imagery itself — it has none, and a fairway
 * the golfer cannot see is not a basemap. It is here so that a failing imagery
 * service degrades to a usable map rather than to a grey void.
 *
 * @type {BasemapLayer}
 */
export const STREET = Object.freeze({
  id: 'osm',
  label: 'Map',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19,
  imagery: false,
});

/** Every basemap the golfer can choose, imagery first. @type {readonly BasemapLayer[]} */
export const BASEMAPS = Object.freeze([SATELLITE, STREET]);

/**
 * The layer a map opens on. Imagery, always: a golf hole seen as a street map
 * is a green rectangle with no fairway, no bunkers and no green.
 *
 * @returns {BasemapLayer}
 */
export function defaultBasemap() {
  return SATELLITE;
}

/**
 * @param {string} id
 * @returns {BasemapLayer}
 */
export function basemapById(id) {
  return BASEMAPS.find((layer) => layer.id === id) ?? SATELLITE;
}
