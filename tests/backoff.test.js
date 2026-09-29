'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const backoff = require('../extension/lib/backoff.js');

const NOW = Date.UTC(2026, 8, 29, 15, 0, 0);   // whole second, so an HTTP-date round-trips exactly
const MIN = 60 * 1000;

test('a first failure makes every tab wait a minute before retrying', () => {
  const next = backoff.afterFailure({}, null, NOW);
  assert.equal(next.failures, 1);
  assert.equal(next.retryAt, NOW + MIN);
});

test('each consecutive failure doubles the wait', () => {
  assert.equal(backoff.afterFailure({ failures: 1 }, null, NOW).retryAt, NOW + 2 * MIN);
  assert.equal(backoff.afterFailure({ failures: 2 }, null, NOW).retryAt, NOW + 4 * MIN);
  assert.equal(backoff.afterFailure({ failures: 2 }, null, NOW).failures, 3);
});

test('the wait never exceeds 15 minutes, however long the host keeps failing', () => {
  assert.equal(backoff.afterFailure({ failures: 40 }, null, NOW).retryAt, NOW + 15 * MIN);
});

test('a Retry-After longer than the exponential wait is honored', () => {
  assert.equal(backoff.afterFailure({}, '300', NOW).retryAt, NOW + 5 * MIN);
});

test('a Retry-After shorter than the exponential wait does not shorten it', () => {
  // CoinGecko's keyless 429 sends `retry-after: 50` — still wait the full minute.
  assert.equal(backoff.afterFailure({}, '50', NOW).retryAt, NOW + MIN);
});

test('an HTTP-date Retry-After is honored', () => {
  const at = new Date(NOW + 10 * MIN).toUTCString();
  assert.equal(backoff.afterFailure({}, at, NOW).retryAt, NOW + 10 * MIN);
});

test('a Retry-After is capped at 15 minutes too — a host cannot freeze a panel for a day', () => {
  assert.equal(backoff.afterFailure({}, '86400', NOW).retryAt, NOW + 15 * MIN);
});

test('a garbled or negative Retry-After falls back to the exponential wait', () => {
  for (const bad of ['soon', '-5', '', '1.5e9', undefined]) {
    assert.equal(backoff.afterFailure({}, bad, NOW).retryAt, NOW + MIN, `${bad} should be ignored`);
  }
});

test('a failure keeps the last-known value and its fetchedAt, and drops the fetch lock', () => {
  const next = backoff.afterFailure({ value: ['btc'], fetchedAt: 5, fetchingAt: NOW - 1 }, null, NOW);
  assert.deepEqual(next.value, ['btc']);
  assert.equal(next.fetchedAt, 5);
  assert.equal('fetchingAt' in next, false);
});

test('a tab may not fetch before retryAt', () => {
  assert.equal(backoff.inBackoff({ retryAt: NOW + 1 }, NOW), true);
});

test('a tab may fetch once retryAt has passed', () => {
  assert.equal(backoff.inBackoff({ retryAt: NOW }, NOW), false);
  assert.equal(backoff.inBackoff({ retryAt: NOW - 1 }, NOW), false);
});

test('an entry that never failed is not in backoff', () => {
  assert.equal(backoff.inBackoff({ value: ['btc'], fetchedAt: NOW }, NOW), false);
  assert.equal(backoff.inBackoff({}, NOW), false);
  assert.equal(backoff.inBackoff(undefined, NOW), false);
});
