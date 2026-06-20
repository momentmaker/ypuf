/*
 * ypuf — "focus on open" decision (opt-in board behaviour).
 *
 * Pure decidable core (pattern 18): given the user's persisted choice and the board's
 * current state, decide what — if anything — to focus when a new tab opens. The host
 * glue in newtab.js does the actual DOM .focus(); this just picks the target.
 *
 *   off       → never move focus (default; the calm, non-hijacking behaviour)
 *   search    → focus the recall search box (type immediately to find a let-go page)
 *   keyboard  → focus the board itself so the j/k vim layer engages without a click
 *
 * Stealing focus is wrong while the tab is hidden, an overlay (settings / cheatsheet)
 * owns the keys, or the board is in edit mode — so those states yield 'none'.
 * Best-effort by nature: Chrome may keep the address bar focused on a freshly-opened
 * tab regardless (that's a browser limitation the host can't override).
 */
(function (root) {
  'use strict';

  const MODES = ['off', 'search', 'keyboard'];

  const normalize = (v) => (MODES.includes(v) ? v : 'off');

  function target(mode, state) {
    state = state || {};
    if (state.hidden || state.overlayOpen || state.editing) return 'none';
    const m = normalize(mode);
    return m === 'off' ? 'none' : m;
  }

  const api = { MODES, normalize, target };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { focusmode: api });
})(typeof self !== 'undefined' ? self : globalThis);
