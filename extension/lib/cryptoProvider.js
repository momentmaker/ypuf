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
    // price] — the price AND its 24h change in one request. Its responses are
    // CDN-cached for an HOUR per URL, so `end` pins the current minute: each
    // minute is a new URL (fresh prices), shared by every fetch within it.
    buildUrl(tokens, now) {
      const ids = normalize(tokens).filter((t) => ID_SHAPE.test(t)).map((t) => 'coingecko:' + t);
      const minute = Math.floor(now / 60000) * 60;
      return DEFILLAMA_ORIGIN + '/chart/' + ids.join(',') + '?span=2&period=1d&end=' + minute;
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
        return { token: t, price: latest.price, change24h, at: latest.timestamp * 1000 };
      });
    },
  };

  const provider = defillama; // ← swap here to change vendor (R6); panel is unaffected

  // When the shown prices were true: the OLDEST provider observation among them, so
  // the panel's "as of" stamp can't look fresher than its stalest price — whatever
  // the provider or a CDN cached. null when no price carries an observation time.
  function observedAt(prices) {
    const times = (Array.isArray(prices) ? prices : []).map((p) => p && p.at).filter((t) => typeof t === 'number');
    return times.length ? Math.min(...times) : null;
  }

  const api = {
    label: provider.label,
    origin: provider.origin,
    buildUrl: (tokens, now) => provider.buildUrl(tokens, now),
    parse: (text, tokens) => provider.parse(text, tokens),
    observedAt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { cryptoProvider: api });
})(typeof self !== 'undefined' ? self : globalThis);
