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

test('buildUrl asks the /chart endpoint for two daily points of the CoinGecko ids', () => {
  assert.equal(cp.buildUrl(['bitcoin', ' Ethereum ']),
    'https://coins.llama.fi/chart/coingecko:bitcoin,coingecko:ethereum?span=2&period=1d');
});

test('buildUrl drops anything that is not id-shaped — a token cannot inject a path or query', () => {
  assert.equal(cp.buildUrl(['bitcoin', '../prices', 'a?b=1', 'x/y', '', 'usd-coin']),
    'https://coins.llama.fi/chart/coingecko:bitcoin,coingecko:usd-coin?span=2&period=1d');
});

test('parse takes the latest point as the price and the change against the point a day earlier', () => {
  const body = chart({ bitcoin: [[1000, 80000], [87400, 84000]], ethereum: [[1000, 2000], [87400, 1900]] });
  assert.deepEqual(cp.parse(body, ['bitcoin', 'ethereum']), [
    { token: 'bitcoin', price: 84000, change24h: 5 },
    { token: 'ethereum', price: 1900, change24h: -5 },
  ]);
});

test('parse orders points by timestamp, not by position', () => {
  const body = chart({ bitcoin: [[87400, 84000], [1000, 80000]] });
  assert.deepEqual(cp.parse(body, ['bitcoin']), [{ token: 'bitcoin', price: 84000, change24h: 5 }]);
});

test('a missing token degrades to unavailable rather than dropping or throwing (AE3)', () => {
  const body = chart({ bitcoin: [[1000, 80000], [87400, 84000]] });
  assert.deepEqual(cp.parse(body, ['bitcoin', 'dogecoin']), [
    { token: 'bitcoin', price: 84000, change24h: 5 },
    { token: 'dogecoin', price: null, change24h: null, unavailable: true },
  ]);
});

test('a single price point keeps the price and nulls the change', () => {
  assert.deepEqual(cp.parse(chart({ bitcoin: [[87400, 84000]] }), ['bitcoin']),
    [{ token: 'bitcoin', price: 84000, change24h: null }]);
});

test('a zero price a day ago nulls the change instead of dividing by zero', () => {
  assert.deepEqual(cp.parse(chart({ bitcoin: [[1000, 0], [87400, 84000]] }), ['bitcoin']),
    [{ token: 'bitcoin', price: 84000, change24h: null }]);
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
