/*
 * ypuf — recall "why this" rationale (Recall v2 / U10).
 *
 * Pure: compose ONE quiet clause explaining why a recall row is worth a glance —
 * or '' to suppress the line entirely. It only surfaces signal the row's meta line
 * doesn't already show (host + how-long-ago), so a zero-history row adds no line.
 *
 *   compose(record, signal) -> "often revisited" | "same session as <host>" | ""
 *
 * Born-equal-safe by construction (Pattern 19): it never claims recall/reopen
 * activity — only revisit FREQUENCY (foreground returns, lib/signal.js) and the
 * session a page was let go alongside (lib/cluster.js siblings). A record that was
 * never recalled (lastAccessed === timestamp) therefore can't earn a false claim.
 */
(function (root) {
  'use strict';

  const FREQUENT = 3; // matches background's FREQUENT_REVISITS — the §4 "load-bearing" bar

  function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }

  function compose(record, signal) {
    if (!record || !signal) return '';
    const revisits = (signal.revisits && record.url && signal.revisits[record.url]) || 0;
    if (revisits >= FREQUENT) return 'often revisited';
    const sibs = Array.isArray(record.siblings) ? record.siblings : [];
    const host = sibs.length ? (sibs[0].host || hostOf(sibs[0].url)) : '';
    if (host) return 'same session as ' + host;
    return '';
  }

  const api = { compose };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { rationale: api });
})(typeof self !== 'undefined' ? self : globalThis);
