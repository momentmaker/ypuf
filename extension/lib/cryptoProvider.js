/*
 * ypuf — crypto price provider (slice 5 / U6, R6/R11).
 *
 * A SWAPPABLE provider adapter behind a small contract — { label, buildUrl(tokens),
 * parse(text, tokens) }. v1 is CoinGecko (public, no key). Swap `provider` below to
 * change vendors without touching the panel. parse() degrades calmly: malformed
 * JSON or a missing/typeless token yields an `unavailable` entry, never a throw, so
 * the panel can keep last-known prices (R11).
 *
 * The actual fetch is the broker's (host, with credentials:omit / no-referrer /
 * redirect:error). This module is pure parse + URL build, built test-first.
 */
(function (root) {
  'use strict';

  const coingecko = {
    label: 'CoinGecko',

    buildUrl(tokens) {
      const ids = (Array.isArray(tokens) ? tokens : []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
      return 'https://api.coingecko.com/api/v3/simple/price'
        + '?ids=' + encodeURIComponent(ids.join(','))
        + '&vs_currencies=usd&include_24hr_change=true';
    },

    parse(text, tokens) {
      let data;
      try { data = JSON.parse(text); } catch { return []; }
      if (!data || typeof data !== 'object') return [];
      return (Array.isArray(tokens) ? tokens : []).map((raw) => {
        const t = String(raw).trim().toLowerCase();
        const d = data[t];
        if (!d || typeof d.usd !== 'number') return { token: t, price: null, change24h: null, unavailable: true };
        return { token: t, price: d.usd, change24h: typeof d.usd_24h_change === 'number' ? d.usd_24h_change : null };
      });
    },
  };

  const provider = coingecko; // ← swap here to change vendor (R6); panel is unaffected

  const api = {
    label: provider.label,
    buildUrl: (tokens) => provider.buildUrl(tokens),
    parse: (text, tokens) => provider.parse(text, tokens),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { cryptoProvider: api });
})(typeof self !== 'undefined' ? self : globalThis);
