'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const snooze = require('../extension/lib/snooze.js');

// A fixed reference moment; assertions stay timezone-independent by checking
// the resolved Date's local hour/day rather than an absolute timestamp.
const NOW = new Date(2026, 5, 17, 10, 0, 0, 0).getTime(); // Wed 2026-06-17 10:00 local

// --- resolve: clock presets -------------------------------------------------

test('later-today resolves to a few hours from now', () => {
  const { returnAt } = snooze.resolve('later-today', NOW);
  assert.equal(returnAt, NOW + 3 * 3600 * 1000);
});

test('this-evening resolves to the next 6pm', () => {
  const { returnAt } = snooze.resolve('this-evening', NOW);
  assert.ok(returnAt > NOW);
  assert.equal(new Date(returnAt).getHours(), 18);
});

test('tomorrow-morning resolves to 9am the next day', () => {
  const { returnAt } = snooze.resolve('tomorrow-morning', NOW);
  const d = new Date(returnAt);
  assert.equal(d.getHours(), 9);
  assert.equal(d.getDate(), new Date(NOW).getDate() + 1);
});

test('this-weekend resolves to a Saturday 9am in the future', () => {
  const { returnAt } = snooze.resolve('this-weekend', NOW);
  const d = new Date(returnAt);
  assert.equal(d.getDay(), 6); // Saturday
  assert.equal(d.getHours(), 9);
  assert.ok(returnAt > NOW);
});

test('next-week resolves to a future Monday 9am at least a few days out', () => {
  const { returnAt } = snooze.resolve('next-week', NOW);
  const d = new Date(returnAt);
  assert.equal(d.getDay(), 1); // Monday
  assert.equal(d.getHours(), 9);
  assert.ok(returnAt - NOW >= 4 * 86400000); // strictly next week, not this week
});

test('custom resolves to the passed timestamp', () => {
  const ts = NOW + 999999;
  assert.deepEqual(snooze.resolve('custom', NOW, ts), { returnAt: ts });
});

test('this-evening past 6pm rolls to tomorrow evening', () => {
  const evening = new Date(2026, 5, 17, 20, 0, 0, 0).getTime(); // 8pm
  const { returnAt } = snooze.resolve('this-evening', evening);
  const d = new Date(returnAt);
  assert.equal(d.getHours(), 18);
  assert.equal(d.getDate(), new Date(evening).getDate() + 1);
});

// --- resolve: the "when I'm back" flag (no numeric sentinel) -----------------

test('when-im-back resolves to an untilStartup flag with no returnAt', () => {
  const sched = snooze.resolve('when-im-back', NOW);
  assert.deepEqual(sched, { untilStartup: true });
  assert.equal(sched.returnAt, undefined);
});

test('an unknown preset throws', () => {
  assert.throws(() => snooze.resolve('whenever', NOW));
});

// --- selection helpers ------------------------------------------------------

const recs = () => [
  { id: 'a', snoozeState: 'snoozed', returnAt: NOW - 1000 },   // overdue clock
  { id: 'b', snoozeState: 'snoozed', returnAt: NOW + 1000 },   // future clock
  { id: 'c', snoozeState: 'snoozed', untilStartup: true },     // startup
  { id: 'd', snoozeState: 'back-now', returnAt: NOW - 5000 },  // already returned
  { id: 'e' },                                                 // not snoozed
];

test('dueSnoozes selects only overdue numeric-returnAt snoozed records', () => {
  assert.deepEqual(snooze.dueSnoozes(recs(), NOW).map((r) => r.id), ['a']);
});

test('dueSnoozes never selects an untilStartup record (when-im-back is not clock-due)', () => {
  const due = snooze.dueSnoozes(recs(), NOW + 1e12); // far future
  assert.ok(!due.some((r) => r.id === 'c'));
  assert.deepEqual(due.map((r) => r.id), ['a', 'b']);
});

test('pendingClock returns the snoozed numeric-returnAt records (the re-arm set)', () => {
  assert.deepEqual(snooze.pendingClock(recs()).map((r) => r.id), ['a', 'b']);
});

test('pendingStartup returns the snoozed untilStartup records', () => {
  assert.deepEqual(snooze.pendingStartup(recs()).map((r) => r.id), ['c']);
});

// --- mark -------------------------------------------------------------------

test('mark sets snoozeState without touching other fields', () => {
  const r = snooze.mark({ id: 'a', returnAt: 5, title: 'X' }, 'back-now');
  assert.equal(r.snoozeState, 'back-now');
  assert.equal(r.returnAt, 5);
  assert.equal(r.title, 'X');
});

test('mark(record, null) clears the snooze fields (reopen → normal tab)', () => {
  const r = snooze.mark({ id: 'a', snoozeState: 'snoozed', returnAt: 5, untilStartup: undefined, title: 'X' }, null);
  assert.equal(r.snoozeState, null);
  assert.equal('returnAt' in r, false);
  assert.equal('untilStartup' in r, false);
  assert.equal(r.title, 'X');
});
