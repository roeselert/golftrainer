/**
 * The burger menu — the app's only navigation surface.
 *
 * Behaviour is wired onto markup that already exists in `index.html` rather
 * than generated here, so the menu is present before any script runs and is
 * precached as part of the shell.
 *
 * Car mode (TD3) governs the styling: the same menu is opened on the couch and
 * on the sixteenth tee, one-handed, in sunlight, wearing a glove. That is why
 * the targets are large and why closing it is forgiving — Escape, a tap
 * outside, or a second tap on the button.
 */

/**
 * @typedef {object} MenuOptions
 * @property {HTMLElement} toggle
 * @property {HTMLElement} panel
 * @property {Record<string, () => void | Promise<void>>} handlers  Keyed by `data-action`.
 */

/**
 * @param {HTMLElement} panel
 * @returns {HTMLButtonElement[]}
 */
function enabledItems(panel) {
  const items = /** @type {NodeListOf<HTMLButtonElement>} */ (
    panel.querySelectorAll('button[data-action]')
  );
  return Array.from(items).filter((item) => !item.disabled);
}

/**
 * @param {MenuOptions} options
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean }}
 */
export function createMenu({ toggle, panel, handlers }) {
  const isOpen = () => !panel.hidden;

  function open() {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    enabledItems(panel)[0]?.focus();
  }

  /**
   * Focus returns to the toggle only when it was inside the menu. Moving it
   * otherwise would yank the caret away from whatever the golfer just tapped.
   */
  function close() {
    if (!isOpen()) return;
    const focusWasInside = panel.contains(document.activeElement);
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (focusWasInside) toggle.focus();
  }

  toggle.addEventListener('click', () => {
    if (isOpen()) close();
    else open();
  });

  panel.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target).closest('button[data-action]');
    if (!(target instanceof HTMLButtonElement) || target.disabled) return;

    const action = target.dataset.action;
    close();

    // `Object.hasOwn` rather than a plain lookup: `data-action="constructor"`
    // would otherwise resolve through the prototype chain and be invoked.
    if (action && Object.hasOwn(handlers, action)) {
      /*
        Suppression reason: the Object.hasOwn check above keeps the key off the
        prototype chain, and the result is verified callable before it is
        called. Without that guard, data-action="constructor" would resolve to
        Object.prototype.constructor and be invoked.
      */
      // eslint-disable-next-line security/detect-object-injection
      const handler = handlers[action];
      if (typeof handler === 'function') void handler();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  // `pointerdown` rather than `click`: closing should feel immediate, and a
  // tap that starts outside the menu is never meant for it.
  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    const target = /** @type {Node} */ (event.target);
    if (!panel.contains(target) && !toggle.contains(target)) close();
  });

  return { open, close, isOpen };
}
