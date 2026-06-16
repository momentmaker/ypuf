'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const cluster = require('../extension/lib/cluster.js');
const exclusion = require('../extension/lib/exclusion.js');

const NOW = 1_000_000_000;
const CO = 5 * 60 * 1000;     // co-activation window
const BURST = 90 * 1000;      // temporal-burst (created-together) window

function opts(over) {
  return Object.assign({
    classify: exclusion.classify,
    userBlocklist: [],
    tabstate: {},
    now: NOW,
    maxSize: 8,
    coWindowMs: CO,
    burstWindowMs: BURST,
  }, over);
}

// A plain Chrome-Tab-shaped object (what chrome.tabs.query returns).
function tab(id, url, over) {
  return Object.assign({ id, url, title: 'T' + id, windowId: 10, openerTabId: undefined, incognito: false }, over);
}

function urls(set) { return set.map((s) => s.url); }

// --- spawn-tree -------------------------------------------------------------

test('children sharing the anchor as opener are siblings', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [
    anchor,
    tab(2, 'https://b.com/x', { openerTabId: 1 }),
    tab(3, 'https://c.com/y', { openerTabId: 1 }),
    tab(4, 'https://d.com/z', { windowId: 99, openerTabId: 1 }), // other window
  ];
  const set = cluster.computeSet(anchor, open, opts());
  assert.deepEqual(urls(set).sort(), ['https://b.com/x', 'https://c.com/y']);
});

test('tabs sharing the anchor’s opener are siblings', () => {
  const anchor = tab(2, 'https://a.com/', { openerTabId: 1, windowId: 10 });
  const open = [
    tab(1, 'https://opener.com/', {}),               // the shared opener itself
    anchor,
    tab(3, 'https://c.com/y', { openerTabId: 1 }),    // same opener as anchor
  ];
  const set = cluster.computeSet(anchor, open, opts());
  assert.ok(urls(set).includes('https://c.com/y'));
  assert.ok(urls(set).includes('https://opener.com/')); // anchor.openerTabId === tab.id
});

// --- orphan fallback (co-activation + temporal burst from the tabstate map) --

test('orphan anchor clusters a co-active same-window tab via the tabstate map', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 }); // no opener
  const open = [anchor, tab(2, 'https://b.com/x', { windowId: 10 })];
  const tabstate = {
    1: { createdAt: NOW - 1e6, lastActivatedAt: NOW },
    2: { createdAt: NOW - 1e6, lastActivatedAt: NOW - 60_000 }, // within CO
  };
  const set = cluster.computeSet(anchor, open, opts({ tabstate }));
  assert.deepEqual(urls(set), ['https://b.com/x']);
});

test('orphan anchor clusters a temporally-bursty same-window tab (created together)', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [anchor, tab(2, 'https://b.com/x', { windowId: 10 })];
  const tabstate = {
    1: { createdAt: NOW, lastActivatedAt: null },
    2: { createdAt: NOW - 30_000, lastActivatedAt: null }, // within BURST
  };
  const set = cluster.computeSet(anchor, open, opts({ tabstate }));
  assert.deepEqual(urls(set), ['https://b.com/x']);
});

test('a same-window tab with no spawn/co-activation/burst signal is NOT a sibling', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [anchor, tab(2, 'https://b.com/x', { windowId: 10 })];
  const tabstate = {
    1: { createdAt: NOW, lastActivatedAt: NOW },
    2: { createdAt: NOW - 10 * 60 * 1000, lastActivatedAt: NOW - 10 * 60 * 1000 }, // outside both windows
  };
  assert.deepEqual(cluster.computeSet(anchor, open, opts({ tabstate })), []);
});

test('an anchor open alone gets no set', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  assert.deepEqual(cluster.computeSet(anchor, [anchor], opts()), []);
});

test('a candidate in a different window is excluded', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [anchor, tab(2, 'https://b.com/x', { windowId: 11, openerTabId: 1 })];
  assert.deepEqual(cluster.computeSet(anchor, open, opts()), []);
});

// --- privacy gate (R5: exclude blocklisted / incognito / restricted) --------

test('a blocklisted candidate is excluded from the set', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [anchor, tab(2, 'https://www.chase.com/account?id=9', { openerTabId: 1 })];
  assert.deepEqual(cluster.computeSet(anchor, open, opts()), []);
});

test('an incognito candidate is excluded from the set', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [anchor, tab(2, 'https://secret.com/x', { openerTabId: 1, incognito: true })];
  assert.deepEqual(cluster.computeSet(anchor, open, opts()), []);
});

test('a restricted-scheme candidate is excluded from the set', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [anchor, tab(2, 'chrome://settings', { openerTabId: 1 })];
  assert.deepEqual(cluster.computeSet(anchor, open, opts()), []);
});

test('an extractable sibling URL with a query string is stored query-stripped', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [anchor, tab(2, 'https://example.com/p?token=abc#frag', { openerTabId: 1 })];
  const set = cluster.computeSet(anchor, open, opts());
  assert.deepEqual(set, [{ url: 'https://example.com/p', title: 'T2', host: 'example.com' }]);
});

// --- cap + determinism ------------------------------------------------------

test('the set is capped and the cap is deterministic across runs', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [anchor];
  const tabstate = { 1: { createdAt: NOW, lastActivatedAt: NOW } };
  for (let i = 2; i <= 13; i++) {                       // 12 candidate children
    open.push(tab(i, `https://s${i}.com/p`, { openerTabId: 1 }));
    tabstate[i] = { createdAt: NOW, lastActivatedAt: NOW - i * 1000 }; // distinct recency
  }
  const a = cluster.computeSet(anchor, open, opts({ tabstate, maxSize: 8 }));
  const b = cluster.computeSet(anchor, [...open].reverse(), opts({ tabstate, maxSize: 8 }));
  assert.equal(a.length, 8);
  assert.deepEqual(urls(a), urls(b));                  // order-independent → reproducible
  // most-recently-activated survive (ids 2..9); 12 & 13 (oldest) dropped
  assert.ok(!urls(a).includes('https://s13.com/p'));
  assert.ok(urls(a).includes('https://s2.com/p'));
});

test('each member of a same-window cluster sees the others from one snapshot (sweep order-independence)', () => {
  const open = [
    tab(1, 'https://a.com/', { windowId: 10, openerTabId: 5 }),
    tab(2, 'https://b.com/', { windowId: 10, openerTabId: 5 }),
    tab(3, 'https://c.com/', { windowId: 10, openerTabId: 5 }),
  ];
  assert.deepEqual(urls(cluster.computeSet(open[0], open, opts())).sort(), ['https://b.com/', 'https://c.com/']);
  assert.deepEqual(urls(cluster.computeSet(open[1], open, opts())).sort(), ['https://a.com/', 'https://c.com/']);
  assert.deepEqual(urls(cluster.computeSet(open[2], open, opts())).sort(), ['https://a.com/', 'https://b.com/']);
});

test('spawn-tree siblings outrank co-activation-only siblings when over the cap', () => {
  const anchor = tab(1, 'https://a.com/', { windowId: 10 });
  const open = [anchor];
  const tabstate = { 1: { createdAt: NOW, lastActivatedAt: NOW } };
  // one spawn-tree child + two co-active-only tabs, cap of 1 → the child wins
  open.push(tab(2, 'https://child.com/', { openerTabId: 1 }));
  tabstate[2] = { createdAt: NOW - 1e6, lastActivatedAt: NOW - 4 * 60 * 1000 };
  open.push(tab(3, 'https://co.com/', { windowId: 10 }));
  tabstate[3] = { createdAt: NOW - 1e6, lastActivatedAt: NOW };
  const set = cluster.computeSet(anchor, open, opts({ tabstate, maxSize: 1 }));
  assert.deepEqual(urls(set), ['https://child.com/']);
});
