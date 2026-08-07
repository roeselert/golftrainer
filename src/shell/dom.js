/**
 * The DOM vocabulary every screen is built from.
 *
 * It lives in the shell (TD13) because both halves use it and neither owns it,
 * and because the shell already carries the offline constraints: no network,
 * no static import of an online capability.
 *
 * Everything here sets `textContent`, never `innerHTML`. Course names are typed
 * by the golfer and stroke data comes back out of the database; there is no
 * point in the app where interpolating markup is the easy way to do something.
 */

/**
 * @param {string} tag
 * @param {Record<string, any>} [props]  `class`, `text`, `on*` handlers, or any attribute.
 * @param {(Node | string | null | false | undefined)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'class') {
      node.className = String(value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'disabled' || key === 'hidden') {
      if (value) node.setAttribute(key, '');
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  return node;
}

/**
 * @param {Element} node
 */
export function clear(node) {
  node.replaceChildren();
}

/**
 * A screen heading with an optional back button.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.subtitle]
 * @param {() => void} [options.onBack]
 * @returns {HTMLElement}
 */
export function screenHeader({ title, subtitle, onBack }) {
  return el('div', { class: 'screen__header' }, [
    onBack && el('button', { class: 'back', type: 'button', text: '‹ Back', onclick: onBack }),
    el('div', {}, [
      el('h2', { class: 'screen__title', text: title }),
      subtitle && el('p', { class: 'screen__subtitle', text: subtitle }),
    ]),
  ]);
}

/**
 * A message the golfer can act on, or at least understand.
 *
 * Failures on the course are announced rather than styled away: `role="status"`
 * so a screen reader gets them, and `aria-live` so a stroke that did not save
 * is not a silent nothing (UC1 E5).
 *
 * @param {'ok' | 'warn' | 'fail' | 'info'} tone
 * @param {string} message
 * @returns {HTMLElement}
 */
export function notice(tone, message) {
  return el('p', {
    class: `notice notice--${tone}`,
    role: 'status',
    'aria-live': 'polite',
    text: message,
  });
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatCoordinate(value) {
  return value.toFixed(5);
}
