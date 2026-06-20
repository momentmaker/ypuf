'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const focusmode = require('../extension/lib/focusmode.js');

test('MODES are the three persisted choices', () => {
  assert.deepEqual(focusmode.MODES, ['off', 'search', 'keyboard']);
});

test('normalize passes known modes through, coerces anything else to off', () => {
  assert.equal(focusmode.normalize('off'), 'off');
  assert.equal(focusmode.normalize('search'), 'search');
  assert.equal(focusmode.normalize('keyboard'), 'keyboard');
  assert.equal(focusmode.normalize(undefined), 'off');   // unset config → off
  assert.equal(focusmode.normalize(null), 'off');
  assert.equal(focusmode.normalize('Keyboard'), 'off');  // case-sensitive; unknown → off
  assert.equal(focusmode.normalize('nav'), 'off');
});

test('target returns the chosen focus target in a clean board state', () => {
  assert.equal(focusmode.target('search', {}), 'search');
  assert.equal(focusmode.target('keyboard', {}), 'keyboard');
  assert.equal(focusmode.target('off', {}), 'none');
  assert.equal(focusmode.target('search'), 'search');    // missing state == clean
});

test('off (or an unknown mode) never focuses', () => {
  assert.equal(focusmode.target('off', {}), 'none');
  assert.equal(focusmode.target('bogus', {}), 'none');
  assert.equal(focusmode.target(undefined, {}), 'none');
});

test('never steal focus when hidden, an overlay is open, or editing', () => {
  for (const mode of ['search', 'keyboard']) {
    assert.equal(focusmode.target(mode, { hidden: true }), 'none', `${mode} + hidden`);
    assert.equal(focusmode.target(mode, { overlayOpen: true }), 'none', `${mode} + overlay`);
    assert.equal(focusmode.target(mode, { editing: true }), 'none', `${mode} + editing`);
  }
});

test('a blocking state overrides even when the mode is set', () => {
  assert.equal(focusmode.target('keyboard', { hidden: false, overlayOpen: false, editing: false }), 'keyboard');
  assert.equal(focusmode.target('keyboard', { hidden: false, overlayOpen: true, editing: false }), 'none');
});
