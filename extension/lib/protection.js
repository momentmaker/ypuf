/*
 * ypuf — reopen-protection (U7 / R14, flow F2).
 *
 * The one thing ypuf learns in v1: if it auto-let-go a tab and you reopened it,
 * that domain mattered — protect it from future auto-close. CONTEXT §4 calls a
 * reopen "the strongest signal there is."
 *
 * Host-key consistency is load-bearing: protection is RECORDED from a stored
 * record's host and CHECKED against a live tab's host, which differ across
 * www/subdomain variants. So we normalize to the registrable family (strip a
 * leading "www.") on write and match by suffix on read — protect once, and the
 * whole family is safe; check under any variant, and it still fires.
 *
 * Pure: the persisted set is passed in/out; background.js owns storage.
 */
(function (root) {
  'use strict';

  function normalizeHost(host) {
    return String(host || '').replace(/^www\./, '');
  }

  function emptyState() { return {}; }

  function protect(state, host) {
    const h = normalizeHost(host);
    if (h) state[h] = true;
    return state;
  }

  function unprotect(state, host) {
    delete state[normalizeHost(host)];
    return state;
  }

  function isProtected(state, host) {
    const h = normalizeHost(host);
    if (!h) return false;
    if (state[h]) return true;
    for (const e of Object.keys(state)) if (h === e || h.endsWith('.' + e)) return true;
    return false;
  }

  function list(state) { return Object.keys(state); }

  // Forget/purge: drop every entry inside the forgotten domain (and the parent,
  // if a subdomain entry exists under it).
  function deleteByDomain(state, host) {
    const h = normalizeHost(host);
    for (const e of Object.keys(state)) {
      if (e === h || e.endsWith('.' + h) || h.endsWith('.' + e)) delete state[e];
    }
    return state;
  }

  const api = { emptyState, normalizeHost, protect, unprotect, isProtected, list, deleteByDomain };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { protection: api });
})(typeof self !== 'undefined' ? self : globalThis);
