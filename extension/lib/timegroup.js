/*
 * ypuf — recall-shelf time grouping (panel redesign).
 *
 * Pure: bucket timestamped items into calm, ordered time groups (Today / Yesterday /
 * Earlier this week / Earlier) so a long recall list reads as a few scannable
 * sections instead of an unbroken wall. `now` is injected; boundaries are local
 * midnights. Items keep the caller's order within a group (the shelf pre-sorts
 * newest-first), and empty groups are dropped so headers never show over nothing.
 */
(function (root) {
  'use strict';

  const DAY = 86400000;

  function startOfDay(now) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function bucketByTime(items, now) {
    const today = startOfDay(now);
    const yesterday = today - DAY;
    const weekAgo = today - 7 * DAY;
    const defs = [
      { key: 'today', label: 'Today', test: (t) => t >= today },
      { key: 'yesterday', label: 'Yesterday', test: (t) => t >= yesterday && t < today },
      { key: 'week', label: 'Earlier this week', test: (t) => t >= weekAgo && t < yesterday },
      { key: 'earlier', label: 'Earlier', test: () => true },
    ];
    const groups = defs.map((d) => ({ key: d.key, label: d.label, items: [] }));
    for (const it of (Array.isArray(items) ? items : [])) {
      const t = typeof it.timestamp === 'number' ? it.timestamp : -Infinity;
      groups[defs.findIndex((d) => d.test(t))].items.push(it);
    }
    return groups.filter((g) => g.items.length);
  }

  // Partition a group into the visible head (up to `cap`) and the overflow `rest`
  // for the "Show N more" expander. A falsy cap (or a short group) shows everything.
  function split(items, cap) {
    const arr = Array.isArray(items) ? items : [];
    if (!cap || arr.length <= cap) return { visible: arr, rest: [] };
    return { visible: arr.slice(0, cap), rest: arr.slice(cap) };
  }

  const api = { bucketByTime, split };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { timegroup: api });
})(typeof self !== 'undefined' ? self : globalThis);
