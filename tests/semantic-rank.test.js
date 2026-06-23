'use strict';

// U5 — the two-axis (text-relevance × semantic-similarity) rerank, plus the
// semantic candidate-union seam in recallrank.assemble. The headline guard
// (AE2) is written FIRST and must fail before the rerank rework lands.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const rank = require('../extension/lib/rank.js');
const recallrank = require('../extension/lib/recallrank.js');

const DAY = 86400000;
const NOW = 1000 * DAY;

// A hit carrying both axes. `semantic` is the 0..1 cosine for that row; absent
// (undefined) means "no semantic signal", which the off path treats as 0.
function row(id, score, semantic, signal) {
  const r = { id, score, signal: Object.assign({ revisits: 0, dwell: 0, ageMs: null }, signal) };
  if (semantic !== undefined) r.semantic = semantic;
  return r;
}
const order = (rows) => rank.rerank(rows).map((h) => h.id);

// --- AE2: zero-keyword meaning match survives (the headline guard) --------

test('AE2: a textScore=0 row with high semantic survives rerank and lands in the top results', () => {
  // 'kw' is a strong keyword hit, no semantic. 'sem' has NO keyword match
  // (textScore 0) but a near-perfect cosine. Today's text-only FLOOR buries
  // any textScore=0 row at the bottom; the two-axis rework must surface it.
  const out = order([
    row('kw', 20, 0),
    row('weakkw', 4, 0),
    row('sem', 0, 0.95),
  ]);
  assert.ok(out.indexOf('sem') < out.indexOf('weakkw'),
    'the strong semantic-only match must outrank the weak keyword hit');
  assert.ok(out.slice(0, 2).includes('sem'),
    'the strong semantic-only match lands in the top results, not last');
});

// --- AE1: semantic OFF -> byte-for-byte today's keyword order -------------

test('AE1: with NO semantic values present, rerank is byte-for-byte the legacy keyword order', () => {
  const hits = [
    row('a', 12, undefined, { revisits: 2 }),
    row('b', 9, undefined, {}),
    row('c', 20, undefined, { revisits: 200, dwell: 9 * DAY }),
  ];
  assert.deepEqual(order(hits), ['c', 'a', 'b']);
  // and the exact blended values match the legacy (text-unit) scoring
  const sub = rank.rerank([
    row('top', 20, undefined, {}),
    row('subf', 11, undefined, { revisits: 9999, dwell: 30 * DAY }),
  ]);
  assert.equal(sub.find((h) => h.id === 'subf')._blended, 11,
    'sub-floor row keeps its raw text score — the legacy path is untouched');
});

// --- bounded two-axis: neither axis buries the other ----------------------

test('bounded: a strong semantic match cannot bury an exact keyword match, and vice versa', () => {
  // exact keyword (textNorm 1, no semantic) vs strong semantic (cosine 0.9, no
  // keyword). Neither should crush the other: both clear the floor and sit near
  // the top, and the gap between them stays inside the bounded lift envelope.
  const ranked = rank.rerank([
    row('kw', 20, 0),
    row('sem', 0, 0.9),
  ]);
  const kw = ranked.find((r) => r.id === 'kw')._blended;
  const sem = ranked.find((r) => r.id === 'sem')._blended;
  const hi = Math.max(kw, sem);
  const lo = Math.min(kw, sem);
  // A pure-axis top row maxes at primary=1; a 0.9-cosine row sits at 0.9. With
  // no intent lift on either, the ratio is exactly their primary ratio — bounded
  // well inside 2x. The point: the loser is never floored to 0 / buried.
  assert.ok(lo > 0, 'the losing axis is not zeroed out');
  assert.ok(hi / lo < 2, `neither axis buries the other (ratio ${hi / lo})`);
});

// --- union dedup: a page matched by BOTH collapses, keyword excerpt wins ----

function record(over) {
  const base = { id: 'r', url: 'https://e.com/a', host: 'e.com', title: 'A', content: 'body text here', timestamp: 500 * DAY };
  const r = Object.assign(base, over);
  if (r.lastAccessed === undefined) r.lastAccessed = r.timestamp;
  return r;
}

test('union dedup: a page matched by both keyword and semantic appears once, keeping the keyword excerpt/terms', () => {
  const rec = record({ id: 'dup', url: 'https://e.com/dup', content: 'machine learning notes' });
  const out = recallrank.assemble({
    hits: [{ id: 'dup', score: 9, terms: ['learning'] }],
    records: [rec],
    semanticRows: [recallrank.semanticRow(rec, 0.88)],
    q: 'learning', now: NOW,
  });
  const dupRows = out.filter((r) => r.url === 'https://e.com/dup');
  assert.equal(dupRows.length, 1, 'one row per canonical key');
  assert.ok(dupRows[0].snippet, 'the keyword twin excerpt survives the merge');
  assert.deepEqual(dupRows[0].matchTerms, ['learning'], 'the keyword terms survive the merge');
});

test('a strong semantic-only match (no keyword twin) survives the union cap and outranks a weak keyword hit', () => {
  // A strong keyword hit sets the run's text-max; the weak one normalizes low.
  const strongKw = record({ id: 'strongkw', url: 'https://e.com/strong', content: 'the body body body text' });
  const weakKw = record({ id: 'weakkw', url: 'https://e.com/weak', content: 'one body mention only' });
  const sem = record({ id: 'sem', url: 'https://e.com/sem', content: 'utterly unrelated words' });
  const out = recallrank.assemble({
    hits: [{ id: 'strongkw', score: 30, terms: ['body'] }, { id: 'weakkw', score: 4, terms: ['body'] }],
    records: [strongKw, weakKw],
    semanticRows: [recallrank.semanticRow(sem, 0.96)],
    q: 'body', now: NOW,
  });
  const ids = out.map((r) => r.id);
  assert.ok(ids.includes('sem'), 'the semantic-only candidate is in the list (survived the union)');
  assert.ok(ids.indexOf('sem') < ids.indexOf('weakkw'),
    'the strong semantic match (cosine 0.96) outranks the weak keyword hit (textNorm 0.13)');
  assert.ok(ids.indexOf('strongkw') < ids.indexOf('sem'),
    'the exact keyword match (textNorm 1.0) still leads the 0.96 semantic match — neither buries the other');
});

test('AE3: empty/absent semanticRows -> assemble output is identical to the no-semantic call (keyword fallback)', () => {
  // The SW returns [] from semanticCandidates whenever semantic is off, the model
  // is absent, or the query embed throws — so assemble with semanticRows:[] (and
  // with the field absent) must be byte-for-byte the keyword-only result.
  const a = record({ id: 'a', url: 'https://e.com/a', content: 'alpha body' });
  const b = record({ id: 'b', url: 'https://e.com/b', content: 'beta body' });
  const base = { hits: [{ id: 'a', score: 12, terms: ['body'] }, { id: 'b', score: 9, terms: ['body'] }], records: [a, b], q: 'body', now: NOW };
  const withEmpty = recallrank.assemble(Object.assign({}, base, { semanticRows: [] }));
  const without = recallrank.assemble(base);
  assert.deepEqual(withEmpty, without, 'an empty semantic union changes nothing');
  assert.deepEqual(withEmpty.map((r) => r.id), ['a', 'b'], 'pure keyword order preserved');
});

test('a semantic candidate with empty matchTerms produces an empty (not thrown) excerpt', () => {
  const rec = record({ id: 's', url: 'https://e.com/s', content: 'arbitrary page body' });
  const r = recallrank.semanticRow(rec, 0.7);
  assert.equal(r.snippet, '', 'no matched terms -> empty excerpt, never a throw');
  assert.deepEqual(r.matchTerms, []);
  assert.equal(r.kind, 'semantic');
  assert.equal(r.semantic, 0.7);
});
