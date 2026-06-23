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
