'use strict';

require('fake-indexeddb/auto');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const store = require('../extension/lib/store.js');
const vectorstore = require('../extension/lib/vectorstore.js');
const privacy = require('../extension/lib/blocklist.js');
const search = require('../extension/lib/search.js');
const signal = require('../extension/lib/signal.js');
const cluster = require('../extension/lib/cluster.js');
const capture = require('../extension/lib/capture.js');
const exclusion = require('../extension/lib/exclusion.js');

const DIM = 8;

// Deterministic stub embed: a tiny char-fingerprint vector, L2-normalized so
// cosine behaves. Same text -> same vector (idempotency), different text ->
// different vector. Returns a Float32Array (the store's structured-clone path).
function stubEmbed(text) {
  const out = new Float32Array(DIM);
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) out[s.charCodeAt(i) % DIM] += 1;
  let norm = 0;
  for (let d = 0; d < DIM; d++) norm += out[d] * out[d];
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < DIM; d++) out[d] /= norm;
  return out;
}

// Count how many times embed runs — to prove a resumed backfill doesn't
// re-embed completed pages.
let embedCalls;
function countingEmbed(text) { embedCalls += 1; return stubEmbed(text); }

const MODEL_V = 'hash-v1';

// The injected IDB accessors background.js wires for vectorstore — sharing the
// real store.js DB handle (same DB/version, so the v2 migration runs once).
function vdeps(over) {
  return Object.assign({
    withVectorStore: store.withVectorStore,
    reqToPromise: store.reqToPromise,
    canonicalKeyOf: cluster.originPathKey,
    embed: countingEmbed,
    listKeys: async () => (await store.getAll())
      .filter((r) => r.url && !r.contentLess && r.content)
      .map((r) => ({ key: cluster.originPathKey(r.url), url: r.url, text: r.content })),
    recordExists: async (key) => (await store.getByCanonicalKey(key)) != null,
    loadCursor: async () => cursorBox.value,
    saveCursor: (c) => { cursorBox.value = c; },
  }, over);
}

// The persisted backfill cursor (chrome.storage stand-in).
let cursorBox;

let durable;
beforeEach(() => {
  globalThis.indexedDB = new globalThis.IDBFactory();
  store.reset();
  search.create();
  durable = signal.emptyState();
  embedCalls = 0;
  cursorBox = { value: 0 };
});

async function seedRecord(id, url, content) {
  const host = (() => { try { return new URL(url).hostname; } catch { return 'x'; } })();
  await store.put({ id, url, host, title: id, content, timestamp: 1, lastAccessed: 1 });
}

function blocklistDeps() {
  return {
    store, search, signal, durable,
    vectorstore,
    vectorDeps: vdeps(),
    modelVersion: MODEL_V,
  };
}

// --- store + get by canonical key ------------------------------------------

test('put then get returns the vector by canonical key (Float32, version-tagged)', async () => {
  const url = 'https://e.com/article';
  const key = cluster.originPathKey(url);
  await vectorstore.put(vdeps(), key, stubEmbed('hello world'), MODEL_V);

  const row = await vectorstore.get(vdeps(), key);
  assert.ok(row, 'row exists');
  assert.equal(row.key, key);
  assert.ok(row.vector instanceof Float32Array, 'vector survives as Float32Array');
  assert.equal(row.vector.length, DIM);
  assert.equal(row.modelVersion, MODEL_V);
  assert.equal(await vectorstore.has(vdeps(), key), true);
  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://e.com/other')), false);
});

test('query/hash variants of one page collapse to a single vector (newest wins)', async () => {
  // Three URLs, same canonical key (origin+path), embedded in order.
  await vectorstore.embedAndPut(vdeps(), 'https://e.com/p?ref=1', 'first content', MODEL_V);
  await vectorstore.embedAndPut(vdeps(), 'https://e.com/p?ref=2#frag', 'second content', MODEL_V);
  await vectorstore.embedAndPut(vdeps(), 'https://e.com/p', 'newest content', MODEL_V);

  const key = cluster.originPathKey('https://e.com/p');
  const allKeys = await store.withVectorStore('readonly', (s) => store.reqToPromise(s.getAllKeys()));
  assert.deepEqual(allKeys, [key], 'one vector for the canonical page, not three');

  const row = await vectorstore.get(vdeps(), key);
  // Newest write wins: the vector matches the last (newest) content.
  assert.deepEqual(Array.from(row.vector), Array.from(stubEmbed('newest content')));
});

// --- the canonical-key index resolves key -> record (U5 read path) ----------

test('the v2 canonical-key index resolves a vector key back to its record (O(1))', async () => {
  await seedRecord('rec-1', 'https://e.com/page?utm=x', 'the body text');
  const key = cluster.originPathKey('https://e.com/page?utm=x');

  const rec = await store.getByCanonicalKey(key);
  assert.ok(rec, 'record found by canonical key');
  assert.equal(rec.id, 'rec-1');
  // A key with no record resolves to undefined (read-side guard for evicted pages).
  assert.equal(await store.getByCanonicalKey(cluster.originPathKey('https://e.com/gone')), undefined);
});

// --- backfill over N records -> N vectors -----------------------------------

test('backfill embeds every indexed page exactly once -> N vectors', async () => {
  for (let i = 0; i < 5; i++) await seedRecord('r' + i, `https://e.com/p${i}`, `content number ${i}`);

  let res, guard = 0;
  do { res = await vectorstore.backfill(vdeps(), { modelVersion: MODEL_V, batchSize: 2 }); guard++; }
  while (!res.done && guard < 50);

  assert.equal(embedCalls, 5, 'each page embedded once');
  const keys = await store.withVectorStore('readonly', (s) => store.reqToPromise(s.getAllKeys()));
  assert.equal(keys.length, 5, 'five vectors for five pages');
  // Every page has a vector.
  for (let i = 0; i < 5; i++) {
    assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey(`https://e.com/p${i}`)), true);
  }
});

// --- interrupted backfill resumes from its cursor without re-embedding -------

test('an interrupted backfill resumes from its cursor (no re-embed, no missing page)', async () => {
  for (let i = 0; i < 6; i++) await seedRecord('r' + i, `https://e.com/p${i}`, `content ${i}`);

  // First pass: one batch of 2, then "the SW dies" (we stop looping). The cursor
  // is persisted at 2.
  const first = await vectorstore.backfill(vdeps(), { modelVersion: MODEL_V, batchSize: 2 });
  assert.equal(first.done, false);
  assert.equal(embedCalls, 2);
  assert.equal(cursorBox.value, 2, 'cursor persisted mid-pass');

  // Resume: a FRESH deps (new SW life) reading the persisted cursor. It must NOT
  // re-embed the first 2 and must finish the remaining 4.
  embedCalls = 0;
  let res, guard = 0;
  do { res = await vectorstore.backfill(vdeps(), { modelVersion: MODEL_V, batchSize: 2 }); guard++; }
  while (!res.done && guard < 50);

  assert.equal(embedCalls, 4, 'only the remaining 4 pages embedded on resume');
  const keys = await store.withVectorStore('readonly', (s) => store.reqToPromise(s.getAllKeys()));
  assert.equal(keys.length, 6, 'no page left without a vector');
  assert.equal(cursorBox.value, 0, 'cursor reset after completion');
});

test('backfill re-checks record existence at embed time (a concurrently-forgotten page gets no vector)', async () => {
  await seedRecord('keep', 'https://e.com/keep', 'kept content');
  await seedRecord('gone', 'https://e.com/gone', 'doomed content');

  // listKeys captures BOTH; but we forget 'gone' between snapshot and embed by
  // wrapping recordExists to drop it. Simulate the concurrent forget: delete the
  // record from the store before the backfill embeds it.
  const goneKey = cluster.originPathKey('https://e.com/gone');
  const deps = vdeps({
    listKeys: async () => ([
      { key: cluster.originPathKey('https://e.com/keep'), url: 'https://e.com/keep', text: 'kept content' },
      { key: goneKey, url: 'https://e.com/gone', text: 'doomed content' },
    ]),
  });
  await store.remove('gone'); // concurrently forgotten after the snapshot

  let res, guard = 0;
  do { res = await vectorstore.backfill(deps, { modelVersion: MODEL_V, batchSize: 1 }); guard++; }
  while (!res.done && guard < 50);

  assert.equal(await vectorstore.has(deps, cluster.originPathKey('https://e.com/keep')), true);
  assert.equal(await vectorstore.has(deps, goneKey), false, 'forgotten page got NO re-created vector');
});

// --- stale model version invalidated on mismatch (re-backfill) --------------

test('a stale-version vector is re-embedded on a model bump; a current one is skipped', async () => {
  await seedRecord('r0', 'https://e.com/a', 'aaa');
  await seedRecord('r1', 'https://e.com/b', 'bbb');

  // Backfill at the OLD version.
  let res, guard = 0;
  do { res = await vectorstore.backfill(vdeps(), { modelVersion: 'old-hash', batchSize: 5 }); guard++; }
  while (!res.done && guard < 50);
  assert.equal(embedCalls, 2);

  // Re-backfill at the NEW version: both stale vectors must be re-embedded.
  embedCalls = 0;
  cursorBox.value = 0;
  guard = 0;
  do { res = await vectorstore.backfill(vdeps(), { modelVersion: 'new-hash', batchSize: 5 }); guard++; }
  while (!res.done && guard < 50);
  assert.equal(embedCalls, 2, 'stale-version vectors re-embedded on bump');

  const row = await vectorstore.get(vdeps(), cluster.originPathKey('https://e.com/a'));
  assert.equal(row.modelVersion, 'new-hash');

  // A third backfill at the SAME (new) version re-embeds nothing.
  embedCalls = 0;
  cursorBox.value = 0;
  guard = 0;
  do { res = await vectorstore.backfill(vdeps(), { modelVersion: 'new-hash', batchSize: 5 }); guard++; }
  while (!res.done && guard < 50);
  assert.equal(embedCalls, 0, 'current-version vectors are skipped');
});

// --- forget a page -> vector gone (AE4) -------------------------------------

test('forgetPage drops the page vector (no searchable residue)', async () => {
  await seedRecord('a', 'https://e.com/secret', 'sensitive body');
  search.addRecord({ id: 'a', url: 'https://e.com/secret', host: 'e.com', title: 'a', content: 'sensitive body' });
  durable.dwell['https://e.com/secret'] = 1;
  await vectorstore.embedAndPut(vdeps(), 'https://e.com/secret', 'sensitive body', MODEL_V);
  const key = cluster.originPathKey('https://e.com/secret');
  assert.equal(await vectorstore.has(vdeps(), key), true);

  await privacy.forgetPage('a', blocklistDeps());
  assert.equal(await vectorstore.has(vdeps(), key), false, 'vector dropped on forget');
});

// --- LRU/byte-budget eviction inside put() drops the evicted vectors ---------

test('an LRU/byte-budget prune drops the evicted records vectors via onEvict (no orphans)', async () => {
  // Three pages, each with a vector. Prune by byte budget evicts the LRU one.
  await store.put({ id: 'a', url: 'https://e.com/a', host: 'e.com', title: 'A', content: 'A', timestamp: 1, lastAccessed: 300, byteSize: 100 });
  await store.put({ id: 'b', url: 'https://e.com/b', host: 'e.com', title: 'B', content: 'B', timestamp: 2, lastAccessed: 150, byteSize: 100 }); // LRU
  await store.put({ id: 'c', url: 'https://e.com/c', host: 'e.com', title: 'C', content: 'C', timestamp: 3, lastAccessed: 350, byteSize: 100 });
  for (const u of ['a', 'b', 'c']) await vectorstore.embedAndPut(vdeps(), `https://e.com/${u}`, u, MODEL_V);

  // onEvict resolves each evicted record's url -> key and drops its vector.
  const onEvict = async (records) => {
    for (const r of records) await vectorstore.deleteKey(vdeps(), cluster.originPathKey(r.url));
  };
  const deleted = await store.prune({ maxBytes: 250, onEvict });
  assert.equal(deleted, 1);

  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://e.com/b')), false, 'evicted page vector gone');
  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://e.com/a')), true, 'surviving vectors kept');
  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://e.com/c')), true);
});

// --- blocklisting a domain (retroactivePurge) drops its vectors -------------

test('retroactivePurge drops the now-scrubbed pages vectors (no searchable residue)', async () => {
  await seedRecord('a', 'https://health.com/x', 'diagnosis details');
  await seedRecord('b', 'https://health.com/y', 'more details');
  await seedRecord('c', 'https://news.com/z', 'headlines');
  for (const r of [['a', 'https://health.com/x', 'diagnosis details'], ['b', 'https://health.com/y', 'more details'], ['c', 'https://news.com/z', 'headlines']]) {
    search.addRecord({ id: r[0], url: r[1], host: new URL(r[1]).hostname, title: r[0], content: r[2] });
    await vectorstore.embedAndPut(vdeps(), r[1], r[2], MODEL_V);
  }

  await privacy.retroactivePurge('health.com', blocklistDeps());

  // The blocklisted domain's vectors are gone (its content was scrubbed in place);
  // the other domain's vector survives.
  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://health.com/x')), false);
  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://health.com/y')), false);
  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://news.com/z')), true);
});

test('forgetDomain drops every vector for the domain', async () => {
  await seedRecord('a', 'https://bank.com/x', 'statement');
  await seedRecord('b', 'https://bank.com/y', 'another');
  await seedRecord('c', 'https://news.com/z', 'news');
  for (const r of [['https://bank.com/x', 'statement'], ['https://bank.com/y', 'another'], ['https://news.com/z', 'news']]) {
    await vectorstore.embedAndPut(vdeps(), r[0], r[1], MODEL_V);
  }
  await privacy.forgetDomain('bank.com', blocklistDeps());
  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://bank.com/x')), false);
  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://bank.com/y')), false);
  assert.equal(await vectorstore.has(vdeps(), cluster.originPathKey('https://news.com/z')), true);
});

// --- purge -> empty (AE4) ---------------------------------------------------

test('clear purges the whole vector store', async () => {
  await vectorstore.embedAndPut(vdeps(), 'https://e.com/a', 'a', MODEL_V);
  await vectorstore.embedAndPut(vdeps(), 'https://e.com/b', 'b', MODEL_V);
  await vectorstore.clear(vdeps());
  const keys = await store.withVectorStore('readonly', (s) => store.reqToPromise(s.getAllKeys()));
  assert.equal(keys.length, 0, 'vector store empty after purge');
});

// --- vector persists across a simulated SW restart --------------------------

test('a vector persists across a simulated SW restart (store.reset, re-open same DB)', async () => {
  await vectorstore.embedAndPut(vdeps(), 'https://e.com/persist', 'durable content', MODEL_V);
  const key = cluster.originPathKey('https://e.com/persist');

  // Simulate SW termination: drop the memoized DB handle but KEEP the same
  // IndexedDB backing (we do NOT swap globalThis.indexedDB).
  store.reset();

  const row = await vectorstore.get(vdeps(), key);
  assert.ok(row, 'vector survived the restart');
  assert.equal(row.modelVersion, MODEL_V);
  assert.ok(row.vector instanceof Float32Array);
});

// --- migration is non-destructive (existing records survive the v1->v2 bump) -

test('existing records survive the v1->v2 migration and gain the canonical-key index', async () => {
  // A "v1" record written through the current store (the migration runs on first
  // open). It must remain readable AND resolvable by its canonical key.
  await seedRecord('legacy', 'https://e.com/legacy?q=1', 'legacy body');
  store.reset(); // re-open
  const got = await store.get('legacy');
  assert.ok(got, 'legacy record survived');
  assert.equal(got.content, 'legacy body');
  const byKey = await store.getByCanonicalKey(cluster.originPathKey('https://e.com/legacy?q=1'));
  assert.equal(byKey.id, 'legacy', 'legacy record resolvable by canonical key');
});

test('backfillCanonicalKeys heals a legacy record so it resolves by canonical key', async () => {
  // A record written WITHOUT the canonicalKey property (a pre-U3 row) — write it
  // straight to IDB so normalize() can't stamp the key.
  const db = await store.openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store.STORE, 'readwrite');
    tx.objectStore(store.STORE).put({ id: 'old', url: 'https://e.com/legacy', host: 'e.com', title: 'old', content: 'body', timestamp: 1, lastAccessed: 1 });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  const key = cluster.originPathKey('https://e.com/legacy');
  // Before heal: invisible to the canonical-key index.
  assert.equal(await store.getByCanonicalKey(key), undefined);

  const migrated = await store.backfillCanonicalKeys();
  assert.equal(migrated, 1);
  const rec = await store.getByCanonicalKey(key);
  assert.equal(rec.id, 'old', 'legacy record now resolves by canonical key');
});

// --- embed injection seam: no embed fn -> no-op -----------------------------

test('embedAndPut and backfill no-op when no embed fn is injected (semantic-off seam)', async () => {
  await seedRecord('a', 'https://e.com/a', 'body');
  const noEmbed = vdeps({ embed: undefined });
  assert.equal(await vectorstore.embedAndPut(noEmbed, 'https://e.com/a', 'body', MODEL_V), null);
  const res = await vectorstore.backfill(noEmbed, { modelVersion: MODEL_V });
  assert.deepEqual(res, { embedded: 0, scanned: 0, done: true });
  const keys = await store.withVectorStore('readonly', (s) => store.reqToPromise(s.getAllKeys()));
  assert.equal(keys.length, 0, 'no vectors written without an embed fn');
});

// --- topK: cosine scan for semantic recall (U5) -----------------------------

const embed = require('../extension/lib/embed.js');

// Seed a vector directly under a canonical key (bypassing embed, so the test
// controls cosines exactly). Vectors are unit-length so cosine == dot product.
async function seedVector(key, vec, modelVersion = MODEL_V) {
  await vectorstore.put(vdeps(), key, Float32Array.from(vec), modelVersion);
}
function queryDeps() {
  return { withVectorStore: store.withVectorStore, reqToPromise: store.reqToPromise, cosine: embed.cosine };
}

test('topK returns the highest-cosine keys, sorted desc, capped at K', async () => {
  await seedVector('https://e.com/near', [1, 0, 0, 0, 0, 0, 0, 0]);
  await seedVector('https://e.com/mid',  [0.6, 0.8, 0, 0, 0, 0, 0, 0]);
  await seedVector('https://e.com/far',  [0, 1, 0, 0, 0, 0, 0, 0]);
  const q = Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
  const out = await vectorstore.topK(queryDeps(), q, 2, MODEL_V);
  assert.equal(out.length, 2, 'capped at K');
  assert.deepEqual(out.map((r) => r.key), ['https://e.com/near', 'https://e.com/mid'], 'sorted by cosine desc');
  assert.ok(out[0].score > out[1].score);
});

test('topK skips vectors tagged a different model version (no cross-space cosine)', async () => {
  await seedVector('https://e.com/current', [1, 0, 0, 0, 0, 0, 0, 0], 'hash-v2');
  await seedVector('https://e.com/stale',   [1, 0, 0, 0, 0, 0, 0, 0], 'hash-v1');
  const q = Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
  const out = await vectorstore.topK(queryDeps(), q, 10, 'hash-v2');
  assert.deepEqual(out.map((r) => r.key), ['https://e.com/current'], 'stale-version vector excluded');
});

test('topK no-ops gracefully: no cosine fn, no query vec, or K<=0 -> []', async () => {
  await seedVector('https://e.com/a', [1, 0, 0, 0, 0, 0, 0, 0]);
  const q = Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(await vectorstore.topK({ withVectorStore: store.withVectorStore, reqToPromise: store.reqToPromise }, q, 5, MODEL_V), []);
  assert.deepEqual(await vectorstore.topK(queryDeps(), null, 5, MODEL_V), []);
  assert.deepEqual(await vectorstore.topK(queryDeps(), q, 0, MODEL_V), []);
});

test('topK over an empty store returns []', async () => {
  const q = Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(await vectorstore.topK(queryDeps(), q, 5, MODEL_V), []);
});

test('topK drops hits below the MIN_COSINE floor (a vague query yields the calm empty state)', async () => {
  // 'strong' is a near-perfect match; 'weak' is near-orthogonal (cosine ~0.1,
  // below the 0.15 floor). The floor must drop 'weak' so a vague/stopword query
  // can't flood the empty state with near-zero-similarity rows.
  await seedVector('https://e.com/strong', [1, 0, 0, 0, 0, 0, 0, 0]);
  await seedVector('https://e.com/weak', [0.1, 0.995, 0, 0, 0, 0, 0, 0]); // cosine ~0.1 to q
  const q = Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]);

  const out = await vectorstore.topK(queryDeps(), q, 10, MODEL_V);
  assert.deepEqual(out.map((r) => r.key), ['https://e.com/strong'], 'only the above-floor hit survives');
  assert.ok(out.every((r) => r.score >= vectorstore.MIN_COSINE), 'every returned hit clears the floor');

  // A query that matches NOTHING above the floor returns [] (the no-results path).
  const orthogonal = Float32Array.from([0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(await vectorstore.topK(queryDeps(), orthogonal, 10, MODEL_V), [], 'all-weak query → calm empty result');
});

// --- §7: a quota-pressure eviction at CAPTURE drops the evicted record's vector
// (no orphan vector survives the in-put() quota path) -------------------------
//
// Regression for the bug where capture.letGo's `deps.store.put(record)` carried
// NO onEvict, so a QuotaExceededError eviction during a let-go evicted records
// but orphaned their paired vectors permanently (the cold-start maybePrune that
// wires dropEvictedVectors never re-sees an already-evicted record).

// The same onEvict callback background.js wires into prune/quotaPrune.
function dropEvictedVectors(records) {
  return Promise.all((records || [])
    .filter((r) => r && r.url)
    .map((r) => vectorstore.deleteKey(vdeps(), cluster.originPathKey(r.url))));
}

// The record-bearing store wrapper background.js (storeWithEvict) hands capture:
// its put threads onEvict so a quota eviction during the write drops the evicted
// pages' vectors too. Mirrors background.js's storeWithEvict exactly: it is the
// SAME quota-retry + onEvict pipeline (store.withQuotaRetry → store.quotaPrune →
// prune), with the first underlying write fault-injected to throw Quota once so
// the retry path actually runs (fake-indexeddb won't raise QuotaExceededError on
// its own). store.put(record,{onEvict}) is exactly this composition.
function quotaFaultingStore(fault) {
  return Object.assign(Object.create(store), {
    put: (record) => store.withQuotaRetry(
      () => fault.armed ? (fault.armed = false, Promise.reject(quotaErr())) : store.put(record),
      () => store.quotaPrune(dropEvictedVectors),
    ),
  });
}
function quotaErr() { const e = new Error('quota'); e.name = 'QuotaExceededError'; return e; }

function captureDeps(over, faultingStore) {
  let counter = 0;
  return Object.assign({
    classify: exclusion.classify,
    userBlocklist: [],
    inject: async () => ({ title: 'New', textContent: 'fresh body content for the new page', excerpt: 'fresh' }),
    closeTab: async () => {},
    openTab: async () => {},
    session: (() => { const bag = {}; return { get: async (k) => bag[k], set: async (k, v) => { bag[k] = v; } }; })(),
    now: () => 1000,
    makeId: () => 'new-' + (++counter),
    inFlight: new Set(),
    store: faultingStore,
    search,
    canonicalKey: cluster.originPathKey,
  }, over);
}

test('§7: a quota-eviction during a capture put drops the evicted record vector (no orphan)', async () => {
  // Seed an OLD, least-recently-accessed page + its vector. It's the eviction
  // victim when the new capture put hits quota pressure.
  await store.put({ id: 'old', url: 'https://e.com/old', host: 'e.com', title: 'Old', content: 'old body', timestamp: 1, lastAccessed: 1, byteSize: 1000 });
  await vectorstore.embedAndPut(vdeps(), 'https://e.com/old', 'old body', MODEL_V);
  const oldKey = cluster.originPathKey('https://e.com/old');
  assert.equal(await vectorstore.has(vdeps(), oldKey), true, 'old vector present before the squeeze');

  // Make quotaPrune derive a byte budget small enough that the LRU 'old' record
  // is evicted (quota * 0.6 = 900 < old's 1000 bytes).
  const origStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');
  Object.defineProperty(navigator, 'storage', {
    value: { estimate: async () => ({ quota: 1500 }) },
    configurable: true,
  });

  try {
    const fault = { armed: true };
    const tab = { id: 9, url: 'https://e.com/new', title: 'New', incognito: false };
    const res = await capture.letGo(tab, captureDeps(undefined, quotaFaultingStore(fault)));
    assert.ok(res.record, 'the new page was captured despite quota pressure');
    assert.equal(fault.armed, false, 'the quota fault fired (the retry path ran)');
    assert.ok(await store.get(res.record.id), 'new record stored on retry');
  } finally {
    if (origStorage) Object.defineProperty(navigator, 'storage', origStorage);
    else delete navigator.storage;
  }

  // The eviction shed 'old'; onEvict must have dropped its vector — no orphan.
  assert.equal(await store.get('old'), undefined, 'LRU record was evicted under quota pressure');
  assert.equal(await vectorstore.has(vdeps(), oldKey), false, 'evicted record vector dropped — no orphan vector survives the quota path');
});

// --- R8: an opt-out purge mid-backfill leaves NO vector residue ---------------
//
// Regression for the race where runVectorBackfill checked isSemanticReady() once
// before the loop and read modelVersion every iteration, so a concurrent
// semanticDisable→semanticPurge (clear + model null) let the in-flight batch
// re-write vectors AFTER clear(). This driver mirrors runVectorBackfill's fenced
// loop exactly: snapshot a generation token + modelVersion before the loop, and
// re-check the token at the TOP of each batch (break if a purge bumped it). The
// purge bumps the token, then awaits the backfill chain before clear().

// A backfill loop with the fence runVectorBackfill uses, parameterized by the
// generation getter so the test can bump it mid-pass.
function fencedBackfillPass(deps, modelVersion, pages, getGen) {
  const gen = getGen();
  return (async () => {
    let res, guard = 0;
    do {
      if (getGen() !== gen) break; // a purge bumped the token — stop before re-writing
      res = await vectorstore.backfill(deps, { modelVersion, batchSize: 1, pages });
      guard += 1;
    } while (res && !res.done && guard < 1000);
  })();
}

test('R8: a semanticPurge mid-backfill ends with an EMPTY vector store and cursor 0 (no residue)', async () => {
  for (let i = 0; i < 6; i++) await seedRecord('r' + i, `https://e.com/p${i}`, `content ${i}`);

  let generation = 0;
  const getGen = () => generation;
  const deps = vdeps();
  const pages = await deps.listKeys();

  // Kick off the fenced pass (batchSize 1 → page-by-page), let some batches land,
  // then opt out: bump the generation token (which fences the loop) and DRAIN the
  // in-flight pass BEFORE clearing — exactly semanticPurge's order. The fence
  // guarantees no batch re-populates the store after clear() runs.
  const pass = fencedBackfillPass(deps, MODEL_V, pages, getGen);
  await new Promise((r) => setImmediate(r));
  generation += 1;            // semanticPurge bumps the token first
  await pass;                 // drain the in-flight backfill (it breaks at the gate)
  await vectorstore.clear(deps); // then clear — no batch can re-populate after this
  cursorBox.value = 0;        // semanticPurge resets the cursor

  const keys = await store.withVectorStore('readonly', (s) => store.reqToPromise(s.getAllKeys()));
  assert.equal(keys.length, 0, 'vector store empty after a mid-backfill purge (no residue)');
  assert.equal(cursorBox.value, 0, 'cursor reset to 0 after purge');
});

test('R8: the fence stops the loop the moment the generation token changes', async () => {
  for (let i = 0; i < 8; i++) await seedRecord('r' + i, `https://e.com/p${i}`, `content ${i}`);

  let generation = 0;
  const getGen = () => generation;
  const deps = vdeps();
  const pages = await deps.listKeys();

  // Bump the token after the 3rd batch: the loop must break at the next gate
  // check, so strictly fewer than all 8 pages embed before the fence trips.
  let batches = 0;
  const countingDeps = vdeps({
    embed: (t) => { batches += 1; if (batches === 3) generation += 1; return stubEmbed(t); },
  });
  await fencedBackfillPass(countingDeps, MODEL_V, pages, getGen);

  assert.ok(batches < 8, `fence tripped early: only ${batches} of 8 pages embedded before the generation bump`);
});
