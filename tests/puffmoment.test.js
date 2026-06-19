'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { arrival, letGo, BOX } = require('../extension/lib/puffmoment.js');

const ok01 = (v) => v >= 0 && v <= 1;
const inBox = (pt) => pt.x >= 0 && pt.x <= BOX && pt.y >= 0 && pt.y <= BOX;

test('arrival starts high + faint and ends low + bright (descends to join, fades in)', () => {
  const a = arrival(0), b = arrival(1);
  assert.ok(a.y < b.y, 'descends — y increases toward the cluster');
  assert.ok(a.opacity < b.opacity, 'fades in as it joins');
  assert.ok(a.opacity < 0.2, 'starts faint');
});

test('letGo starts at the cluster full and ends off + transparent (drifts off, fades out)', () => {
  const a = letGo(0), b = letGo(1);
  assert.ok(a.opacity > b.opacity, 'fades out');
  assert.ok(b.opacity <= 0.001, 'gone by the end');
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) > 5, 'travels off the cluster');
});

test('arrival y is monotonically non-decreasing and opacity non-decreasing', () => {
  let py = -Infinity, po = -Infinity;
  for (let p = 0; p <= 1.0001; p += 0.1) {
    const s = arrival(p);
    assert.ok(s.y >= py - 1e-9, 'y never reverses');
    assert.ok(s.opacity >= po - 1e-9, 'opacity never reverses');
    py = s.y; po = s.opacity;
  }
});

test('letGo opacity is monotonically non-increasing', () => {
  let po = Infinity;
  for (let p = 0; p <= 1.0001; p += 0.1) {
    const o = letGo(p).opacity;
    assert.ok(o <= po + 1e-9, 'opacity never rises');
    po = o;
  }
});

test('progress clamps to [0,1] — out of range matches the endpoints', () => {
  assert.deepEqual(arrival(-1), arrival(0));
  assert.deepEqual(arrival(2), arrival(1));
  assert.deepEqual(letGo(-3), letGo(0));
  assert.deepEqual(letGo(5), letGo(1));
});

test('every sample is well-formed: finite, in-box, opacity in [0,1]', () => {
  for (const fn of [arrival, letGo]) {
    for (let p = 0; p <= 1.0001; p += 0.25) {
      const s = fn(p);
      for (const k of ['x', 'y', 'r', 'opacity']) {
        assert.ok(typeof s[k] === 'number' && Number.isFinite(s[k]), `${k} finite`);
      }
      assert.ok(inBox(s), 'inside the box');
      assert.ok(ok01(s.opacity), 'opacity in [0,1]');
    }
  }
});

test('deterministic: same progress → identical output', () => {
  assert.deepEqual(arrival(0.37), arrival(0.37));
  assert.deepEqual(letGo(0.62), letGo(0.62));
});
