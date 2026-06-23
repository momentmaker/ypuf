/*
 * ypuf — one-box cross-state merge (Recall v2 / U2).
 *
 * Unifies the three recall states into one deduped result set: the let-go
 * archive, snoozed pages (both index-backed, carrying content), and currently
 * OPEN tabs (live, carrying a tabId but no content). Dedup uses the project's
 * existing public canonical key — `cluster.originPathKey` (origin + pathname) —
 * NOT a re-implemented key, so it stays consistent with forget/restore/dedup
 * everywhere else.
 *
 * The merge is FIELD-LEVEL, not row-level supersede: when an open tab and its
 * let-go/snoozed twin collapse, the surviving row takes the ACTION (kind +
 * tabId) from the highest-precedence twin (open > snoozed > let-go) but RETAINS
 * the index record's display fields (id, content, excerpt, siblings, timestamp,
 * return metadata). Otherwise the most common dedup case — a page you have open
 * that you also let go before — would surface with an empty excerpt and no
 * siblings, silently degrading highlight and `with:` pivots.
 */
(function (root) {
  'use strict';

  const cluster =
    (typeof self !== 'undefined' && self.ypuf && self.ypuf.cluster) ? self.ypuf.cluster :
    (typeof require !== 'undefined' ? require('./cluster.js') : null);

  const PRECEDENCE = { open: 3, snoozed: 2, 'let-go': 1 };

  function keyOf(url) {
    return cluster ? cluster.originPathKey(url) : url;
  }

  // Combine one group of rows sharing a canonical key into a single row.
  function combine(rows) {
    // Action source: highest-precedence kind (open jump > snoozed wake > restore).
    let action = rows[0];
    for (const r of rows) {
      if ((PRECEDENCE[r.kind] || 0) > (PRECEDENCE[action.kind] || 0)) action = r;
    }
    // Display source: when the winning action is itself index-backed (a snoozed or
    // let-go twin), its OWN record supplies the display fields — so a snoozed twin
    // keeps its snoozeState/returnAt instead of inheriting a let-go twin's nulls.
    // A pure open tab (no id) falls back to any index twin, then to itself.
    const base = (action.id != null) ? action : (rows.find((r) => r.id != null) || action);
    return Object.assign({}, base, {
      kind: action.kind,
      tabId: action.tabId != null ? action.tabId : base.tabId,
    });
  }

  // Dedup + field-level merge. Returns a NEW array in first-occurrence order
  // (preserving the caller's ranking); input rows are never mutated.
  function merge(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const groups = new Map(); // key -> { order, rows: [] }
    let order = 0;
    for (const r of rows) {
      if (!r || !r.url) continue;
      const k = keyOf(r.url);
      let g = groups.get(k);
      if (!g) { g = { order: order++, rows: [] }; groups.set(k, g); }
      g.rows.push(r);
    }
    return [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .map((g) => combine(g.rows));
  }

  const api = { merge, keyOf };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { recallmerge: api });
})(typeof self !== 'undefined' ? self : globalThis);
