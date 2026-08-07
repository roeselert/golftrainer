/**
 * Entry point — a walking skeleton, not a feature.
 *
 * Its job is to prove the three decisions that everything else rests on
 * actually hold on a real device:
 *
 *   TD4  the service worker precaches the shell, so a cold start works offline
 *   TD5  PGlite opens and migrates
 *   TD8  persistent storage is requested, and refusal is reported honestly
 *
 * The car-mode capture UI (UC1) is deliberately absent: it waits on OPEN-3 and
 * belongs to a user story, not to the bootstrap.
 */

import { ensureDurableStorage } from './offline/shared/durability/storage-durability.js';
import { closeDatabase, openDatabase } from './offline/shared/store/database.js';
import { currentVersion } from './offline/shared/store/migrations.js';
import { browserEnvironment, loadNewVersion } from './shell/app-update.js';
import { createMenu } from './shell/menu.js';

/**
 * @param {unknown} error
 * @returns {string}
 */
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {string} label
 * @param {'ok' | 'warn' | 'fail' | 'pending'} state
 * @param {string} detail
 */
function report(label, state, detail) {
  const list = document.querySelector('#status');
  if (!list) return;

  const item = document.createElement('li');
  item.className = `status status--${state}`;
  item.innerHTML = `<span class="status__label"></span><span class="status__detail"></span>`;

  const labelNode = item.querySelector('.status__label');
  const detailNode = item.querySelector('.status__detail');
  if (labelNode) labelNode.textContent = label;
  if (detailNode) detailNode.textContent = detail;

  list.append(item);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    report('Offline support', 'fail', 'This browser has no service worker support.');
    return;
  }

  try {
    // Derived from this module's own location rather than written as "/sw.js":
    // the app is served from a subpath on GitHub Pages, and the worker's scope
    // follows wherever it actually lives.
    const workerUrl = new URL('../sw.js', import.meta.url);
    await navigator.serviceWorker.register(workerUrl);
    report('Offline support', 'ok', 'App shell and database engine are cached for offline use.');
  } catch (error) {
    report('Offline support', 'fail', `Registration failed: ${describe(error)}`);
  }
}

async function reportStorage() {
  const status = await ensureDurableStorage();
  const state = status.verdict === 'safe' ? 'ok' : status.verdict === 'at-risk' ? 'warn' : 'warn';
  report('Storage durability', state, status.explanation);
}

async function reportDatabase() {
  try {
    const db = await openDatabase();
    const version = await currentVersion(db);
    const { rows } = await db.query('SELECT version() AS version');
    const server = rows[0]?.version ?? 'unknown build';
    report(
      'Database',
      'ok',
      `${server.split(' ').slice(0, 2).join(' ')} — schema version ${version}.`,
    );
  } catch (error) {
    report('Database', 'fail', `Could not open the local database: ${describe(error)}`);
  }
}

function wireMenu() {
  const toggle = document.querySelector('#menu-toggle');
  const panel = document.querySelector('#menu');
  if (!(toggle instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

  createMenu({
    toggle,
    panel,
    handlers: {
      // Only this one is implemented. Track round, plan round and manage
      // courses are disabled in the markup until their use cases exist —
      // a handler that did nothing would be worse than a disabled button.
      'load-new-version': async () => {
        const outcome = await loadNewVersion(browserEnvironment());
        if (outcome.status !== 'reloading') {
          report('Load new version', 'warn', outcome.message);
        }
      },
    },
  });
}

async function main() {
  wireMenu();
  await registerServiceWorker();
  await reportStorage();
  await reportDatabase();
}

window.addEventListener('beforeunload', () => {
  void closeDatabase();
});

void main();
