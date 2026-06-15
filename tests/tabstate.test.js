'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const tabstate = require('../extension/lib/tabstate.js');

// --- staleness / grace -----------------------------------------------------

test('a tab idle past the window with no engagement is stale; a fresh one is not', () => {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 0, {});
  tabstate.recordActivated(s, 1, 0);          // observed once, long ago
  tabstate.recordCreated(s, 2, 9_000, {});
  tabstate.recordActivated(s, 2, 9_000);      // observed just now
  const now = 10_000, window = 5_000;
  assert.equal(tabstate.isStale(s[1], now, window), true);
  assert.equal(tabstate.isStale(s[2], now, window), false);
});

test('AE6: a tab idle past the window but recently re-activated is NOT stale', () => {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 0, {});
  tabstate.recordActivated(s, 1, 0);
  tabstate.recordActivated(s, 1, 9_500);      // came back to it
  assert.equal(tabstate.isStale(s[1], 10_000, 5_000), false);
});

test('gracePassed is false until the tab has been the active tab at least once', () => {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 0, {});        // created in background, never activated
  assert.equal(tabstate.gracePassed(s[1]), false);
  tabstate.recordActivated(s, 1, 100);
  assert.equal(tabstate.gracePassed(s[1]), true);
});

// --- engagement (URL-drift safety, P0) -------------------------------------

test('a tab activated at/above the floor is engaged regardless of URL', () => {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 0, { host: 'app.com' });
  tabstate.recordActivated(s, 1, 1, 'app.com/a');
  tabstate.recordActivated(s, 1, 2, 'app.com/b');   // navigated within the SPA
  tabstate.recordActivated(s, 1, 3, 'app.com/c');
  assert.equal(tabstate.isEngaged(s[1], 3), true);
  assert.equal(tabstate.isEngaged(s[1], 5), false);
});

// --- burst / restored session (AE3) ----------------------------------------

test('AE3: tabs created inside the post-startup grace window are flagged burst', () => {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 1_000, { startupAt: 0, startupGraceMs: 5_000 });
  assert.equal(tabstate.isBurst(s[1]), true);
  tabstate.recordCreated(s, 2, 9_000, { startupAt: 0, startupGraceMs: 5_000 });
  assert.equal(tabstate.isBurst(s[2]), false);
});

test('AE3: a dense burst of opener-less tabs is flagged burst (open-all-bookmarks)', () => {
  const s = tabstate.emptyState();
  const opts = { burstWindowMs: 1_000, burstMinCluster: 3 };
  tabstate.recordCreated(s, 1, 100, opts);
  tabstate.recordCreated(s, 2, 200, opts);
  tabstate.recordCreated(s, 3, 300, opts);   // third opener-less tab inside the window
  assert.equal(tabstate.isBurst(s[1]), true);
  assert.equal(tabstate.isBurst(s[2]), true);
  assert.equal(tabstate.isBurst(s[3]), true);
});

test('a tab opened from a link (has opener) is not treated as a burst', () => {
  const s = tabstate.emptyState();
  const opts = { burstWindowMs: 1_000, burstMinCluster: 2 };
  tabstate.recordCreated(s, 1, 100, Object.assign({ openerTabId: 7 }, opts));
  tabstate.recordCreated(s, 2, 150, Object.assign({ openerTabId: 7 }, opts));
  assert.equal(tabstate.isBurst(s[1]), false);
  assert.equal(tabstate.isBurst(s[2]), false);
});

// --- cold-start fail-safe --------------------------------------------------

test('a tab with no persisted record fails safe: not graced, not engaged, not stale', () => {
  const s = tabstate.emptyState();              // SW never saw this tab (asleep during restore)
  assert.equal(tabstate.gracePassed(s[999]), false);
  assert.equal(tabstate.isEngaged(s[999], 1), false);
  assert.equal(tabstate.isStale(s[999], 1e9, 1), false);
});

// --- dirty-state (U3 lands here) -------------------------------------------

test('dirtyOf: unknown when unobserved, reflects last-known when set', () => {
  const s = tabstate.emptyState();
  assert.equal(tabstate.dirtyOf(s[1], { id: 1 }), 'unknown');
  tabstate.recordCreated(s, 1, 0, {});
  assert.equal(tabstate.dirtyOf(s[1], { id: 1 }), 'unknown');  // created but never reported
  tabstate.setDirty(s, 1, false);
  assert.equal(tabstate.dirtyOf(s[1], { id: 1 }), false);
  tabstate.setDirty(s, 1, true);
  assert.equal(tabstate.dirtyOf(s[1], { id: 1 }), true);
});

test('a frozen tab degrades to unknown even with a last-known clean value', () => {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 0, {});
  tabstate.setDirty(s, 1, false);
  assert.equal(tabstate.dirtyOf(s[1], { id: 1, frozen: true }), 'unknown');
});

// --- persistence faithfulness + purge --------------------------------------

test('state round-trips through JSON (storage faithfulness, no in-memory-only fields)', () => {
  const s = tabstate.emptyState();
  tabstate.recordCreated(s, 1, 0, { host: 'a.com' });
  tabstate.recordActivated(s, 1, 5, 'a.com/x');
  const revived = JSON.parse(JSON.stringify(s));
  assert.equal(tabstate.isEngaged(revived[1], 1), true);
  assert.equal(revived[1].lastActivatedAt, 5);
});

test('deleteByTabId and deleteByDomain purge per-tab records', () => {
  const s = tabstate.emptyState();
  tabstate.recordActivated(s, 1, 0, 'https://bank.com/a');
  tabstate.recordActivated(s, 2, 0, 'https://sub.bank.com/b');
  tabstate.recordActivated(s, 3, 0, 'https://news.com/c');
  tabstate.deleteByDomain(s, 'bank.com');
  assert.deepEqual(Object.keys(s), ['3']);
  tabstate.deleteByTabId(s, 3);
  assert.deepEqual(Object.keys(s), []);
});
