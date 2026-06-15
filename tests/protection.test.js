'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const protection = require('../extension/lib/protection.js');

test('protect then isProtected matches the host family (www / subdomains)', () => {
  const s = protection.emptyState();
  protection.protect(s, 'news.com');
  assert.equal(protection.isProtected(s, 'news.com'), true);
  assert.equal(protection.isProtected(s, 'www.news.com'), true);   // www variant
  assert.equal(protection.isProtected(s, 'sub.news.com'), true);   // subdomain
  assert.equal(protection.isProtected(s, 'othernews.com'), false); // not a suffix match
  assert.equal(protection.isProtected(s, 'other.com'), false);
});

test('host-key consistency: protecting a www/subdomain host stores the registrable family', () => {
  const s = protection.emptyState();
  protection.protect(s, 'www.news.com');        // a record stored under the www host
  assert.deepEqual(protection.list(s), ['news.com']);
  assert.equal(protection.isProtected(s, 'news.com'), true); // checked under the bare host → still fires
});

test('unprotect removes the domain', () => {
  const s = protection.emptyState();
  protection.protect(s, 'news.com');
  protection.unprotect(s, 'news.com');
  assert.equal(protection.isProtected(s, 'news.com'), false);
  assert.deepEqual(protection.list(s), []);
});

test('deleteByDomain purges the host and anything beneath it', () => {
  const s = protection.emptyState();
  protection.protect(s, 'news.com');
  protection.protect(s, 'blog.example.com');
  protection.deleteByDomain(s, 'example.com'); // forgetting the parent clears the subdomain entry
  assert.deepEqual(protection.list(s), ['news.com']);
  protection.deleteByDomain(s, 'news.com');
  assert.deepEqual(protection.list(s), []);
});

test('forgetting a subdomain does NOT un-protect the parent family', () => {
  const s = protection.emptyState();
  protection.protect(s, 'news.com');
  protection.deleteByDomain(s, 'sub.news.com'); // forgetting a child must not clear the parent
  assert.equal(protection.isProtected(s, 'news.com'), true);
  assert.deepEqual(protection.list(s), ['news.com']);
});

test('state round-trips through JSON (persisted, not in-memory-only)', () => {
  const s = protection.emptyState();
  protection.protect(s, 'news.com');
  const revived = JSON.parse(JSON.stringify(s));
  assert.equal(protection.isProtected(revived, 'www.news.com'), true);
});

test('empty / falsy hosts never protect', () => {
  const s = protection.emptyState();
  protection.protect(s, '');
  assert.deepEqual(protection.list(s), []);
  assert.equal(protection.isProtected(s, ''), false);
});
