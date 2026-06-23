'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const rationale = require('../extension/lib/rationale.js');

// A recall row as the SW projects it: `frequent` is the revisit flag, `siblings` the
// session. A born-equal/no-signal row (Pattern 19) is { frequent: false, siblings: [] }.
function row(over) { return Object.assign({ frequent: false, siblings: [] }, over); }

test('U10: a frequently-revisited row reads "often revisited"', () => {
  assert.equal(rationale.compose(row({ frequent: true })), 'often revisited');
});

test('U10: a session-bearing row reads "same session as <host>"', () => {
  assert.equal(rationale.compose(row({ siblings: [{ url: 'https://github.com/o/r', host: 'github.com' }] })), 'same session as github.com');
});

test('U10: frequency takes priority over session', () => {
  assert.equal(rationale.compose(row({ frequent: true, siblings: [{ host: 'x.com' }] })), 'often revisited');
});

test('U10: a sibling with only a URL derives the host', () => {
  assert.equal(rationale.compose(row({ siblings: [{ url: 'https://docs.site.org/a' }] })), 'same session as docs.site.org');
});

test('U10/Pattern 19: a born-equal, no-signal row composes nothing (no false "recalled" claim, suppressed)', () => {
  assert.equal(rationale.compose(row()), '');
});

test('U10: a null / hostless sibling is inert (no crash, no "same session as " stub)', () => {
  assert.equal(rationale.compose(row({ siblings: [null] })), '');
  assert.equal(rationale.compose(row({ siblings: [{ host: null, url: null }] })), '');
});

test('U10: missing row is inert', () => {
  assert.equal(rationale.compose(null), '');
});
