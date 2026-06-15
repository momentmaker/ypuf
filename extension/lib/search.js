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

  // Re-add any authoritative store record missing from the index (covers an
  // SW death between the IDB write and the snapshot flush).
  function reconcile(records) {
    const ms = ensure();
    let added = 0;
    for (const record of records) {
      if (!ms.has(record.id)) { ms.add(toDoc(record)); added++; }
    }
    return added;
  }

  const api = {
    create, addRecord, removeRecord, buildFrom, search, has,
    snapshot, load, reconcile, CONFIG, SEARCH_OPTS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { search: api });
})(typeof self !== 'undefined' ? self : globalThis);
