/*
 * ypuf — one-line parser (board redesign / U6, R15).
 *
 * Pure: takes the markdown of um.fz.ax/self/one-line.md (a `# one line` heading + a
 * blockquote preamble + one aphorism per line) and returns the aphorism lines as
 * plain strings. The board caches this list daily and picks one locally per tab, so
 * the endpoint is hit ~once a day. Rendered text-only on the host (textContent), so a
 * line is inert even if it contained markup. Built test-first (tests/oneline.test.js).
 */
(function (root) {
  'use strict';

  // Keep non-empty lines that aren't the blockquote preamble (`>`) or a heading (`#`).
  function parse(md) {
    if (typeof md !== 'string') return [];
    return md.split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && l[0] !== '>' && l[0] !== '#');
  }

  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { oneline: api });
})(typeof self !== 'undefined' ? self : globalThis);
