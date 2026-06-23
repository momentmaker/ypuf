'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const recallquery = require('../extension/lib/recallquery.js');

const DAY = 86400000;
function startOfDay(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }

test('U5/AE5: "with:" splits the session term from the free text', () => {
  const p = recallquery.parse('github with: tax research', startOfDay(new Date(2026, 5, 23).getTime()));
  assert.equal(p.text, 'github');
  assert.equal(p.withTerm, 'tax research');
  assert.equal(p.timeRange, null);
});

test('U5: plain text passes through with no pivots', () => {
  const p = recallquery.parse('react hooks', 1000 * DAY);
  assert.equal(p.text, 'react hooks');
  assert.equal(p.withTerm, null);
  assert.equal(p.timeRange, null);
  assert.deepEqual(p.chips, []);
});

test('U5: a leading "with:" yields an empty text and the whole tail as the session term', () => {
  const p = recallquery.parse('with: my taxes project', 1000 * DAY);
  assert.equal(p.text, '');
  assert.equal(p.withTerm, 'my taxes project');
});

test('U5: "today" / "yesterday" / "this morning" map to the right windows', () => {
  const now = new Date(2026, 5, 23, 15, 0).getTime(); // mid-afternoon
  const sod = startOfDay(now);
  assert.deepEqual(recallquery.parse('today', now).timeRange, { from: sod, to: sod + DAY });
  assert.deepEqual(recallquery.parse('yesterday', now).timeRange, { from: sod - DAY, to: sod });
  assert.deepEqual(recallquery.parse('this morning', now).timeRange, { from: sod, to: sod + 12 * 3600000 });
});

test('U5: "this week" spans from the start of the calendar week through end of today', () => {
  const now = new Date(2026, 5, 23, 9, 0).getTime();
  const r = recallquery.parse('this week', now).timeRange;
  const sod = startOfDay(now);
  assert.ok(r.from <= sod, 'starts at or before today');
  assert.equal(r.to, sod + DAY);
  assert.equal(new Date(r.from).getHours(), 0, 'week start is a local midnight');
});

test('U5/Pattern 25: "last <weekday>" resolves to the prior weekday at SEVERAL fixed nows', () => {
  // Walk seven consecutive days; "last tuesday" must always land on a Tuesday that
  // is strictly before today and no more than 7 days back (no off-by-a-week).
  for (let d = 0; d < 7; d++) {
    const now = new Date(2026, 5, 21 + d, 11, 0).getTime();
    const r = recallquery.parse('last tuesday', now).timeRange;
    assert.equal(new Date(r.from).getDay(), 2, `from is a Tuesday (day +${d})`);
    assert.equal(r.to - r.from, DAY, 'window is exactly one day');
    assert.ok(r.from < startOfDay(now), 'strictly before today');
    assert.ok(startOfDay(now) - r.from <= 7 * DAY, 'within the last 7 days');
  }
});

test('U5: a time phrase and "with:" combine; chips carry labels + removable phrases', () => {
  const now = new Date(2026, 5, 23).getTime();
  const p = recallquery.parse('design last friday with: tax', now);
  assert.equal(p.text, 'design');
  assert.equal(p.withTerm, 'tax');
  assert.equal(new Date(p.timeRange.from).getDay(), 5); // Friday
  assert.equal(p.chips.length, 2);
  const withChip = p.chips.find((c) => c.kind === 'with');
  const timeChip = p.chips.find((c) => c.kind === 'time');
  assert.equal(withChip.label, 'tax');
  assert.equal(withChip.phrase, 'with: tax');     // the exact substring to strip on dismiss
  assert.equal(timeChip.label, 'last friday');
  assert.equal(timeChip.phrase, 'last friday');
});

test('U5: empty / whitespace input is inert', () => {
  const p = recallquery.parse('   ', 1000 * DAY);
  assert.equal(p.text, '');
  assert.equal(p.withTerm, null);
  assert.equal(p.timeRange, null);
});

test('U5: a time phrase mid-free-text is lifted out cleanly', () => {
  const now = new Date(2026, 5, 23).getTime();
  const p = recallquery.parse('react last tuesday hooks', now);
  assert.equal(p.text, 'react hooks');
  assert.equal(new Date(p.timeRange.from).getDay(), 2);
  assert.equal(p.withTerm, null);
});

test('U5: ALL recognized time phrases are stripped — a duplicate/second phrase never leaks into the text', () => {
  const now = new Date(2026, 5, 23, 15).getTime();
  const sod = startOfDay(now);
  const dup = recallquery.parse('today today', now);
  assert.equal(dup.text, '', 'both "today"s removed — none lingers as a search term');
  assert.deepEqual(dup.timeRange, { from: sod, to: sod + DAY });
  assert.equal(dup.chips.length, 1);

  const two = recallquery.parse('today yesterday', now);
  assert.equal(two.text, '', 'the second phrase is not left as a literal content-search term');
  assert.deepEqual(two.timeRange, { from: sod, to: sod + DAY }, 'first phrase wins the range');
});

test('U5: dismiss round-trip — collapsing a chip and re-parsing leaves no chip (the dismiss contract)', () => {
  const now = new Date(2026, 5, 23).getTime();
  const reparse = (p, dismissIdx) => {
    const parts = [p.text];
    p.chips.forEach((c, i) => parts.push(i === dismissIdx ? (c.collapse || '') : c.phrase));
    return recallquery.parse(parts.filter(Boolean).join(' ').trim(), now);
  };
  // with: collapses to plain text — the term is KEPT as search text, not dropped.
  const w = recallquery.parse('github with: tax research', now);
  assert.equal(w.chips[0].collapse, 'tax research');
  const afterW = reparse(w, 0);
  assert.equal(afterW.withTerm, null);
  assert.equal(afterW.chips.length, 0);
  assert.equal(afterW.text, 'github tax research', 'the session term survives as plain text');

  // time collapses away; the duplicate-word case must become dismissable (no re-trigger).
  const t = recallquery.parse('today today', now);
  assert.equal(reparse(t, 0).chips.length, 0, 'dismissing the time chip clears it for good');
});
