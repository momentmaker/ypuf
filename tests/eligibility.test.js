'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const eligibility = require('../extension/lib/eligibility.js');
const tabstate = require('../extension/lib/tabstate.js');
const exclusion = require('../extension/lib/exclusion.js');

// A graced, stale, lightly-touched, known-clean record — the zombie shape.
function zombieRec(over = {}) {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 0, {});
  tabstate.recordActivated(s, 1, 0, 'https://news.com/a'); // observed once, long ago
  tabstate.setDirty(s, 1, false);
  return Object.assign(s[1], over);
}

const TAB = { id: 1, url: 'https://news.com/a', incognito: false, audible: false, pinned: false, frozen: false };

const D = (over = {}) => Object.assign({
  rec: zombieRec(),
  tabstate,
  signal: { dwell: {}, revisits: {} },
  isProtected: () => false,
  classify: exclusion.classify,
  userBlocklist: [],
  now: 10_000,
  staleWindowMs: 1_000,
  dwellFloorMs: 5_000,
  activationFloor: 3,
}, over);

test('AE1: a stale, unengaged, never-touch-clear, capturable tab is a zombie', () => {
  assert.equal(eligibility.classify(TAB, D()), 'zombie');
});

test('AE2: audible / pinned / dirty / protected tabs are kept', () => {
  assert.equal(eligibility.classify({ ...TAB, audible: true }, D()), 'keep');
  assert.equal(eligibility.classify({ ...TAB, pinned: true }, D()), 'keep');
  assert.equal(eligibility.classify(TAB, D({ rec: zombieRec({ dirty: true }) })), 'keep');
  assert.equal(eligibility.classify(TAB, D({ isProtected: () => true })), 'keep');
});

test('unknown or frozen dirty-state fails safe (keep)', () => {
  assert.equal(eligibility.classify(TAB, D({ rec: zombieRec({ dirty: 'unknown' }) })), 'keep');
  assert.equal(eligibility.classify({ ...TAB, frozen: true }, D()), 'keep'); // frozen → dirtyOf unknown
});

test('P0 URL-drift: an engaged tab is kept even with zero per-URL signal', () => {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 0, {});
  tabstate.recordActivated(s, 1, 0, 'https://app.com/a');
  tabstate.recordActivated(s, 1, 1, 'https://app.com/b'); // navigated within the app
  tabstate.recordActivated(s, 1, 2, 'https://app.com/c');
  tabstate.setDirty(s, 1, false);
  // current URL has no dwell/revisit signal at all, yet the tab is engaged
  assert.equal(eligibility.classify({ ...TAB, url: 'https://app.com/c' }, D({ rec: s[1] })), 'keep');
});

test('corroborating per-URL signal keeps a tab (revisited or above dwell floor)', () => {
  assert.equal(eligibility.classify(TAB, D({ signal: { dwell: {}, revisits: { 'https://news.com/a': 1 } } })), 'keep');
  assert.equal(eligibility.classify(TAB, D({ signal: { dwell: { 'https://news.com/a': 6_000 }, revisits: {} } })), 'keep');
});

test('AE3: burst, in-grace, and never-observed tabs are kept', () => {
  assert.equal(eligibility.classify(TAB, D({ rec: zombieRec({ burst: true }) })), 'keep');
  // never observed (no record at all) → keep
  assert.equal(eligibility.classify(TAB, D({ rec: undefined })), 'keep');
  // observed-but-not-yet-stale → keep
  assert.equal(eligibility.classify(TAB, D({ now: 500 })), 'keep');
});

test('AE3: a created-but-never-activated tab is not graced → keep', () => {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 0, {});
  tabstate.setDirty(s, 1, false);
  assert.equal(eligibility.classify(TAB, D({ rec: s[1] })), 'keep');
});

test('AE4/R10: blocklisted, incognito, and restricted-scheme tabs are excluded', () => {
  assert.equal(eligibility.classify({ ...TAB, url: 'https://www.chase.com/x' }, D()), 'excluded');
  assert.equal(eligibility.classify({ ...TAB, incognito: true }, D()), 'excluded');
  assert.equal(eligibility.classify({ ...TAB, url: 'chrome://settings' }, D()), 'excluded');
  assert.equal(eligibility.classify({ ...TAB, url: 'https://site.com/a.pdf' }, D()), 'excluded');
});
