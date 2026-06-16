/*
 * ypuf — working-set clustering (slice 4 / flow F1).
 *
 * Pure function: given the let-go tab (the anchor) and the LIVE open tabs at
 * that moment, returns the working set it was open with — the sibling pages to
 * offer "bring back the set?" for at recall. No chrome.* here; background.js
 * supplies the chrome.tabs.query snapshot, the loaded tabstate map, and the
 * exclusion gate, so the signal math is unit-testable.
 *
 *   computeSet(anchor, openTabs, opts) -> [{ url, title, host }]
 *
 * Signals (all scoped to the anchor's window — same-window-alone is never
 * sufficient on its own, R4):
 *   - spawn-tree  (strong): the tab is the anchor's opener/child, or shares the
 *                 anchor's opener — Chrome's own "these are related" signal.
 *   - co-activation:        last-activated within coWindowMs of the anchor
 *                 (read from the tabstate map — lastActivatedAt is NOT on the
 *                 chrome.tabs Tab object).
 *   - temporal burst:       created within burstWindowMs of the anchor (the
 *                 open-all-bookmarks / restored-session orphan fallback).
 *
 * Privacy (R5): only `extractable` candidates enter the set — incognito,
 * blocklisted, and restricted-scheme siblings are gated out before inclusion,
 * exactly like capture. Stored URLs are query-stripped (origin + pathname).
 */
(function (root) {
  'use strict';

  const DEFAULTS = { maxSize: 8, coWindowMs: 5 * 60 * 1000, burstWindowMs: 90 * 1000 };

  function stripped(url) {
    const u = new URL(url);
    return { url: u.origin + u.pathname, host: u.hostname };
  }

  function spawnRelated(anchor, t) {
    if (t.openerTabId != null && t.openerTabId === anchor.id) return true;        // child of anchor
    if (anchor.openerTabId != null && anchor.openerTabId === t.id) return true;   // anchor's opener
    if (anchor.openerTabId != null && t.openerTabId != null &&
        t.openerTabId === anchor.openerTabId) return true;                        // shared opener
    return false;
  }

  function computeSet(anchor, openTabs, opts) {
    if (!anchor || anchor.windowId == null) return [];
    const o = Object.assign({}, DEFAULTS, opts);
    const ts = o.tabstate || {};
    const aState = ts[anchor.id] || {};

    const scored = [];
    for (const t of openTabs) {
      if (t.id === anchor.id || t.windowId !== anchor.windowId) continue;

      const tState = ts[t.id] || {};
      const spawn = spawnRelated(anchor, t);
      const coActive = aState.lastActivatedAt != null && tState.lastActivatedAt != null &&
        Math.abs(tState.lastActivatedAt - aState.lastActivatedAt) <= o.coWindowMs;
      const burst = aState.createdAt != null && tState.createdAt != null &&
        Math.abs(tState.createdAt - aState.createdAt) <= o.burstWindowMs;
      if (!spawn && !coActive && !burst) continue; // same-window alone is not enough

      const cls = o.classify({ url: t.url, incognito: t.incognito }, o.userBlocklist);
      if (cls.kind !== 'extractable') continue;    // R5: only extractable siblings

      const id = stripped(t.url);
      scored.push({
        url: id.url, title: (t.title || '').trim(), host: id.host,
        _tier: spawn ? 2 : 1,
        _last: tState.lastActivatedAt != null ? tState.lastActivatedAt : -Infinity,
        _id: t.id,
      });
    }

    // Deterministic order — strongest signal, then most-recently-active, then
    // tab id — so the cap picks the same survivors regardless of query order.
    scored.sort((a, b) => (b._tier - a._tier) || (b._last - a._last) || (a._id - b._id));

    return scored.slice(0, o.maxSize).map((s) => ({ url: s.url, title: s.title, host: s.host }));
  }

  function originPathKey(u) {
    try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; }
  }

  // Restore (slice 4 / R8): the ordered list of URLs to reopen for a "bring back
  // the set?" request. Opens ONLY URLs the record actually stored (intersect
  // against `siblings`, so a replaying/compromised popup can't open arbitrary
  // URLs), web-scheme only, deduped by origin+pathname within the pass.
  function restorePlan(siblings, requestedUrls, isWebUrl) {
    const allowed = new Set((Array.isArray(siblings) ? siblings : []).map((s) => s && s.url));
    const seen = new Set();
    const plan = [];
    for (const u of (Array.isArray(requestedUrls) ? requestedUrls : [])) {
      if (!allowed.has(u)) continue;
      if (typeof isWebUrl === 'function' && !isWebUrl(u)) continue;
      const k = originPathKey(u);
      if (seen.has(k)) continue;
      seen.add(k);
      plan.push(u);
    }
    return plan;
  }

  const api = { computeSet, restorePlan, originPathKey };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { cluster: api });
})(typeof self !== 'undefined' ? self : globalThis);
