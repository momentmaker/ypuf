'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const theme = require('../extension/lib/theme.js');

test('MODES is the canonical cycle order', () => {
  assert.deepEqual(theme.MODES, ['light', 'dark', 'star']);
});

test('next cycles light → dark → star → light', () => {
  assert.equal(theme.next('light'), 'dark');
  assert.equal(theme.next('dark'), 'star');
  assert.equal(theme.next('star'), 'light');
});

test('next on an unknown mode falls back to the first cycle step', () => {
  assert.equal(theme.next('garbage'), 'dark');   // normalize(garbage)=light → next=dark
  assert.equal(theme.next(undefined), 'dark');
});

test('normalize validates a stored value, defaulting to light', () => {
  assert.equal(theme.normalize('light'), 'light');
  assert.equal(theme.normalize('dark'), 'dark');
  assert.equal(theme.normalize('star'), 'star');
  assert.equal(theme.normalize('garbage'), 'light');
  assert.equal(theme.normalize(undefined), 'light');
  assert.equal(theme.normalize(null), 'light');
  assert.equal(theme.normalize(42), 'light');
});

test('resolveInitial: a stored mode always wins, including star', () => {
  assert.equal(theme.resolveInitial('dark', false), 'dark');
  assert.equal(theme.resolveInitial('light', true), 'light');
  assert.equal(theme.resolveInitial('star', false), 'star');   // stored star is honored
});

test('resolveInitial: with no stored mode, follow prefers-color-scheme; star is never auto-selected', () => {
  assert.equal(theme.resolveInitial(null, true), 'dark');
  assert.equal(theme.resolveInitial(null, false), 'light');
  assert.equal(theme.resolveInitial(undefined, true), 'dark');
  // a garbage stored value is not a valid mode → treated as unset → prefers-color-scheme
  assert.equal(theme.resolveInitial('garbage', true), 'dark');
  // star is only ever reached via an explicit stored choice, never from prefersDark
  assert.notEqual(theme.resolveInitial(null, true), 'star');
});
