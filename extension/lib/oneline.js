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

  // Keep the aphorism lines: non-empty, not the blockquote preamble (`>`) or a heading
  // (`#`). Stop at the footer — a `---` rule, or a heading once aphorisms have started —
  // so um.fz.ax's GitBook boilerplate ("--- / # Agent Instructions / published with
  // GitBook…") can never be picked as an aphorism.
  function parse(md) {
    if (typeof md !== 'string') return [];
    const out = [];
    for (const raw of md.split(/\r?\n/)) {
      const l = raw.trim();
      if (/^-{3,}$/.test(l)) break;                  // horizontal rule → footer follows
      if (l[0] === '#' && out.length) break;         // a heading after the aphorisms → footer
      if (!l || l[0] === '>' || l[0] === '#') continue; // skip blanks, preamble, headings
      out.push(l);
    }
    return out;
  }

  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { oneline: api });
})(typeof self !== 'undefined' ? self : globalThis);
