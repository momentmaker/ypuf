'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const search = require('../extension/lib/search.js');

beforeEach(() => search.create());

function rec(over) {
  return Object.assign({ id: 'x', title: 'T', url: 'https://e.com/a', content: 'body' }, over);
}

test('AE4: a content phrase finds the record', () => {
  search.addRecord(rec({ id: 'a', title: 'My day', content: 'the article about the guy who climbed everest' }));
  const ids = search.search('climbed everest').map((r) => r.id);
  assert.ok(ids.includes('a'));
});

test('a title match outranks a content-only match (boost)', () => {
  search.addRecord(rec({ id: 'title-hit', title: 'kubernetes guide', content: 'unrelated text' }));
  search.addRecord(rec({ id: 'content-hit', title: 'random', content: 'kubernetes appears only in body' }));
  const ids = search.search('kubernetes').map((r) => r.id);
  assert.equal(ids[0], 'title-hit');
});

test('fuzzy typo and prefix both match', () => {
  search.addRecord(rec({ id: 'a', title: 'serverless architecture', content: 'x' }));
  assert.ok(search.search('serverles').map((r) => r.id).includes('a')); // fuzzy/prefix
  assert.ok(search.search('architec').map((r) => r.id).includes('a')); // prefix mid-type
});

test('toJSON/loadJSON round-trip reproduces results', () => {
  search.addRecord(rec({ id: 'a', title: 'photosynthesis', content: 'leaves and light' }));
  const snap = search.snapshot();
  search.create(); // wipe in-memory
  assert.equal(search.search('photosynthesis').length, 0);
  assert.equal(search.load(snap), true);
  assert.ok(search.search('photosynthesis').map((r) => r.id).includes('a'));
});

test('removing a record drops it from results', () => {
  search.addRecord(rec({ id: 'a', content: 'gone soon' }));
  assert.equal(search.search('gone').length, 1);
  search.removeRecord('a');
  assert.equal(search.search('gone').length, 0);
});

test('a corrupt snapshot fails to load (caller rebuilds)', () => {
  assert.equal(search.load('{ not valid minisearch json'), false);
  assert.equal(search.load(''), false);
});

test('reconcile re-adds store records absent from the index', () => {
  search.addRecord(rec({ id: 'a', content: 'present' }));
  const storeRecords = [rec({ id: 'a', content: 'present' }), rec({ id: 'b', content: 'was missing from index' })];
  const added = search.reconcile(storeRecords);
  assert.equal(added, 1);
  assert.ok(search.search('missing').map((r) => r.id).includes('b'));
});

test('replacing an existing id updates its searchable content', () => {
  search.addRecord(rec({ id: 'a', title: 'old title', content: 'oldword' }));
  search.addRecord(rec({ id: 'a', title: 'new title', content: 'newword' }));
  assert.equal(search.search('oldword').length, 0);
  assert.ok(search.search('newword').map((r) => r.id).includes('a'));
});
