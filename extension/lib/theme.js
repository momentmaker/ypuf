/*
 * ypuf — theme-mode core (theming / U3, R2).
 *
 * The decidable core of the light/dark/star theme, kept pure so the host glue
 * (chrome.storage, the <html> data-theme attribute, the pre-paint bootstrap) stays
 * thin (pattern 18). Three pure functions:
 *   - next(mode): cycle light → dark → star → light (the toggle's click).
 *   - normalize(stored): validate an arbitrary stored value → a real mode (default light).
 *   - resolveInitial(stored, prefersDark): first-run resolution — a stored choice always
 *     wins; otherwise prefers-color-scheme picks light/dark. **star is never auto-selected**
 *     (it is opt-in only), so a fresh dark-OS profile opens dark, never star.
 * Built test-first (tests/theme.test.js).
 */
(function (root) {
  'use strict';

  const MODES = ['light', 'dark', 'star'];

  function normalize(stored) {
    return MODES.indexOf(stored) >= 0 ? stored : 'light';
  }

  function next(mode) {
    const i = MODES.indexOf(normalize(mode));
    return MODES[(i + 1) % MODES.length];
  }

  function resolveInitial(stored, prefersDark) {
    if (MODES.indexOf(stored) >= 0) return stored;   // an explicit prior choice wins (incl. star)
    return prefersDark ? 'dark' : 'light';           // first run: OS preference, never star
  }

  const api = { MODES, next, normalize, resolveInitial };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { theme: api });
})(typeof self !== 'undefined' ? self : globalThis);
