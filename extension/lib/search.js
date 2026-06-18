/*
 * ypuf — recall search index (U4).
 *
 * A MiniSearch inverted index over the store (U3), which stays the source of
 * truth. This module is a rehydratable VIEW: it is snapshotted to storage and
 * loaded on startup; on any load failure it rebuilds from the store, and after
 * a successful load it reconciles against the store so an async-snapshot gap
 * can't hide a record.
 *
 * MiniSearch is resolved from `self.MiniSearch` (importScripts in the SW) or
 * via require() (node tests) — no build step.
 */
(function (root) {
  'use strict';

  const MiniSearch =
    (typeof self !== 'undefined' && self.MiniSearch) ? self.MiniSearch :
    (typeof require !== 'undefined' ? require('../vendor/minisearch.min.js') : null);

  const CONFIG = {
    idField: 'id',
    fields: ['title', 'url', 'content'],
    storeFields: ['id'],
  };

  const SEARCH_OPTS = {
    boost: { title: 3, url: 2, content: 1 },
    fuzzy: 0.2,
    prefix: true,
  };

  let _ms = null;

  function toDoc(record) {
    return {
      id: record.id,
      title: record.title || '',
      url: record.url || '',
      content: record.content || '',
    };
  }

  function create() {
    _ms = new MiniSearch(CONFIG);
    return _ms;
  }

  function ensure() {
    if (!_ms) create();
    return _ms;
  }

  function addRecord(record) {
    const ms = ensure();
    const doc = toDoc(record);
    if (ms.has(doc.id)) ms.replace(doc);
    else ms.add(doc);
  }

  function removeRecord(id) {
    const ms = ensure();
    if (ms.has(id)) ms.discard(id);
  }

  function buildFrom(records) {
    create();
    _ms.addAll(records.map(toDoc));
    return _ms;
  }

  function search(query, opts) {
    return ensure().search(query, Object.assign({}, SEARCH_OPTS, opts));
  }

  function has(id) {
    return ensure().has(id);
  }

  function snapshot() {
    return JSON.stringify(ensure().toJSON());
  }

  // Returns true if the snapshot loaded; false on ANY failure (missing,
  // malformed, version-incompatible) so the caller rebuilds from the store.
  function load(json) {
    if (!json) return false;
    try {
      _ms = MiniSearch.loadJSON(json, CONFIG);
      return true;
    } catch {
      _ms = null;
      return false;
    }
  }

  // Reconcile the index against the authoritative store on cold start. The
  // store is the source of truth, so this must heal divergence in BOTH
  // directions: an interrupted ADD (record in store, missing from a stale
  // snapshot) AND an interrupted REMOVE (record removed from the store by
  // undo/forget, but still a ghost in a snapshot that was flushed before the
  // removal). When counts differ we rebuild from the store — that drops ghosts
  // and adds missing docs in one pass. Returns the number of docs changed.
  function reconcile(records) {
    const ms = ensure();
    if (ms.documentCount !== records.length) {
      buildFrom(records);
      return records.length || 1; // signal a change so the caller re-snapshots
    }
    let added = 0;
    for (const record of records) {
      if (!ms.has(record.id)) { ms.add(toDoc(record)); added++; }
    }
    return added;
  }

  // Pull a short content excerpt around the first query-term match — the "recall by
  // what it said" snippet for the command bar (the moat: recall by content, not metadata).
  // Pure + tested. Returns '' when no term appears in the content (e.g. the hit matched
  // on title/url only), so the caller can omit the line rather than show a head-of-doc stub.
  function excerptAround(content, query, radius) {
    if (!content || !query) return '';
    const r = radius > 0 ? radius : 90;
    const lc = content.toLowerCase();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    let pos = -1;
    for (const t of terms) {
      const i = lc.indexOf(t);
      if (i >= 0 && (pos < 0 || i < pos)) pos = i;
    }
    if (pos < 0) return '';
    const start = Math.max(0, pos - r);
    const end = Math.min(content.length, pos + r);
    let s = content.slice(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) s = '… ' + s;
    if (end < content.length) s += ' …';
    return s;
  }

  const api = {
    create, addRecord, removeRecord, buildFrom, search, has,
    snapshot, load, reconcile, excerptAround, CONFIG, SEARCH_OPTS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { search: api });
})(typeof self !== 'undefined' ? self : globalThis);
