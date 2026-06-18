'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const digest = require('../extension/lib/digest.js');

const DAY = 86400000;
const NOW = 1_700_000_000_000;
const ago = (days) => NOW - days * DAY;

test('counts auto-closed let-gos within the last 7 days; lost is always 0', () => {
  // Production shape: store.put defaults lastAccessed to timestamp, so a never-recalled
  // record has lastAccessed === timestamp — it must NOT count as recalled.
  const recs = [
    { autoClosed: true, timestamp: ago(1), lastAccessed: ago(1) },
    { autoClosed: true, timestamp: ago(6), lastAccessed: ago(6) },
    { autoClosed: true, timestamp: ago(8), lastAccessed: ago(8) },   // outside the week → excluded
  ];
  assert.deepEqual(digest.compute(recs, NOW), { letGo: 2, recalled: 0, lost: 0 });
});

test('recalled counts only genuine re-opens (lastAccessed > timestamp), not fresh let-gos', () => {
  const recs = [
    { autoClosed: true, timestamp: ago(10), lastAccessed: ago(1) }, // recalled this week, let go 10d ago
    { autoClosed: true, timestamp: ago(2), lastAccessed: ago(2) },  // born-equal → never recalled
  ];
  const d = digest.compute(recs, NOW);
  assert.equal(d.recalled, 1);     // only the genuine re-open (lastAccessed strictly after let-go)
  assert.equal(d.letGo, 1);        // only the 2-day-old let-go is in-week
});

test('non-auto-closed records (manual let-go, snooze) never inflate the counts', () => {
  const recs = [
    { autoClosed: false, timestamp: ago(1), lastAccessed: ago(1) }, // manual → excluded
    { timestamp: ago(1), lastAccessed: ago(1) },                    // no flag → excluded
    { autoClosed: true, timestamp: ago(1) },                        // the only one counted
  ];
  assert.deepEqual(digest.compute(recs, NOW), { letGo: 1, recalled: 0, lost: 0 });
});

test('the 7-day window is half-open: exactly 7d old is excluded, a hair under is included', () => {
  assert.deepEqual(digest.compute([{ autoClosed: true, timestamp: ago(7) }], NOW), { letGo: 0, recalled: 0, lost: 0 });
  assert.deepEqual(digest.compute([{ autoClosed: true, timestamp: NOW - 7 * DAY + 1 }], NOW), { letGo: 1, recalled: 0, lost: 0 });
});

test('empty / non-array / missing-field / future-timestamp inputs are safe', () => {
  assert.deepEqual(digest.compute([], NOW), { letGo: 0, recalled: 0, lost: 0 });
  assert.deepEqual(digest.compute(null, NOW), { letGo: 0, recalled: 0, lost: 0 });
  // an auto-closed record with no timestamp/lastAccessed at all → the typeof guard excludes it
  assert.deepEqual(digest.compute([{ autoClosed: true }], NOW), { letGo: 0, recalled: 0, lost: 0 });
  // a future timestamp (clock skew) is not "within the last 7 days" — excluded
  assert.deepEqual(digest.compute([{ autoClosed: true, timestamp: NOW + DAY }], NOW), { letGo: 0, recalled: 0, lost: 0 });
});
