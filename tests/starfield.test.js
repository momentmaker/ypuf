'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const starfield = require('../extension/lib/starfield.js');

test('generate returns `count` stars', () => {
  assert.equal(starfield.generate(50, 800, 600, 1).length, 50);
  assert.equal(starfield.generate(0, 800, 600, 1).length, 0);
});

test('every star sits within [0,w] × [0,h] with a capped opacity and a twinkle phase', () => {
  const stars = starfield.generate(300, 1024, 768, 7);
  for (const s of stars) {
    assert.ok(s.x >= 0 && s.x <= 1024, `x=${s.x}`);
    assert.ok(s.y >= 0 && s.y <= 768, `y=${s.y}`);
    assert.ok(s.r > 0, `r=${s.r}`);
    assert.ok(s.a > 0 && s.a <= starfield.ALPHA_CAP, `a=${s.a} > cap ${starfield.ALPHA_CAP}`);
    assert.ok(s.phase >= 0 && s.phase < Math.PI * 2, `phase=${s.phase}`);
  }
});

test('the field is deterministic — the same seed yields the identical field', () => {
  assert.deepEqual(starfield.generate(40, 500, 500, 42), starfield.generate(40, 500, 500, 42));
});

test('different seeds yield different fields (the PRNG actually varies)', () => {
  const a = starfield.generate(40, 500, 500, 1);
  const b = starfield.generate(40, 500, 500, 2);
  assert.notDeepEqual(a, b);
});

test('a non-positive / non-finite count yields an empty field (no crash)', () => {
  assert.deepEqual(starfield.generate(-5, 500, 500, 1), []);
  assert.deepEqual(starfield.generate(NaN, 500, 500, 1), []);
  assert.deepEqual(starfield.generate(undefined, 500, 500, 1), []);
});
