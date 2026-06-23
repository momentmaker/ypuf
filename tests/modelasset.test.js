'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const modelasset = require('../extension/lib/modelasset.js');

// Only the PURE core is unit-tested here: sha256Hex + constantTimeEqualHex.
// The fetch/Cache-Storage shell (ensureModel/loadFromCache/purge) is thin impure
// glue over the network + Cache Storage + chrome.permissions — exercised via
// manual dogfood (tests/MANUAL-DOGFOOD.md), not unit tests. crypto.subtle is a
// global in node's test runner, so the hash core needs no shim.

function buf(str) { return new TextEncoder().encode(str).buffer; }

// --- sha256Hex ------------------------------------------------------------

test('sha256Hex: known bytes -> known hex (NIST "abc" vector)', async () => {
  const hex = await modelasset.sha256Hex(buf('abc'));
  assert.equal(hex, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('sha256Hex: empty input -> the empty-string SHA-256', async () => {
  const hex = await modelasset.sha256Hex(buf(''));
  assert.equal(hex, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('sha256Hex: output is 64 lowercase hex chars (zero-padded)', async () => {
  const hex = await modelasset.sha256Hex(buf('hello world'));
  assert.equal(hex.length, 64);
  assert.match(hex, /^[0-9a-f]{64}$/);
});

test('sha256Hex: a tampered buffer hashes != the pinned constant', async () => {
  // A stand-in for "the cached safetensors was altered": its hash must not match
  // the pinned asset hash, so verify rejects it.
  const tampered = await modelasset.sha256Hex(buf('not the model bytes'));
  assert.notEqual(tampered, modelasset.PINNED_SAFETENSORS_SHA256);
  assert.equal(
    modelasset.constantTimeEqualHex(tampered, modelasset.PINNED_SAFETENSORS_SHA256),
    false,
  );
});

test('sha256Hex: a one-byte change flips the hash (avalanche)', async () => {
  const a = await modelasset.sha256Hex(buf('model-bytes'));
  const b = await modelasset.sha256Hex(buf('model-bytfs'));
  assert.notEqual(a, b);
});

// --- constantTimeEqualHex -------------------------------------------------

test('constantTimeEqualHex: identical hex -> true', () => {
  const h = 'f65d0f325faadc1e121c319e2faa41170d3fa07d8c89abd48ca5358d9a223de2';
  assert.equal(modelasset.constantTimeEqualHex(h, h), true);
});

test('constantTimeEqualHex: same length, one nibble differs -> false', () => {
  const a = 'abcdef0123456789';
  const b = 'abcdef0123456788'; // last nibble differs
  assert.equal(modelasset.constantTimeEqualHex(a, b), false);
});

test('constantTimeEqualHex: a leading-nibble difference -> false', () => {
  const a = 'abcdef0123456789';
  const b = 'bbcdef0123456789'; // first nibble differs
  assert.equal(modelasset.constantTimeEqualHex(a, b), false);
});

test('constantTimeEqualHex: length mismatch -> false (no throw)', () => {
  assert.equal(modelasset.constantTimeEqualHex('abcd', 'abcde'), false);
  assert.equal(modelasset.constantTimeEqualHex('abcde', 'abcd'), false);
  assert.equal(modelasset.constantTimeEqualHex('', 'a'), false);
});

test('constantTimeEqualHex: two empty strings -> true', () => {
  assert.equal(modelasset.constantTimeEqualHex('', ''), true);
});

// --- pinned constant + URLs (the release-checklist contract) --------------

test('the pinned hash is a 64-char lowercase hex constant', () => {
  assert.match(modelasset.PINNED_SAFETENSORS_SHA256, /^[0-9a-f]{64}$/);
});

test('the asset URLs point at the pinned ypuf release', () => {
  assert.match(modelasset.SAFETENSORS_URL, /^https:\/\/github\.com\/momentmaker\/ypuf\/releases\/download\/.+\/model\.safetensors$/);
  assert.match(modelasset.TOKENIZER_URL, /^https:\/\/github\.com\/momentmaker\/ypuf\/releases\/download\/.+\/tokenizer\.json$/);
});

test('the narrow host permission covers the release host AND the redirect target, never <all_urls>', () => {
  const origins = modelasset.HOST_PERMISSION.origins;
  assert.ok(origins.includes('https://github.com/momentmaker/ypuf/releases/*'));
  assert.ok(origins.includes('https://objects.githubusercontent.com/*'));
  assert.ok(!origins.includes('<all_urls>')); // revoking the model grant must not touch auto-let-go
});
