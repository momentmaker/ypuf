/*
 * ypuf — "Recall by meaning" settings-UI state resolver (U6).
 *
 * Pure: maps the SW's semantic state `{ enabled, ready, cached }` plus the page's
 * transient session `phase` to the ONE settings-group state the view renders. The
 * impure shell (newtab.js) owns the gestures (request permission, download, confirm)
 * and the DOM; this is the decidable core that says "given where we are, show X" —
 * so the state machine has no gaps a future implementer must invent. Built test-first
 * (tests/semanticui.test.js).
 *
 * SW state (polled via the `semantic-state` message):
 *   enabled — the persistent opt-in flag
 *   ready   — the model is loaded into the SW seam this SW life (semantic is live)
 *   cached  — the verified asset survives in Cache Storage (re-loadable on wake)
 *
 * phase — what the user is doing in THIS page session (resets on reload):
 *   'idle'        — not mid-gesture; the SW state alone decides the view
 *   'disclosing'  — the disclosure card is up (Enable / Not now)
 *   'downloading' — modelasset.ensureModel is running in the page
 *   'denied'      — chrome.permissions.request returned false
 *   'failed'      — the download or SHA-256 verify threw
 *   'confirming'  — the inline "turn off?" confirm is up (before the destructive purge)
 *
 * resolved UI states (what newtab.js renders):
 *   'off' · 'disclosure' · 'in-progress' · 'permission-denied' · 'failure'
 *   'preparing' · 'ready' · 'evicted' · 'off-confirm'
 */
(function (root) {
  'use strict';

  // A session phase overrides the steady-state view (the user is mid-gesture).
  const PHASE_STATE = {
    disclosing: 'disclosure',
    downloading: 'in-progress',
    denied: 'permission-denied',
    failed: 'failure',
    confirming: 'off-confirm',
  };

  // The exact committed disclosure copy (U6). Single source so the view + a test
  // assert the same string — no drift.
  const DISCLOSURE_COPY =
    "Recall by meaning downloads a ~30MB model once from ypuf's GitHub — nothing "
    + 'from your pages or searches ever leaves your device. Keyword recall keeps '
    + 'working while it loads.';

  // Resolve the single view state. A mid-gesture phase wins; otherwise the SW
  // state decides. `enabled && cached && !ready` is the brief cold-wake window
  // where the SW is re-loading the cached model — shown as the same continuous
  // "preparing…" so there's no unexplained post-download stall. `enabled && !cached`
  // is the EVICTED state: opted in, but the browser dropped the bucket.
  function resolve(sw, phase) {
    const s = sw || {};
    const p = phase || 'idle';
    if (PHASE_STATE[p]) return PHASE_STATE[p];
    if (!s.enabled) return 'off';
    if (s.ready) return 'ready';
    if (s.cached) return 'preparing';
    return 'evicted';
  }

  // Is the toggle "on" (pill filled) in this state? On while enabled OR mid-enable
  // (downloading/preparing) so the switch doesn't flicker off during the download;
  // off for disclosure/denied/failure/off-confirm-from-off.
  function toggleOn(state) {
    return state === 'ready' || state === 'in-progress'
      || state === 'preparing' || state === 'evicted' || state === 'off-confirm';
  }

  // Is the toggle locked (not re-tappable)? Locked while the download/load is in
  // flight so a second tap can't start a parallel download (U6: "visually locked").
  function toggleLocked(state) {
    return state === 'in-progress' || state === 'preparing';
  }

  const api = { resolve, toggleOn, toggleLocked, PHASE_STATE, DISCLOSURE_COPY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { semanticui: api });
})(typeof self !== 'undefined' ? self : globalThis);
