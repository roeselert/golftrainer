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
 * A destination, as the shell knows it *before* loading anything.
 *
 * `requiresNetwork` lives here rather than inside the module, and that placement
 * is the whole point: the router has to answer "can this screen open?" without
 * fetching the screen. With the flag inside the module, being offline produced
 * whichever error won a race — the failed import or the guard — so the same
 * situation had two different explanations depending on whether the module
 * happened to be in an HTTP cache. Now the offline case is decided first, no
 * request is made, and the golfer gets one answer.
 *
 * @typedef {object} RouteEntry
 * @property {string} name
 * @property {boolean} [requiresNetwork]
 * @property {() => Promise<{ render: (outlet: HTMLElement, context: any) => Promise<void> | void }>} load
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
 * @param {Record<string, RouteEntry>} options.routes
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
    const entry = table.get(path) ?? table.get('home');
    if (!entry) return;

    // Decided before the import, so an online-only screen gives one answer
    // rather than whichever of two errors arrives first.
    if (entry.requiresNetwork && !navigator.onLine) {
      onUnavailable(outlet, `${entry.name} needs a network connection.`);
      return;
    }

    let route;
    try {
      route = await entry.load();
    } catch {
      // The online capabilities are deliberately not precached (§1.4), so this
      // is a genuinely broken deployment rather than the everyday offline case
      // — that one was answered above.
      onUnavailable(outlet, `${entry.name} could not be loaded.`);
      return;
    }

    // A slower route that lost the race must not paint over a newer one.
    if (mine !== generation) return;

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
