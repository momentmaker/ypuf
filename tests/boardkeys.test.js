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

test('reanchor advances onto the next row when the cursored row is the one that left', () => {
  // The forget bug: cursor on a row, that row leaves the navigable set (struck), list
  // shrinks by one — the cursor must fall onto the row that took its slot, NOT stay put
  // counting the gone row, so the next delete targets where the user expects.
  assert.equal(bk.reanchor(0, -1, 6), 0);   // deleted the first row → cursor now on the new first
  assert.equal(bk.reanchor(2, -1, 6), 2);   // deleted a middle row → cursor on the row that followed
});

test('reanchor clamps onto the new last row when the cursored last row left', () => {
  assert.equal(bk.reanchor(6, -1, 6), 5);   // was last of 7, now last of 6
});

test('reanchor keeps the highlight on a surviving cursor row, just re-indexed', () => {
  // A row elsewhere left (e.g. mouse-forget above the cursor); the cursor's own row
  // survives at a new index — keep it there, don't drag the highlight.
  assert.equal(bk.reanchor(3, 1, 5), 1);
});

test('reanchor returns -1 when there is no cursor or no rows left', () => {
  assert.equal(bk.reanchor(-1, -1, 5), -1);  // no active cursor
  assert.equal(bk.reanchor(2, -1, 0), -1);   // last row forgotten → nothing to land on
});

test('intent maps the vim normal-mode keys', () => {
  const m = (k) => bk.intent(k, {});
  assert.equal(m('j'), 'down'); assert.equal(m('k'), 'up');
  assert.equal(m('o'), 'open'); assert.equal(m('Enter'), 'open');
  assert.equal(m('r'), 'restoreSet');
  assert.equal(m('d'), 'forget'); assert.equal(m('u'), 'undo');
  assert.equal(m('p'), 'protect'); assert.equal(m('/'), 'search');
  assert.equal(m('g'), 'g'); assert.equal(m('G'), 'bottom');
  assert.equal(m('e'), 'edit'); assert.equal(m('f'), 'hints');
  assert.equal(m('?'), 'help'); assert.equal(m('Escape'), 'escape');
});

test('intent returns none for unhandled keys, incl. arrows (cells own lane reorder)', () => {
  assert.equal(bk.intent('z', {}), 'none');
  assert.equal(bk.intent('x', {}), 'none');   // freed: delete moved to 'd'
  assert.equal(bk.intent('1', {}), 'none');
  assert.equal(bk.intent('Tab', {}), 'none');
  assert.equal(bk.intent('ArrowDown', {}), 'none');
  assert.equal(bk.intent('ArrowUp', {}), 'none');
});

test('intent yields to a focused field — only Escape passes through', () => {
  const ctx = { fieldFocused: true };
  assert.equal(bk.intent('j', ctx), 'none');
  assert.equal(bk.intent('?', ctx), 'none');     // ? must type a literal ? in a field
  assert.equal(bk.intent('d', ctx), 'none');
  assert.equal(bk.intent('r', ctx), 'none');
  assert.equal(bk.intent('Escape', ctx), 'escape'); // Esc still blurs the field
});
