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

  function indexRow(rec, hit, sig, ageMs, q) {
    // Center the excerpt + highlight on the term MiniSearch ACTUALLY matched (a
    // fuzzy/prefix hit on 'googl' matches the index term 'google', which is what
    // appears in the content — the raw query would find nothing and show no excerpt).
    const terms = (hit && Array.isArray(hit.terms) && hit.terms.length)
      ? hit.terms
      : (q ? q.toLowerCase().split(/\s+/).filter(Boolean) : []);
    return {
      kind: rec.snoozeState ? 'snoozed' : 'let-go',
      id: rec.id, url: rec.url, host: rec.host, title: rec.title,
      contentLess: rec.contentLess, timestamp: rec.timestamp,
      frequent: (sig.revisits || 0) >= FREQUENT_REVISITS,
      siblings: Array.isArray(rec.siblings) ? rec.siblings : [],
      snoozeState: rec.snoozeState || null,
      returnAt: typeof rec.returnAt === 'number' ? rec.returnAt : null,
      untilStartup: !!rec.untilStartup,
      snippet: search.excerptAround((rec.content || '').slice(0, EXCERPT_SCAN), terms.join(' '), EXCERPT_RADIUS) || '',
      matchTerms: terms,
      score: hit ? hit.score : 0, signal: { revisits: sig.revisits || 0, dwell: sig.dwell || 0, ageMs },
    };
  }

  // A semantic (meaning-match) candidate: a per-page VECTOR scored by cosine
  // against the query, with NO MiniSearch hit. The SW resolves the cosine top-K
  // back to records (store.getByCanonicalKey) and hands them here; this
  // synthesizes a FINISHED ROW (appended to `rows` BEFORE recallmerge.merge —
  // NOT a hits[] entry, since there's no text hit to rank). It carries:
  //  - kind 'semantic' (a distinct origin, like 'open'/'snoozed'),
  //  - the cosine on the `semantic` field (the new rank axis),
  //  - EMPTY matchTerms, so excerptAround returns '' rather than throwing on a
  //    page the query never keyword-matched (there's no term to center on),
  //  - score 0 (the text axis is genuinely absent; `semantic` drives candidacy).
  // Dedup against a keyword twin happens in recallmerge.merge; assemble re-stamps
  // the semantic value onto the surviving row so a both-matched page keeps the
  // keyword twin's terms/excerpt AND its cosine.
  function semanticRow(rec, cosine) {
    const sem = cosine > 0 ? (cosine > 1 ? 1 : cosine) : 0;
    return {
      kind: 'semantic',
      id: rec.id, url: rec.url, host: rec.host, title: rec.title,
      contentLess: rec.contentLess, timestamp: rec.timestamp,
      frequent: false,
      siblings: Array.isArray(rec.siblings) ? rec.siblings : [],
      snoozeState: rec.snoozeState || null,
      returnAt: typeof rec.returnAt === 'number' ? rec.returnAt : null,
      untilStartup: !!rec.untilStartup,
      snippet: '',
      matchTerms: [],
      score: 0, semantic: sem, signal: { revisits: 0, dwell: 0, ageMs: null },
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

  function siblingMatch(siblings, term) {
    const t = term.toLowerCase();
    return (Array.isArray(siblings) ? siblings : []).some((s) =>
      s && ((s.url || '').toLowerCase().includes(t) || (s.host || '').toLowerCase().includes(t)));
  }

  // Narrow assembled rows by the parsed episodic pivots. `with:` filters ONLY
  // let-go rows by the session (sibling URL/host) they were let go alongside —
  // open/snoozed rows have no cluster, so a pivot narrows the archive and never
  // hides a live tab. A time range applies to any row that carries a timestamp.
  function filterPivots(rows, pivots) {
    if (!pivots) return Array.isArray(rows) ? rows : [];
    let out = Array.isArray(rows) ? rows : [];
    if (pivots.withTerm) {
      out = out.filter((r) => r.kind !== 'let-go' || siblingMatch(r.siblings, pivots.withTerm));
    }
    if (pivots.timeRange) {
      const { from, to } = pivots.timeRange;
      out = out.filter((r) => typeof r.timestamp !== 'number' || (r.timestamp >= from && r.timestamp < to));
    }
    return out;
  }

  function stripInternal(row) {
    const clean = Object.assign({}, row);
    delete clean.score; delete clean.signal; delete clean._blended; delete clean.semantic;
    return clean;
  }

  // `records` is parallel to `hits` and may contain nulls (ids evicted between
  // the text search and store.get) — those rows are skipped. `semanticRows` are
  // pre-built meaning-match rows (semanticRow above) the SW resolved from the
  // cosine top-K; they're unioned with the keyword/open rows BEFORE merge, so a
  // page matched by both collapses to one canonical row. The merge keeps the
  // keyword twin's display fields, so we re-stamp the max cosine per key onto the
  // survivor afterward (else combine() — which bases on the keyword twin — would
  // drop the semantic value the rerank needs). A survivor still tagged
  // kind:'semantic' (a semantic-only candidate, no keyword twin) is remapped to
  // its record's real, actionable kind (let-go / snoozed).
  function assemble(input) {
    const { hits = [], records = [], openTabs = [], semanticRows = [], durable = {}, q = '', now = 0, oneBox = false } = input || {};
    const sigByKey = aggregateSignal(durable);
    const signalFor = (url) => sigByKey.get(cluster.originPathKey(url)) || { revisits: 0, dwell: 0 };

    const rows = [];
    for (let i = 0; i < hits.length; i++) {
      const rec = records[i];
      if (!rec) continue;
      rows.push(indexRow(rec, hits[i], signalFor(rec.url), ageMsOf(rec, now), q));
    }
    if (oneBox) {
      for (const t of openTabs) { const r = openRow(t, q); if (r) rows.push(r); }
    }

    // The max cosine seen per canonical key, so the value survives a merge that
    // bases the survivor on a keyword twin (which has no `semantic`).
    const semByKey = new Map();
    for (const r of semanticRows) {
      if (!r || !r.url) continue;
      rows.push(r);
      const k = cluster.originPathKey(r.url);
      const prev = semByKey.get(k) || 0;
      if (r.semantic > prev) semByKey.set(k, r.semantic);
    }

    const merged = recallmerge.merge(rows);
    for (const r of merged) {
      const sem = r.url ? semByKey.get(cluster.originPathKey(r.url)) : 0;
      if (sem > 0) r.semantic = sem;
      if (r.kind === 'semantic') r.kind = r.snoozeState ? 'snoozed' : 'let-go';
    }
    return rank.rerank(merged).map(stripInternal);
  }

  const api = { assemble, filterPivots, aggregateSignal, ageMsOf, openRow, indexRow, semanticRow };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { recallrank: api });
})(typeof self !== 'undefined' ? self : globalThis);
