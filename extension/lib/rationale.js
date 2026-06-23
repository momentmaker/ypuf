/*
 * ypuf — recall "why this" rationale (Recall v2 / U10).
 *
 * Pure: compose ONE quiet clause explaining why a recall row is worth a glance —
 * or '' to suppress the line entirely. It only surfaces signal the row's meta line
 * doesn't already show (host + how-long-ago), so a zero-history row adds no line.
 *
 *   compose(row) -> "often revisited" | "same session as <host>" | ""
 *
 * Born-equal-safe by construction (Pattern 19): it never claims recall/reopen
 * activity — only revisit FREQUENCY (the `frequent` flag the SW already stamped on
 * the row, from foreground returns) and the session a page was let go alongside
 * (lib/cluster.js siblings). A never-recalled row (lastAccessed === timestamp)
 * therefore can't earn a false claim.
 */
(function (root) {
  'use strict';

  function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }

  function compose(row) {
    if (!row) return '';
    if (row.frequent) return 'often revisited';
    const sibs = Array.isArray(row.siblings) ? row.siblings : [];
    const s0 = sibs[0];
    const host = s0 ? (s0.host || hostOf(s0.url)) : '';
    if (host) return 'same session as ' + host;
    return '';
  }

  const api = { compose };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { rationale: api });
})(typeof self !== 'undefined' ? self : globalThis);
