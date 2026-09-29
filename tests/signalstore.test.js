'use strict';

require('fake-indexeddb/auto');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const store = require('../extension/lib/store.js');
const signal = require('../extension/lib/signal.js');
const signalstore = require('../extension/lib/signalstore.js');

// The injected IDB accessors background.js wires — the real store.js DB handle.
const deps = { withSignalStore: store.withSignalStore, reqToPromise: store.reqToPromise };

const A = 'https://a.test/one';
const B = 'https://b.test/two';
const C = 'https://c.test/three';
const DAY = 86400000;

beforeEach(() => {
  globalThis.indexedDB = new globalThis.IDBFactory();
  store.reset();
});

// Build the in-memory durable shape every consumer uses from per-URL fields.
function durableOf(rows) {
  const d = signal.emptyState();
  for (const [url, f] of Object.entries(rows)) {
    if (f.dwell !== undefined) d.dwell[url] = f.dwell;
    if (f.revisits !== undefined) d.revisits[url] = f.revisits;
    if (f.lastActiveAt !== undefined) d.lastActiveAt[url] = f.lastActiveAt;
  }
  return d;
}

const extractable = () => ({ kind: 'extractable' });

test('loadAll on an empty store returns the empty signal shape', async () => {
  assert.deepEqual(await signalstore.loadAll(deps), signal.emptyState());
});

test('saveAll then loadAll round-trips the whole map', async () => {
  const d = durableOf({ [A]: { dwell: 10, revisits: 1, lastActiveAt: 100 }, [B]: { dwell: 20, revisits: 3, lastActiveAt: 200 } });
  await signalstore.saveAll(deps, d);
  assert.deepEqual(await signalstore.loadAll(deps), d);
});

test('load returns only the requested URLs', async () => {
  await signalstore.saveAll(deps, durableOf({
    [A]: { dwell: 1, revisits: 1, lastActiveAt: 1 },
    [B]: { dwell: 2, revisits: 2, lastActiveAt: 2 },
    [C]: { dwell: 3, revisits: 3, lastActiveAt: 3 },
  }));
  assert.deepEqual(await signalstore.load(deps, [A, B]), durableOf({
    [A]: { dwell: 1, revisits: 1, lastActiveAt: 1 },
    [B]: { dwell: 2, revisits: 2, lastActiveAt: 2 },
  }));
});

test('load of a URL with no row yields no entry for it', async () => {
  assert.deepEqual(await signalstore.load(deps, [A]), signal.emptyState());
});

test('a tab-switch save writes only its URLs — every other row is left untouched', async () => {
  await signalstore.saveAll(deps, durableOf({
    [A]: { dwell: 1000, revisits: 1, lastActiveAt: 10 },
    [C]: { dwell: 7, revisits: 7, lastActiveAt: 7 },
  }));
  const partial = await signalstore.load(deps, [A, B]);
  const next = signal.activate({ url: B }, 5000, {
    durable: partial, active: { url: A, start: 4000 }, classify: extractable, userBlocklist: [],
  });
  await signalstore.save(deps, next.durable, [A, B]);

  assert.deepEqual(await signalstore.loadAll(deps), durableOf({
    [A]: { dwell: 2000, revisits: 1, lastActiveAt: 10 },   // flushed 1s of foreground time
    [B]: { revisits: 1, lastActiveAt: 5000 },              // newly activated
    [C]: { dwell: 7, revisits: 7, lastActiveAt: 7 },       // not in the partial → untouched
  }));
});

test('a tab-switch save deletes a URL its partial no longer holds', async () => {
  await signalstore.saveAll(deps, durableOf({ [A]: { dwell: 1, revisits: 1, lastActiveAt: 1 } }));
  const partial = await signalstore.load(deps, [A]);
  signal.deleteByUrl(A, partial);
  await signalstore.save(deps, partial, [A]);
  assert.equal(await signalstore.count(deps), 0);
});

test('saveAll deletes rows missing from the map (forget) and updates changed ones', async () => {
  await signalstore.saveAll(deps, durableOf({
    [A]: { dwell: 1, revisits: 1, lastActiveAt: 1 },
    [B]: { dwell: 2, revisits: 2, lastActiveAt: 2 },
  }));
  const full = await signalstore.loadAll(deps);
  signal.deleteByUrl(A, full);
  full.revisits[B] = 9;
  await signalstore.saveAll(deps, full);
  assert.deepEqual(await signalstore.loadAll(deps), durableOf({ [B]: { dwell: 2, revisits: 9, lastActiveAt: 2 } }));
});

test('saveAll writes only the rows that changed — a one-URL forget is not a whole-map rewrite', async () => {
  await signalstore.saveAll(deps, durableOf({
    [A]: { dwell: 1, revisits: 1, lastActiveAt: 1 },
    [B]: { dwell: 2, revisits: 2, lastActiveAt: 2 },
    [C]: { dwell: 3, revisits: 3, lastActiveAt: 3 },
  }));
  const full = await signalstore.loadAll(deps);
  signal.deleteByUrl(A, full);
  full.revisits[B] = 9;

  const writes = [];
  const recording = (s) => new Proxy(s, {
    get(target, prop) {
      const v = target[prop];
      if (prop === 'put' || prop === 'delete') return (arg) => { writes.push(prop); return v.call(target, arg); };
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  const spy = { ...deps, withSignalStore: (mode, fn) => store.withSignalStore(mode, (s) => fn(recording(s))) };
  await signalstore.saveAll(spy, full);
  assert.deepEqual(writes.sort(), ['delete', 'put']);   // A deleted, B updated, C untouched
});

test('an orphan URL with no lastActiveAt (pre-U8 data) round-trips without gaining one', async () => {
  const d = durableOf({ [A]: { dwell: 5, revisits: 2 } });
  await signalstore.saveAll(deps, d);
  const got = await signalstore.loadAll(deps);
  assert.deepEqual(got, d);
  assert.equal(A in got.lastActiveAt, false);
});

test('pruneStale deletes rows last active before the cutoff and keeps the rest', async () => {
  const now = 1000 * DAY;
  const cutoff = now - 180 * DAY;
  await signalstore.saveAll(deps, durableOf({
    [A]: { revisits: 1, lastActiveAt: cutoff - 1 },   // just past the window → dropped
    [B]: { revisits: 1, lastActiveAt: cutoff },       // exactly at the cutoff → kept (strict <)
    [C]: { revisits: 1, lastActiveAt: now },          // fresh → kept
  }));
  assert.equal(await signalstore.pruneStale(deps, now, 180 * DAY), 1);
  assert.deepEqual(Object.keys((await signalstore.loadAll(deps)).revisits).sort(), [B, C]);
});

test('pruneStale leaves an orphan without lastActiveAt alone (it has no age to judge)', async () => {
  await signalstore.saveAll(deps, durableOf({ [A]: { dwell: 5, revisits: 2 } }));
  assert.equal(await signalstore.pruneStale(deps, 1000 * DAY, 180 * DAY), 0);
  assert.equal(await signalstore.count(deps), 1);
});

test('count is the number of URLs with a signal row', async () => {
  await signalstore.saveAll(deps, durableOf({
    [A]: { revisits: 1, lastActiveAt: 1 },
    [B]: { revisits: 1, lastActiveAt: 1 },
  }));
  assert.equal(await signalstore.count(deps), 2);
});

// --- migration from the legacy chrome.storage `signal` blob ------------------

function legacyBox(value) {
  const box = { value, removed: false };
  return {
    box,
    io: {
      getLegacy: async () => box.value,
      removeLegacy: async () => { box.removed = true; box.value = undefined; },
    },
  };
}

test('migrateLegacy imports the legacy blob (orphans included), then removes it', async () => {
  const legacy = durableOf({
    [A]: { dwell: 1, revisits: 1, lastActiveAt: 1 },
    [B]: { dwell: 2, revisits: 2, lastActiveAt: 2 },
    [C]: { dwell: 3, revisits: 3 },
  });
  const { box, io } = legacyBox(legacy);
  assert.equal(await signalstore.migrateLegacy(deps, io), 3);
  assert.deepEqual(await signalstore.loadAll(deps), legacy);
  assert.equal(box.removed, true);
});

test('migrateLegacy with no legacy blob is a no-op and never removes anything', async () => {
  const { box, io } = legacyBox(undefined);
  assert.equal(await signalstore.migrateLegacy(deps, io), 0);
  assert.equal(box.removed, false);
});

test('a pre-U8 legacy blob with no lastActiveAt map imports cleanly', async () => {
  const { io } = legacyBox({ dwell: { [A]: 5 }, revisits: { [A]: 2 } });
  assert.equal(await signalstore.migrateLegacy(deps, io), 1);
  assert.deepEqual(await signalstore.loadAll(deps), durableOf({ [A]: { dwell: 5, revisits: 2 } }));
});

test('re-running the import (a crash before remove) never deletes rows the blob lacks', async () => {
  const legacy = durableOf({ [A]: { dwell: 1, revisits: 1, lastActiveAt: 1 } });
  await signalstore.migrateLegacy(deps, { getLegacy: async () => legacy, removeLegacy: async () => { throw new Error('SW died'); } })
    .catch(() => {});
  await signalstore.save(deps, durableOf({ [B]: { revisits: 1, lastActiveAt: 2 } }), [B]);
  const { io } = legacyBox(legacy);
  await signalstore.migrateLegacy(deps, io);
  assert.deepEqual(Object.keys((await signalstore.loadAll(deps)).revisits).sort(), [A, B]);
});

test('a failed import keeps the legacy blob for the next wake', async () => {
  const { box, io } = legacyBox(durableOf({ [A]: { revisits: 1, lastActiveAt: 1 } }));
  const broken = { ...deps, withSignalStore: async () => { throw new Error('idb unavailable'); } };
  await assert.rejects(signalstore.migrateLegacy(broken, io), /idb unavailable/);
  assert.equal(box.removed, false);
});
