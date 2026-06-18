/*
 * ypuf — f-hint label logic (keyboard layer / U9, R10).
 *
 * The decidable core of `f` link-hints, kept pure so the host glue in newtab.js stays
 * thin (pattern 18). Two pure functions:
 *   - assign(n): deterministic hint labels for n targets — single chars while they
 *     fit the alphabet, otherwise ALL two-char (never mixed, so no 1-char label is a
 *     prefix of a 2-char one and every keystroke is unambiguous).
 *   - match(prefix, labels): resolve a typed prefix → { index } | { needMore } |
 *     { noMatch }. Built test-first (tests/hints.test.js).
 */
(function (root) {
  'use strict';

  // Home-row-first so the common (few-target) case lands under the fingers.
  const ALPHABET = 'asdfghjklqwertyuiopzxcvbnm'.split('');

  function assign(n) {
    if (!(n > 0)) return [];
    if (n <= ALPHABET.length) return ALPHABET.slice(0, n);
    const out = [];
    for (const a of ALPHABET) {
      for (const b of ALPHABET) {
        out.push(a + b);
        if (out.length === n) return out;
      }
    }
    return out;   // saturates at ALPHABET.length^2 targets (calmly capped by the caller)
  }

  function match(prefix, labels) {
    const exact = labels.indexOf(prefix);
    if (exact >= 0) return { index: exact };
    if (labels.some((l) => l.indexOf(prefix) === 0)) return { needMore: true };
    return { noMatch: true };
  }

  const api = { assign, match };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { hints: api });
})(typeof self !== 'undefined' ? self : globalThis);
