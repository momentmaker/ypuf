/*
 * ypuf — passive dwell/revisit signal collector (U9 / R19).
 *
 * Banks data for slice 2's auto-let-go; CONSUMED BY NOTHING in slice 1.
 *
 * "dwell" is FOREGROUND ACTIVE-TIME (window focused + tab active), not raw
 * open-duration (CONTEXT §4: raw duration is noise). Because the MV3 service
 * worker is terminated at ~30s idle, dwell is computed from a persisted
 * focus-start timestamp — never an in-memory counter: on each focus change
 * we flush `now - start` into durable storage. State is passed in/out so the
 * math is pure and unit-testable; background.js owns the storage round-trip.
 *
 * Gate-before-write: the U2 classifier runs before anything is persisted.
 * Incognito ('never-index') and blocklisted/restricted ('metadata-only')
 * yield ZERO persisted signal — no key is ever written.
 */
(function (root) {
  'use strict';

  function emptyState() {
    return { dwell: {}, revisits: {}, lastActiveAt: {} };
  }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  function trackable(tab, classify, userBlocklist) {
    return classify({ url: tab.url, incognito: tab.incognito }, userBlocklist).kind === 'extractable';
  }

  // Close out the currently-focused page: add elapsed foreground time to dwell.
  function flush(active, durable, now) {
    if (active && active.url) {
      const delta = Math.max(0, now - active.start);
      durable.dwell[active.url] = (durable.dwell[active.url] || 0) + delta;
    }
  }

  // A page became the focused foreground page. Returns the next {active, durable}.
  function activate(tab, now, deps) {
    const durable = deps.durable || emptyState();
    flush(deps.active, durable, now);
    if (!tab || !tab.url || !trackable(tab, deps.classify, deps.userBlocklist)) {
      return { active: null, durable }; // excluded -> zero signal, no key written
    }
    if (!durable.lastActiveAt) durable.lastActiveAt = {}; // tolerate a pre-U8 durable
    durable.revisits[tab.url] = (durable.revisits[tab.url] || 0) + 1;
    durable.lastActiveAt[tab.url] = now; // recency, for proactive "reaching for these" (U9). Local-time/DST per the page's clock.
    return { active: { url: tab.url, start: now }, durable };
  }

  // Chrome lost focus (windows.onFocusChanged === -1) — pause accumulation.
  function blur(now, deps) {
    const durable = deps.durable || emptyState();
    flush(deps.active, durable, now);
    return { active: null, durable };
  }

  function deleteByUrl(url, durable) {
    delete durable.dwell[url];
    delete durable.revisits[url];
    if (durable.lastActiveAt) delete durable.lastActiveAt[url];
    return durable;
  }

  function deleteByDomain(host, durable) {
    const match = (u) => { const h = hostOf(u); return h === host || h.endsWith('.' + host); };
    for (const url of Object.keys(durable.dwell)) if (match(url)) delete durable.dwell[url];
    for (const url of Object.keys(durable.revisits)) if (match(url)) delete durable.revisits[url];
    for (const url of Object.keys(durable.lastActiveAt || {})) if (match(url)) delete durable.lastActiveAt[url];
    return durable;
  }

  // Bound growth (the signal map is keyed by every URL ever foregrounded and is
  // never pruned by forget alone): drop dwell/revisits/lastActiveAt for any URL not
  // foregrounded within maxAgeMs. Run on the recurring prune trigger, not just forget,
  // so visited-but-never-forgotten URLs age out instead of accumulating forever.
  function pruneStale(durable, now, maxAgeMs) {
    const la = durable.lastActiveAt || {};
    const cutoff = now - maxAgeMs;
    let removed = 0;
    for (const url of Object.keys(la)) {
      if (la[url] < cutoff) {
        delete durable.dwell[url]; delete durable.revisits[url]; delete la[url];
        removed += 1;
      }
    }
    return removed;
  }

  const api = { emptyState, trackable, flush, activate, blur, deleteByUrl, deleteByDomain, pruneStale, hostOf };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { signal: api });
})(typeof self !== 'undefined' ? self : globalThis);
