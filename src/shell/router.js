/**
 * Navigation between screens (TD13).
 *
 * Hash routing rather than paths, for one reason that matters here: the app is
 * a precached single page served from a subpath on GitHub Pages (TD12). A path
 * route would need either a server that rewrites unknown URLs or a service
 * worker that fakes one. `#/track` is served by the same cached `index.html` at
 * any mount point, with no rewrite anywhere.
 *
 * Routes resolve through a factory rather than a module reference so that the
 * online screens can be loaded with a dynamic `import()` at the moment the
 * golfer navigates to them. That is the escape hatch TD13 describes: the cold
 * start on the first tee never pulls in a map library it cannot use.
 */

/**
 * @typedef {object} Route
 * @property {string} name
 * @property {(outlet: HTMLElement, context: any) => Promise<void> | void} render
 * @property {boolean} [requiresNetwork]  Refused offline, with an explanation.
 */

/**
 * @param {string} hash
 * @returns {{ path: string, params: URLSearchParams }}
 */
export function parseHash(hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { path: path || 'home', params: new URLSearchParams(query) };
}

/**
 * @param {string} path
 * @param {Record<string, string>} [params]
 * @returns {string}
 */
export function href(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  return `#/${path}${query ? `?${query}` : ''}`;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.outlet
 * @param {Record<string, () => Promise<Route> | Route>} options.routes
 * @param {(outlet: HTMLElement, message: string) => void} options.onUnavailable
 * @param {() => any} options.context
 * @returns {{ start: () => Promise<void>, navigate: (path: string, params?: Record<string, string>) => void }}
 */
export function createRouter({ outlet, routes, onUnavailable, context }) {
  // A Map rather than the object itself: a route name comes out of the URL bar,
  // and looking an attacker-supplied key up on a plain object is how you end up
  // resolving `constructor` to something that is not a route.
  const table = new Map(Object.entries(routes));
  let generation = 0;

  async function show() {
    const mine = ++generation;
    const { path, params } = parseHash(window.location.hash);
    const load = table.get(path) ?? table.get('home');
    if (!load) return;

    let route;
    try {
      route = await load();
    } catch (error) {
      // A screen that cannot even be fetched is almost always the offline case:
      // the online capabilities are deliberately not precached (§1.4).
      onUnavailable(
        outlet,
        `That screen could not be loaded${navigator.onLine ? '' : ' — you are offline'}.`,
      );
      void error;
      return;
    }

    // A slower route that lost the race must not paint over a newer one.
    if (mine !== generation) return;

    if (route.requiresNetwork && !navigator.onLine) {
      onUnavailable(outlet, `${route.name} needs a network connection.`);
      return;
    }

    outlet.replaceChildren();
    await route.render(outlet, { ...context(), params, navigate });
  }

  /**
   * @param {string} path
   * @param {Record<string, string>} [params]
   */
  function navigate(path, params = {}) {
    const next = href(path, params);
    if (window.location.hash === next) {
      void show();
      return;
    }
    window.location.hash = next;
  }

  return {
    async start() {
      window.addEventListener('hashchange', () => void show());
      await show();
    },
    navigate,
  };
}
