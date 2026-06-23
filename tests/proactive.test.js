'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const proactive = require('../extension/lib/proactive.js');

const DAY = 86400000;
const NOW = 1000 * DAY;

function rec(id, url) { return { id, url: url || ('https://e.com/' + id) }; }

test('U9/AE3: a recently-active, revisited record ranks above an equally-recent untouched one', () => {
  const records = [rec('cold', 'https://e.com/cold'), rec('hot', 'https://e.com/hot')];
  const signal = {
    revisits: { 'https://e.com/hot': 10 },
    lastActiveAt: { 'https://e.com/hot': NOW - 1 * DAY, 'https://e.com/cold': NOW - 1 * DAY },
  };
  const out = proactive.rank(records, signal, NOW).map((r) => r.id);
  assert.equal(out[0], 'hot');
});

test('U9: recency outranks staleness for equally-revisited records', () => {
  const records = [rec('stale', 'https://e.com/s'), rec('fresh', 'https://e.com/f')];
  const signal = {
    revisits: { 'https://e.com/s': 5, 'https://e.com/f': 5 },
    lastActiveAt: { 'https://e.com/s': NOW - 200 * DAY, 'https://e.com/f': NOW - 1 * DAY },
  };
  assert.equal(proactive.rank(records, signal, NOW)[0].id, 'fresh');
});

test('U9: with no signal at all, the set degrades to the caller order (recent let-go)', () => {
  const records = [rec('a'), rec('b'), rec('c')];
  const out = proactive.rank(records, { revisits: {}, lastActiveAt: {} }, NOW).map((r) => r.id);
  assert.deepEqual(out, ['a', 'b', 'c']);
});

test('U9: a record with frequency but no lastActiveAt still outranks a zero-signal one', () => {
  const records = [rec('zero', 'https://e.com/z'), rec('freq', 'https://e.com/q')];
  const signal = { revisits: { 'https://e.com/q': 8 }, lastActiveAt: {} };
  assert.equal(proactive.rank(records, signal, NOW)[0].id, 'freq');
});

test('U9: the set is capped (default 6) to stay a calm peek', () => {
  const records = Array.from({ length: 20 }, (_, i) => rec('r' + i));
  assert.equal(proactive.rank(records, { revisits: {}, lastActiveAt: {} }, NOW).length, 6);
  assert.equal(proactive.rank(records, {}, NOW, { cap: 3 }).length, 3);
});

test('U9: rank is pure — input array and order are untouched', () => {
  const records = [rec('a'), rec('b')];
  const snap = JSON.stringify(records);
  proactive.rank(records, { revisits: { 'https://e.com/b': 9 }, lastActiveAt: {} }, NOW);
  assert.equal(JSON.stringify(records), snap);
});

test('U9: empty / missing inputs return empty', () => {
  assert.deepEqual(proactive.rank([], {}, NOW), []);
  assert.deepEqual(proactive.rank(null, null, NOW), []);
});
