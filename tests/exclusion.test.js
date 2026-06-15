'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { classify, DEFAULT_BLOCKLIST } = require('../extension/lib/exclusion.js');

test('AE2: incognito is never indexed regardless of URL', () => {
  const r = classify({ url: 'https://en.wikipedia.org/wiki/Cat', incognito: true });
  assert.equal(r.kind, 'never-index');
});

test('AE3: blocklisted banking host is metadata-only with query stripped', () => {
  const r = classify({ url: 'https://www.chase.com/account?id=12345&tok=secret', incognito: false });
  assert.equal(r.kind, 'metadata-only');
  assert.equal(r.url, 'https://www.chase.com/account'); // query stripped, path kept
  assert.equal(r.host, 'www.chase.com');
});

test('restricted schemes and the Web Store are metadata-only (uninjectable)', () => {
  assert.equal(classify({ url: 'chrome://settings', incognito: false }).kind, 'metadata-only');
  assert.equal(classify({ url: 'about:blank', incognito: false }).kind, 'metadata-only');
  assert.equal(classify({ url: 'view-source:https://x.com', incognito: false }).kind, 'metadata-only');
  assert.equal(classify({ url: 'https://chromewebstore.google.com/detail/abc', incognito: false }).kind, 'metadata-only');
  assert.equal(classify({ url: 'https://example.com/report.pdf', incognito: false }).kind, 'metadata-only');
});

test('a normal non-blocklisted https article is extractable', () => {
  const r = classify({ url: 'https://example.com/articles/the-thing?utm=x', incognito: false });
  assert.equal(r.kind, 'extractable');
  assert.equal(r.host, 'example.com');
});

test('user-added blocklist domain classifies metadata-only; removing reverts', () => {
  const url = 'https://notion.so/secret-page';
  assert.equal(classify({ url, incognito: false }, []).kind, 'extractable');
  assert.equal(classify({ url, incognito: false }, ['notion.so']).kind, 'metadata-only');
  assert.equal(classify({ url, incognito: false }, []).kind, 'extractable');
});

test('blocklist matches subdomains of an entry', () => {
  assert.equal(classify({ url: 'https://secure.chase.com/x', incognito: false }).kind, 'metadata-only');
  assert.equal(classify({ url: 'https://notchase.com/x', incognito: false }).kind, 'extractable');
});

test('malformed or empty URL fails closed to metadata-only', () => {
  assert.equal(classify({ url: '', incognito: false }).kind, 'metadata-only');
  assert.equal(classify({ url: 'not a url', incognito: false }).kind, 'metadata-only');
  assert.equal(classify({ url: undefined, incognito: false }).kind, 'metadata-only');
});

test('default blocklist covers banking, health, gov, and password managers', () => {
  assert.ok(DEFAULT_BLOCKLIST.length > 10);
  for (const sample of ['chase.com', '1password.com', 'irs.gov']) {
    assert.ok(DEFAULT_BLOCKLIST.includes(sample), `expected ${sample} in default blocklist`);
  }
});
