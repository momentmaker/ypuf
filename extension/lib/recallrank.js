/*
 * ypuf — one-box recall assembler (Recall v2 / U3, pure seam).
 *
 * The decidable core of getRecallResults, kept free of chrome.* so it is
 * unit-testable: the SW gathers the inputs (text-search hits + their records,
 * the live open tabs, the signal map) and this function ranks + dedups them
 * into the rows the panel renders.
 *
 *   index hits  ─┐
 *   open tabs   ─┼─► merge by cluster.originPathKey (field-level) ─► rank.rerank ─► rows
 *   (snoozed rows are index hits whose record.snoozeState is set — not a 3rd source)
 *
 * Two review-driven correctness rules live here:
 *  - Pattern 9: signal is keyed by the exact URL but dedup is by origin+pathname,
 *    so aggregate the signal across every full-URL that collapses to one key —
 *    else a page whose engagement is banked under a query-bearing URL gets no lift.
 *  - Pattern 19: a born-equal record (lastAccessed === timestamp) has never been
 *    recalled, so its recency age is null and contributes no rank lift.
 */
(function (root) {
  'use strict';

  const resolve = (name, path) =>
    (typeof self !== 'undefined' && self.ypuf && self.ypuf[name]) ? self.ypuf[name] :
    (typeof require !== 'undefined' ? require(path) : null);
  const rank = resolve('rank', './rank.js');
  const recallmerge = resolve('recallmerge', './recallmerge.js');
  const cluster = resolve('cluster', './cluster.js');
  const search = resolve('search', './search.js');

  const FREQUENT_REVISITS = 3;     // matches background's "often revisited" marker
  const EXCERPT_SCAN = 8000;       // bound the per-keystroke excerpt scan
  const EXCERPT_RADIUS = 90;
  const OPEN_MATCH_SCALE = 2;      // synthesized relevance for an open-tab url/title match

  // Pattern 9: collapse the per-exact-URL signal onto the canonical dedup key.
  function aggregateSignal(durable) {
    const byKey = new Map();
    const add = (url, field, val) => {
      const k = cluster.originPathKey(url);
      const e = byKey.get(k) || { revisits: 0, dwell: 0 };
      e[field] += val || 0;
      byKey.set(k, e);
    };
    const rv = (durable && durable.revisits) || {};
    const dw = (durable && durable.dwell) || {};
    for (const u of Object.keys(rv)) add(u, 'revisits', rv[u]);
    for (const u of Object.keys(dw)) add(u, 'dwell', dw[u]);
    return byKey;
  }

  // Pattern 19: born-equal (never recalled) -> no recency age.
  function ageMsOf(rec, now) {
    if (typeof rec.lastAccessed === 'number' && typeof rec.timestamp === 'number'
        && rec.lastAccessed > rec.timestamp) {
      return now - rec.lastAccessed;
    }
    return null;
  }

  function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }
  const isWeb = (url) => /^https?:\/\//i.test(url || '');

  function indexRow(rec, score, sig, ageMs, q) {
    return {
      kind: rec.snoozeState ? 'snoozed' : 'let-go',
      id: rec.id, url: rec.url, host: rec.host, title: rec.title,
      contentLess: rec.contentLess, timestamp: rec.timestamp,
      frequent: (sig.revisits || 0) >= FREQUENT_REVISITS,
      siblings: Array.isArray(rec.siblings) ? rec.siblings : [],
      snoozeState: rec.snoozeState || null,
      returnAt: typeof rec.returnAt === 'number' ? rec.returnAt : null,
      untilStartup: !!rec.untilStartup,
      snippet: search.excerptAround((rec.content || '').slice(0, EXCERPT_SCAN), q, EXCERPT_RADIUS) || '',
      score, signal: { revisits: sig.revisits || 0, dwell: sig.dwell || 0, ageMs },
    };
  }

  // A currently-open tab matched on url/title (it has no indexed content). Incognito
  // tabs never surface to the new-tab page. Returns null when it doesn't match q.
  function openRow(tab, q) {
    if (!tab || tab.incognito || !isWeb(tab.url)) return null;
    const terms = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return null;
    const hay = ((tab.title || '') + ' ' + tab.url).toLowerCase();
    const matched = terms.filter((t) => hay.includes(t)).length;
    if (!matched) return null;
    return {
      kind: 'open', id: null, url: tab.url, host: hostOf(tab.url), title: (tab.title || '').trim(),
      tabId: tab.id, contentLess: true, timestamp: null, frequent: false,
      siblings: [], snoozeState: null, returnAt: null, untilStartup: false, snippet: '',
      score: (matched / terms.length) * OPEN_MATCH_SCALE,
      signal: { revisits: 0, dwell: 0, ageMs: null },
    };
  }

  function stripInternal(row) {
    const clean = Object.assign({}, row);
    delete clean.score; delete clean.signal; delete clean._blended;
    return clean;
  }

  // `records` is parallel to `hits` and may contain nulls (ids evicted between
  // the text search and store.get) — those rows are skipped.
  function assemble(input) {
    const { hits = [], records = [], openTabs = [], durable = {}, q = '', now = 0, oneBox = false } = input || {};
    const sigByKey = aggregateSignal(durable);
    const signalFor = (url) => sigByKey.get(cluster.originPathKey(url)) || { revisits: 0, dwell: 0 };

    const rows = [];
    for (let i = 0; i < hits.length; i++) {
      const rec = records[i];
      if (!rec) continue;
      rows.push(indexRow(rec, hits[i].score, signalFor(rec.url), ageMsOf(rec, now), q));
    }
    if (oneBox) {
      for (const t of openTabs) { const r = openRow(t, q); if (r) rows.push(r); }
    }
    return rank.rerank(recallmerge.merge(rows)).map(stripInternal);
  }

  const api = { assemble, aggregateSignal, ageMsOf, openRow, indexRow };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { recallrank: api });
})(typeof self !== 'undefined' ? self : globalThis);
