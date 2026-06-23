'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const signal = require('../extension/lib/signal.js');
const exclusion = require('../extension/lib/exclusion.js');

const deps = (over) => Object.assign({ classify: exclusion.classify, userBlocklist: [], active: null, durable: signal.emptyState() }, over);

test('switching focus flushes elapsed foreground time to dwell', () => {
  let s = signal.activate({ url: 'https://a.com/x', incognito: false }, 1000, deps());
  // 1000 -> 4000 on a.com, then switch to b.com
  s = signal.activate({ url: 'https://b.com/y', incognito: false }, 4000, deps({ active: s.active, durable: s.durable }));
  assert.equal(s.durable.dwell['https://a.com/x'], 3000);
  assert.equal(s.durable.dwell['https://b.com/y'], undefined); // not flushed until it loses focus
});

test('dwell accumulates correctly across a simulated SW termination', () => {
  // State only ever lives in the passed `durable`/`active` objects (i.e. storage),
  // never in-memory — so reconstructing them between calls is faithful.
  let s = signal.activate({ url: 'https://a.com', incognito: false }, 0, deps());
  // "SW dies"; on wake the durable+active come back from storage:
  const revived = deps({ active: s.active, durable: s.durable });
  s = signal.blur(5000, revived);
  assert.equal(s.durable.dwell['https://a.com'], 5000);
  assert.equal(s.active, null);
});

test('Chrome unfocused pauses; refocus resumes (no double count)', () => {
  let s = signal.activate({ url: 'https://a.com', incognito: false }, 0, deps());
  s = signal.blur(2000, deps({ active: s.active, durable: s.durable })); // 2000ms accrued
  s = signal.blur(9999, deps({ active: s.active, durable: s.durable })); // already blurred -> no-op
  assert.equal(s.durable.dwell['https://a.com'], 2000);
  s = signal.activate({ url: 'https://a.com', incognito: false }, 10000, deps({ active: s.active, durable: s.durable }));
  s = signal.blur(10500, deps({ active: s.active, durable: s.durable }));
  assert.equal(s.durable.dwell['https://a.com'], 2500);
});

test('revisits increment per URL; distinct URLs track independently', () => {
  let s = signal.activate({ url: 'https://a.com', incognito: false }, 0, deps());
  s = signal.activate({ url: 'https://b.com', incognito: false }, 1, deps({ active: s.active, durable: s.durable }));
  s = signal.activate({ url: 'https://a.com', incognito: false }, 2, deps({ active: s.active, durable: s.durable }));
  assert.equal(s.durable.revisits['https://a.com'], 2);
  assert.equal(s.durable.revisits['https://b.com'], 1);
});

test('incognito and blocklisted tabs write NO key whatsoever', () => {
  let s = signal.activate({ url: 'https://secret.com', incognito: true }, 0, deps());
  s = signal.activate({ url: 'https://www.chase.com/x', incognito: false }, 100, deps({ active: s.active, durable: s.durable }));
  assert.deepEqual(Object.keys(s.durable.dwell), []);
  assert.deepEqual(Object.keys(s.durable.revisits), []);
});

test('deleteByDomain removes all of a domain’s dwell + revisit signal', () => {
  const durable = signal.emptyState();
  durable.dwell['https://bank.com/a'] = 5; durable.revisits['https://bank.com/a'] = 2;
  durable.dwell['https://sub.bank.com/b'] = 3; durable.revisits['https://sub.bank.com/b'] = 1;
  durable.dwell['https://news.com/c'] = 9; durable.revisits['https://news.com/c'] = 4;
  signal.deleteByDomain('bank.com', durable);
  assert.deepEqual(Object.keys(durable.dwell), ['https://news.com/c']);
  assert.deepEqual(Object.keys(durable.revisits), ['https://news.com/c']);
});

// --- U8: lastActiveAt (recency) + retention -------------------------------

test('emptyState carries a lastActiveAt map; activate stamps it with the injected now', () => {
  assert.deepEqual(signal.emptyState().lastActiveAt, {});
  const s = signal.activate({ url: 'https://a.com/x', incognito: false }, 7777, deps());
  assert.equal(s.durable.lastActiveAt['https://a.com/x'], 7777);
});

test('activate tolerates a pre-U8 durable with no lastActiveAt map', () => {
  const legacy = { dwell: {}, revisits: {} }; // a durable persisted before U8
  const s = signal.activate({ url: 'https://a.com', incognito: false }, 42, deps({ durable: legacy }));
  assert.equal(s.durable.lastActiveAt['https://a.com'], 42);
});

test('deleteByUrl and deleteByDomain also clear lastActiveAt (forget leaves no rhythm residue)', () => {
  const durable = signal.emptyState();
  durable.dwell['https://e.com/a'] = 1; durable.revisits['https://e.com/a'] = 1; durable.lastActiveAt['https://e.com/a'] = 100;
  durable.lastActiveAt['https://e.com/b'] = 200; durable.dwell['https://e.com/b'] = 2;
  signal.deleteByUrl('https://e.com/a', durable);
  assert.equal(durable.lastActiveAt['https://e.com/a'], undefined);
  signal.deleteByDomain('e.com', durable);
  assert.deepEqual(Object.keys(durable.lastActiveAt), []);
});

test('pruneStale drops dwell+revisits+lastActiveAt for URLs not active within the window, keeps fresh ones', () => {
  const now = 1000 * 86400000;
  const durable = signal.emptyState();
  const stale = 'https://old.com/x', fresh = 'https://new.com/y';
  durable.dwell[stale] = 9; durable.revisits[stale] = 3; durable.lastActiveAt[stale] = now - 200 * 86400000;
  durable.dwell[fresh] = 1; durable.revisits[fresh] = 1; durable.lastActiveAt[fresh] = now - 1 * 86400000;
  const removed = signal.pruneStale(durable, now, 180 * 86400000);
  assert.equal(removed, 1);
  assert.deepEqual(Object.keys(durable.lastActiveAt), [fresh]);
  assert.deepEqual(Object.keys(durable.dwell), [fresh]);
  assert.deepEqual(Object.keys(durable.revisits), [fresh]);
});

test('pruneStale keeps a URL active EXACTLY at the cutoff (strict <), drops one just past it', () => {
  const now = 1000 * 86400000;
  const maxAge = 180 * 86400000;
  const d = signal.emptyState();
  d.lastActiveAt['https://e.com/at'] = now - maxAge;        // exactly at cutoff -> kept
  d.lastActiveAt['https://e.com/past'] = now - maxAge - 1;  // one ms older -> dropped
  d.dwell['https://e.com/at'] = 1; d.dwell['https://e.com/past'] = 1;
  assert.equal(signal.pruneStale(d, now, maxAge), 1);
  assert.deepEqual(Object.keys(d.lastActiveAt), ['https://e.com/at']);
});
