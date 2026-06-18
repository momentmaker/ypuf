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

  // generate(count, w, h, seed) → [{ x, y, r, a, phase, period, warm }], deterministic for a
  // fixed seed. Stars are FIXED positions that breathe (a slow per-star pulse, `period` ms,
  // offset by `phase`); a few are warm-tinted. The host draws a soft glow that grows/shrinks
  // with the breath — no horizontal drift.
  function generate(count, w, h, seed) {
    const n = (Number.isFinite(count) && count > 0) ? Math.floor(count) : 0;
    const rand = mulberry32((seed >>> 0) || 1);
    const stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: rand() * w,
        y: rand() * h,
        r: 0.6 + rand() * 1.4,                          // base glow radius (×dpr at draw time)
        a: 0.2 + rand() * (ALPHA_CAP - 0.2),            // base opacity, capped ≤ ALPHA_CAP
        phase: rand() * Math.PI * 2,                    // per-star breath offset
        period: 3000 + rand() * 4000,                   // breath cycle, 3–7 s (calm)
        warm: rand() < 0.12,                            // a few warm-tinted stars
      });
    }
    return stars;
  }

  const api = { generate, ALPHA_CAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { starfield: api });
})(typeof self !== 'undefined' ? self : globalThis);
