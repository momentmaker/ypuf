/*
 * ypuf — board normal-mode key logic (keyboard layer / U8, R9/R12).
 *
 * The decidable core of the board's vim layer, kept pure so the host glue in
 * newtab.js stays thin (pattern 18). Two pure functions:
 *   - moveCursor: clamp a recall-row cursor under j/k (modeled on the popup's inline
 *     moveCursor — from -1 it enters at the end matching the direction).
 *   - intent: map a KeyboardEvent.key → a normal-mode intent, yielding entirely to
 *     a focused field (so typing in the recall search is never hijacked) except for
 *     Escape, which still blurs the field. Built test-first (tests/boardkeys.test.js).
 */
(function (root) {
  'use strict';

  function moveCursor(cursor, delta, len) {
    if (len <= 0) return -1;
    const start = cursor < 0 ? (delta > 0 ? 0 : len - 1) : cursor + delta;
    return Math.max(0, Math.min(len - 1, start));
  }

  // Arrows are deliberately NOT mapped: board cells own ◀▶▲▼ for lane reorder
  // (newtab.js makeDraggable), so the recall cursor stays on j/k to avoid a collision.
  const MAP = {
    j: 'down', k: 'up',
    o: 'open', Enter: 'open',
    x: 'forget', u: 'undo', p: 'protect',
    '/': 'search', g: 'g', G: 'bottom',
    e: 'edit', f: 'hints', '?': 'help', Escape: 'escape',
  };

  function intent(key, ctx) {
    ctx = ctx || {};
    if (ctx.fieldFocused) return key === 'Escape' ? 'escape' : 'none';
    return Object.prototype.hasOwnProperty.call(MAP, key) ? MAP[key] : 'none';
  }

  const api = { moveCursor, intent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { boardkeys: api });
})(typeof self !== 'undefined' ? self : globalThis);
