'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const rank = require('../extension/lib/rank.js');

const DAY = 86400000;

// A hit as it arrives from a text search: { id, score (text relevance), signal }.
function hit(id, score, signal) {
  return { id, score, signal: Object.assign({ revisits: 0, dwell: 0, ageMs: null }, signal) };
}

function order(hits) {
  return rank.rerank(hits).map((h) => h.id);
}

test('AE2: with equal text scores, the more-revisited page ranks first', () => {
  const out = order([
    hit('cold', 10, { revisits: 0 }),
    hit('hot', 10, { revisits: 12 }),
  ]);
  assert.equal(out[0], 'hot');
});

test('intent is a bounded tie-breaker: a heavily-revisited marginal match cannot outrank a strong exact match', () => {
  // 'driver' is a daily-driver (200 revisits) but only a weak text match;
  // 'exact' is a strong text match with zero behavioral signal.
  const out = order([
    hit('exact', 20, { revisits: 0 }),
    hit('driver', 8, { revisits: 200, dwell: 9 * DAY }),
  ]);
  assert.equal(out[0], 'exact', 'the strong text match must stay on top');
});

test('intent cannot push even a floor-edge page above the strongest zero-signal text hit', () => {
  // floor-edge page sits right at the relevance floor and maxes out its signal.
  const top = 20;
  const out = rank.rerank([
    hit('top', top, { revisits: 0 }),
    hit('edge', Math.ceil(top * 0.6), { revisits: 9999, dwell: 30 * DAY }),
  ]);
  assert.equal(out[0].id, 'top');
});

test('a row BELOW the relevance floor receives no lift, however strong its signal', () => {
  // The core cross-document dominance guard (rank.js: `score < FLOOR*topScore`):
  // a sub-floor row keeps its raw text score, so intent can never climb it.
  const out = rank.rerank([
    hit('top', 20, { revisits: 0 }),
    hit('sub', 11, { revisits: 9999, dwell: 30 * DAY }), // 11 < 0.6*20 = 12 -> below floor
  ]);
  assert.equal(out.find((h) => h.id === 'sub')._blended, 11, 'sub-floor row keeps its raw score, no lift');
});

test('zero signal yields the text-only baseline (no lift, deterministic order)', () => {
  const out = order([
    hit('a', 12, {}),
    hit('b', 9, {}),
  ]);
  assert.deepEqual(out, ['a', 'b']);
});

test('born-equal recency (ageMs null/0) contributes no recency lift', () => {
  // Two equally-weak-text rows; the only difference is recency. A born-equal
  // record (never recalled -> ageMs null) must not be lifted over a genuinely
  // recently-touched one.
  const recent = rank.rerank([hit('r', 10, { ageMs: 1 * DAY })])[0]._blended;
  const bornEqual = rank.rerank([hit('be', 10, { ageMs: null })])[0]._blended;
  const bornZero = rank.rerank([hit('bz', 10, { ageMs: 0 })])[0]._blended;
  assert.ok(recent > bornEqual, 'a recently-touched page outscores a never-recalled one');
  assert.equal(bornEqual, bornZero, 'ageMs 0 and null are both "never recalled"');
  assert.equal(bornEqual, 10, 'no recency signal -> pure text score');
});

test('a large revisit count does not swamp a much stronger text score', () => {
  const out = order([
    hit('strong', 100, { revisits: 0 }),
    hit('revisited', 30, { revisits: 5000 }),
  ]);
  assert.equal(out[0], 'strong');
});

test('rerank is pure: it does not mutate the input order or scores', () => {
  const hits = [hit('a', 5, { revisits: 1 }), hit('b', 9, {})];
  const snapshot = JSON.stringify(hits);
  rank.rerank(hits);
  assert.equal(JSON.stringify(hits), snapshot, 'input array is untouched');
});

test('empty input returns empty', () => {
  assert.deepEqual(rank.rerank([]), []);
});
