/*
 * ypuf — network-panel retry backoff (pure).
 *
 * A failing panel host must not be retried on every tick and every new-tab open:
 * keyless providers (CoinGecko) rate-limit per IP and count failed requests too, so
 * hammering a 429 keeps the IP blocked. The broker stores a `retryAt` in the shared
 * cache entry on each failure, and no tab fetches before it. The wait doubles per
 * consecutive failure (a longer Retry-After wins), capped so a panel always recovers
 * within minutes; a success overwrites the entry and restarts the ladder.
 */
(function (root) {
  'use strict';

  const BASE_MS = 60 * 1000;
  const CAP_MS = 15 * 60 * 1000;

  // Retry-After is delta-seconds or an HTTP-date; anything else is ignored.
  function parseRetryAfter(header, now) {
    const s = header == null ? '' : String(header).trim();
    if (/^\d+$/.test(s)) return Number(s) * 1000;
    const at = Date.parse(s);
    return Number.isNaN(at) ? 0 : Math.max(0, at - now);
  }

  function afterFailure(entry, retryAfterHeader, now) {
    const prev = entry || {};
    const failures = (Number.isInteger(prev.failures) ? prev.failures : 0) + 1;
    const exponential = BASE_MS * 2 ** (failures - 1);
    const wait = Math.min(Math.max(exponential, parseRetryAfter(retryAfterHeader, now)), CAP_MS);
    return { value: prev.value, fetchedAt: prev.fetchedAt, failures, retryAt: now + wait };
  }

  function inBackoff(entry, now) {
    return !!entry && typeof entry.retryAt === 'number' && now < entry.retryAt;
  }

  const api = { afterFailure, inBackoff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { backoff: api });
})(typeof self !== 'undefined' ? self : globalThis);
