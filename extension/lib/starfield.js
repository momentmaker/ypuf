/*
 * ypuf — starfield generation (theming / U8, R4).
 *
 * The pure, deterministic core of the star-mode starfield: given a count, a viewport, and
 * a seed, produce star positions. Pure + node-tested (tests/starfield.test.js); the canvas
 * draw loop + reduced-motion gating are host glue in newtab.js (pattern 18). The PRNG is an
 * explicit seeded mulberry32 — this does NOT port pilgrim's Universe.js (which uses unseeded
 * Math.random); determinism is invented here so the sky is stable and testable.
 *
 * Each star's base opacity is capped (ALPHA_CAP) so the field stays a calm background and
 * never competes with text drawn over it.
 */
(function (root) {
  'use strict';

  const ALPHA_CAP = 0.6;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // generate(count, w, h, seed) → [{ x, y, r, a, phase }], deterministic for a fixed seed.
  function generate(count, w, h, seed) {
    const n = (Number.isFinite(count) && count > 0) ? Math.floor(count) : 0;
    const rand = mulberry32((seed >>> 0) || 1);
    const stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: rand() * w,
        y: rand() * h,
        r: 0.4 + rand() * 1.0,                          // 0.4–1.4 px (×dpr at draw time)
        a: 0.15 + rand() * (ALPHA_CAP - 0.15),          // base opacity, capped ≤ ALPHA_CAP
        phase: rand() * Math.PI * 2,                    // per-star twinkle offset
      });
    }
    return stars;
  }

  const api = { generate, ALPHA_CAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { starfield: api });
})(typeof self !== 'undefined' ? self : globalThis);
