'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const moon = require('../extension/lib/moonphase.js');

const SYNODIC = 29.53059;
// Same locale-relative reference the lib uses, so the diff is timezone-independent.
const NEW_MOON = new Date(2000, 0, 6, 18, 14);
const plusDays = (d, n) => new Date(d.getTime() + n * 86400000);

test('phase is ~0 at a known new moon and ~0.5 a half-cycle later', () => {
  assert.ok(moon.phase(NEW_MOON) < 0.02, `expected ~0, got ${moon.phase(NEW_MOON)}`);
  const half = moon.phase(plusDays(NEW_MOON, SYNODIC / 2));
  assert.ok(Math.abs(half - 0.5) < 0.01, `expected ~0.5, got ${half}`);
});

test('phase stays in [0,1) for far-future, pre-epoch, and just-before dates', () => {
  for (const d of [plusDays(NEW_MOON, 100000), plusDays(NEW_MOON, -100000), plusDays(NEW_MOON, -0.5)]) {
    const p = moon.phase(d);
    assert.ok(p >= 0 && p < 1, `phase ${p} out of [0,1)`);
  }
});

test('phaseName buckets the cycle into the 8 lunar names (and wraps at the end)', () => {
  assert.equal(moon.phaseName(0), 'New Moon');
  assert.equal(moon.phaseName(0.125), 'Waxing Crescent');
  assert.equal(moon.phaseName(0.25), 'First Quarter');
  assert.equal(moon.phaseName(0.375), 'Waxing Gibbous');
  assert.equal(moon.phaseName(0.5), 'Full Moon');
  assert.equal(moon.phaseName(0.625), 'Waning Gibbous');
  assert.equal(moon.phaseName(0.75), 'Last Quarter');
  assert.equal(moon.phaseName(0.875), 'Waning Crescent');
  assert.equal(moon.phaseName(0.99), 'New Moon');   // wraps back to new
});

test('phaseName flips exactly at each of the 8 bucket boundaries', () => {
  const e = 1e-6;
  const pairs = [
    [0.0625, 'New Moon', 'Waxing Crescent'],
    [0.1875, 'Waxing Crescent', 'First Quarter'],
    [0.3125, 'First Quarter', 'Waxing Gibbous'],
    [0.4375, 'Waxing Gibbous', 'Full Moon'],
    [0.5625, 'Full Moon', 'Waning Gibbous'],
    [0.6875, 'Waning Gibbous', 'Last Quarter'],
    [0.8125, 'Last Quarter', 'Waning Crescent'],
    [0.9375, 'Waning Crescent', 'New Moon'],
  ];
  for (const [b, before, at] of pairs) {
    assert.equal(moon.phaseName(b - e), before, `just below ${b}`);
    assert.equal(moon.phaseName(b), at, `at ${b}`);
  }
});
