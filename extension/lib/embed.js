/*
 * ypuf — static-embedding core (Model2Vec / potion-base-8M).
 *
 * Pure-JS static embeddings: tokenize -> token-vector lookup -> mean-pool ->
 * L2-normalize. NO neural forward pass, NO WASM, NO build step — the model is
 * a single F32 matrix and inference is array math (origin: U1 spike, proven on
 * potion-base-8M; "the"->1002, gist cosine works).
 *
 * This lib is the math/parsing core ONLY. The impure shell — fetching, hashing,
 * and caching the model bytes — lives in a later unit; everything here is given
 * its inputs (an ArrayBuffer, a parsed tokenizer.json, a matrix) and never
 * touches chrome.*, fs, or the network. No function mutates its inputs.
 *
 *   parseSafetensors(arrayBuffer) -> { matrix, vocab, dim }   (Float32Array VIEW)
 *   makeTokenizer(tokenizerJson)  -> { tokenize(text) -> number[] }
 *   embed(text, { matrix, dim, tokenizer }) -> normalized Float32Array
 *   cosine(a, b) -> dot product of two unit vectors
 */
(function (root) {
  'use strict';

  // --- safetensors: one F32 'embeddings' tensor [vocab, dim] ---------------
  // Container layout: [8-byte LE header length][JSON header][tensor bytes].
  // Returns a Float32Array VIEW over the matrix bytes (no copy).
  function parseSafetensors(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const headerLen = Number(view.getBigUint64(0, true));
    const headerBytes = new Uint8Array(arrayBuffer, 8, headerLen);
    const header = JSON.parse(new TextDecoder('utf-8').decode(headerBytes));
    const t = header.embeddings;
    const [vocab, dim] = t.shape;
    const start = 8 + headerLen + t.data_offsets[0];
    const end = 8 + headerLen + t.data_offsets[1];
    const matrix = new Float32Array(arrayBuffer, start, (end - start) / 4);
    return { matrix, vocab, dim };
  }

  // --- tokenizer: BertNormalizer + BertPreTokenizer + WordPiece ------------

  // BertNormalizer: clean control chars, strip accents (NFD + drop combining
  // marks), lowercase. strip_accents=null + lowercase=true => strip.
  function normalize(text) {
    let s = String(text).replace(/[\x00-\x1f\x7f]/g, ' ');
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.toLowerCase();
  }

  // BERT punctuation: non-alphanumeric ASCII punctuation + any Unicode P category.
  function isPunct(ch) {
    const cp = ch.codePointAt(0);
    if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) ||
        (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) return true;
    return /\p{P}/u.test(ch);
  }

  // BertPreTokenizer: split on whitespace, then split each chunk so punctuation
  // becomes its own token.
  function preTokenize(text) {
    const out = [];
    for (const chunk of text.split(/\s+/)) {
      if (!chunk) continue;
      let cur = '';
      for (const ch of chunk) {
        if (isPunct(ch)) { if (cur) { out.push(cur); cur = ''; } out.push(ch); }
        else cur += ch;
      }
      if (cur) out.push(cur);
    }
    return out;
  }

  // WordPiece greedy longest-match. The continuing-subword prefix ('##') marks
  // every piece after the first; a word with no covering piece -> [UNK].
  function wordpiece(word, tk) {
    if (word.length > tk.maxChars) return [tk.unkId];
    const ids = [];
    let start = 0;
    while (start < word.length) {
      let end = word.length, cur = null;
      while (start < end) {
        const sub = (start > 0 ? tk.prefix : '') + word.slice(start, end);
        if (Object.prototype.hasOwnProperty.call(tk.vocab, sub)) { cur = tk.vocab[sub]; break; }
        end--;
      }
      if (cur === null) return [tk.unkId];
      ids.push(cur);
      start = end;
    }
    return ids;
  }

  // Build a tokenizer from a parsed tokenizer.json. Closes over the vocab + the
  // WordPiece config so callers just call tokenize(text). Pure: it reads the
  // json once and never mutates it.
  function makeTokenizer(tokenizerJson) {
    const model = (tokenizerJson && tokenizerJson.model) || {};
    const vocab = model.vocab || {};
    const tk = {
      vocab,
      unkId: vocab[model.unk_token],
      prefix: model.continuing_subword_prefix || '##',
      maxChars: model.max_input_chars_per_word || 100,
    };
    function tokenize(text) {
      const ids = [];
      for (const word of preTokenize(normalize(text))) {
        for (const id of wordpiece(word, tk)) ids.push(id);
      }
      return ids;
    }
    return { tokenize };
  }

  // --- embed: mean-pool the token rows, then L2-normalize ------------------
  // Model2Vec: no special tokens. Empty / no-token input -> a zero vector
  // (never NaN). Pure: reads `matrix`, allocates a fresh output.
  function embed(text, opts) {
    const matrix = opts.matrix;
    const dim = opts.dim;
    const ids = opts.tokenizer.tokenize(text);
    const out = new Float32Array(dim);
    if (!ids.length) return out;
    for (const id of ids) {
      const base = id * dim;
      for (let d = 0; d < dim; d++) out[d] += matrix[base + d];
    }
    let norm = 0;
    for (let d = 0; d < dim; d++) { out[d] /= ids.length; norm += out[d] * out[d]; }
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < dim; d++) out[d] /= norm;
    return out;
  }

  // Cosine of two unit vectors == their dot product.
  function cosine(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  const api = { parseSafetensors, makeTokenizer, embed, cosine };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { embed: api });
})(typeof self !== 'undefined' ? self : globalThis);
