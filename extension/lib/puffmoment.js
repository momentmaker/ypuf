/*
 * ypuf — the living-puff one-shot "moments" (slice 2): the transient particle for
 * the arrival (a snoozed tab comes home) and the let-go (the auto-sweep clears a tab).
 *
 * Pure. Each function maps a one-shot's progress (0→1) to a single transient
 * particle's position + opacity, in the same BOX-32 space as lib/puffscene.js. The
 * host runs an rAF over a fixed duration, calls these per frame, and overlays the
 * particle on the resting favicon. No canvas, no time, no DOM — progress is injected;
 * deterministic; out-of-range progress clamps to the endpoints.
 *
 * arrival: descends from the top into the cluster, fading IN as it joins.
 * letGo:   drifts up-and-off the cluster, fading OUT as it leaves.
 */
(function (root) {
  'use strict';

  const BOX = 32;
  const clamp01 = (p) => (Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0);   // NaN/undefined → 0, never a NaN coord
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - (1 - t) * (1 - t);   // decelerates as it settles
  const easeIn = (t) => t * t;                     // accelerates as it leaves

  function arrival(progress) {
    const e = easeOut(clamp01(progress));
    return {
      x: lerp(21, 20, e),
      y: lerp(1, 13, e),                  // top of the chip → into the cluster
      r: 1.4,
      opacity: clamp01(0.05 + 0.8 * e),   // faint → present as it joins
    };
  }

  function letGo(progress) {
    const p = clamp01(progress);
    const e = easeIn(p);
    return {
      x: lerp(14, 27, e),                 // off the cluster, up and to the right
      y: lerp(16, 2, e),
      r: 1.5,
      opacity: clamp01(0.7 * (1 - p)),    // present → gone as it drifts away
    };
  }

  const api = { arrival, letGo, BOX };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { puffmoment: api });
})(typeof self !== 'undefined' ? self : globalThis);
