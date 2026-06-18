/*
 * ypuf — lunar-phase core (theming / U4, R15).
 *
 * The pure data source for the moon-phase toggle: tonight's phase from a date, on-device,
 * no network. Ported from ../pilgrim-podcast/js/moon.js (the synodic-month math); the
 * canvas/SVG render is host glue (lib/moonrender.js). Kept pure (no DOM, no implicit
 * `Date.now()` — the caller passes the date) so it's deterministically testable
 * (tests/moonphase.test.js).
 *
 * `KNOWN_NEW_MOON` is constructed in local time, so the phase is locale-relative — fine
 * for a soft ambient indicator, not an almanac.
 */
(function (root) {
  'use strict';

  const SYNODIC_MONTH = 29.53059;                 // days between new moons
  const KNOWN_NEW_MOON = new Date(2000, 0, 6, 18, 14);

  // phase ∈ [0,1): 0 = new, 0.5 = full. The ((x % S)+S)%S guard keeps pre-epoch dates in range.
  function phase(date) {
    const diffDays = (date.getTime() - KNOWN_NEW_MOON.getTime()) / 86400000;
    return (((diffDays % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH) / SYNODIC_MONTH;
  }

  function phaseName(p) {
    if (p < 0.0625) return 'New Moon';
    if (p < 0.1875) return 'Waxing Crescent';
    if (p < 0.3125) return 'First Quarter';
    if (p < 0.4375) return 'Waxing Gibbous';
    if (p < 0.5625) return 'Full Moon';
    if (p < 0.6875) return 'Waning Gibbous';
    if (p < 0.8125) return 'Last Quarter';
    if (p < 0.9375) return 'Waning Crescent';
    return 'New Moon';
  }

  const api = { phase, phaseName, SYNODIC_MONTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { moonphase: api });
})(typeof self !== 'undefined' ? self : globalThis);
