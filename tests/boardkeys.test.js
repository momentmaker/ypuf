'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const bk = require('../extension/lib/boardkeys.js');

test('moveCursor clamps within [0, len-1]', () => {
  assert.equal(bk.moveCursor(0, 1, 3), 1);
  assert.equal(bk.moveCursor(2, 1, 3), 2);
  assert.equal(bk.moveCursor(0, -1, 3), 0);
});

test('moveCursor clamps a stale out-of-range cursor (list shrank under it)', () => {
  assert.equal(bk.moveCursor(5, 1, 3), 2);
  assert.equal(bk.moveCursor(5, -1, 3), 2);
});

test('moveCursor from -1 enters at an end by direction', () => {
  assert.equal(bk.moveCursor(-1, 1, 3), 0);   // forward → first row
  assert.equal(bk.moveCursor(-1, -1, 3), 2);  // backward → last row
});

test('moveCursor on an empty list returns -1 (no row to land on)', () => {
  assert.equal(bk.moveCursor(-1, 1, 0), -1);
  assert.equal(bk.moveCursor(0, 1, 0), -1);
});

test('intent maps the vim normal-mode keys', () => {
  const m = (k) => bk.intent(k, {});
  assert.equal(m('j'), 'down'); assert.equal(m('k'), 'up');
  assert.equal(m('o'), 'open'); assert.equal(m('Enter'), 'open');
  assert.equal(m('x'), 'forget'); assert.equal(m('u'), 'undo');
  assert.equal(m('p'), 'protect'); assert.equal(m('/'), 'search');
  assert.equal(m('g'), 'g'); assert.equal(m('G'), 'bottom');
  assert.equal(m('e'), 'edit'); assert.equal(m('f'), 'hints');
  assert.equal(m('?'), 'help'); assert.equal(m('Escape'), 'escape');
});

test('intent returns none for unhandled keys, incl. arrows (cells own lane reorder)', () => {
  assert.equal(bk.intent('z', {}), 'none');
  assert.equal(bk.intent('1', {}), 'none');
  assert.equal(bk.intent('Tab', {}), 'none');
  assert.equal(bk.intent('ArrowDown', {}), 'none');
  assert.equal(bk.intent('ArrowUp', {}), 'none');
});

test('intent yields to a focused field — only Escape passes through', () => {
  const ctx = { fieldFocused: true };
  assert.equal(bk.intent('j', ctx), 'none');
  assert.equal(bk.intent('?', ctx), 'none');     // ? must type a literal ? in a field
  assert.equal(bk.intent('x', ctx), 'none');
  assert.equal(bk.intent('Escape', ctx), 'escape'); // Esc still blurs the field
});
