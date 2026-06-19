'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { scene, BOX } = require('../extension/lib/puffscene.js');
const { compute } = require('../extension/lib/barometer.js');

const ROLES = new Set(['core', 'particle', 'dot']);
const only = (prims, role) => prims.filter((p) => p.role === role);
const CLEAR = compute({ back: 0, snoozed: 0 });
const SCHEDULED = compute({ back: 0, snoozed: 2 });
const BACKNOW = compute({ back: 3, snoozed: 0 });

test('every primitive is well-formed: numeric x/y/r/opacity and a known role', () => {
  for (const b of [CLEAR, SCHEDULED, BACKNOW]) {
    for (const p of scene(b, 0.5)) {
      for (const k of ['x', 'y', 'r', 'opacity']) {
        assert.equal(typeof p[k], 'number', `${k} numeric`);
        assert.ok(Number.isFinite(p[k]), `${k} finite`);
      }
      assert.ok(ROLES.has(p.role), `role ${p.role} known`);
      assert.ok(p.x >= 0 && p.x <= BOX && p.y >= 0 && p.y <= BOX, 'inside the box');
      assert.ok(p.opacity >= 0 && p.opacity <= 1, 'opacity in [0,1] (canvas globalAlpha clamps silently)');
    }
  }
});

test('clear → only the base puff core circles, no particles, no dot', () => {
  const prims = scene(CLEAR, 0.5);
  assert.equal(only(prims, 'particle').length, 0);
  assert.equal(only(prims, 'dot').length, 0);
  assert.ok(only(prims, 'core').length >= 3, 'the puff is its core circles');
});

test('scheduled → core + N particles drifting up (no dot)', () => {
  const prims = scene(SCHEDULED, 0.5);
  const particles = only(prims, 'particle');
  assert.equal(particles.length, SCHEDULED.particles); // 2
  assert.equal(only(prims, 'dot').length, 0);
  // "up" = the upper region of the box (smaller y)
  for (const p of particles) assert.ok(p.y < BOX / 2, 'scheduled particle sits high');
});

test('back-now → core + N settled particles + exactly one dot', () => {
  const prims = scene(BACKNOW, 0.5);
  const particles = only(prims, 'particle');
  assert.equal(particles.length, BACKNOW.particles); // 3
  assert.equal(only(prims, 'dot').length, 1);
  // "down" = the lower region (larger y), distinct from scheduled's up
  for (const p of particles) assert.ok(p.y > BOX / 2, 'back-now particle has settled low');
});

test('the dot appears only in back-now', () => {
  assert.equal(only(scene(CLEAR, 0.5), 'dot').length, 0);
  assert.equal(only(scene(SCHEDULED, 0.5), 'dot').length, 0);
  assert.equal(only(scene(BACKNOW, 0.5), 'dot').length, 1);
});

test('breath modulates the scene: breath 0 vs 1 changes core size and particle position', () => {
  const a = scene(SCHEDULED, 0);
  const b = scene(SCHEDULED, 1);
  const coreA = only(a, 'core')[0];
  const coreB = only(b, 'core')[0];
  assert.notEqual(coreA.r, coreB.r, 'core breathes (scale changes with breath)');
  const pa = only(a, 'particle')[0];
  const pb = only(b, 'particle')[0];
  assert.notEqual(pa.y, pb.y, 'particle drift offset changes with breath');
});

test('deterministic: same (state, breath) → identical primitives', () => {
  assert.deepEqual(scene(BACKNOW, 0.37), scene(BACKNOW, 0.37));
});

test('reduced-motion still frame (fixed breath) keeps scheduled distinct from clear', () => {
  // No motion: a single fixed breath. Scheduled must still carry its particles so a
  // reduced-motion user reads "scheduled" by configuration, not by drift animation.
  const still = 0.5;
  assert.equal(only(scene(CLEAR, still), 'particle').length, 0);
  assert.equal(only(scene(SCHEDULED, still), 'particle').length, SCHEDULED.particles);
  assert.ok(SCHEDULED.particles > 0);
});

test('back-now particles also bob with breath (not just scheduled)', () => {
  const pa = only(scene(BACKNOW, 0), 'particle')[0];
  const pb = only(scene(BACKNOW, 1), 'particle')[0];
  assert.notEqual(pa.y, pb.y);
});

test('breath is clamped to [0,1]; out-of-range matches the endpoint', () => {
  assert.deepEqual(scene(SCHEDULED, -1), scene(SCHEDULED, 0));
  assert.deepEqual(scene(SCHEDULED, 2), scene(SCHEDULED, 1));
});

test('a null / missing barometer → core-only, no particles, no dot, no throw', () => {
  const prims = scene(null, 0.5);
  assert.equal(only(prims, 'particle').length, 0);
  assert.equal(only(prims, 'dot').length, 0);
  assert.ok(only(prims, 'core').length >= 3);
});
