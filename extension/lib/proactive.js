/*
 * ypuf — proactive "reaching for these" ranker (Recall v2 / U9).
 *
 * Pure: before the user types anything, order the recent let-go records by how
 * likely they want each one RIGHT NOW — recency of last foreground activity
 * (lib/signal.js lastActiveAt, U8) blended with revisit frequency — and cap to a
 * calm peek. The best search is the one you never run.
 *
 *   rank(records, signal, now, opts?) -> orderedRecords (<= cap)
 *
 * A record with no signal scores 0 and keeps its input position, so when the
 * engine knows nothing yet the set degrades gracefully to "recent let-go" (the
 * caller passes records newest-first). Born-equal records (Pattern 19) simply
 * carry no lastActiveAt and fall to the recency baseline — no false lift.
 */
(function (root) {
  'use strict';

  const DEFAULT_CAP = 6;            // matches the panel's RECENT_GROUP_CAP — a glanceable peek
  const K_REVISIT = 5;             // revisits saturate: 5 ~= half weight
  const HALFLIFE = 3 * 86400000;   // recency half-life ~3 days
  const W = { freq: 0.5, recency: 0.5 };

  function scoreOf(rec, signal, now) {
    const rv = (signal.revisits && signal.revisits[rec.url]) || 0;
    const la = signal.lastActiveAt && signal.lastActiveAt[rec.url];
    const freq = rv / (rv + K_REVISIT);
    const recency = (typeof la === 'number') ? HALFLIFE / (HALFLIFE + Math.max(0, now - la)) : 0;
    return W.freq * freq + W.recency * recency;
  }

  function rank(records, signal, now, opts) {
    const cap = (opts && opts.cap > 0) ? opts.cap : DEFAULT_CAP;
    const sig = signal || {};
    return (Array.isArray(records) ? records : [])
      .map((r, i) => ({ r, i, s: scoreOf(r, sig, now) }))
      .sort((a, b) => (b.s - a.s) || (a.i - b.i))   // stable: ties keep the caller's (newest-first) order
      .slice(0, cap)
      .map((x) => x.r);
  }

  const api = { rank, scoreOf, DEFAULT_CAP };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { proactive: api });
})(typeof self !== 'undefined' ? self : globalThis);
