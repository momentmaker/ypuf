'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const highlight = require('../extension/lib/highlight.js');

function flat(segs) { return segs.map((s) => (s.hl ? `[${s.text}]` : s.text)).join(''); }

test('segments: no query → one un-highlighted run', () => {
  assert.deepEqual(highlight.segments('Hello world', ''), [{ text: 'Hello world', hl: false }]);
});

test('segments: marks a case-insensitive match mid-string', () => {
  assert.equal(flat(highlight.segments('The Founder farms goats', 'founder')), 'The [Founder] farms goats');
});

test('segments: a match at the very start has no leading plain run', () => {
  const segs = highlight.segments('Founder notes', 'founder');
  assert.equal(segs[0].hl, true);
  assert.equal(flat(segs), '[Founder] notes');
});

test('segments: multi-term query highlights every term, earliest-first', () => {
  assert.equal(flat(highlight.segments('quit Google to farm', 'farm quit')), '[quit] Google to [farm]');
});

test('segments: empty/whitespace text → no segments', () => {
  assert.deepEqual(highlight.segments('', 'x'), []);
  assert.deepEqual(highlight.segments(null, 'x'), []);
});

test('groupLabel buckets by calendar day relative to now', () => {
  const now = new Date(2026, 5, 18, 10, 0, 0).getTime();       // 2026-06-18 10:00
  const sameDay = new Date(2026, 5, 18, 1, 0, 0).getTime();    // earlier same day
  const yesterday = new Date(2026, 5, 17, 23, 0, 0).getTime();
  const threeDays = new Date(2026, 5, 15, 12, 0, 0).getTime();
  const lastMonth = new Date(2026, 4, 1, 12, 0, 0).getTime();
  assert.equal(highlight.groupLabel(sameDay, now), 'Today');
  assert.equal(highlight.groupLabel(yesterday, now), 'Yesterday');
  assert.equal(highlight.groupLabel(threeDays, now), 'This week');
  assert.equal(highlight.groupLabel(lastMonth, now), 'Earlier');
  assert.equal(highlight.groupLabel(null, now), 'Earlier');
});
