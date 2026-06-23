/*
 * ypuf — per-page embedding vector store (semantic recall U3).
 *
 * One model-version-tagged vector per CANONICAL page (origin+pathname), stored
 * in the v2 `vectors` IndexedDB object store beside the content index. This lib
 * is the lifecycle: store / read / drop / backfill the vectors that semantic
 * recall (U5) cosines a query against.
 *
 * Pure DI. The IndexedDB accessors (`withVectorStore`, `reqToPromise`,
 * `canonicalKeyOf`) AND the EMBEDDING function are INJECTED via `deps` — this
 * module never imports lib/embed.js, never touches chrome.*, never opens its own
 * DB connection. background.js wires the real store accessors + the real embed
 * fn (gated on semantic-enabled + model-ready); tests wire a stub embed. Keeping
 * embed injected means a blocklisted/forgotten page can be dropped here without
 * the (heavy) model ever being loaded.
 *
 * Stored row shape (keyed by `key`):
 *   { key: canonicalKeyOf(url), vector: Float32Array, modelVersion }
 *
 *   get(deps, key) -> row | undefined
 *   has(deps, key) -> boolean
 *   put(deps, key, vector, modelVersion) -> key
 *   deleteKey(deps, key)
 *   deleteByDomain(deps, host)            (drop every vector for a host)
 *   clear(deps)                           (purge the whole store)
 *   embedAndPut(deps, url, text, modelVersion)   (embed via deps.embed, then put)
 *   backfill(deps, opts)                  (resumable, idempotent batch embed)
 */
(function (root) {
  'use strict';

  // origin+pathname of a host — used to drop a domain's vectors. The stored key
  // is already canonical (origin+path), so a host's vectors are those whose key
  // URL parses to that hostname. We can't reverse a key to a host without
  // parsing, so deleteByDomain scans keys and matches hostname — bounded by the
  // vector count, which equals the page count (small).
  function hostOfKey(key) {
    try { return new URL(key).hostname; } catch { return null; }
  }

  function get(deps, key) {
    return deps.withVectorStore('readonly', (s) => deps.reqToPromise(s.get(key)));
  }

  async function has(deps, key) {
    const row = await get(deps, key);
    return row != null;
  }

  // Store (or replace) the vector for a canonical key. Newest write wins — a
  // page re-embedded (newer content, or a model bump) overwrites the prior
  // vector for the same key, so query/hash variants of one page never accrue
  // multiple vectors (they collapse to one canonical key). The vector is stored
  // as a Float32Array (round-trips through structured clone, confirmed under
  // fake-indexeddb); a non-Float32 input is coerced so callers can't poison the
  // store with a plain array.
  function put(deps, key, vector, modelVersion) {
    const vec = (vector instanceof Float32Array) ? vector : Float32Array.from(vector || []);
    return deps.withVectorStore('readwrite',
      (s) => deps.reqToPromise(s.put({ key, vector: vec, modelVersion })));
  }

  function deleteKey(deps, key) {
    return deps.withVectorStore('readwrite', (s) => deps.reqToPromise(s.delete(key)));
  }

  // Drop every vector belonging to a host — the blocklist-add / domain-forget
  // chokepoints. One read of the keys, then a batch delete of the matches.
  async function deleteByDomain(deps, host) {
    const keys = await deps.withVectorStore('readonly', (s) => deps.reqToPromise(s.getAllKeys()));
    const doomed = (keys || []).filter((k) => hostOfKey(k) === host);
    if (!doomed.length) return 0;
    await deps.withVectorStore('readwrite',
      (s) => Promise.all(doomed.map((k) => deps.reqToPromise(s.delete(k)))));
    return doomed.length;
  }

  function clear(deps) {
    return deps.withVectorStore('readwrite', (s) => deps.reqToPromise(s.clear()));
  }

  // Embed a page's text (via the injected embed fn) and store the vector under
  // its canonical key. Returns the key, or null when no embed fn is wired (the
  // semantic-off / model-absent no-op the seam guarantees). Empty text still
  // embeds to a (zero) vector — embed.js handles that safely — so a content-less
  // page gets a deterministic vector rather than a gap that re-backfills forever.
  async function embedAndPut(deps, url, text, modelVersion) {
    if (typeof deps.embed !== 'function') return null;
    const key = deps.canonicalKeyOf(url);
    if (!key) return null;
    const vector = deps.embed(text || '');
    await put(deps, key, vector, modelVersion);
    return key;
  }

  // Resumable, idempotent backfill: embed every indexed page that lacks a
  // current-version vector, advancing a PERSISTED cursor (deps.loadCursor /
  // deps.saveCursor over chrome.storage — Pattern 10) so an SW kill resumes
  // mid-pass rather than restarting. Each batch:
  //   - skips a page that already has a vector tagged the CURRENT modelVersion
  //     (so a resumed pass never re-embeds completed pages; a stale-version
  //     vector IS re-embedded — the model-bump invalidation path);
  //   - RE-CHECKS the record still exists at embed time (deps.recordExists), so
  //     a page concurrently forgotten between snapshot and embed can't get a
  //     re-created vector (the load-bearing privacy guard);
  //   - persists the cursor after each batch.
  // `deps.listKeys()` returns the ordered [{ key, url, text }] to embed (the SW
  // derives these from store.getAll). Returns { embedded, scanned, done }.
  async function backfill(deps, opts = {}) {
    if (typeof deps.embed !== 'function') return { embedded: 0, scanned: 0, done: true };
    const modelVersion = opts.modelVersion;
    const batchSize = opts.batchSize || 25;
    const pages = await deps.listKeys();           // ordered, stable across resumes
    let cursor = (typeof deps.loadCursor === 'function' ? await deps.loadCursor() : 0) || 0;
    if (cursor < 0 || cursor > pages.length) cursor = 0; // a stale cursor (index shrank) restarts safely

    let embedded = 0;
    let scanned = 0;
    const end = Math.min(cursor + batchSize, pages.length);
    for (let i = cursor; i < end; i++) {
      const page = pages[i];
      scanned += 1;
      if (!page || !page.url) continue;
      const key = deps.canonicalKeyOf(page.url);
      if (!key) continue;

      // Skip a page already embedded at the current model version (resume
      // without re-embedding completed pages). A missing/stale-version vector
      // falls through and is (re-)embedded.
      const existing = await get(deps, key);
      if (existing && existing.modelVersion === modelVersion) continue;

      // Re-check the record still exists RIGHT NOW (not from the snapshot): a
      // page forgotten since listKeys() must not get a re-created vector.
      if (typeof deps.recordExists === 'function' && !(await deps.recordExists(key))) {
        await deleteKey(deps, key); // and drop any stale vector the gap left behind
        continue;
      }

      await put(deps, key, deps.embed(page.text || ''), modelVersion);
      embedded += 1;
    }

    cursor = end;
    const done = cursor >= pages.length;
    if (done) cursor = 0; // reset so a later re-backfill (model bump) starts clean
    if (typeof deps.saveCursor === 'function') await deps.saveCursor(cursor);
    return { embedded, scanned, done };
  }

  // Cosine top-K over every stored vector (semantic recall U5). One pass: read
  // all rows, cosine each against the query vector (via the injected
  // deps.cosine — vectorstore never imports lib/embed.js), keep the K highest.
  // The scan is bounded by the vector count, which equals the page count (small
  // — a few thousand), so a per-query linear scan stays well inside the latency
  // bar. Rows tagged a DIFFERENT modelVersion than the query's are skipped: a
  // half-finished model bump must never cosine query vectors against stale ones
  // (mismatched spaces). A non-positive K, an empty store, or no cosine fn -> [].
  // Returns [{ key, score }] sorted by score desc, length <= K.
  async function topK(deps, queryVec, k, modelVersion) {
    if (typeof deps.cosine !== 'function' || !queryVec || !(k > 0)) return [];
    const rows = await deps.withVectorStore('readonly',
      (s) => deps.reqToPromise(s.getAll()));
    const scored = [];
    for (const r of rows || []) {
      if (!r || !r.vector) continue;
      if (modelVersion != null && r.modelVersion !== modelVersion) continue;
      scored.push({ key: r.key, score: deps.cosine(queryVec, r.vector) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  const api = {
    get, has, put, deleteKey, deleteByDomain, clear,
    embedAndPut, backfill, topK, hostOfKey,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { vectorstore: api });
})(typeof self !== 'undefined' ? self : globalThis);
