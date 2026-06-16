'use strict';

require('fake-indexeddb/auto');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const store = require('../extension/lib/store.js');

beforeEach(() => {
  // Fresh database per test (fake-indexeddb exposes IDBFactory globally).
  globalThis.indexedDB = new globalThis.IDBFactory();
  store.reset();
});

function rec(over) {
  return Object.assign(
    { id: 'x', url: 'https://e.com/a', host: 'e.com', title: 'A', content: 'body', timestamp: 1 },
    over,
  );
}

test('put then get round-trips; listRecent is reverse-chronological', async () => {
  await store.put(rec({ id: 'a', timestamp: 100 }));
  await store.put(rec({ id: 'b', timestamp: 300 }));
  await store.put(rec({ id: 'c', timestamp: 200 }));

  const got = await store.get('b');
  assert.equal(got.id, 'b');

  const recent = await store.listRecent();
  assert.deepEqual(recent.map((r) => r.id), ['b', 'c', 'a']);
});

test('deleteByDomain removes a domain and leaves others', async () => {
  await store.put(rec({ id: 'a', host: 'bank.com' }));
  await store.put(rec({ id: 'b', host: 'bank.com' }));
  await store.put(rec({ id: 'c', host: 'news.com' }));

  const n = await store.deleteByDomain('bank.com');
  assert.equal(n, 2);
  assert.deepEqual((await store.allIds()).sort(), ['c']);
});

test('prune by byte budget evicts least-recently-accessed, not oldest-created', async () => {
  await store.put(rec({ id: 'a', timestamp: 100, lastAccessed: 300, byteSize: 100 }));
  await store.put(rec({ id: 'b', timestamp: 200, lastAccessed: 150, byteSize: 100 })); // LRU
  await store.put(rec({ id: 'c', timestamp: 300, lastAccessed: 350, byteSize: 100 }));

  const deleted = await store.prune({ maxBytes: 250 });
  assert.equal(deleted, 1);
  assert.deepEqual((await store.allIds()).sort(), ['a', 'c']); // 'b' (LRU) evicted, not 'a' (oldest)
});

test('touch updates lastAccessed and changes LRU prune order', async () => {
  await store.put(rec({ id: 'a', lastAccessed: 300, byteSize: 100 }));
  await store.put(rec({ id: 'b', lastAccessed: 150, byteSize: 100 }));
  await store.put(rec({ id: 'c', lastAccessed: 350, byteSize: 100 }));

  await store.touch('b', 400); // 'b' is now most-recent; 'a' becomes LRU
  await store.prune({ maxBytes: 250 });
  assert.deepEqual((await store.allIds()).sort(), ['b', 'c']); // 'a' evicted now
});

test('prune age cap deletes entries older than maxAgeMs', async () => {
  await store.put(rec({ id: 'old', timestamp: 1000 }));
  await store.put(rec({ id: 'new', timestamp: 9000 }));
  const deleted = await store.prune({ maxAgeMs: 5000, now: 10000 });
  assert.equal(deleted, 1);
  assert.deepEqual(await store.allIds(), ['new']);
});

test('withQuotaRetry prunes and retries once, then surfaces a second failure', async () => {
  let calls = 0, pruned = 0;
  const quota = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
  const writeOnce = () => { calls++; if (calls === 1) quota(); return 'ok'; };
  const result = await store.withQuotaRetry(writeOnce, async () => { pruned++; });
  assert.equal(result, 'ok');
  assert.equal(pruned, 1);
  assert.equal(calls, 2);

  await assert.rejects(() => store.withQuotaRetry(quota, async () => {}), /full/);
});

// --- scrubSibling: cross-record forget consistency (slice 4 / R12) ----------

test('scrubSibling removes a matching sibling and leaves the carrying record', async () => {
  await store.put(rec({ id: 'A', siblings: [
    { url: 'https://b.com/x', title: 'B', host: 'b.com' },
    { url: 'https://c.com/y', title: 'C', host: 'c.com' },
  ] }));
  const n = await store.scrubSibling('https://b.com/x');
  assert.equal(n, 1);
  const a = await store.get('A');
  assert.deepEqual(a.siblings.map((s) => s.url), ['https://c.com/y']);
  assert.equal(a.title, 'A'); // record otherwise intact
});

test('scrubSibling normalizes its input URL to origin+pathname (extractable full-href match)', async () => {
  await store.put(rec({ id: 'A', siblings: [{ url: 'https://b.com/page', title: 'B', host: 'b.com' }] }));
  const n = await store.scrubSibling('https://b.com/page?token=abc#frag'); // a full href, query+hash
  assert.equal(n, 1);
  assert.deepEqual((await store.get('A')).siblings, []);
});

test('scrubSibling touches every record that listed the URL', async () => {
  await store.put(rec({ id: 'A', siblings: [{ url: 'https://b.com/x', title: 'B', host: 'b.com' }] }));
  await store.put(rec({ id: 'B', siblings: [{ url: 'https://b.com/x', title: 'B', host: 'b.com' }] }));
  await store.put(rec({ id: 'C', siblings: [{ url: 'https://z.com/q', title: 'Z', host: 'z.com' }] }));
  const n = await store.scrubSibling('https://b.com/x');
  assert.equal(n, 2);
  assert.deepEqual((await store.get('C')).siblings.map((s) => s.url), ['https://z.com/q']); // untouched
});

test('scrubSibling on a URL no record references is a no-op', async () => {
  await store.put(rec({ id: 'A', siblings: [{ url: 'https://b.com/x', title: 'B', host: 'b.com' }] }));
  const n = await store.scrubSibling('https://nope.com/x');
  assert.equal(n, 0);
  assert.deepEqual((await store.get('A')).siblings.map((s) => s.url), ['https://b.com/x']);
});

test('scrubSiblings removes multiple forgotten URLs in one store scan (domain forget)', async () => {
  await store.put(rec({ id: 'A', siblings: [
    { url: 'https://b.com/x', title: 'B', host: 'b.com' },
    { url: 'https://c.com/y', title: 'C', host: 'c.com' },
  ] }));
  await store.put(rec({ id: 'D', siblings: [{ url: 'https://c.com/y', title: 'C', host: 'c.com' }] }));
  const n = await store.scrubSiblings(['https://b.com/x', 'https://c.com/y']);
  assert.equal(n, 2);
  assert.deepEqual((await store.get('A')).siblings, []);
  assert.deepEqual((await store.get('D')).siblings, []);
});

test('scrubSiblings([]) is a no-op', async () => {
  await store.put(rec({ id: 'A', siblings: [{ url: 'https://b.com/x', title: 'B', host: 'b.com' }] }));
  assert.equal(await store.scrubSiblings([]), 0);
  assert.equal((await store.get('A')).siblings.length, 1);
});

test('contentLess record stores and lists like any other, never holding content', async () => {
  await store.put(rec({ id: 'meta', title: 'Bank', url: 'https://bank.com/x', content: 'SHOULD NOT PERSIST', contentLess: true }));
  const got = await store.get('meta');
  assert.equal(got.contentLess, true);
  assert.equal(got.content, '');
  assert.equal((await store.listRecent()).length, 1);
});
