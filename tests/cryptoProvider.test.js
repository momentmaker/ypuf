'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const cp = require('../extension/lib/cryptoProvider.js');

// A DefiLlama /chart response: per coin, the price ~24h ago then the latest price.
function chart(coins) {
  const out = {};
  for (const [id, prices] of Object.entries(coins)) {
    out['coingecko:' + id] = { symbol: id.toUpperCase(), confidence: 0.99, prices: prices.map(([timestamp, price]) => ({ timestamp, price })) };
  }
  return JSON.stringify({ coins: out });
}

test('the provider is DefiLlama, fetched from its coins origin', () => {
  assert.equal(cp.label, 'DefiLlama');
  assert.equal(cp.origin, 'https://coins.llama.fi');
});

const MINUTE_S = 1790708940;              // a whole minute, in unix seconds
const NOW = MINUTE_S * 1000 + 59999;     // 59.999s into that minute

test('buildUrl asks /chart for two daily points ending at the current minute', () => {
  assert.equal(cp.buildUrl(['bitcoin', ' Ethereum '], NOW),
    `https://coins.llama.fi/chart/coingecko:bitcoin,coingecko:ethereum?span=2&period=1d&end=${MINUTE_S}`);
});

test('fetches within a minute share one URL, the next minute gets a new one — /chart is CDN-cached an hour per URL', () => {
  const tokens = ['bitcoin'];
  assert.equal(cp.buildUrl(tokens, MINUTE_S * 1000), cp.buildUrl(tokens, NOW));
  assert.notEqual(cp.buildUrl(tokens, NOW + 1), cp.buildUrl(tokens, NOW));
});

test('buildUrl drops anything that is not id-shaped — a token cannot inject a path or query', () => {
  assert.equal(cp.buildUrl(['bitcoin', '../prices', 'a?b=1', 'x/y', '', 'usd-coin'], NOW),
    `https://coins.llama.fi/chart/coingecko:bitcoin,coingecko:usd-coin?span=2&period=1d&end=${MINUTE_S}`);
});

// `at` is when the provider observed the latest price (ms) — not when ypuf fetched it.
const AT = 87400 * 1000;

test('parse takes the latest point as the price and the change against the point a day earlier', () => {
  const body = chart({ bitcoin: [[1000, 80000], [87400, 84000]], ethereum: [[1000, 2000], [87400, 1900]] });
  assert.deepEqual(cp.parse(body, ['bitcoin', 'ethereum']), [
    { token: 'bitcoin', price: 84000, change24h: 5, at: AT },
    { token: 'ethereum', price: 1900, change24h: -5, at: AT },
  ]);
});

test('parse orders points by timestamp, not by position', () => {
  const body = chart({ bitcoin: [[87400, 84000], [1000, 80000]] });
  assert.deepEqual(cp.parse(body, ['bitcoin']), [{ token: 'bitcoin', price: 84000, change24h: 5, at: AT }]);
});

test('a missing token degrades to unavailable rather than dropping or throwing (AE3)', () => {
  const body = chart({ bitcoin: [[1000, 80000], [87400, 84000]] });
  assert.deepEqual(cp.parse(body, ['bitcoin', 'dogecoin']), [
    { token: 'bitcoin', price: 84000, change24h: 5, at: AT },
    { token: 'dogecoin', price: null, change24h: null, unavailable: true },
  ]);
});

test('a single price point keeps the price and nulls the change', () => {
  assert.deepEqual(cp.parse(chart({ bitcoin: [[87400, 84000]] }), ['bitcoin']),
    [{ token: 'bitcoin', price: 84000, change24h: null, at: AT }]);
});

test('a zero price a day ago nulls the change instead of dividing by zero', () => {
  assert.deepEqual(cp.parse(chart({ bitcoin: [[1000, 0], [87400, 84000]] }), ['bitcoin']),
    [{ token: 'bitcoin', price: 84000, change24h: null, at: AT }]);
});

test('observedAt is the oldest observation among the shown prices — the stamp never flatters', () => {
  assert.equal(cp.observedAt([
    { token: 'bitcoin', price: 1, change24h: null, at: 5000 },
    { token: 'ethereum', price: 1, change24h: null, at: 3000 },
    { token: 'dogecoin', price: null, change24h: null, unavailable: true },
  ]), 3000);
});

test('observedAt is null when no price carries an observation time (e.g. a cached pre-`at` value)', () => {
  assert.equal(cp.observedAt([{ token: 'bitcoin', price: 1, change24h: null }]), null);
  assert.equal(cp.observedAt([]), null);
  assert.equal(cp.observedAt(null), null);
});

test('a non-number latest price is treated as unavailable, never rendered as-is', () => {
  assert.deepEqual(cp.parse(chart({ bitcoin: [[1000, 80000], [87400, 'NaN-ish']] }), ['bitcoin']),
    [{ token: 'bitcoin', price: null, change24h: null, unavailable: true }]);
});

test('a coin with no prices array is unavailable', () => {
  const body = JSON.stringify({ coins: { 'coingecko:bitcoin': { symbol: 'BTC' } } });
  assert.deepEqual(cp.parse(body, ['bitcoin']), [{ token: 'bitcoin', price: null, change24h: null, unavailable: true }]);
});

test('a rate-limit / error / non-JSON body returns [] without throwing (calm degrade, R11)', () => {
  assert.deepEqual(cp.parse('{"status":{"error_code":429}}-not-json', ['bitcoin']), []);
  assert.deepEqual(cp.parse('', ['bitcoin']), []);
  assert.deepEqual(cp.parse('null', ['bitcoin']), []);
});
