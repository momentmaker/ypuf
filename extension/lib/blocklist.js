/*
 * ypuf — cross-store privacy operations (U8).
 *
 * The "what's indexed" view, forget, and blocklist management are user-facing;
 * this module is the load-bearing part: every forget / blocklist-purge spans
 * ALL persisted stores — IndexedDB content (U3), the MiniSearch index (U4), and
 * the dwell/revisit signal (U9). Adding a store is incomplete until these
 * paths cover it. Slice 2's per-tab state and reopen-protection stores are
 * purged alongside these via background.js `purgeDomainStores` (U1/U7).
 *
 * Orchestration only — store/search/signal/durable are injected so the
 * cross-store guarantees are unit-testable; background.js owns persistence.
 */
(function (root) {
  'use strict';

  // Strip a record down to title+URL only (the metadata-only form).
  function downgrade(record) {
    return Object.assign({}, record, { content: '', excerpt: '', contentLess: true });
  }

  // Adding a domain to the blocklist retroactively downgrades its already-
  // indexed content AND wipes its prior dwell signal. The index is re-written
  // (addRecord replaces) so no stripped content survives in the snapshot.
  async function retroactivePurge(host, deps) {
    const records = await deps.store.getByDomain(host);
    for (const r of records) {
      const d = downgrade(r);
      await deps.store.put(d);
      deps.search.addRecord(d);
    }
    deps.signal.deleteByDomain(host, deps.durable);
    return records.length;
  }

  // Single-page forget: remove from every store. Returns a bundle so the
  // ~6s undo can restore content + index + dwell together.
  async function forgetPage(recordId, deps) {
    const record = await deps.store.get(recordId);
    if (!record) return null;
    const bundle = {
      record,
      dwell: deps.durable.dwell[record.url],
      revisits: deps.durable.revisits[record.url],
      lastActiveAt: deps.durable.lastActiveAt && deps.durable.lastActiveAt[record.url],
    };
    await deps.store.remove(recordId);
    deps.search.removeRecord(recordId);
    deps.signal.deleteByUrl(record.url, deps.durable);
    return bundle;
  }

  async function restorePage(bundle, deps) {
    if (!bundle) return;
    await deps.store.put(bundle.record);
    deps.search.addRecord(bundle.record);
    if (bundle.dwell != null) deps.durable.dwell[bundle.record.url] = bundle.dwell;
    if (bundle.revisits != null) deps.durable.revisits[bundle.record.url] = bundle.revisits;
    // `lastActiveAt` is absent on bundles captured before U8 — restore is a no-op then.
    if (bundle.lastActiveAt != null) (deps.durable.lastActiveAt || (deps.durable.lastActiveAt = {}))[bundle.record.url] = bundle.lastActiveAt;
  }

  // Domain forget: remove every entry for a domain from every store (AE6).
  async function forgetDomain(host, deps) {
    const records = await deps.store.getByDomain(host);
    for (const r of records) deps.search.removeRecord(r.id);
    const n = await deps.store.deleteByDomain(host);
    deps.signal.deleteByDomain(host, deps.durable);
    return n != null ? n : records.length;
  }

  const api = { downgrade, retroactivePurge, forgetPage, restorePage, forgetDomain };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { privacy: api });
})(typeof self !== 'undefined' ? self : globalThis);
