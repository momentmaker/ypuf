'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const embed = require('../extension/lib/embed.js');

// --- tiny deterministic fixtures (no 30MB model) --------------------------
//
// A 6-token vocab. ids must be < DIM-safe rows in the fixture matrix. We keep
// vocab ids and matrix rows in lock-step so a hand-computed pool is checkable.
//   0 [UNK]   1 cat   2 dog   3 run   4 ##s   5 fox
const DIM = 4;
const VOCAB = { '[UNK]': 0, cat: 1, dog: 2, run: 3, '##s': 4, fox: 5 };

// tokenizer.json shape the lib reads: .model.{vocab,unk_token,...}
const TOKENIZER_JSON = {
  model: {
    vocab: VOCAB,
    unk_token: '[UNK]',
    continuing_subword_prefix: '##',
    max_input_chars_per_word: 100,
  },
};

// Row r holds [r+1, 0, 0, 0]-ish distinct values so pools are easy to verify.
// rows: id*DIM .. id*DIM+DIM-1
const ROWS = [
  [0, 0, 0, 0],   // 0 [UNK]
  [1, 0, 0, 0],   // 1 cat
  [0, 2, 0, 0],   // 2 dog
  [0, 0, 3, 0],   // 3 run
  [0, 0, 0, 4],   // 4 ##s
  [2, 2, 0, 0],   // 5 fox
];
const MATRIX = Float32Array.from(ROWS.flat());

function makeCtx() {
  return { matrix: MATRIX, dim: DIM, tokenizer: embed.makeTokenizer(TOKENIZER_JSON) };
}

function l2(v) { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s); }

// Pool ids by hand, then L2-normalize — the independent oracle for embed().
function expectedVector(ids) {
  const out = new Array(DIM).fill(0);
  if (!ids.length) return out;
  for (const id of ids) for (let d = 0; d < DIM; d++) out[d] += ROWS[id][d];
  for (let d = 0; d < DIM; d++) out[d] /= ids.length;
  const n = l2(out) || 1;
  return out.map((x) => x / n);
}

const TOL = 1e-6;

// --- tokenizer ------------------------------------------------------------

test('tokenize: known words map to their vocab ids', () => {
  const tk = embed.makeTokenizer(TOKENIZER_JSON);
  assert.deepEqual(tk.tokenize('cat dog'), [1, 2]);
});

test('tokenize: WordPiece splits a known word into a base + ## subword', () => {
  // 'dogs' is not in vocab, but 'dog' + '##s' are -> greedy longest-match.
  const tk = embed.makeTokenizer(TOKENIZER_JSON);
  assert.deepEqual(tk.tokenize('dogs'), [2, 4]);
});

test('tokenize: an out-of-vocab word falls back to [UNK] without throwing', () => {
  const tk = embed.makeTokenizer(TOKENIZER_JSON);
  assert.deepEqual(tk.tokenize('zebra'), [0]); // no covering piece -> [UNK]
});

test('tokenize: normalization lowercases and splits punctuation into its own token', () => {
  const tk = embed.makeTokenizer(TOKENIZER_JSON);
  // 'CAT,DOG' -> lowercase, comma is punctuation (own token -> [UNK]).
  assert.deepEqual(tk.tokenize('CAT,DOG'), [1, 0, 2]);
});

test('tokenize: accents are stripped before lookup', () => {
  const tk = embed.makeTokenizer(TOKENIZER_JSON);
  // 'cát' -> NFD + drop combining mark -> 'cat'.
  assert.deepEqual(tk.tokenize('cát'), [1]);
});

test('tokenize: empty / whitespace-only text yields no ids', () => {
  const tk = embed.makeTokenizer(TOKENIZER_JSON);
  assert.deepEqual(tk.tokenize(''), []);
  assert.deepEqual(tk.tokenize('   \t\n  '), []);
});

test('makeTokenizer: defaults fill in when tokenizer.json omits prefix/maxChars', () => {
  const tk = embed.makeTokenizer({ model: { vocab: VOCAB, unk_token: '[UNK]' } });
  assert.deepEqual(tk.tokenize('dogs'), [2, 4]); // default '##' prefix still works
});

// --- embed: happy path ----------------------------------------------------

test('embed: known text -> the hand-pooled, L2-normalized vector (within tolerance)', () => {
  const ctx = makeCtx();
  const v = embed.embed('cat dog', ctx); // ids [1, 2]
  const want = expectedVector([1, 2]);
  assert.equal(v.length, DIM);
  for (let d = 0; d < DIM; d++) assert.ok(Math.abs(v[d] - want[d]) < TOL, `dim ${d}: ${v[d]} vs ${want[d]}`);
});

test('embed: output is unit length', () => {
  const ctx = makeCtx();
  const v = embed.embed('cat dog fox', ctx);
  assert.ok(Math.abs(l2(v) - 1) < TOL, `|v| = ${l2(v)}`);
});

test('embed: a subword-split word pools the base + ## rows', () => {
  const ctx = makeCtx();
  const v = embed.embed('dogs', ctx); // ids [2, 4]
  const want = expectedVector([2, 4]);
  for (let d = 0; d < DIM; d++) assert.ok(Math.abs(v[d] - want[d]) < TOL);
});

// --- embed: edge cases ----------------------------------------------------

test('embed: empty text -> a zero vector, no NaN', () => {
  const ctx = makeCtx();
  const v = embed.embed('', ctx);
  assert.equal(v.length, DIM);
  for (const x of v) { assert.equal(x, 0); assert.ok(!Number.isNaN(x)); }
});

test('embed: whitespace-only text -> a zero vector, no NaN', () => {
  const ctx = makeCtx();
  const v = embed.embed('   \n\t ', ctx);
  for (const x of v) { assert.equal(x, 0); assert.ok(!Number.isNaN(x)); }
});

test('embed: out-of-vocab-only text embeds [UNK] without throwing', () => {
  const ctx = makeCtx();
  // 'zebra' -> [UNK] (row is all zeros) -> pool is zero -> safe zero vector, no NaN.
  let v;
  assert.doesNotThrow(() => { v = embed.embed('zebra', ctx); });
  for (const x of v) assert.ok(!Number.isNaN(x));
});

test('embed: a real (non-zero) UNK row still normalizes to unit length', () => {
  // cat + zebra([UNK]) — [UNK] row is zero here, so this just confirms UNK ids
  // flow through pooling and the result is still a clean unit vector.
  const ctx = makeCtx();
  const v = embed.embed('cat zebra', ctx); // ids [1, 0]
  assert.ok(Math.abs(l2(v) - 1) < TOL);
  for (const x of v) assert.ok(!Number.isNaN(x));
});

// --- cosine ---------------------------------------------------------------

test('cosine: identical unit vectors -> 1', () => {
  const ctx = makeCtx();
  const v = embed.embed('cat dog', ctx);
  assert.ok(Math.abs(embed.cosine(v, v) - 1) < TOL);
});

test('cosine: orthogonal unit vectors -> 0', () => {
  const ctx = makeCtx();
  const a = embed.embed('cat', ctx); // row 1 -> [1,0,0,0] normalized
  const b = embed.embed('dog', ctx); // row 2 -> [0,2,0,0] normalized -> orthogonal to a
  assert.ok(Math.abs(embed.cosine(a, b)) < TOL, `cos = ${embed.cosine(a, b)}`);
});

test('cosine: a related pair scores between orthogonal and identical', () => {
  const ctx = makeCtx();
  const cat = embed.embed('cat', ctx); // [1,0,0,0]
  const fox = embed.embed('fox', ctx); // [2,2,0,0] -> shares dim 0 with cat
  const c = embed.cosine(cat, fox);
  assert.ok(c > 0 && c < 1, `expected 0 < cos < 1, got ${c}`);
});

// --- purity ---------------------------------------------------------------

test('embed: never mutates the matrix or the tokenizer.json', () => {
  const ctx = makeCtx();
  const matrixSnap = Array.from(MATRIX);
  const jsonSnap = JSON.stringify(TOKENIZER_JSON);
  embed.embed('cat dog fox', ctx);
  embed.embed('dogs', ctx);
  assert.deepEqual(Array.from(MATRIX), matrixSnap, 'matrix untouched');
  assert.equal(JSON.stringify(TOKENIZER_JSON), jsonSnap, 'tokenizer.json untouched');
});

test('embed: two calls on the same text return equal, independent vectors', () => {
  const ctx = makeCtx();
  const a = embed.embed('cat dog', ctx);
  const b = embed.embed('cat dog', ctx);
  assert.notEqual(a, b, 'a fresh array each call');
  for (let d = 0; d < DIM; d++) assert.equal(a[d], b[d]);
});

// --- parseSafetensors -----------------------------------------------------

// Build a minimal safetensors buffer by hand:
//   [8-byte LE header length][JSON header][F32 tensor bytes]
function buildSafetensors(matrixRows, vocab, dim) {
  const flat = Float32Array.from(matrixRows.flat());
  const tensorBytes = flat.byteLength;
  let header = JSON.stringify({
    embeddings: { dtype: 'F32', shape: [vocab, dim], data_offsets: [0, tensorBytes] },
  });
  // safetensors pads the header with spaces so the tensor block starts on a
  // multiple-of-8 boundary (the real model is aligned; mirror that here).
  while ((8 + header.length) % 8 !== 0) header += ' ';
  const headerBytes = new TextEncoder().encode(header);
  const total = 8 + headerBytes.byteLength + tensorBytes;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setBigUint64(0, BigInt(headerBytes.byteLength), true);
  new Uint8Array(buf, 8, headerBytes.byteLength).set(headerBytes);
  new Uint8Array(buf, 8 + headerBytes.byteLength).set(new Uint8Array(flat.buffer));
  return buf;
}

test('parseSafetensors: a hand-built buffer -> the right matrix view + shape', () => {
  const rows = [[1, 2], [3, 4], [5, 6]]; // vocab=3, dim=2
  const buf = buildSafetensors(rows, 3, 2);
  const { matrix, vocab, dim } = embed.parseSafetensors(buf);
  assert.equal(vocab, 3);
  assert.equal(dim, 2);
  assert.equal(matrix.length, 6);
  assert.deepEqual(Array.from(matrix), [1, 2, 3, 4, 5, 6]);
});

test('parseSafetensors: the matrix is a VIEW over the source bytes (no copy)', () => {
  const rows = [[7, 8], [9, 10]];
  const buf = buildSafetensors(rows, 2, 2);
  const { matrix } = embed.parseSafetensors(buf);
  assert.equal(matrix.buffer, buf, 'Float32Array shares the source ArrayBuffer');
});

test('parseSafetensors output feeds embed end-to-end against a hand-built model', () => {
  // Reproduce the fixture matrix through the container, then pool 'cat dog'.
  const buf = buildSafetensors(ROWS, ROWS.length, DIM);
  const { matrix, dim } = embed.parseSafetensors(buf);
  const tokenizer = embed.makeTokenizer(TOKENIZER_JSON);
  const v = embed.embed('cat dog', { matrix, dim, tokenizer });
  const want = expectedVector([1, 2]);
  for (let d = 0; d < DIM; d++) assert.ok(Math.abs(v[d] - want[d]) < TOL);
});
