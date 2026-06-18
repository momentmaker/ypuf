/*
 * ypuf — recall command-bar text helpers (pure core, pattern 18).
 *
 * The overlay (extension/overlay/overlay.js) is a browser-only closed-shadow-DOM surface
 * that node tests can't execute, so its decidable bits live here where they ARE node-tested:
 *   - segments(text, query): split text into [{text, hl}] runs, marking query-term matches.
 *     The host then renders them textContent-only (page-derived text never touches innerHTML).
 *   - groupLabel(ts, now): the recency bucket for the instant-recent view (now passed in so
 *     the day math is testable without a clock).
 */
(function (root) {
  'use strict';

  function segments(text, query) {
    if (!text) return [];
    const terms = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [{ text, hl: false }];
    const lc = text.toLowerCase();
    const out = [];
    let i = 0;
    while (i < text.length) {
      let next = -1, len = 0;
      for (const t of terms) {            // earliest match across all terms wins the next run
        const at = lc.indexOf(t, i);
        if (at >= 0 && (next < 0 || at < next)) { next = at; len = t.length; }
      }
      if (next < 0) { out.push({ text: text.slice(i), hl: false }); break; }
      if (next > i) out.push({ text: text.slice(i, next), hl: false });
      out.push({ text: text.slice(next, next + len), hl: true });
      i = next + len;
    }
    return out;
  }

  function groupLabel(ts, now) {
    if (!ts) return 'Earlier';
    const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(ts))) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return 'This week';
    return 'Earlier';
  }

  const api = { segments, groupLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { highlight: api });
})(typeof self !== 'undefined' ? self : globalThis);
