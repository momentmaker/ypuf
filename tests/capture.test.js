'use strict';

require('fake-indexeddb/auto');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const capture = require('../extension/lib/capture.js');
const exclusion = require('../extension/lib/exclusion.js');
const store = require('../extension/lib/store.js');
const search = require('../extension/lib/search.js');
const cluster = require('../extension/lib/cluster.js');

beforeEach(() => {
  globalThis.indexedDB = new globalThis.IDBFactory();
  store.reset();
  search.create();
});

function makeDeps(over) {
  const ctx = { closed: [], opened: [], injectCalls: 0, session: {} };
  let counter = 0;
  const deps = Object.assign({
    classify: exclusion.classify,
    userBlocklist: [],
    inject: async () => { ctx.injectCalls++; return { title: 'Everest', textContent: 'the article about the guy who climbed everest', excerpt: 'climbed everest' }; },
    closeTab: async (id) => { ctx.closed.push(id); },
    openTab: async (url) => { ctx.opened.push(url); },
    session: { get: async (k) => ctx.session[k], set: async (k, v) => { ctx.session[k] = v; } },
    now: () => 1000,
    makeId: () => 'rec-' + (++counter),
    inFlight: new Set(),
    store, search,
    canonicalKey: cluster.originPathKey,
  }, over);
  return { deps, ctx };
}

test('AE1: an extractable tab is captured with content, indexed, and closed', async () => {
  const { deps, ctx } = makeDeps();
  const tab = { id: 7, url: 'https://example.com/everest', title: 'Everest', incognito: false };
  const res = await capture.letGo(tab, deps);

  assert.equal(res.kind, 'extractable');
  assert.equal(ctx.injectCalls, 1);
  assert.deepEqual(ctx.closed, [7]);

  const stored = await store.get(res.record.id);
  assert.equal(stored.contentLess, false);
  assert.match(stored.content, /climbed everest/);
  assert.ok(search.search('climbed everest').map((r) => r.id).includes(res.record.id));

  const pending = await capture.readPending(deps.session);
  assert.equal(pending.length, 1);
});

test('AE5: undo removes the record, clears the index, reopens the tab', async () => {
  const { deps, ctx } = makeDeps();
  const res = await capture.letGo({ id: 7, url: 'https://example.com/a', title: 'A', incognito: false }, deps);

  const ok = await capture.undo(res.record.id, deps);
  assert.equal(ok, true);
  assert.equal(await store.get(res.record.id), undefined);
  assert.equal(search.search('everest').length, 0);
  assert.deepEqual(ctx.opened, ['https://example.com/a']);
  assert.equal((await capture.readPending(deps.session)).length, 0);
});

test('re-letting-go a page collapses the prior record(s) for the same canonical URL (newest wins)', async () => {
  const { deps } = makeDeps();
  const r1 = await capture.letGo({ id: 7, url: 'https://example.com/a?ref=1', title: 'A', incognito: false }, deps);
  // Same page (query differs, time later) → REPLACE the prior record, don't stack a duplicate.
  const r2 = await capture.letGo({ id: 8, url: 'https://example.com/a?ref=2', title: 'A', incognito: false },
    Object.assign({}, deps, { now: () => 2000 }));

  const key = cluster.originPathKey('https://example.com/a');
  const samePage = (await store.getAll()).filter((rec) => cluster.originPathKey(rec.url) === key);
  assert.equal(samePage.length, 1);                        // collapsed to one record
  assert.equal(samePage[0].id, r2.record.id);              // the newer record survives
  assert.equal(samePage[0].timestamp, 2000);               // with the fresh timestamp
  assert.equal(await store.get(r1.record.id), undefined);  // the prior is gone from the store
  assert.ok(!search.search('climbed everest').map((x) => x.id).includes(r1.record.id)); // and de-indexed
});

test('a different path on the same host is NOT collapsed', async () => {
  const { deps } = makeDeps();
  const a = await capture.letGo({ id: 7, url: 'https://example.com/a', title: 'A', incognito: false }, deps);
  const b = await capture.letGo({ id: 8, url: 'https://example.com/b', title: 'B', incognito: false }, deps);
  assert.ok(await store.get(a.record.id), 'distinct page a survives');
  assert.ok(await store.get(b.record.id), 'distinct page b survives');
});

test('without a canonicalKey dep wired, letGo does not collapse (back-compat)', async () => {
  const { deps } = makeDeps({ canonicalKey: undefined });
  const r1 = await capture.letGo({ id: 7, url: 'https://example.com/a', title: 'A', incognito: false }, deps);
  const r2 = await capture.letGo({ id: 8, url: 'https://example.com/a', title: 'A', incognito: false }, deps);
  assert.ok(await store.get(r1.record.id));
  assert.ok(await store.get(r2.record.id));
});

test('a blocklisted tab is stored title+URL only, query stripped, without injecting', async () => {
  const { deps, ctx } = makeDeps({ inject: async () => { throw new Error('inject must not run on blocklisted'); } });
  const tab = { id: 3, url: 'https://www.chase.com/account?id=99', title: 'Chase', incognito: false };
  const res = await capture.letGo(tab, deps);

  assert.equal(res.kind, 'metadata-only');
  assert.equal(ctx.injectCalls, 0);
  assert.equal(res.record.contentLess, true);
  assert.equal(res.record.content, '');
  assert.equal(res.record.url, 'https://www.chase.com/account'); // query stripped
});

test('an incognito tab is closed and nothing is stored', async () => {
  const { deps, ctx } = makeDeps();
  const res = await capture.letGo({ id: 9, url: 'https://secret.com', title: 'x', incognito: true }, deps);
  assert.equal(res.kind, 'never-index');
  assert.deepEqual(ctx.closed, [9]);
  assert.equal(await store.count(), 0);
});

test('a discarded tab falls back to the title+URL floor (no injection)', async () => {
  const { deps, ctx } = makeDeps();
  const res = await capture.letGo({ id: 4, url: 'https://example.com/zombie', title: 'Zombie', incognito: false, discarded: true }, deps);
  assert.equal(ctx.injectCalls, 0);
  assert.equal(res.record.contentLess, true);
  assert.equal(await store.count(), 1);
});

test('an extraction that throws falls back to the floor rather than blocking the close', async () => {
  const { deps, ctx } = makeDeps({ inject: async () => { throw new Error('readability blew up'); } });
  const res = await capture.letGo({ id: 5, url: 'https://example.com/spa', title: 'SPA', incognito: false }, deps);
  assert.equal(res.record.contentLess, true);
  assert.deepEqual(ctx.closed, [5]);
});

test('recordExtra is stamped into the single pre-close store.put (auto-close marker)', async () => {
  const { deps } = makeDeps();
  const res = await capture.letGo({ id: 7, url: 'https://example.com/a', title: 'A', incognito: false }, deps, { autoClosed: true });
  assert.equal(res.record.autoClosed, true);
  const stored = await store.get(res.record.id);
  assert.equal(stored.autoClosed, true); // persisted with the record, not a second write
});

test('a siblings working-set rides the recordExtra into the single store.put (slice 4)', async () => {
  const { deps } = makeDeps();
  const siblings = [{ url: 'https://b.com/x', title: 'B', host: 'b.com' }];
  const res = await capture.letGo({ id: 7, url: 'https://a.com/', title: 'A', incognito: false }, deps, { siblings });
  assert.deepEqual(res.record.siblings, siblings);
  const stored = await store.get(res.record.id);
  assert.deepEqual(stored.siblings, siblings); // persisted with the record, not a second write
});

test('recordExtra also rides the floor record (discarded auto-close)', async () => {
  const { deps } = makeDeps();
  const res = await capture.letGo({ id: 4, url: 'https://example.com/z', title: 'Z', incognito: false, discarded: true }, deps, { autoClosed: true });
  assert.equal(res.record.contentLess, true);
  assert.equal(res.record.autoClosed, true);
});

test('AE5: a blocklisted tab snoozed stores title+URL only and carries the schedule', async () => {
  const { deps } = makeDeps();
  const res = await capture.letGo(
    { id: 3, url: 'https://www.chase.com/x?id=9', title: 'Chase', incognito: false },
    deps,
    { snoozeState: 'snoozed', returnAt: 5000 },
  );
  assert.equal(res.kind, 'metadata-only');
  assert.equal(res.record.contentLess, true);       // no page content captured
  assert.equal(res.record.url, 'https://www.chase.com/x'); // query stripped
  assert.equal(res.record.snoozeState, 'snoozed');
  assert.equal(res.record.returnAt, 5000);
});

test('a when-im-back snooze records the untilStartup flag and no returnAt', async () => {
  const { deps } = makeDeps();
  const res = await capture.letGo(
    { id: 8, url: 'https://example.com/a', title: 'A', incognito: false },
    deps,
    { snoozeState: 'snoozed', untilStartup: true },
  );
  assert.equal(res.record.snoozeState, 'snoozed');
  assert.equal(res.record.untilStartup, true);
  assert.equal(res.record.returnAt, undefined); // resolved only on startup, never by the wake sweep
});

test('recordExtra on a never-index tab still persists NOTHING (R10 assert-record backstop)', async () => {
  const { deps, ctx } = makeDeps();
  const res = await capture.letGo({ id: 9, url: 'https://secret.com', title: 'x', incognito: true }, deps, { autoClosed: true });
  assert.equal(res.kind, 'never-index');
  assert.equal(res.record, undefined);       // the sweep's `if (res && res.record)` guard never counts this closed
  assert.equal(await store.count(), 0);
  assert.deepEqual(ctx.closed, [9]);
});

test('the in-flight guard ignores a second let-go of the same tab', async () => {
  const { deps } = makeDeps();
  deps.inFlight.add(5);
  const res = await capture.letGo({ id: 5, url: 'https://example.com/a', title: 'A', incognito: false }, deps);
  assert.equal(res.kind, 'skipped');
  assert.equal(await store.count(), 0);
});

test('undo with no pending entry is a no-op (never deletes the store record)', async () => {
  const { deps } = makeDeps();
  await capture.letGo({ id: 7, url: 'https://example.com/a', title: 'A', incognito: false }, deps);
  const before = await store.count();
  const ok = await capture.undo('nonexistent-id', deps);
  assert.equal(ok, false);
  assert.equal(await store.count(), before); // store untouched
});

test('expirePending drops entries past their grace window', async () => {
  const session = { _d: {}, get: async (k) => session._d[k], set: async (k, v) => { session._d[k] = v; } };
  await session.set('pendingUndo', [{ recordId: 'a', expiry: 500 }, { recordId: 'b', expiry: 5000 }]);
  const dropped = await capture.expirePending(session, 1000);
  assert.equal(dropped, 1);
  assert.deepEqual((await capture.readPending(session)).map((p) => p.recordId), ['b']);
});
