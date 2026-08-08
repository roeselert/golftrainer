/**
 * Composition root.
 *
 * Everything the app is made of is wired together here and nowhere else: the
 * database is opened once, the router is given its routes, and the burger menu
 * is pointed at them.
 *
 * The interesting line in this file is the `import()` in the two online routes.
 * A static import would drag the map and its tile access into the cold-start
 * path on the first tee, which is exactly what TD13 exists to prevent. ESLint
 * blocks the static form here; the dynamic one is the intended escape hatch,
 * taken at the moment the golfer navigates.
 */

import { ensureDurableStorage } from './offline/shared/durability/storage-durability.js';
import { closeDatabase, openDatabase } from './offline/shared/store/database.js';
import { currentVersion } from './offline/shared/store/migrations.js';
import { browserEnvironment, loadNewVersion } from './shell/app-update.js';
import { el, notice, screenHeader } from './shell/dom.js';
import { createMenu } from './shell/menu.js';
import { createRouter } from './shell/router.js';

/** @type {any} */
let database;

/** @type {{ verdict: string, explanation: string } | undefined} */
let durability;

/**
 * @param {unknown} error
 * @returns {string}
 */
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {HTMLElement} list
 * @param {string} label
 * @param {'ok' | 'warn' | 'fail' | 'pending'} state
 * @param {string} detail
 */
function report(list, label, state, detail) {
  list.append(
    el('li', { class: `status status--${state}` }, [
      el('span', { class: 'status__label', text: label }),
      el('span', { class: 'status__detail', text: detail }),
    ]),
  );
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    // Derived from this module's own location rather than written as "/sw.js":
    // the app is served from a subpath on GitHub Pages, and the worker's scope
    // follows wherever it actually lives.
    await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url));
  } catch (error) {
    console.error('Service worker registration failed:', describe(error));
  }
}

/**
 * The home screen: what the app can do, and whether the stack underneath it is
 * healthy. The diagnostics stay because they answer the questions that matter
 * before a round — is the shell cached, will the round survive, is the database
 * open — and the answers are worth seeing in the clubhouse car park.
 *
 * @param {HTMLElement} outlet
 * @param {any} context
 */
async function renderHome(outlet, context) {
  const { navigate } = context;

  outlet.append(
    screenHeader({
      title: 'GolfTrainer',
      subtitle: 'Record every stroke on the course. Review and plan from the couch.',
    }),
    el('div', { class: 'tiles' }, [
      el('button', {
        class: 'tile',
        type: 'button',
        id: 'tile-track',
        text: 'Track round',
        onclick: () => navigate('track'),
      }),
      el('button', {
        class: 'tile',
        type: 'button',
        id: 'tile-courses',
        text: 'Courses',
        onclick: () => navigate('courses'),
      }),
      el('button', {
        class: 'tile',
        type: 'button',
        id: 'tile-rounds',
        text: 'Rounds',
        onclick: () => navigate('rounds'),
      }),
      el('button', {
        class: 'tile',
        type: 'button',
        id: 'tile-plan',
        text: 'Plan round',
        onclick: () => navigate('plan'),
      }),
    ]),
  );

  const list = el('ul', { id: 'status' });
  outlet.append(el('h3', { class: 'card__title', text: 'Stack' }), list);

  report(
    list,
    'Offline support',
    'serviceWorker' in navigator ? 'ok' : 'fail',
    'serviceWorker' in navigator
      ? 'App shell and database engine are cached for offline use.'
      : 'This browser has no service worker support.',
  );

  if (durability) {
    report(
      list,
      'Storage durability',
      durability.verdict === 'safe' ? 'ok' : 'warn',
      durability.explanation,
    );
  }

  try {
    const version = await currentVersion(database);
    const { rows } = await database.query('SELECT version() AS version');
    const server = String(rows[0]?.version ?? 'unknown build');
    report(
      list,
      'Database',
      'ok',
      `${server.split(' ').slice(0, 2).join(' ')} — schema version ${version}.`,
    );
  } catch (error) {
    report(list, 'Database', 'fail', `Could not open the local database: ${describe(error)}`);
  }
}

/**
 * @param {HTMLElement} outlet
 * @param {string} message
 */
function renderUnavailable(outlet, message) {
  outlet.replaceChildren(
    screenHeader({ title: 'Not available' }),
    notice('warn', message),
    el('p', {
      class: 'hint',
      text: 'Reviewing and planning need the map, and the map only works online. Tracking a round does not.',
    }),
  );
}

async function main() {
  const outlet = document.querySelector('#view');
  const toggle = document.querySelector('#menu-toggle');
  const panel = document.querySelector('#menu');
  if (!(outlet instanceof HTMLElement)) return;

  const router = createRouter({
    outlet,
    context: () => ({ db: database, durability }),
    onUnavailable: renderUnavailable,
    routes: {
      home: { name: 'Home', load: async () => ({ render: renderHome }) },
      courses: {
        name: 'Courses',
        load: () => import('./offline/shared/catalogue/courses-view.js'),
      },
      track: {
        name: 'Track round',
        load: () => import('./offline/capture/capture-view.js'),
      },
      // Online (§1.4). Not precached, loaded on navigation, and refused offline
      // before the import is attempted — the shell knows they need a network
      // without having to fetch them to find out.
      rounds: {
        name: 'Show round',
        requiresNetwork: true,
        load: () => import('./online/review/review-view.js'),
      },
      // Placing tees on a map is the couch half of UC5. The catalogue screen
      // navigates here rather than importing it, so the offline core still does
      // not know this screen exists.
      tees: {
        name: 'Tee positions',
        requiresNetwork: true,
        load: () => import('./online/catalogue/tee-map-view.js'),
      },
      plan: {
        name: 'Plan round',
        requiresNetwork: true,
        load: () => import('./online/planner/planner-view.js'),
      },
    },
  });

  // Wired before anything is awaited, and deliberately so.
  //
  // PGlite takes seconds to boot from cold. Wiring the menu behind that await
  // leaves the burger button present but dead for the whole of it — a tap that
  // does nothing, on the first tee, which is the exact moment QG2 is about.
  //
  // The menu holds one item now. Navigation lives on the home screen, where a
  // destination is one tap rather than two.
  if (toggle instanceof HTMLElement && panel instanceof HTMLElement) {
    createMenu({
      toggle,
      panel,
      handlers: {
        'load-new-version': async () => {
          const outcome = await loadNewVersion(browserEnvironment());
          if (outcome.status !== 'reloading') {
            outlet.prepend(notice('warn', outcome.message));
          }
        },
      },
    });
  }

  outlet.append(
    screenHeader({ title: 'GolfTrainer' }),
    notice('info', 'Opening the local database…'),
  );

  void registerServiceWorker();
  durability = await ensureDurableStorage();

  try {
    database = await openDatabase();
  } catch (error) {
    outlet.replaceChildren(
      screenHeader({ title: 'GolfTrainer' }),
      notice('fail', `The local database could not be opened: ${describe(error)}`),
    );
    return;
  }

  await router.start();
}

window.addEventListener('beforeunload', () => {
  void closeDatabase();
});

void main();
