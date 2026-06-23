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
 *
 * Semantic recall (U3) adds a per-page vector store. Forget/blocklist MUST drop
 * a page's vector or its meaning stays cosine-searchable after the content is
 * gone — a privacy regression (§7). `deps.vectorstore` + `deps.vectorDeps` are
 * INJECTED and OPTIONAL: absent (semantic never enabled / pre-slice callers) the
 * vector drops no-op, so the cross-store paths stay back-compatible.
 */
(function (root) {
  'use strict';

  // Strip a record down to title+URL only (the metadata-only form).
  function downgrade(record) {
    return Object.assign({}, record, { content: '', excerpt: '', contentLess: true });
  }

  // Drop a single page's vector by its canonical key, if a vector store is wired.
  async function dropVector(url, deps) {
    if (!deps.vectorstore || !deps.vectorDeps || !url) return;
    const key = deps.vectorDeps.canonicalKeyOf(url);
    if (key) await deps.vectorstore.deleteKey(deps.vectorDeps, key);
  }

  // Drop every vector for a host, if a vector store is wired.
  async function dropDomainVectors(host, deps) {
    if (!deps.vectorstore || !deps.vectorDeps) return;
    await deps.vectorstore.deleteByDomain(deps.vectorDeps, host);
  }

  // Adding a domain to the blocklist retroactively downgrades its already-
  // indexed content AND wipes its prior dwell signal. The index is re-written
  // (addRecord replaces) so no stripped content survives in the snapshot.
  // The page's VECTOR — embedded from the now-scrubbed content — must be dropped
  // too, or a blocklisted page stays semantically searchable (§7 privacy). This
  // is a DOWNGRADE (content:''), not a delete, so the vector won't fall out via
  // any record-deletion path; it has to be dropped here explicitly.
  async function retroactivePurge(host, deps) {
    const records = await deps.store.getByDomain(host);
    for (const r of records) {
      const d = downgrade(r);
      await deps.store.put(d);
      deps.search.addRecord(d);
    }
    deps.signal.deleteByDomain(host, deps.durable);
    await dropDomainVectors(host, deps);
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
    await dropVector(record.url, deps);
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
    // Undoing a forget restores the page in full — re-embed its vector so an undo
    // doesn't leave the page permanently keyword-only. Only when semantic is wired
    // AND the restored record carries content (a downgraded record has none).
    if (deps.vectorstore && deps.vectorDeps && typeof deps.vectorDeps.embed === 'function' &&
        bundle.record && bundle.record.url && !bundle.record.contentLess) {
      try {
        await deps.vectorstore.embedAndPut(
          deps.vectorDeps, bundle.record.url, bundle.record.content || '', deps.modelVersion);
      } catch { /* re-embed is best-effort; backfill recovers a miss */ }
    }
  }

  // Domain forget: remove every entry for a domain from every store (AE6).
  async function forgetDomain(host, deps) {
    const records = await deps.store.getByDomain(host);
    for (const r of records) deps.search.removeRecord(r.id);
    const n = await deps.store.deleteByDomain(host);
    deps.signal.deleteByDomain(host, deps.durable);
    await dropDomainVectors(host, deps);
    return n != null ? n : records.length;
  }

  const api = { downgrade, retroactivePurge, forgetPage, restorePage, forgetDomain };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { privacy: api });
})(typeof self !== 'undefined' ? self : globalThis);
