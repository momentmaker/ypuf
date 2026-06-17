'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ch = require('../extension/lib/channel.js');

// NOTE: this proves the PURE intent-validation logic. The real cross-frame
// event.source identity check is a browser-runtime property verified by the
// forged-intent MANUAL-DOGFOOD step (U1), not here.

test('renderEnvelope carries only sanitized text fields — no raw URL/HTML reaches the sandbox', () => {
  const env = ch.renderEnvelope({
    lines: [
      { text: 'Headline one', open: 0, url: 'https://evil.test/secret', html: '<img onerror=x>' },
      { text: 'Headline two', open: 1 },
    ],
    foot: 'fetches news.test',
    note: 'as of 3:42pm',
  });
  assert.equal(env.ypuf, 'panel');
  assert.equal(env.v, 1);
  assert.equal(env.kind, 'render');
  // Each line keeps ONLY {text, open} — the url/html keys are dropped, not forwarded.
  assert.deepEqual(env.body.lines, [
    { text: 'Headline one', open: 0 },
    { text: 'Headline two', open: 1 },
  ]);
  assert.equal(env.body.foot, 'fetches news.test');
  assert.equal(env.body.note, 'as of 3:42pm');
});

test('sanitizeLines coerces non-string text and drops a non-integer open index', () => {
  assert.deepEqual(ch.sanitizeLines([{ text: 42 }, { text: 'ok', open: 1.5 }, { text: 'x', open: 2 }]), [
    { text: '42' },
    { text: 'ok' },
    { text: 'x', open: 2 },
  ]);
  assert.deepEqual(ch.sanitizeLines(null), []);
});

test('parseIntent accepts a well-formed open intent and rejects everything else', () => {
  assert.deepEqual(ch.parseIntent({ ypuf: 'panel', v: 1, kind: 'intent', intent: 'open', index: 3 }), { intent: 'open', index: 3 });
  assert.equal(ch.parseIntent({ ypuf: 'panel', v: 1, kind: 'render' }), null);     // wrong kind
  assert.equal(ch.parseIntent({ ypuf: 'panel', v: 2, kind: 'intent', intent: 'open', index: 0 }), null); // wrong version
  assert.equal(ch.parseIntent({ kind: 'intent', intent: 'open', index: 0 }), null); // not an envelope
  assert.equal(ch.parseIntent({ ypuf: 'panel', v: 1, kind: 'intent', intent: 'open', index: '0' }), null); // non-int index
  assert.equal(ch.parseIntent({ ypuf: 'panel', v: 1, kind: 'intent', intent: 'eval' }), null); // unknown intent
  assert.equal(ch.parseIntent(null), null);
});

test('resolveOpen intersects a panel index against the host-parsed links (pattern 15)', () => {
  const links = ['https://news.test/a', 'https://news.test/b'];
  assert.equal(ch.resolveOpen(0, links), 'https://news.test/a');
  assert.equal(ch.resolveOpen(1, links), 'https://news.test/b');
  // forged / out-of-range / negative / non-integer → null: the panel cannot open a
  // URL the host didn't itself parse.
  assert.equal(ch.resolveOpen(2, links), null);
  assert.equal(ch.resolveOpen(-1, links), null);
  assert.equal(ch.resolveOpen(1.5, links), null);
  assert.equal(ch.resolveOpen(0, null), null);
  assert.equal(ch.resolveOpen(0, []), null);
});
