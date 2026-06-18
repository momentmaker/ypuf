'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const eagerness = require('../extension/lib/eagerness.js');

const DAY = 86400000;

test('toWindowMs maps the three presets to ~7 / 3 / 1 days', () => {
  assert.equal(eagerness.toWindowMs('timid'), 7 * DAY);
  assert.equal(eagerness.toWindowMs('balanced'), 3 * DAY);
  assert.equal(eagerness.toWindowMs('bold'), 1 * DAY);
});

test('unknown / missing / non-string falls back to balanced (3 days) — the safe default', () => {
  assert.equal(eagerness.toWindowMs('nope'), 3 * DAY);
  assert.equal(eagerness.toWindowMs(''), 3 * DAY);
  assert.equal(eagerness.toWindowMs(undefined), 3 * DAY);
  assert.equal(eagerness.toWindowMs(null), 3 * DAY);
  assert.equal(eagerness.toWindowMs(42), 3 * DAY);
});

test('the mapping is monotonic: timid > balanced > bold (timid keeps tabs longest)', () => {
  assert.ok(eagerness.toWindowMs('timid') > eagerness.toWindowMs('balanced'));
  assert.ok(eagerness.toWindowMs('balanced') > eagerness.toWindowMs('bold'));
});

test('LEVELS is a stable ordered list of {key,label,days} for the segmented control', () => {
  assert.deepEqual(eagerness.LEVELS.map((l) => l.key), ['timid', 'balanced', 'bold']);
  for (const l of eagerness.LEVELS) {
    assert.equal(typeof l.label, 'string'); assert.ok(l.label.length);
    assert.equal(typeof l.days, 'number'); assert.ok(l.days > 0);
    assert.equal(eagerness.toWindowMs(l.key), l.days * DAY); // toWindowMs derives from LEVELS
  }
});

test('DEFAULT is balanced (preserves the shipped 3-day behavior for untouched installs)', () => {
  assert.equal(eagerness.DEFAULT, 'balanced');
  assert.equal(eagerness.toWindowMs(eagerness.DEFAULT), 3 * DAY);
});
