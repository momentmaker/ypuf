'use strict';

require('fake-indexeddb/auto');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const privacy = require('../extension/lib/blocklist.js');
const store = require('../extension/lib/store.js');
const search = require('../extension/lib/search.js');
const signal = require('../extension/lib/signal.js');

let durable;
beforeEach(() => {
  globalThis.indexedDB = new globalThis.IDBFactory();
  store.reset();
  search.create();
  durable = signal.emptyState();
});

function deps() { return { store, search, signal, durable }; }

async function seed(id, host, content, url) {
  const rec = { id, url: url || `https://${host}/${id}`, host, title: id, content, timestamp: 1, lastAccessed: 1 };
  await store.put(rec);
  search.addRecord(rec);
  durable.dwell[rec.url] = 100;
  durable.revisits[rec.url] = 2;
  durable.lastActiveAt[rec.url] = 4242;
  return rec;
}

test('AE6: forgetDomain removes every entry for a domain across stores', async () => {
  await seed('a', 'bank.com', 'statement body');
  await seed('b', 'bank.com', 'another statement');
  await seed('c', 'news.com', 'headlines');

  const n = await privacy.forgetDomain('bank.com', deps());
  assert.equal(n, 2);
  assert.deepEqual((await store.allIds()).sort(), ['c']);
  assert.equal(search.search('statement').length, 0);
  assert.deepEqual(Object.keys(durable.dwell), ['https://news.com/c']);
});

test('retroactivePurge downgrades content but keeps the entry recallable', async () => {
  await seed('a', 'health.com', 'diagnosis details in the body');

  const n = await privacy.retroactivePurge('health.com', deps());
  assert.equal(n, 1);

  const rec = await store.get('a');
  assert.equal(rec.contentLess, true);
  assert.equal(rec.content, '');
  assert.equal(search.search('diagnosis').length, 0); // content gone from the index
  assert.ok(search.search('a').map((r) => r.id).includes('a')); // still findable by title
  assert.deepEqual(Object.keys(durable.dwell), []); // dwell signal wiped
});

test('forgetPage clears all stores; restorePage brings them all back', async () => {
  const rec = await seed('a', 'example.com', 'unique body phrase');

  const bundle = await privacy.forgetPage('a', deps());
  assert.equal(await store.get('a'), undefined);
  assert.equal(search.search('unique').length, 0);
  assert.equal(durable.dwell[rec.url], undefined);
  assert.equal(durable.lastActiveAt[rec.url], undefined); // U8: forget leaves no rhythm residue

  await privacy.restorePage(bundle, deps());
  assert.ok((await store.get('a')) !== undefined);
  assert.ok(search.search('unique').map((r) => r.id).includes('a'));
  assert.equal(durable.dwell[rec.url], 100);
  assert.equal(durable.revisits[rec.url], 2);
  assert.equal(durable.lastActiveAt[rec.url], 4242); // U8: undo restores recency too
});
