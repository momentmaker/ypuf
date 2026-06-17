'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { validate } = require('../extension/lib/sourceurl.js');

test('a normal https feed URL passes', () => {
  const r = validate('https://example.com/feed.xml');
  assert.equal(r.ok, true);
  assert.equal(r.origin, 'https://example.com');
  assert.equal(r.host, 'example.com');
});

test('non-https schemes are rejected (https-only)', () => {
  for (const u of ['http://example.com/feed', 'javascript:alert(1)', 'data:text/html,<b>x', 'file:///etc/passwd', 'ftp://example.com/x']) {
    const r = validate(u);
    assert.equal(r.ok, false, `${u} should be rejected`);
    assert.equal(r.reason, 'scheme', `${u} → scheme`);
  }
});

test('private / loopback / link-local IPv4 hosts are blocked (SSRF, AE10)', () => {
  for (const u of [
    'https://127.0.0.1/x', 'https://10.0.0.1/x', 'https://172.16.0.1/x',
    'https://172.31.255.255/x', 'https://192.168.1.1/feed', 'https://169.254.169.254/latest/meta-data',
    'https://0.0.0.0/x', 'https://100.64.0.1/x',
  ]) {
    const r = validate(u);
    assert.equal(r.ok, false, `${u} should be blocked`);
    assert.equal(r.reason, 'private-ip', `${u} → private-ip`);
  }
});

test('a public IPv4 host is allowed', () => {
  assert.equal(validate('https://8.8.8.8/feed').ok, true);
  assert.equal(validate('https://172.32.0.1/x').ok, true);   // just outside 172.16/12
});

test('loopback / link-local / ULA IPv6 hosts are blocked', () => {
  for (const u of ['https://[::1]/x', 'https://[fe80::1]/x', 'https://[fc00::1]/x', 'https://[fd12:3456::1]/x', 'https://[::ffff:192.168.0.1]/x']) {
    const r = validate(u);
    assert.equal(r.ok, false, `${u} should be blocked`);
  }
});

test('localhost (and *.localhost) is blocked', () => {
  assert.equal(validate('https://localhost/x').reason, 'loopback');
  assert.equal(validate('https://api.localhost/x').reason, 'loopback');
});

test('a malformed / non-URL string is rejected without throwing', () => {
  for (const u of ['not a url', '', 'https://', '://nope']) {
    const r = validate(u);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'not-a-url');
  }
});
