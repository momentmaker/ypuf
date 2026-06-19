/*
 * ypuf — the snooze "barometer": snooze-queue counts → an abstract favicon state.
 *
 * Pure. Maps the snooze queue ({ back, snoozed } counts) to the three calm
 * configurations the living-puff favicon renders: clear (puff at rest), scheduled
 * (particles drift up — tabs coming back later), back-now (particles settle down
 * + an amber dot — tabs have returned and are waiting). back-now dominates when
 * both are present ("come get these"). Inputs are integer COUNTS, never arrays —
 * a stray array coerces to 0 (clear) rather than crashing. The geometry lives in
 * lib/puffscene.js; this is only the decidable state mapping (pattern 18).
 */
(function (root) {
  'use strict';

  const CAP = 4; // most extra particles before the 16px favicon reads busy (tuned in the harness)

  // A count is a finite positive number; anything else (arrays, strings, NaN,
  // negatives, null) reads as 0 so a malformed queue degrades to `clear`.
  function count(v) {
    return (typeof v === 'number' && Number.isFinite(v) && v > 0) ? Math.floor(v) : 0;
  }

  function compute(input) {
    const back = count(input && input.back);
    const snoozed = count(input && input.snoozed);
    if (back > 0) return { state: 'back-now', particles: Math.min(back, CAP), dot: true };
    if (snoozed > 0) return { state: 'scheduled', particles: Math.min(snoozed, CAP), dot: false };
    return { state: 'clear', particles: 0, dot: false };
  }

  const api = { compute, CAP };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { barometer: api });
})(typeof self !== 'undefined' ? self : globalThis);
