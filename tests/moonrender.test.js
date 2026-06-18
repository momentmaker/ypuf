'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const mr = require('../extension/lib/moonrender.js');

// The two-disc geometry is the one decidable piece of the DOM renderer (pattern 18);
// the SVG materialisation stays untested (DOM, MANUAL-DOGFOOD).
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('geometry: new moon (phase 0) → all dark (f≈0, shadow centred on the disc)', () => {
  const g = mr.geometry(0);
  assert.ok(near(g.f, 0), `f=${g.f}`);
  assert.ok(near(g.shadowX, 16), `shadowX=${g.shadowX}`);
});

test('geometry: first quarter (0.25) → half lit, waxing (shadow displaced left to x=3)', () => {
  const g = mr.geometry(0.25);
  assert.ok(near(g.f, 0.5), `f=${g.f}`);
  assert.equal(g.waning, false);
  assert.ok(near(g.shadowX, 3), `shadowX=${g.shadowX}`);
});

test('geometry: full moon (0.5) → all lit (shadow pushed off-disc to x=42), waning side begins', () => {
  const g = mr.geometry(0.5);
  assert.ok(near(g.f, 1), `f=${g.f}`);
  assert.equal(g.waning, true);
  assert.ok(near(g.shadowX, 42), `shadowX=${g.shadowX}`);
});

test('geometry: last quarter (0.75) → half lit, waning (shadow displaced right to x=29)', () => {
  const g = mr.geometry(0.75);
  assert.ok(near(g.f, 0.5), `f=${g.f}`);
  assert.equal(g.waning, true);
  assert.ok(near(g.shadowX, 29), `shadowX=${g.shadowX}`);
});

test('geometry: a waxing crescent (small phase) reveals a thin lit limb (shadow nearly centred)', () => {
  const g = mr.geometry(0.05);
  assert.ok(g.f > 0 && g.f < 0.15, `f=${g.f}`);     // small illuminated fraction
  assert.equal(g.waning, false);
  assert.ok(g.shadowX < 16 && g.shadowX > 16 - 26 * 0.15, `shadowX=${g.shadowX}`); // displaced slightly left
});
