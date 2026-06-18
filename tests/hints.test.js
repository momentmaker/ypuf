'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const hints = require('../extension/lib/hints.js');

test('assign returns N distinct single-char labels for small N', () => {
  const a = hints.assign(3);
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  assert.ok(a.every((l) => l.length === 1));
});

test('assign is deterministic — same N, same labels in the same order', () => {
  assert.deepEqual(hints.assign(5), hints.assign(5));
});

test('assign escalates to uniform two-char labels past the alphabet (no prefix ambiguity)', () => {
  const a = hints.assign(40);
  assert.equal(a.length, 40);
  assert.equal(new Set(a).size, 40);          // all unique
  assert.ok(a.every((l) => l.length === 2));  // all 2-char → no 1-char is a prefix of a 2-char
});

test('assign mode boundary: 26 stays 1-char, 27 flips entirely to 2-char', () => {
  assert.ok(hints.assign(26).every((l) => l.length === 1));
  assert.ok(hints.assign(27).every((l) => l.length === 2));
});

test('assign saturates at alphabet^2 (676) rather than throwing', () => {
  assert.equal(hints.assign(677).length, 676);
});

test('assign edge cases: 0, negative, non-number → empty', () => {
  assert.deepEqual(hints.assign(0), []);
  assert.deepEqual(hints.assign(-3), []);
  assert.deepEqual(hints.assign(undefined), []);
});

test('match resolves an exact label to its index (incl. index 0)', () => {
  const labels = hints.assign(3);
  assert.deepEqual(hints.match(labels[0], labels), { index: 0 });
  assert.deepEqual(hints.match(labels[1], labels), { index: 1 });
});

test('match is case-sensitive — callers (the host) must lowercase before calling', () => {
  const labels = hints.assign(3);   // lowercase labels
  assert.deepEqual(hints.match(labels[0].toUpperCase(), labels), { noMatch: true });
});

test('match signals needMore for a live prefix and noMatch for an absent one', () => {
  const labels = hints.assign(40);          // two-char labels
  const firstChar = labels[0][0];
  assert.deepEqual(hints.match(firstChar, labels), { needMore: true }); // a char that begins some label
  assert.deepEqual(hints.match(labels[0], labels), { index: 0 });        // the full label
  assert.deepEqual(hints.match('zq9', labels), { noMatch: true });       // nothing starts with this
});

test('match: empty prefix needs more (nothing typed yet)', () => {
  const labels = hints.assign(3);
  assert.deepEqual(hints.match('', labels), { needMore: true });
});
