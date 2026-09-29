/*
 * ypuf — per-URL persistence for the dwell/revisit signal (lib/signal.js).
 *
 * The signal used to live in ONE chrome.storage.local blob that every tab switch,
 * in-tab navigation and window focus change read, rewrote whole, and broadcast to
 * every open board via storage.onChanged — 7 MB on a months-old profile. It now
 * lives in the v3 IndexedDB `signal` store, one row per URL:
 *
 *   { url, dwell?, revisits?, lastActiveAt? }     (a field is absent, never null)
 *
 * Consumers keep the in-memory shape lib/signal.js defines — { dwell, revisits,
 * lastActiveAt }, each a url->number map — so the pure signal/eligibility/recall/
 * privacy code is unchanged. This module only moves that shape in and out:
 *
 *   load(deps, urls)          -> the map for just these URLs (tab-switch hot path)
 *   save(deps, durable, urls) -> write back just these URLs (absent → row deleted)
 *   loadAll(deps)             -> the whole map (recall, sweeps, forget/undo/purge)
 *   saveAll(deps, durable)    -> persist the whole map, writing only the diff
 *   pruneStale(deps, now, maxAgeMs) -> drop rows last active before the window
 *   count(deps)               -> rows stored
 *   migrateLegacy(deps, io)   -> one-time import of the old chrome.storage blob
 *
 * Pure DI, like vectorstore: `withSignalStore` + `reqToPromise` come from
 * store.js; this module never opens its own DB connection or touches chrome.*.
 */
(function (root) {
  'use strict';

  const FIELDS = ['dwell', 'revisits', 'lastActiveAt'];

  function emptyMap() {
    return { dwell: {}, revisits: {}, lastActiveAt: {} };
  }

  function urlsOf(durable) {
    const urls = new Set();
    for (const f of FIELDS) for (const url of Object.keys((durable && durable[f]) || {})) urls.add(url);
    return urls;
  }

  function rowOf(durable, url) {
    const row = { url };
    let any = false;
    for (const f of FIELDS) {
      const map = durable && durable[f];
      if (map && Object.hasOwn(map, url) && map[url] !== undefined) { row[f] = map[url]; any = true; }
    }
    return any ? row : null;
  }

  function toMap(rows) {
    const d = emptyMap();
    for (const row of rows) for (const f of FIELDS) if (row[f] !== undefined) d[f][row.url] = row[f];
    return d;
  }

  const sameRow = (a, b) => FIELDS.every((f) => a[f] === b[f]);
  const distinct = (urls) => [...new Set((urls || []).filter(Boolean))];

  async function load(deps, urls) {
    const rows = await deps.withSignalStore('readonly',
      (s) => Promise.all(distinct(urls).map((url) => deps.reqToPromise(s.get(url)))));
    return toMap(rows.filter(Boolean));
  }

  function save(deps, durable, urls) {
    return deps.withSignalStore('readwrite', (s) => Promise.all(distinct(urls).map((url) => {
      const row = rowOf(durable, url);
      return deps.reqToPromise(row ? s.put(row) : s.delete(url));
    })));
  }

  async function loadAll(deps) {
    return toMap(await deps.withSignalStore('readonly', (s) => deps.reqToPromise(s.getAll())));
  }

  // Read and write inside ONE readwrite transaction, so the diff is against
  // exactly what gets overwritten.
  function saveAll(deps, durable) {
    const want = new Map();
    for (const url of urlsOf(durable)) {
      const row = rowOf(durable, url);
      if (row) want.set(url, row);
    }
    return deps.withSignalStore('readwrite', async (s) => {
      const have = await deps.reqToPromise(s.getAll());
      const writes = [];
      for (const row of have) {
        const next = want.get(row.url);
        if (!next) writes.push(s.delete(row.url));
        else if (!sameRow(row, next)) writes.push(s.put(next));
        want.delete(row.url);
      }
      for (const row of want.values()) writes.push(s.put(row));
      await Promise.all(writes.map((req) => deps.reqToPromise(req)));
    });
  }

  // Bound growth (U8): rows are keyed by every URL ever foregrounded and forget alone
  // never removes a visited-but-kept one, so drop any URL whose lastActiveAt is
  // strictly before now - maxAgeMs. A row with no lastActiveAt (pre-U8) isn't in the
  // index, so it is kept — it has no age to judge. O(removed), via the index.
  function pruneStale(deps, now, maxAgeMs) {
    const stale = IDBKeyRange.upperBound(now - maxAgeMs, true);
    return deps.withSignalStore('readwrite', (s) => new Promise((resolve, reject) => {
      let removed = 0;
      const req = s.index('lastActiveAt').openCursor(stale);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(removed); return; }
        cursor.delete();
        removed += 1;
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    }));
  }

  function count(deps) {
    return deps.withSignalStore('readonly', (s) => deps.reqToPromise(s.count()));
  }

  // Import the old chrome.storage blob, THEN remove it — so a failure or a SW death
  // mid-way leaves the blob for the next wake to retry. Import only puts (never
  // deletes), so a retry over an already-imported blob is harmless.
  async function migrateLegacy(deps, io) {
    const legacy = await io.getLegacy();
    if (!legacy || typeof legacy !== 'object') return 0;
    const rows = [...urlsOf(legacy)].map((url) => rowOf(legacy, url)).filter(Boolean);
    await deps.withSignalStore('readwrite', (s) => Promise.all(rows.map((row) => deps.reqToPromise(s.put(row)))));
    await io.removeLegacy();
    return rows.length;
  }

  const api = { load, save, loadAll, saveAll, pruneStale, count, migrateLegacy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { signalstore: api });
})(typeof self !== 'undefined' ? self : globalThis);
