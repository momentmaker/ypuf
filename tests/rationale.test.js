'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const rationale = require('../extension/lib/rationale.js');

const DAY = 86400000;
// A born-equal record (Pattern 19): lastAccessed === timestamp, i.e. never recalled.
function rec(over) {
  const base = { id: 'r', url: 'https://e.com/a', host: 'e.com', timestamp: 500 * DAY, siblings: [] };
  const r = Object.assign(base, over);
  if (r.lastAccessed === undefined) r.lastAccessed = r.timestamp;
  return r;
}
const sig = (over) => Object.assign({ revisits: {}, dwell: {}, lastActiveAt: {} }, over);

test('U10: a frequently-revisited page reads "often revisited"', () => {
  const r = rec({ url: 'https://e.com/pr' });
  assert.equal(rationale.compose(r, sig({ revisits: { 'https://e.com/pr': 7 } })), 'often revisited');
});

test('U10: a session-bearing page reads "same session as <host>"', () => {
  const r = rec({ siblings: [{ url: 'https://github.com/o/r', host: 'github.com' }] });
  assert.equal(rationale.compose(r, sig()), 'same session as github.com');
});

test('U10: frequency takes priority over session', () => {
  const r = rec({ url: 'https://e.com/x', siblings: [{ host: 'x.com' }] });
  assert.equal(rationale.compose(r, sig({ revisits: { 'https://e.com/x': 9 } })), 'often revisited');
});

test('U10: a sibling with only a URL derives the host', () => {
  const r = rec({ siblings: [{ url: 'https://docs.site.org/a' }] });
  assert.equal(rationale.compose(r, sig()), 'same session as docs.site.org');
});

test('U10/Pattern 19: a born-equal, no-signal row composes nothing (no false "recalled" claim, suppressed)', () => {
  const r = rec(); // never recalled, no revisits, no siblings
  assert.equal(rationale.compose(r, sig()), '');
});

test('U10: below the frequency bar AND no session -> suppressed (the meta line already shows recency)', () => {
  const r = rec({ url: 'https://e.com/y' });
  assert.equal(rationale.compose(r, sig({ revisits: { 'https://e.com/y': 1 } })), '');
});

test('U10: missing record / signal is inert', () => {
  assert.equal(rationale.compose(null, sig()), '');
  assert.equal(rationale.compose(rec(), null), '');
});
