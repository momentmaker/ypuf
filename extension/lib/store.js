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
 *
 * VERSION 2 (semantic recall U3) adds, non-destructively:
 *   - a `vectors` object store (keyed by canonical origin+path) for the
 *     per-page embedding vectors — owned by lib/vectorstore.js, which reaches
 *     the same DB handle through `openDB()` + the exported store-name constants.
 *   - a `canonicalKey` index on the RECORD store so a vector's key resolves to
 *     its record in O(1) (the key->record read path semantic recall needs;
 *     records are keyed by `id`, which a cosine result never carries).
 */
(function (root) {
  'use strict';

  const DB_NAME = 'ypuf';
  const STORE = 'entries';
  const VECTOR_STORE = 'vectors';
  const VERSION = 2;

  // origin+pathname canonical key — the SAME normalization cluster.originPathKey
  // and the working-set siblings use (drops ?query/#hash). The `canonicalKey`
  // index is derived from this so a vector's key joins back to its record.
  function canonicalKeyOf(u) {
    try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; }
  }

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
      // Incremental, non-destructive migration: each version block runs only
      // when upgrading PAST it, so an existing v1 DB keeps every record while
      // gaining the v2 stores/index. `oldVersion === 0` is a fresh install.
      req.onupgradeneeded = (event) => {
        const db = req.result;
        const oldVersion = event.oldVersion;
        if (oldVersion < 1) {
          const s = db.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('host', 'host', { unique: false });
          s.createIndex('lastAccessed', 'lastAccessed', { unique: false });
          s.createIndex('byteSize', 'byteSize', { unique: false });
          s.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (oldVersion < 2) {
          db.createObjectStore(VECTOR_STORE, { keyPath: 'key' });
          // The records store already exists (created above for a fresh install,
          // or carried over from v1) — reach it via the upgrade transaction to
          // add the canonical-key index without rewriting any rows. IndexedDB does
          // NOT retro-populate an index: a pre-U3 record has no canonicalKey
          // property, so it stays ABSENT from this index until backfillCanonicalKeys()
          // re-puts it (normalize() then stamps the key). initIndex() runs that once.
          const entries = req.transaction.objectStore(STORE);
          if (!entries.indexNames.contains('canonicalKey')) {
            entries.createIndex('canonicalKey', 'canonicalKey', { unique: false });
          }
        }
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
    // Stamp the canonical key so the v2 index can join a vector's key back to
    // its record. Derived (never trusted from the caller) so it always matches
    // the url. A record without a url indexes under '' — harmless, never queried.
    r.canonicalKey = r.url ? canonicalKeyOf(r.url) : '';
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
  // so the retry would hit the same error and lose the record. `onEvict` rides
  // through to prune so the in-put() quota-pressure eviction also drops the
  // evicted pages' vectors (not just the cold-start sweep).
  async function quotaPrune(onEvict) {
    let maxBytes;
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const { quota = 0 } = (await navigator.storage.estimate()) || {};
        if (quota) maxBytes = Math.floor(quota * 0.6);
      }
    } catch { /* ignore */ }
    return prune({ maxAgeMs: 180 * 86400000, maxBytes, onEvict });
  }

  // `onEvict(records)` (optional): fires for any records evicted while making
  // room for this write under quota pressure, so a caller drops their vectors.
  async function put(record, { onEvict } = {}) {
    const r = normalize(record);
    return withQuotaRetry(
      () => withStore('readwrite', (s) => reqToPromise(s.put(r))),
      () => quotaPrune(onEvict),
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

  // key->record via the v2 canonical-key index (O(1), not a getAll scan). A page
  // re-let-go collapses to one record (capture.collapsePrior), so at most one
  // record carries a given key — return the first match (or undefined).
  async function getByCanonicalKey(key) {
    const matches = await withStore('readonly',
      (s) => reqToPromise(s.index('canonicalKey').getAll(key)));
    return (matches && matches.length) ? matches[0] : undefined;
  }

  // One-time index back-fill after the v1->v2 upgrade: a record written before
  // the canonicalKey property existed survives by `id` but is invisible to the
  // canonicalKey index until re-written — so getByCanonicalKey (and the backfill's
  // existence check) would miss it. Re-put any such record (normalize() stamps the
  // key) so the index covers the whole store. Idempotent: once every record has
  // the key, it's a no-op scan. Returns the count migrated.
  async function backfillCanonicalKeys() {
    const all = await getAll();
    const stale = all.filter((r) => r && r.url && r.canonicalKey == null);
    for (const r of stale) await put(r);
    return stale.length;
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
  // `onEvict(records)` (optional) receives the FULL evicted record objects so a
  // caller can resolve each record's url->canonical key and drop its paired
  // vector (no orphan vectors survive an eviction). It fires once per eviction
  // batch (age cap, then byte budget) and is awaited but best-effort: an
  // onEvict failure must not roll back the eviction it follows.
  async function prune({ maxAgeMs, maxBytes, now, onEvict } = {}) {
    const stamp = now == null ? new Date().getTime() : now;
    let deleted = 0;
    let all = await getAll();

    const fireEvict = async (records) => {
      if (typeof onEvict === 'function' && records.length) {
        try { await onEvict(records); } catch { /* best-effort; eviction already committed */ }
      }
    };

    if (maxAgeMs != null) {
      const cutoff = stamp - maxAgeMs;
      const old = all.filter((r) => r.timestamp < cutoff);
      if (old.length) {
        await withStore('readwrite', (s) => Promise.all(old.map((r) => reqToPromise(s.delete(r.id)))));
        deleted += old.length;
        all = all.filter((r) => r.timestamp >= cutoff);
        await fireEvict(old);
      }
    }

    if (maxBytes != null) {
      all.sort((a, b) => a.lastAccessed - b.lastAccessed); // LRU first
      let bytes = all.reduce((sum, r) => sum + (r.byteSize || 0), 0);
      const evict = []; // full records, not bare ids — onEvict needs the urls
      let i = 0;
      while (bytes > maxBytes && i < all.length) {
        evict.push(all[i]);
        bytes -= all[i].byteSize || 0;
        i++;
      }
      if (evict.length) {
        await withStore('readwrite', (s) => Promise.all(evict.map((r) => reqToPromise(s.delete(r.id)))));
        deleted += evict.length;
        await fireEvict(evict);
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

  // origin+pathname key — same normalization the working set stores siblings
  // under (drops ?query/#hash), so a forgotten record's full-href URL still
  // matches the query-stripped sibling form.
  function siblingKey(u) {
    try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; }
  }

  // Cross-record forget consistency (slice 4 / R12): remove the given URL(s) from
  // every other record's working set when their page is forgotten, so a forgotten
  // URL never lingers as a sibling. No reverse index exists, so this is ONE
  // full-store scan for the whole batch (a per-URL loop would re-scan N times).
  // Returns the number of records touched.
  async function scrubSiblings(urls) {
    const keys = new Set((Array.isArray(urls) ? urls : []).map(siblingKey));
    if (!keys.size) return 0;
    const all = await getAll();
    let touched = 0;
    for (const r of all) {
      if (!Array.isArray(r.siblings) || !r.siblings.length) continue;
      const next = r.siblings.filter((s) => !keys.has(siblingKey(s.url)));
      if (next.length !== r.siblings.length) { r.siblings = next; await put(r); touched += 1; }
    }
    return touched;
  }

  const scrubSibling = (url) => scrubSiblings([url]);

  // Run `fn(objectStore)` against the v2 vector store on the SAME memoized DB
  // handle the record store uses — so lib/vectorstore.js shares one DB/version
  // and never opens its own connection (which would race the migration). This
  // is the injected accessor vectorstore.js receives; it stays the only store.js
  // knowledge of the vector store's existence beyond the migration.
  async function withVectorStore(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE, mode);
      const vs = tx.objectStore(VECTOR_STORE);
      let result;
      Promise.resolve(fn(vs)).then((r) => { result = r; }).catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const api = {
    reset, openDB, put, get, getAll, listRecent, getByDomain, getByCanonicalKey,
    remove, deleteByDomain, touch, allIds, totalBytes, prune, quotaPrune, shouldPrune,
    withQuotaRetry, count, scrubSibling, scrubSiblings, backfillCanonicalKeys,
    withVectorStore, reqToPromise, canonicalKeyOf,
    STORE, VECTOR_STORE, VERSION,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { store: api });
})(typeof self !== 'undefined' ? self : globalThis);
