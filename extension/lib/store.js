/*
 * ypuf — IndexedDB content store + retention (U3).
 *
 * Source of truth for archived pages (the MiniSearch index in U4 is a
 * rehydratable view over this). Local-only; nothing is ever transmitted.
 *
 * Uses the global `indexedDB` — `self.indexedDB` in the MV3 service worker,
 * and the `fake-indexeddb/auto` shim under node tests. The DB handle is
 * memoized and reopened on demand (reset() clears it), because the service
 * worker is terminated at ~30s idle and must reopen the DB on each wake.
 *
 * Record shape:
 *   { id, url, host, title, content, excerpt, timestamp, lastAccessed,
 *     byteSize, contentLess }
 */
(function (root) {
  'use strict';

  const DB_NAME = 'ypuf';
  const STORE = 'entries';
  const VERSION = 1;

  let _name = DB_NAME;
  let _dbPromise = null;

  function reset() {
    _dbPromise = null;
  }

  function openDB(name) {
    if (name && name !== _name) { _name = name; _dbPromise = null; }
    if (_dbPromise) return _dbPromise;
    const p = new Promise((resolve, reject) => {
      const req = indexedDB.open(_name, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('host', 'host', { unique: false });
        s.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        s.createIndex('byteSize', 'byteSize', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // Don't memoize a rejection — one transient open failure would otherwise
    // poison the store for the whole SW lifetime. Clear so the next call retries.
    p.catch(() => { if (_dbPromise === p) _dbPromise = null; });
    _dbPromise = p;
    return p;
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then((r) => { result = r; }).catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function estimateBytes(record) {
    const text = (record.title || '') + (record.url || '') + (record.content || '') + (record.excerpt || '');
    return text.length;
  }

  function normalize(record) {
    const r = Object.assign({}, record);
    if (r.timestamp == null) throw new Error('store.put: record.timestamp is required');
    if (r.lastAccessed == null) r.lastAccessed = r.timestamp;
    if (r.contentLess) r.content = '';
    if (r.byteSize == null) r.byteSize = estimateBytes(r);
    return r;
  }

  // Try the write; on quota pressure, prune once and retry. A second failure
  // surfaces, rather than silently dropping the record.
  async function withQuotaRetry(writeFn, pruneFn) {
    try {
      return await writeFn();
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        await pruneFn();
        return writeFn();
      }
      throw err;
    }
  }

  // On QuotaExceededError, free real space before retrying — an age cap plus a
  // byte budget derived from the live quota estimate. prune({}) frees nothing,
  // so the retry would hit the same error and lose the record.
  async function quotaPrune() {
    let maxBytes;
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const { quota = 0 } = (await navigator.storage.estimate()) || {};
        if (quota) maxBytes = Math.floor(quota * 0.6);
      }
    } catch { /* ignore */ }
    return prune({ maxAgeMs: 180 * 86400000, maxBytes });
  }

  async function put(record) {
    const r = normalize(record);
    return withQuotaRetry(
      () => withStore('readwrite', (s) => reqToPromise(s.put(r))),
      quotaPrune,
    );
  }

  function get(id) {
    return withStore('readonly', (s) => reqToPromise(s.get(id)));
  }

  async function getAll() {
    return withStore('readonly', (s) => reqToPromise(s.getAll()));
  }

  async function listRecent(limit = Infinity) {
    const all = await getAll();
    all.sort((a, b) => b.timestamp - a.timestamp);
    return Number.isFinite(limit) ? all.slice(0, limit) : all;
  }

  function getByDomain(host) {
    return withStore('readonly', (s) => reqToPromise(s.index('host').getAll(host)));
  }

  function remove(id) {
    return withStore('readwrite', (s) => reqToPromise(s.delete(id)));
  }

  async function deleteByDomain(host) {
    const records = await getByDomain(host);
    await withStore('readwrite', (s) => Promise.all(records.map((r) => reqToPromise(s.delete(r.id)))));
    return records.length;
  }

  async function touch(id, when) {
    const record = await get(id);
    if (!record) return false;
    record.lastAccessed = when == null ? new Date().getTime() : when;
    await withStore('readwrite', (s) => reqToPromise(s.put(record)));
    return true;
  }

  async function allIds() {
    return withStore('readonly', (s) => reqToPromise(s.getAllKeys()));
  }

  async function totalBytes() {
    const all = await getAll();
    return all.reduce((sum, r) => sum + (r.byteSize || 0), 0);
  }

  // Age cap, then LRU eviction by lastAccessed until under the byte budget.
  async function prune({ maxAgeMs, maxBytes, now } = {}) {
    const stamp = now == null ? new Date().getTime() : now;
    let deleted = 0;
    let all = await getAll();

    if (maxAgeMs != null) {
      const cutoff = stamp - maxAgeMs;
      const old = all.filter((r) => r.timestamp < cutoff);
      if (old.length) {
        await withStore('readwrite', (s) => Promise.all(old.map((r) => reqToPromise(s.delete(r.id)))));
        deleted += old.length;
        all = all.filter((r) => r.timestamp >= cutoff);
      }
    }

    if (maxBytes != null) {
      all.sort((a, b) => a.lastAccessed - b.lastAccessed); // LRU first
      let bytes = all.reduce((sum, r) => sum + (r.byteSize || 0), 0);
      const evict = [];
      let i = 0;
      while (bytes > maxBytes && i < all.length) {
        evict.push(all[i].id);
        bytes -= all[i].byteSize || 0;
        i++;
      }
      if (evict.length) {
        await withStore('readwrite', (s) => Promise.all(evict.map((id) => reqToPromise(s.delete(id)))));
        deleted += evict.length;
      }
    }
    return deleted;
  }

  // Trigger check: is the origin's storage past `threshold` of quota?
  async function shouldPrune({ estimateFn, threshold = 0.75 } = {}) {
    const fn = estimateFn || (() => navigator.storage.estimate());
    const { usage = 0, quota = 0 } = (await fn()) || {};
    if (!quota) return false;
    return usage / quota >= threshold;
  }

  function count() {
    return withStore('readonly', (s) => reqToPromise(s.count()));
  }

  const api = {
    reset, openDB, put, get, getAll, listRecent, getByDomain,
    remove, deleteByDomain, touch, allIds, totalBytes, prune, shouldPrune,
    withQuotaRetry, count,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { store: api });
})(typeof self !== 'undefined' ? self : globalThis);
