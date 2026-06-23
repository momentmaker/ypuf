'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const merge = require('../extension/lib/recallmerge.js');

// Index-backed rows (let-go / snoozed) carry content + a record id; open-tab
// rows carry a live tabId and url/title only (no content).
function letgo(over) {
  return Object.assign({
    kind: 'let-go', id: 'rec1', url: 'https://e.com/a?ref=x#frag',
    host: 'e.com', title: 'A', content: 'the body text', excerpt: 'the body…',
    siblings: [{ url: 'https://e.com/b', host: 'e.com' }], timestamp: 100,
  }, over);
}
function open(over) {
  return Object.assign({
    kind: 'open', url: 'https://e.com/a', host: 'e.com', title: 'A', tabId: 42,
  }, over);
}
function snoozed(over) {
  return letgo(Object.assign({ kind: 'snoozed', id: 'recS', returnAt: 999, snoozeState: 'snoozed' }, over));
}

test('U2/AE1: an open tab and its let-go twin (differing query/hash) collapse to one row', () => {
  const out = merge.merge([letgo(), open()]);
  assert.equal(out.length, 1);
});

test('U2: the merged row takes kind+tabId from the open twin but RETAINS content/excerpt/siblings/id from the let-go record', () => {
  const out = merge.merge([letgo(), open()]);
  const row = out[0];
  assert.equal(row.kind, 'open', 'action adapts to the live tab');
  assert.equal(row.tabId, 42, 'jump target preserved');
  assert.equal(row.id, 'rec1', 'recordId retained for restore/why-this');
  assert.equal(row.content, 'the body text', 'content retained for highlight');
  assert.ok(row.excerpt, 'excerpt retained — not an empty open-tab stub');
  assert.equal(row.siblings.length, 1, 'siblings retained for with: pivots');
});

test('U2: differing query string and hash on the same path canonicalize to one key', () => {
  const out = merge.merge([
    letgo({ id: 'r', url: 'https://e.com/a?ref=newsletter' }),
    open({ url: 'https://e.com/a?q=1#section' }),
  ]);
  assert.equal(out.length, 1);
});

test('U2: precedence open > snoozed > let-go for the action kind', () => {
  // same page snoozed AND currently open -> the action is "jump", not "wake".
  const out = merge.merge([snoozed({ url: 'https://e.com/a' }), open()]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'open');
  assert.equal(out[0].tabId, 42);
  assert.equal(out[0].returnAt, 999, 'snoozed metadata still carried for display');
});

test('U2: a let-go twin and a snoozed twin on one key collapse coherently — snooze metadata survives', () => {
  // Two DISTINCT index records sharing a canonical key (different query strings),
  // one let-go and one snoozed. The survivor must read as snoozed (its returnAt +
  // snoozeState), not silently drop them by inheriting the let-go twin's nulls.
  const out = merge.merge([
    letgo({ id: 'lg', url: 'https://e.com/a?ref=1' }),
    snoozed({ id: 'sn', url: 'https://e.com/a?ref=2', returnAt: 777 }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'snoozed');
  assert.equal(out[0].snoozeState, 'snoozed');
  assert.equal(out[0].returnAt, 777);
  assert.equal(out[0].id, 'sn', 'the winning snoozed record supplies the display fields');
});

test('U2: a pure open tab with no index twin passes through as kind:open (no content)', () => {
  const out = merge.merge([open({ url: 'https://only-open.com/x', tabId: 7 })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'open');
  assert.equal(out[0].tabId, 7);
  assert.equal(out[0].content, undefined);
});

test('U2: distinct URLs are not merged; input order is preserved', () => {
  const out = merge.merge([
    letgo({ id: 'a', url: 'https://e.com/a' }),
    letgo({ id: 'b', url: 'https://e.com/b' }),
  ]);
  assert.deepEqual(out.map((r) => r.id), ['a', 'b']);
});

test('U2: empty input -> empty; merge does not mutate input rows', () => {
  assert.deepEqual(merge.merge([]), []);
  const rows = [letgo(), open()];
  const snap = JSON.stringify(rows);
  merge.merge(rows);
  assert.equal(JSON.stringify(rows), snap);
});

// --- U3: the one-box assembler seam (pure, no chrome.*) -------------------

const recallrank = require('../extension/lib/recallrank.js');

const DAY = 86400000;
const NOW = 1000 * DAY;

// A production-shaped store record (born-equal unless lastAccessed is overridden).
function record(over) {
  const base = { id: 'r', url: 'https://e.com/a', host: 'e.com', title: 'A', content: 'body text here', timestamp: 500 * DAY };
  const r = Object.assign(base, over);
  if (r.lastAccessed === undefined) r.lastAccessed = r.timestamp; // born-equal by default
  return r;
}
function hitFor(rec, score) { return { id: rec.id, score }; }

test('U3: assemble ranks a frequently-revisited record above an equal-text stale one', () => {
  const hot = record({ id: 'hot', url: 'https://e.com/hot' });
  const cold = record({ id: 'cold', url: 'https://e.com/cold' });
  const out = recallrank.assemble({
    hits: [hitFor(cold, 10), hitFor(hot, 10)],
    records: [cold, hot],
    durable: { revisits: { 'https://e.com/hot': 12 }, dwell: {} },
    q: 'body', now: NOW,
  });
  assert.equal(out[0].id, 'hot');
});

test('U3/Pattern 9: signal banked under a query-bearing URL still attaches after dedup', () => {
  // The record url is query-stripped; the signal was banked under the full URL.
  const rec = record({ id: 'pr', url: 'https://github.com/o/r/pull/9' });
  const stale = record({ id: 'doc', url: 'https://e.com/doc' });
  const out = recallrank.assemble({
    hits: [hitFor(stale, 10), hitFor(rec, 10)],
    records: [stale, rec],
    durable: { revisits: { 'https://github.com/o/r/pull/9?tab=files': 20 }, dwell: {} },
    q: 'body', now: NOW,
  });
  assert.equal(out[0].id, 'pr', 'aggregated signal across the canonical key lifts the PR');
});

test('U3/Pattern 19: a born-equal record gets no recency lift over a recently-touched one', () => {
  const recent = record({ id: 'recent', url: 'https://e.com/recent', lastAccessed: 999 * DAY });
  const born = record({ id: 'born', url: 'https://e.com/born' }); // lastAccessed === timestamp
  const out = recallrank.assemble({
    hits: [hitFor(born, 10), hitFor(recent, 10)],
    records: [born, recent],
    durable: { revisits: {}, dwell: {} },
    q: 'body', now: NOW,
  });
  assert.equal(out[0].id, 'recent');
  assert.equal(recallrank.ageMsOf(born, NOW), null, 'born-equal -> no age');
});

test('U3: an open-only tab (no index twin) surfaces on a url/title match when oneBox', () => {
  const out = recallrank.assemble({
    hits: [], records: [], oneBox: true, q: 'figma', now: NOW,
    openTabs: [{ id: 7, url: 'https://figma.com/board', title: 'Figma — board', incognito: false }],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'open');
  assert.equal(out[0].tabId, 7);
  assert.equal(out[0].id, null, 'a pure open tab has no record id');
});

test('U3: incognito open tabs never surface', () => {
  const out = recallrank.assemble({
    hits: [], records: [], oneBox: true, q: 'secret', now: NOW,
    openTabs: [{ id: 1, url: 'https://secret.com/x', title: 'secret', incognito: true }],
  });
  assert.equal(out.length, 0);
});

test('U3: oneBox=false (the ⌘⇧K overlay path) emits no open-tab rows', () => {
  const out = recallrank.assemble({
    hits: [], records: [], oneBox: false, q: 'figma', now: NOW,
    openTabs: [{ id: 7, url: 'https://figma.com/board', title: 'Figma', incognito: false }],
  });
  assert.equal(out.length, 0);
});

test('U3: an open tab and its let-go twin dedup to one row that jumps but keeps the snippet', () => {
  const rec = record({ id: 'fig', url: 'https://figma.com/board', content: 'figma design board notes' });
  const out = recallrank.assemble({
    hits: [hitFor(rec, 9)], records: [rec], oneBox: true, q: 'figma', now: NOW,
    openTabs: [{ id: 42, url: 'https://figma.com/board?node=1', title: 'Figma', incognito: false }],
  });
  assert.equal(out.length, 1, 'open + let-go twin collapse');
  assert.equal(out[0].kind, 'open');
  assert.equal(out[0].tabId, 42);
  assert.equal(out[0].id, 'fig', 'recordId retained');
  assert.ok(out[0].snippet, 'excerpt retained from the indexed twin');
});

test('U3: assemble output carries no internal score/signal fields', () => {
  const rec = record({ id: 'r', content: 'hello body' });
  const out = recallrank.assemble({ hits: [hitFor(rec, 5)], records: [rec], q: 'body', now: NOW });
  assert.equal(out[0].score, undefined);
  assert.equal(out[0].signal, undefined);
  assert.equal(out[0]._blended, undefined);
});

test('U3: a record evicted between search and store.get (null) is skipped; survivors still rank', () => {
  const alive = record({ id: 'alive', url: 'https://e.com/alive', content: 'alive body' });
  const out = recallrank.assemble({
    hits: [{ id: 'evicted', score: 50 }, hitFor(alive, 5)],
    records: [null, alive], // the high-scoring hit was evicted from the store
    q: 'body', now: NOW,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'alive');
});

test('U3: a snoozed record flows through assemble as kind:snoozed with its return metadata', () => {
  const rec = record({ id: 'sn', url: 'https://e.com/s', content: 'snooze body', snoozeState: 'snoozed', returnAt: 4242 });
  const out = recallrank.assemble({ hits: [hitFor(rec, 8)], records: [rec], q: 'body', now: NOW });
  assert.equal(out[0].kind, 'snoozed');
  assert.equal(out[0].snoozeState, 'snoozed');
  assert.equal(out[0].returnAt, 4242);
});

test('U7: the excerpt + matchTerms come from the term MiniSearch matched, not the raw typo', () => {
  // A fuzzy/prefix hit: the user typed 'googl' but the index matched 'google'. The
  // excerpt must center on 'google' (which is in the content) — the raw query is not.
  const rec = record({ id: 'g', url: 'https://e.com/g', content: 'the google cloud platform writeup' });
  const out = recallrank.assemble({
    hits: [{ id: 'g', score: 9, terms: ['google'] }],
    records: [rec], q: 'googl', now: NOW,
  });
  assert.ok(out[0].snippet.toLowerCase().includes('google'), 'excerpt centers on the matched term');
  assert.deepEqual(out[0].matchTerms, ['google']);
});

// --- U6: episodic pivot filtering -----------------------------------------

function frow(over) {
  return Object.assign({ kind: 'let-go', id: 'r', timestamp: 500 * DAY, siblings: [] }, over);
}

test('U6: with: keeps only let-go rows whose siblings match the session — open/snoozed pass through', () => {
  const rows = [
    frow({ id: 'match', kind: 'let-go', siblings: [{ url: 'https://e.com/tax', host: 'e.com' }] }),
    frow({ id: 'miss', kind: 'let-go', siblings: [{ url: 'https://x.com/y', host: 'x.com' }] }),
    frow({ id: 'open', kind: 'open', siblings: [] }),
    frow({ id: 'snoozed', kind: 'snoozed', siblings: [] }),
  ];
  const out = recallrank.filterPivots(rows, { withTerm: 'tax' }).map((r) => r.id);
  assert.deepEqual(out.sort(), ['match', 'open', 'snoozed'].sort(), 'matching let-go + all live rows kept; non-matching let-go dropped');
});

test('U6: a time range keeps rows whose timestamp falls inside it; timestamp-less rows (open tabs) pass', () => {
  const range = { from: 100 * DAY, to: 200 * DAY };
  const rows = [
    frow({ id: 'in', timestamp: 150 * DAY }),
    frow({ id: 'before', timestamp: 50 * DAY }),
    frow({ id: 'after', timestamp: 250 * DAY }),
    frow({ id: 'open', kind: 'open', timestamp: null }),
  ];
  const out = recallrank.filterPivots(rows, { timeRange: range }).map((r) => r.id);
  assert.deepEqual(out.sort(), ['in', 'open'].sort());
});

test('U6: with: and time range compose; no pivots is a pass-through', () => {
  const rows = [
    frow({ id: 'keep', timestamp: 150 * DAY, siblings: [{ host: 'e.com' }] }),
    frow({ id: 'wrongtime', timestamp: 999 * DAY, siblings: [{ host: 'e.com' }] }),
  ];
  const both = recallrank.filterPivots(rows, { withTerm: 'e.com', timeRange: { from: 100 * DAY, to: 200 * DAY } });
  assert.deepEqual(both.map((r) => r.id), ['keep']);
  assert.equal(recallrank.filterPivots(rows, null).length, 2);
});
