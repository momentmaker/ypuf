'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const rp = require('../extension/lib/recallpage.js');

// Build a reverse-chronological archive of metas from ids (newest first).
const A = (...ids) => ids.map((id, i) => ({ id, url: 'https://e.com/' + id, timestamp: 1000 - i, snoozeState: null }));

test('page 0 returns the peek ids in ranked order; hasMore when the archive is larger', () => {
  const archive = A('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'); // 8 total
  const page0Ids = ['b', 'a', 'c'];                          // proactive order, not chronological
  const r = rp.pageIds({ archive, page0Ids, page: 0, pageSize: 3 });
  assert.deepEqual(r.ids, ['b', 'a', 'c']);
  assert.equal(r.page, 0);
  assert.equal(r.pageSize, 3);
  assert.equal(r.total, 8);
  assert.equal(r.hasMore, true);
});

test('page 1 returns the reverse-chronological remainder, excluding page 0', () => {
  const archive = A('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
  const page0Ids = ['b', 'a', 'c'];
  const r = rp.pageIds({ archive, page0Ids, page: 1, pageSize: 3 });
  assert.deepEqual(r.ids, ['d', 'e', 'f']); // archive order minus a/b/c
  assert.equal(r.hasMore, true);            // g,h remain
});

test('the last partial page reports hasMore false', () => {
  const archive = A('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
  const page0Ids = ['a', 'b', 'c'];
  const r = rp.pageIds({ archive, page0Ids, page: 2, pageSize: 3 });
  assert.deepEqual(r.ids, ['g', 'h']);
  assert.equal(r.hasMore, false);
});

test('paging past the end returns an empty page with no more', () => {
  const archive = A('a', 'b', 'c', 'd');
  const page0Ids = ['a', 'b', 'c'];
  const r = rp.pageIds({ archive, page0Ids, page: 5, pageSize: 3 });
  assert.deepEqual(r.ids, []);
  assert.equal(r.hasMore, false);
});

test('page 0 hasMore is false when the whole archive fits the peek', () => {
  const archive = A('a', 'b', 'c');
  const r = rp.pageIds({ archive, page0Ids: ['a', 'b', 'c'], page: 0, pageSize: 7 });
  assert.equal(r.hasMore, false);
});

test('empty archive is safe', () => {
  const r = rp.pageIds({ archive: [], page0Ids: [], page: 0, pageSize: 7 });
  assert.deepEqual(r.ids, []);
  assert.equal(r.total, 0);
  assert.equal(r.hasMore, false);
});
