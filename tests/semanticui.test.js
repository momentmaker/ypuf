'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const semanticui = require('../extension/lib/semanticui.js');

// The pure "recall by meaning" settings-state resolver (U6). The DOM glue in
// newtab.js is impure shell (manual dogfood); this proves the decidable state
// machine has no gap — every SW-state × phase combination resolves to exactly one
// of the nine committed view states.

const SW = (enabled, ready, cached) => ({ enabled, ready, cached });

// --- steady state (phase 'idle'): the SW state alone decides ---------------

test('off by default: not enabled -> off', () => {
  assert.equal(semanticui.resolve(SW(false, false, false), 'idle'), 'off');
});

test('enabled + ready -> ready (semantic live)', () => {
  assert.equal(semanticui.resolve(SW(true, true, true), 'idle'), 'ready');
});

test('enabled + cached but not yet loaded -> preparing (cold-wake window)', () => {
  assert.equal(semanticui.resolve(SW(true, false, true), 'idle'), 'preparing');
});

test('enabled but asset evicted (not cached) -> evicted', () => {
  assert.equal(semanticui.resolve(SW(true, false, false), 'idle'), 'evicted');
});

test('ready wins even if cached flag is stale-false (model is loaded)', () => {
  assert.equal(semanticui.resolve(SW(true, true, false), 'idle'), 'ready');
});

// --- a mid-gesture phase overrides the steady-state view -------------------

test('disclosing phase -> disclosure regardless of SW state', () => {
  assert.equal(semanticui.resolve(SW(false, false, false), 'disclosing'), 'disclosure');
});

test('downloading phase -> in-progress', () => {
  assert.equal(semanticui.resolve(SW(false, false, false), 'downloading'), 'in-progress');
});

test('denied phase -> permission-denied', () => {
  assert.equal(semanticui.resolve(SW(false, false, false), 'denied'), 'permission-denied');
});

test('failed phase -> failure', () => {
  assert.equal(semanticui.resolve(SW(false, false, false), 'failed'), 'failure');
});

test('confirming phase -> off-confirm (even while enabled+ready underneath)', () => {
  assert.equal(semanticui.resolve(SW(true, true, true), 'confirming'), 'off-confirm');
});

test('a missing/undefined phase is treated as idle', () => {
  assert.equal(semanticui.resolve(SW(false, false, false)), 'off');
  assert.equal(semanticui.resolve(SW(true, true, true), undefined), 'ready');
});

test('a missing SW state is treated as off (safe default)', () => {
  assert.equal(semanticui.resolve(undefined, 'idle'), 'off');
});

// --- every resolved state is one of the nine committed view states ---------

test('resolve only ever yields a known view state', () => {
  const KNOWN = new Set(['off', 'disclosure', 'in-progress', 'permission-denied',
    'failure', 'preparing', 'ready', 'evicted', 'off-confirm']);
  const phases = ['idle', 'disclosing', 'downloading', 'denied', 'failed', 'confirming'];
  for (const enabled of [false, true]) {
    for (const ready of [false, true]) {
      for (const cached of [false, true]) {
        for (const phase of phases) {
          const s = semanticui.resolve(SW(enabled, ready, cached), phase);
          assert.ok(KNOWN.has(s), `unknown state ${s} for ${enabled}/${ready}/${cached}/${phase}`);
        }
      }
    }
  }
});

// --- toggle affordance helpers ---------------------------------------------

test('toggleOn: on for the enabled-or-mid-enable states, off otherwise', () => {
  for (const s of ['ready', 'in-progress', 'preparing', 'evicted', 'off-confirm']) {
    assert.equal(semanticui.toggleOn(s), true, `${s} should read on`);
  }
  for (const s of ['off', 'disclosure', 'permission-denied', 'failure']) {
    assert.equal(semanticui.toggleOn(s), false, `${s} should read off`);
  }
});

test('toggleLocked: only the in-flight download/load states lock the switch', () => {
  assert.equal(semanticui.toggleLocked('in-progress'), true);
  assert.equal(semanticui.toggleLocked('preparing'), true);
  for (const s of ['off', 'disclosure', 'ready', 'failure', 'evicted', 'off-confirm', 'permission-denied']) {
    assert.equal(semanticui.toggleLocked(s), false, `${s} should not lock`);
  }
});

// --- the committed disclosure copy is the exact required string ------------

test('DISCLOSURE_COPY is the committed string (no drift)', () => {
  assert.equal(
    semanticui.DISCLOSURE_COPY,
    "Recall by meaning downloads a ~30MB model once from ypuf's GitHub — nothing "
    + 'from your pages or searches ever leaves your device. Keyword recall keeps '
    + 'working while it loads.',
  );
});
