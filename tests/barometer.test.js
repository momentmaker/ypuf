'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const barometer = require('../extension/lib/barometer.js');
const { compute, CAP } = barometer;

test('empty queue → clear: no particles, no dot', () => {
  assert.deepEqual(compute({ back: 0, snoozed: 0 }), {
    state: 'clear', particles: 0, dot: false,
  });
});

test('snoozed only → scheduled: particles = snoozed count, no dot', () => {
  assert.deepEqual(compute({ back: 0, snoozed: 2 }), {
    state: 'scheduled', particles: 2, dot: false,
  });
});

test('any back → back-now: dot true, particles = back count', () => {
  assert.deepEqual(compute({ back: 1, snoozed: 0 }), {
    state: 'back-now', particles: 1, dot: true,
  });
});

test('back-now dominates when both back and snoozed are present', () => {
  const r = compute({ back: 2, snoozed: 5 });
  assert.equal(r.state, 'back-now');
  assert.equal(r.dot, true);
  assert.equal(r.particles, 2); // reflects the back count, not the snoozed
});

test('particles clamp to CAP in scheduled', () => {
  assert.equal(compute({ back: 0, snoozed: CAP + 7 }).particles, CAP);
});

test('particles clamp to CAP in back-now', () => {
  assert.equal(compute({ back: CAP + 3, snoozed: 0 }).particles, CAP);
});

test('CAP is a small positive integer (calm — not a busy 16px favicon)', () => {
  assert.equal(typeof CAP, 'number');
  assert.ok(CAP >= 1 && CAP <= 6 && Number.isInteger(CAP));
});

test('arrays passed by mistake coerce to clear, never crash (counts-not-arrays guard)', () => {
  assert.deepEqual(compute({ back: [], snoozed: [{}, {}] }), {
    state: 'clear', particles: 0, dot: false,
  });
});

test('null / undefined / missing input → clear, no throw', () => {
  assert.equal(compute(null).state, 'clear');
  assert.equal(compute(undefined).state, 'clear');
  assert.equal(compute({}).state, 'clear');
});

test('non-numeric / negative / NaN fields → clear', () => {
  assert.equal(compute({ back: 'x', snoozed: NaN }).state, 'clear');
  assert.equal(compute({ back: -3, snoozed: -1 }).state, 'clear');
});

test('fractional counts floor (defensive — counts should be integers)', () => {
  assert.equal(compute({ back: 0, snoozed: 2.9 }).particles, 2);
});
