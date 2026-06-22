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

  // After a recall row leaves the navigable shelf (opened, or forgotten — a struck row
  // drops out of reach during its undo window), choose the cursor's new index. `present`
  // is where the still-highlighted row now sits in the shortened list, or -1 if that row
  // is the one that left. When it left we fall onto the row that took its slot (so deleting
  // a row advances to the next instead of leaving the count off-by-one); when it survived we
  // keep it, merely re-indexed, so a row removed elsewhere doesn't drag the highlight.
  function reanchor(prev, present, len) {
    if (prev < 0 || len <= 0) return -1;
    if (present >= 0) return present;
    return Math.min(prev, len - 1);
  }

  // Arrows are deliberately NOT mapped: board cells own ◀▶▲▼ for lane reorder
  // (newtab.js makeDraggable), so the recall cursor stays on j/k to avoid a collision.
  const MAP = {
    j: 'down', k: 'up',
    o: 'open', Enter: 'open', r: 'restoreSet',
    d: 'forget', u: 'undo', p: 'protect',
    '/': 'search', g: 'g', G: 'bottom',
    e: 'edit', f: 'hints', '?': 'help', Escape: 'escape',
  };

  function intent(key, ctx) {
    ctx = ctx || {};
    if (ctx.fieldFocused) return key === 'Escape' ? 'escape' : 'none';
    return Object.prototype.hasOwnProperty.call(MAP, key) ? MAP[key] : 'none';
  }

  const api = { moveCursor, reanchor, intent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { boardkeys: api });
})(typeof self !== 'undefined' ? self : globalThis);
