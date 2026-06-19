'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const timegroup = require('../extension/lib/timegroup.js');

const NOW = new Date(2026, 5, 18, 14, 0, 0, 0).getTime(); // Thu 2026-06-18 14:00 local
const at = (y, mo, d, h = 12) => new Date(y, mo, d, h).getTime();
const item = (id, ts) => ({ id, timestamp: ts });
const byKey = (groups) => Object.fromEntries(groups.map((g) => [g.key, g.items.map((i) => i.id)]));

test('bucketByTime groups into Today/Yesterday/this-week/Earlier, newest groups first', () => {
  const items = [
    item('today1', at(2026, 5, 18, 9)),
    item('yest', at(2026, 5, 17, 20)),
    item('wk', at(2026, 5, 15, 10)),   // 3 days ago → earlier this week
    item('old', at(2026, 5, 1, 10)),   // earlier
  ];
  const groups = timegroup.bucketByTime(items, NOW);
  assert.deepEqual(groups.map((g) => g.key), ['today', 'yesterday', 'week', 'earlier']);
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.id)), [['today1'], ['yest'], ['wk'], ['old']]);
});

test('empty groups are dropped', () => {
  const groups = timegroup.bucketByTime([item('a', at(2026, 5, 18, 9))], NOW);
  assert.deepEqual(groups.map((g) => g.key), ['today']);
});

test('item order within a group is preserved (caller pre-sorts newest-first)', () => {
  const items = [item('a', at(2026, 5, 18, 13)), item('b', at(2026, 5, 18, 9))];
  const [today] = timegroup.bucketByTime(items, NOW);
  assert.deepEqual(today.items.map((i) => i.id), ['a', 'b']);
});

test('midnight boundary: exactly start-of-today is Today, one ms before is Yesterday', () => {
  const startToday = new Date(2026, 5, 18, 0, 0, 0, 0).getTime();
  const k = byKey(timegroup.bucketByTime([item('mid', startToday), item('pre', startToday - 1)], NOW));
  assert.deepEqual(k.today, ['mid']);
  assert.deepEqual(k.yesterday, ['pre']);
});

test('7-day boundary separates "earlier this week" from "earlier"', () => {
  const startToday = new Date(2026, 5, 18, 0, 0, 0, 0).getTime();
  const within = startToday - 6 * 86400000 + 1000;
  const beyond = startToday - 7 * 86400000 - 1000;
  const k = byKey(timegroup.bucketByTime([item('w', within), item('e', beyond)], NOW));
  assert.ok(k.week.includes('w'));
  assert.ok(k.earlier.includes('e'));
});

test('a missing timestamp falls to Earlier (never crashes)', () => {
  const groups = timegroup.bucketByTime([{ id: 'x' }], NOW);
  assert.equal(groups[0].key, 'earlier');
});

test('non-array input yields no groups', () => {
  assert.deepEqual(timegroup.bucketByTime(null, NOW), []);
});

test('week boundary: a record exactly at weekAgo lands in "Earlier this week"', () => {
  const startToday = new Date(2026, 5, 18, 0, 0, 0, 0).getTime();
  const weekAgo = startToday - 7 * 86400000;
  const k = byKey(timegroup.bucketByTime([item('edge', weekAgo)], NOW));
  assert.deepEqual(k.week, ['edge']);
});

// --- split: cap / overflow partition for "Show N more" ----------------------

const ids = (a) => a.map((x) => x.id);
const five = [1, 2, 3, 4, 5].map((n) => ({ id: 'i' + n }));

test('split: a group shorter than the cap shows everything, no overflow', () => {
  const { visible, rest } = timegroup.split(five, 6);
  assert.deepEqual(ids(visible), ['i1', 'i2', 'i3', 'i4', 'i5']);
  assert.deepEqual(rest, []);
});

test('split: a group exactly at the cap shows everything, no overflow', () => {
  const { visible, rest } = timegroup.split(five, 5);
  assert.equal(visible.length, 5);
  assert.deepEqual(rest, []);
});

test('split: cap+1 shows cap, overflows the remainder (the moreButton count)', () => {
  const { visible, rest } = timegroup.split(five, 4);
  assert.deepEqual(ids(visible), ['i1', 'i2', 'i3', 'i4']);
  assert.deepEqual(ids(rest), ['i5']);
});

test('split: a falsy cap shows everything (no capping)', () => {
  assert.deepEqual(timegroup.split(five, 0).visible.length, 5);
  assert.deepEqual(timegroup.split(five, 0).rest, []);
});

test('split: non-array input is safe', () => {
  assert.deepEqual(timegroup.split(null, 4), { visible: [], rest: [] });
});
