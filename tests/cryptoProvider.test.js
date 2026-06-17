'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const cp = require('../extension/lib/cryptoProvider.js');

test('buildUrl targets the CoinGecko public endpoint with the requested ids', () => {
  const url = cp.buildUrl(['bitcoin', 'Ethereum']);
  assert.match(url, /^https:\/\/api\.coingecko\.com\/api\/v3\/simple\/price\?/);
  assert.match(url, /ids=bitcoin%2Cethereum/);   // lowercased, comma-encoded
  assert.match(url, /vs_currencies=usd/);
  assert.match(url, /include_24hr_change=true/);
});

test('parse maps a CoinGecko response to {token, price, change24h}', () => {
  const body = JSON.stringify({
    bitcoin: { usd: 67000, usd_24h_change: 2.34 },
    ethereum: { usd: 3500, usd_24h_change: -1.2 },
  });
  assert.deepEqual(cp.parse(body, ['bitcoin', 'ethereum']), [
    { token: 'bitcoin', price: 67000, change24h: 2.34 },
    { token: 'ethereum', price: 3500, change24h: -1.2 },
  ]);
});

test('a missing token degrades to unavailable rather than dropping or throwing (AE3)', () => {
  const body = JSON.stringify({ bitcoin: { usd: 67000, usd_24h_change: 2 } });
  assert.deepEqual(cp.parse(body, ['bitcoin', 'dogecoin']), [
    { token: 'bitcoin', price: 67000, change24h: 2 },
    { token: 'dogecoin', price: null, change24h: null, unavailable: true },
  ]);
});

test('a token with a price but no 24h change keeps the price, nulls the change', () => {
  const body = JSON.stringify({ bitcoin: { usd: 67000 } });
  assert.deepEqual(cp.parse(body, ['bitcoin']), [{ token: 'bitcoin', price: 67000, change24h: null }]);
});

test('a rate-limit / error / non-JSON body returns [] without throwing (calm degrade, R11)', () => {
  assert.deepEqual(cp.parse('{"status":{"error_code":429}}-not-json', ['bitcoin']), []);
  assert.deepEqual(cp.parse('', ['bitcoin']), []);
  assert.deepEqual(cp.parse('null', ['bitcoin']), []);
});

test('a non-number price (string) is treated as unavailable, never rendered as-is', () => {
  const body = JSON.stringify({ bitcoin: { usd: 'NaN-ish' } });
  assert.deepEqual(cp.parse(body, ['bitcoin']), [{ token: 'bitcoin', price: null, change24h: null, unavailable: true }]);
});
