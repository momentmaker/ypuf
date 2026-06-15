/*
 * ypuf — per-tab state store (U1 / R1, R3, R4).
 *
 * Slice 1's signal is keyed by URL; auto-let-go also needs per-TAB facts that
 * URL-keyed dwell can't carry: when a tab opened, when it was last the active
 * tab, how many times it was activated, and whether it arrived in a session-
 * restore / open-all-bookmarks burst. All of it is timestamp-derived and
 * persisted (the SW dies at ~30s idle, so an in-memory counter would reset).
 *
 * Two safety properties live here:
 *  - `activations` is the URL-DRIFT-ROBUST engagement signal. A tab the user
 *    keeps coming back to is `engaged` no matter how its URL changes (SPA
 *    routing, redirects, login rewrites), so a heavily-used tab that merely
 *    navigated is never mistaken for a zombie.
 *  - A tab with NO record (its onCreated/onActivated were missed — SW asleep
 *    during restore, or it predates install) fails safe: not graced, not
 *    engaged, not stale → never eligible until actually observed.
 *
 * Pure: state is passed in/out so the math is unit-testable; background.js
 * owns the chrome.* listeners and the storage round-trip.
 */
(function (root) {
  'use strict';

  function emptyState() { return {}; }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  function blank(now, opts) {
    return {
      createdAt: now,
      lastActivatedAt: null,
      activations: 0,
      burst: false,
      dirty: 'unknown',
      host: (opts && opts.host) || '',
      noOpener: !opts || opts.openerTabId == null,
    };
  }

  // A tab was created. Burst (→ excluded from auto-close) when it arrives in the
  // post-startup grace window (session restore) OR in a dense cluster of
  // opener-less creations (open-all-bookmarks / open-all-in-tabs).
  function recordCreated(state, tabId, now, opts = {}) {
    const t = blank(now, opts);
    const { startupAt = null, startupGraceMs = 0, burstWindowMs = 0, burstMinCluster = Infinity } = opts;
    if (startupAt != null && (now - startupAt) <= startupGraceMs) t.burst = true;
    state[tabId] = t;
    if (!t.burst && t.noOpener && burstWindowMs > 0) {
      const cluster = Object.values(state).filter((o) => o.noOpener && Math.abs(now - o.createdAt) <= burstWindowMs);
      if (cluster.length >= burstMinCluster) for (const o of cluster) o.burst = true;
    }
    return state;
  }

  // The tab became the active tab. Creating-on-miss keeps a tab we first see
  // via activation conservative (looks fresh → not stale) rather than dropping it.
  function recordActivated(state, tabId, now, host) {
    const t = state[tabId] || (state[tabId] = blank(now, {}));
    t.lastActivatedAt = now;
    t.activations += 1;
    if (host) t.host = hostOf(host) || t.host;
    return state;
  }

  function setHost(state, tabId, url) {
    const t = state[tabId];
    if (t) t.host = hostOf(url) || t.host;
    return state;
  }

  function setDirty(state, tabId, value) {
    const t = state[tabId] || (state[tabId] = blank(0, {}));
    t.dirty = value;
    return state;
  }

  function deleteByTabId(state, tabId) { delete state[tabId]; return state; }

  function deleteByDomain(state, host) {
    const match = (h) => h === host || h.endsWith('.' + host);
    for (const id of Object.keys(state)) if (match(state[id].host || '')) delete state[id];
    return state;
  }

  // --- read-only classifiers (a record `t` may be undefined → fail safe) ----

  function isStale(t, now, windowMs) {
    if (!t) return false;
    const ref = t.lastActivatedAt != null ? t.lastActivatedAt : t.createdAt;
    return ref != null && (now - ref) > windowMs;
  }

  function gracePassed(t) { return !!(t && t.lastActivatedAt != null); }

  function isEngaged(t, floor) { return !!(t && t.activations >= floor); }

  function isBurst(t) { return !!(t && t.burst); }

  // Trust a last-known dirty value only for a tab whose script could have
  // reported it. A `frozen` tab keeps its DOM but can't run handlers, so a
  // stale "clean" is untrustworthy → unknown → fail-safe keep.
  function dirtyOf(t, tab) {
    if (tab && tab.frozen) return 'unknown';
    if (!t || t.dirty == null) return 'unknown';
    return t.dirty;
  }

  const api = {
    emptyState, hostOf,
    recordCreated, recordActivated, setHost, setDirty, deleteByTabId, deleteByDomain,
    isStale, gracePassed, isEngaged, isBurst, dirtyOf,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { tabstate: api });
})(typeof self !== 'undefined' ? self : globalThis);
