/*
 * ypuf — the living-puff favicon scene: a barometer state + a breath phase →
 * a flat list of drawable primitives the host paints to a canvas.
 *
 * Pure. No canvas, no color: each primitive carries a `role` (core | particle |
 * dot) and the host maps that role to a palette fill and draws in array order
 * (back→front: core, particles, dot — the host paints the night glow behind all
 * of this first). Coordinates are in a BOX-unit square; the host scales to its
 * favicon canvas. `breath ∈ [0,1]` modulates the core's gentle scale/opacity and
 * the particle drift — a fixed breath gives the reduced-motion still frame, which
 * still carries the state by configuration (particles present + dot), not motion.
 * The geometry is the ypuf puff mark (the four drifting circles) scaled into BOX.
 */
(function (root) {
  'use strict';

  const BOX = 32;

  // The puff mark — the four drifting circles, scaled ×2 from the 16-unit viewBox.
  const CORE = [
    { x: 10.6, y: 21.4, r: 7.0, op: 1.0 },
    { x: 19.4, y: 14.6, r: 3.5, op: 0.72 },
    { x: 24.6, y: 9.8, r: 2.1, op: 0.5 },
    { x: 28.0, y: 6.4, r: 1.24, op: 0.32 },
  ];

  const BREATH_SCALE = 0.08; // ±4% core scale across the breath
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function coreCircles(breath) {
    const scale = 1 + BREATH_SCALE * (breath - 0.5);
    const alpha = 0.9 + 0.1 * breath;
    return CORE.map((c) => ({ x: c.x, y: c.y, r: c.r * scale, opacity: c.op * alpha, role: 'core' }));
  }

  // Scheduled: a faint trail drifting UP-right off the puff (the upper half of the
  // box), rising further with the breath — "tabs heading out, coming back later".
  function driftUp(n, breath) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        x: clamp(21 + i * 2.6, 0, BOX),
        y: clamp(8 - i * 1.6 - breath * 2, 0, BOX),
        r: 1.3,
        opacity: clamp(0.5 - i * 0.06, 0.15, 1),
        role: 'particle',
      });
    }
    return out;
  }

  // Back-now: particles settled at the puff's base (the lower half), with a gentle
  // breath bob — "they've come home and are waiting".
  function driftDown(n, breath) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        x: clamp(8 + i * 3.2, 0, BOX),
        y: clamp(24 + (i % 2) * 1.5 + breath * 1.2, 0, BOX),
        r: 1.5,
        opacity: 0.55,
        role: 'particle',
      });
    }
    return out;
  }

  function scene(barometer, breath) {
    const b = (typeof breath === 'number' && Number.isFinite(breath)) ? clamp(breath, 0, 1) : 0.5;
    const state = barometer && barometer.state;
    const n = (barometer && barometer.particles) || 0;
    const prims = coreCircles(b); // core first (drawn just over the host's night glow)
    if (state === 'scheduled') prims.push(...driftUp(n, b));
    else if (state === 'back-now') prims.push(...driftDown(n, b));
    // The amber dot draws LAST so a particle can never occlude the load-bearing signal.
    if (barometer && barometer.dot) prims.push({ x: 26, y: 26, r: 4, opacity: 1, role: 'dot' });
    return prims;
  }

  const api = { scene, BOX };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { puffscene: api });
})(typeof self !== 'undefined' ? self : globalThis);
