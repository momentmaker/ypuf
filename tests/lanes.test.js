'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const lanes = require('../extension/lib/lanes.js');

const COLS = 3;
const ids = (panels) => panels.map((p) => p.id);
// flat order within a single lane (the rendered top-to-bottom order of one column)
const lane = (panels, col) => panels.filter((p) => lanes.colOf(p, COLS) === col).map((p) => p.id);

test('colOf clamps non-integer / out-of-range / missing col to lane 0; valid passes through', () => {
  assert.equal(lanes.colOf({ col: 0 }, COLS), 0);
  assert.equal(lanes.colOf({ col: 2 }, COLS), 2);
  assert.equal(lanes.colOf({ col: 3 }, COLS), 0);   // == cols → out of range
  assert.equal(lanes.colOf({ col: -1 }, COLS), 0);
  assert.equal(lanes.colOf({ col: 99 }, COLS), 0);
  assert.equal(lanes.colOf({ col: 1.5 }, COLS), 0); // non-integer
  assert.equal(lanes.colOf({ col: '1' }, COLS), 1); // numeric string coerces to a valid integer lane
  assert.equal(lanes.colOf({ col: 'x' }, COLS), 0); // non-numeric string → NaN → lane 0
  assert.equal(lanes.colOf({}, COLS), 0);           // no col
  assert.equal(lanes.colOf(null, COLS), 0);
});

test('reorderInto drops src into the target lane, before the target', () => {
  const panels = [{ id: 'a', col: 0 }, { id: 'b', col: 0 }, { id: 'c', col: 1 }];
  assert.equal(lanes.reorderInto(panels, 'a', 'c', true, COLS), true);
  // a took c's lane (1) and sits before c in flat order
  assert.deepEqual(ids(panels), ['b', 'a', 'c']);
  assert.equal(panels.find((p) => p.id === 'a').col, 1);
  assert.deepEqual(lane(panels, 1), ['a', 'c']);
});

test('reorderInto with before=false places src after the target', () => {
  const panels = [{ id: 'a', col: 0 }, { id: 'b', col: 0 }, { id: 'c', col: 1 }];
  assert.equal(lanes.reorderInto(panels, 'a', 'c', false, COLS), true);
  assert.deepEqual(ids(panels), ['b', 'c', 'a']);
  assert.deepEqual(lane(panels, 1), ['c', 'a']);
});

test('reorderInto is a no-op when src === target or an id is missing', () => {
  const panels = [{ id: 'a', col: 0 }, { id: 'b', col: 1 }];
  assert.equal(lanes.reorderInto(panels, 'a', 'a', true, COLS), false);
  assert.equal(lanes.reorderInto(panels, 'a', 'zzz', true, COLS), false);
  assert.equal(lanes.reorderInto(panels, 'zzz', 'b', true, COLS), false);
  assert.deepEqual(ids(panels), ['a', 'b']);   // untouched
});

test('moveToLane sets the col and pushes to the flat end (bottom of the lane)', () => {
  const panels = [{ id: 'a', col: 0 }, { id: 'b', col: 0 }, { id: 'c', col: 2 }];
  assert.equal(lanes.moveToLane(panels, 'a', 2), true);
  assert.deepEqual(ids(panels), ['b', 'c', 'a']);
  assert.equal(panels.find((p) => p.id === 'a').col, 2);
  assert.deepEqual(lane(panels, 2), ['c', 'a']);   // a lands at the bottom of lane 2
  assert.equal(lanes.moveToLane(panels, 'nope', 1), false);
});

test('moveAcross shifts one lane and clamps at the edges', () => {
  const panels = [{ id: 'a', col: 1 }];
  assert.equal(lanes.moveAcross(panels, 'a', 1, COLS), true);
  assert.equal(panels[0].col, 2);
  assert.equal(lanes.moveAcross(panels, 'a', 1, COLS), false); // already at the last lane → no-op
  assert.equal(panels[0].col, 2);
  assert.equal(lanes.moveAcross(panels, 'a', -1, COLS), true);
  assert.equal(panels[0].col, 1);
  const left = [{ id: 'x', col: 0 }];
  assert.equal(lanes.moveAcross(left, 'x', -1, COLS), false);  // already at lane 0 → no-op
  assert.equal(lanes.moveAcross(left, 'missing', -1, COLS), false);
});

test('moveWithinLane reorders inside the lane and is a no-op at the lane ends', () => {
  const panels = [{ id: 'a', col: 0 }, { id: 'b', col: 0 }, { id: 'c', col: 0 }];
  assert.equal(lanes.moveWithinLane(panels, 'b', -1, COLS), true);   // b up
  assert.deepEqual(ids(panels), ['b', 'a', 'c']);
  assert.equal(lanes.moveWithinLane(panels, 'b', 1, COLS), true);    // b back down
  assert.deepEqual(ids(panels), ['a', 'b', 'c']);
  assert.equal(lanes.moveWithinLane(panels, 'a', -1, COLS), false);  // top of lane → no-op
  assert.equal(lanes.moveWithinLane(panels, 'c', 1, COLS), false);   // bottom of lane → no-op
  assert.deepEqual(ids(panels), ['a', 'b', 'c']);
});

test('moveWithinLane skips panels in other lanes (operates only within the lane)', () => {
  // flat: a(0) b(1) c(0) — lane 0 is [a, c]; moving a down should jump past b to below c
  const panels = [{ id: 'a', col: 0 }, { id: 'b', col: 1 }, { id: 'c', col: 0 }];
  assert.equal(lanes.moveWithinLane(panels, 'a', 1, COLS), true);
  assert.deepEqual(lane(panels, 0), ['c', 'a']);
  assert.deepEqual(lane(panels, 1), ['b']);   // lane 1 untouched
});

test('migrateCols assigns round-robin cols only to colless panels; returns false when all have cols', () => {
  const fresh = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.equal(lanes.migrateCols(fresh, COLS), true);
  assert.deepEqual(fresh.map((p) => p.col), [0, 1, 2, 0]);

  const mixed = [{ id: 'a', col: 2 }, { id: 'b' }];   // b is colless, index 1 → col 1
  assert.equal(lanes.migrateCols(mixed, COLS), true);
  assert.equal(mixed[0].col, 2);   // existing col preserved
  assert.equal(mixed[1].col, 1);

  const done = [{ id: 'a', col: 0 }, { id: 'b', col: 1 }];
  assert.equal(lanes.migrateCols(done, COLS), false);   // nothing to migrate
});
