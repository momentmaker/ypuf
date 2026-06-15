/*
 * ypuf — zombie eligibility classifier (U4 / R2, R4, R5, R6, R7, R10, R11).
 *
 * The single, load-bearing safety gate: decides whether an open tab is an
 * auto-close zombie. Pure — every input (the per-tab record, the dwell/revisit
 * signal, the protected-domain check, the exclusion gate, thresholds, now) is
 * injected, so the gate is exhaustively unit-testable. The #1 product risk is
 * one wrong auto-close, so this errs toward `keep`/`excluded` at every fork.
 *
 *   classify(tab, deps) -> 'zombie' | 'keep' | 'excluded'
 *
 * Order matters: capturability (R10) first so an uncapturable tab is never
 * closed; then live never-touch signals; then staleness/grace/burst; then the
 * URL-stable engagement gate; finally the corroborating per-URL signal.
 */
(function (root) {
  'use strict';

  function classify(tab, deps) {
    const cls = deps.classify({ url: tab.url, incognito: tab.incognito }, deps.userBlocklist);
    // R10: only an extractable web page can be captured-then-closed. Anything
    // never-index / metadata-only / restricted is left open, never closed.
    if (cls.kind !== 'extractable') return 'excluded';

    const ts = deps.tabstate;
    const rec = deps.rec;
    const isProtected = deps.isProtected || (() => false);

    // Live never-touch signals (R5) — re-read immediately before close (R6).
    if (tab.audible || tab.pinned) return 'keep';
    if (ts.dirtyOf(rec, tab) !== false) return 'keep';   // dirty / unknown / frozen → fail safe (R7)
    if (isProtected(cls.host)) return 'keep';            // learned protection (R14)

    // Staleness gates.
    if (!ts.gracePassed(rec)) return 'keep';             // unobserved → never eligible
    if (ts.isBurst(rec)) return 'keep';                  // restored session / bulk-open (R3)
    if (!ts.isStale(rec, deps.now, deps.staleWindowMs)) return 'keep';

    // Engagement — the URL-stable primary gate (R4). A tab the user keeps
    // returning to is never a zombie, however its URL drifted.
    if (ts.isEngaged(rec, deps.activationFloor)) return 'keep';

    // Corroborating per-URL signal: zero revisits AND sub-floor dwell.
    const sig = deps.signal || {};
    const revisits = (sig.revisits && sig.revisits[tab.url]) || 0;
    const dwell = (sig.dwell && sig.dwell[tab.url]) || 0;
    if (revisits > 0 || dwell >= deps.dwellFloorMs) return 'keep';

    return 'zombie';
  }

  const api = { classify };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { eligibility: api });
})(typeof self !== 'undefined' ? self : globalThis);
