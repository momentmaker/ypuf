'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const returnwindow = require('../extension/lib/returnwindow.js');

// Fixed reference: Wednesday 2026-06-17 10:00 local (so weekday math is deterministic).
const NOW = new Date(2026, 5, 17, 10, 0, 0, 0).getTime();
const at = (y, mo, d, h = 9, mi = 0) => new Date(y, mo, d, h, mi).getTime();
const rec = (id, over) => Object.assign({ id, snoozeState: 'snoozed' }, over);
const keys = (groups) => groups.map((g) => g.key);
const byKey = (groups) => Object.fromEntries(groups.map((g) => [g.key, g.items.map((i) => i.id)]));

test('windows groups by return window, soonest first, untilStartup last', () => {
  const records = [
    rec('startup', { untilStartup: true }),
    rec('later', { returnAt: at(2026, 5, 30) }),         // > 2 weeks
    rec('nextweek', { returnAt: at(2026, 5, 22) }),      // Mon after this weekend
    rec('weekend', { returnAt: at(2026, 5, 20) }),       // Sat
    rec('thisweek', { returnAt: at(2026, 5, 19) }),      // Fri (later this week)
    rec('tomorrow', { returnAt: at(2026, 5, 18) }),      // Thu
    rec('evening', { returnAt: at(2026, 5, 17, 18) }),   // today 6pm
    rec('today', { returnAt: at(2026, 5, 17, 14) }),     // today 2pm
  ];
  const groups = returnwindow.windows(records, NOW);
  assert.deepEqual(keys(groups), ['today', 'evening', 'tomorrow', 'thisweek', 'weekend', 'nextweek', 'later', 'startup']);
  assert.equal(groups[groups.length - 1].key, 'startup'); // untilStartup always last
});

test('the evening boundary: 18:00 today is evening, 17:59 is today', () => {
  const k = byKey(returnwindow.windows([
    rec('e', { returnAt: at(2026, 5, 17, 18, 0) }),
    rec('t', { returnAt: at(2026, 5, 17, 17, 59) }),
  ], NOW));
  assert.deepEqual(k.evening, ['e']);
  assert.deepEqual(k.today, ['t']);
});

test('the coming Saturday buckets to weekend; the Monday after to nextweek', () => {
  const k = byKey(returnwindow.windows([
    rec('sat', { returnAt: at(2026, 5, 20, 9) }),   // Sat
    rec('sun', { returnAt: at(2026, 5, 21, 9) }),   // Sun
    rec('mon', { returnAt: at(2026, 5, 22, 9) }),   // next Mon
  ], NOW));
  assert.deepEqual(k.weekend.sort(), ['sat', 'sun']);
  assert.deepEqual(k.nextweek, ['mon']);
});

test('a midweek custom time (Friday) buckets to "Later this week", not weekend', () => {
  const k = byKey(returnwindow.windows([rec('fri', { returnAt: at(2026, 5, 19, 15) })], NOW));
  assert.deepEqual(k.thisweek, ['fri']);
});

test('untilStartup buckets to startup with no returnAt, never crashes', () => {
  const groups = returnwindow.windows([rec('s', { untilStartup: true })], NOW);
  assert.equal(groups[0].key, 'startup');
  assert.equal(groups[0].label, "When you're back");
});

test('each group carries a human label', () => {
  const labels = Object.fromEntries(returnwindow.windows([
    rec('a', { returnAt: at(2026, 5, 17, 14) }),
    rec('b', { returnAt: at(2026, 5, 20, 9) }),
  ], NOW).map((g) => [g.key, g.label]));
  assert.equal(labels.today, 'Later today');
  assert.equal(labels.weekend, 'This weekend');
});

test('empty groups dropped; intra-group order preserved (caller pre-sorts)', () => {
  const groups = returnwindow.windows([
    rec('a', { returnAt: at(2026, 5, 17, 11) }),
    rec('b', { returnAt: at(2026, 5, 17, 15) }),
  ], NOW);
  assert.deepEqual(keys(groups), ['today']);
  assert.deepEqual(groups[0].items.map((i) => i.id), ['a', 'b']);
});

test('an overdue-but-still-snoozed returnAt buckets to the soonest window (today), never lost', () => {
  const groups = returnwindow.windows([rec('overdue', { returnAt: NOW - 86400000 })], NOW);
  assert.equal(groups[0].key, 'today');
});

test('a record with neither returnAt nor untilStartup is skipped, not crashing', () => {
  assert.deepEqual(returnwindow.windows([rec('bad', {})], NOW), []);
});

test('non-array input yields no groups', () => {
  assert.deepEqual(returnwindow.windows(null, NOW), []);
});

// The "Later this week" / "This weekend" windows narrow as the week advances — on
// some weekdays they collapse to nothing and their items route to nearer windows.
test('on Thursday "Later this week" collapses: Friday is tomorrow, Saturday is weekend', () => {
  const THU = new Date(2026, 5, 18, 10, 0, 0, 0).getTime();
  const k = byKey(returnwindow.windows([
    rec('fri', { returnAt: at(2026, 5, 19, 9) }),   // Fri
    rec('sat', { returnAt: at(2026, 5, 20, 9) }),   // Sat
  ], THU));
  assert.deepEqual(k.tomorrow, ['fri']);
  assert.deepEqual(k.weekend, ['sat']);
  assert.equal(k.thisweek, undefined);   // no "Later this week" group exists on a Thursday
});

test('on Saturday "This weekend" collapses: Sunday is tomorrow, Monday is nextweek', () => {
  const SAT = new Date(2026, 5, 20, 10, 0, 0, 0).getTime();
  const k = byKey(returnwindow.windows([
    rec('sun', { returnAt: at(2026, 5, 21, 9) }),   // Sun
    rec('mon', { returnAt: at(2026, 5, 22, 9) }),   // next Mon
  ], SAT));
  assert.deepEqual(k.tomorrow, ['sun']);
  assert.deepEqual(k.nextweek, ['mon']);
  assert.equal(k.weekend, undefined);   // no "This weekend" group exists on a Saturday
});
