/*
 * ypuf — crypto price provider (slice 5 / U6, R6/R11).
 *
 * A SWAPPABLE provider adapter behind a small contract — { label, origin,
 * buildUrl(tokens), parse(text, tokens) }. The provider is DefiLlama's coins API
 * (public, no key). v1 was CoinGecko, until its keyless tier started IP-blocking
 * even one request per 15 min. Tokens stay CoinGecko ids ("bitcoin", not "BTC"):
 * DefiLlama keys coins as `coingecko:<id>`, so configured panels carry over.
 * parse() degrades calmly: malformed JSON or a missing/typeless token yields an
 * `unavailable` entry, never a throw, so the panel can keep last-known prices (R11).
 *
 * The actual fetch is the broker's (host, with credentials:omit / no-referrer /
 * redirect:error). This module is pure parse + URL build, built test-first.
 */
(function (root) {
  'use strict';

  const ID_SHAPE = /^[a-z0-9][a-z0-9._-]*$/;   // a CoinGecko id — nothing that could reshape the URL
  const normalize = (tokens) => (Array.isArray(tokens) ? tokens : []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  const unavailable = (token) => ({ token, price: null, change24h: null, unavailable: true });

  const DEFILLAMA_ORIGIN = 'https://coins.llama.fi';

  const defillama = {
    label: 'DefiLlama',
    origin: DEFILLAMA_ORIGIN,

    // /chart with span=2 & period=1d answers, per coin, [price ~24h ago, latest
    // price] — the price AND its 24h change in one request.
    buildUrl(tokens) {
      const ids = normalize(tokens).filter((t) => ID_SHAPE.test(t)).map((t) => 'coingecko:' + t);
      return DEFILLAMA_ORIGIN + '/chart/' + ids.join(',') + '?span=2&period=1d';
    },

    parse(text, tokens) {
      let data;
      try { data = JSON.parse(text); } catch { return []; }
      const coins = data && typeof data === 'object' ? data.coins : null;
      if (!coins || typeof coins !== 'object') return [];
      return normalize(tokens).map((t) => {
        const series = coins['coingecko:' + t];
        const points = (series && Array.isArray(series.prices) ? series.prices : [])
          .filter((p) => p && typeof p.timestamp === 'number')
          .sort((a, b) => a.timestamp - b.timestamp);
        const latest = points[points.length - 1];
        if (!latest || typeof latest.price !== 'number') return unavailable(t);
        const dayAgo = points.length > 1 ? points[0].price : null;
        const change24h = typeof dayAgo === 'number' && dayAgo > 0 ? ((latest.price - dayAgo) / dayAgo) * 100 : null;
        return { token: t, price: latest.price, change24h };
      });
    },
  };

  const provider = defillama; // ← swap here to change vendor (R6); panel is unaffected

  const api = {
    label: provider.label,
    origin: provider.origin,
    buildUrl: (tokens) => provider.buildUrl(tokens),
    parse: (text, tokens) => provider.parse(text, tokens),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { cryptoProvider: api });
})(typeof self !== 'undefined' ? self : globalThis);
