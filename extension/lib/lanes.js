/*
 * ypuf — lane placement (board redesign).
 *
 * Pure: the Trello-style drag-placement math, extracted from newtab.js so it can be
 * unit-tested without chrome.* or the DOM. The host keeps the orchestration (the
 * boardBusy guard, saveConfig, renderBoard, focusPanel); these functions only mutate
 * the flat `panels` array and report whether anything changed.
 *
 * Data model: a panel's lane is `spec.col`; within-lane order is the order same-lane
 * panels appear in the flat array. So a move = set col + reposition in the flat array.
 * Every read clamps an out-of-range/garbage col to lane 0 (colOf), so a malformed
 * saved config degrades calmly instead of wedging the board. Built test-first
 * (tests/lanes.test.js).
 */
(function (root) {
  'use strict';

  function colOf(spec, cols) {
    const c = Number(spec && spec.col);
    return (Number.isInteger(c) && c >= 0 && c < cols) ? c : 0;
  }

  // Drop src into target's lane, before/after target in the flat order. Returns
  // whether a move happened (so the host can skip a needless save + re-render).
  function reorderInto(panels, srcId, targetId, before, cols) {
    if (srcId === targetId) return false;
    const src = panels.find((p) => p.id === srcId);
    const target = panels.find((p) => p.id === targetId);
    if (!src || !target) return false;
    src.col = colOf(target, cols);
    panels.splice(panels.indexOf(src), 1);
    let to = panels.indexOf(target);
    if (!before) to += 1;
    panels.splice(to, 0, src);
    return true;
  }

  // Drop onto a lane's empty space → bottom of that lane (last in the flat array).
  function moveToLane(panels, srcId, col) {
    const src = panels.find((p) => p.id === srcId);
    if (!src) return false;
    src.col = col;
    panels.splice(panels.indexOf(src), 1);
    panels.push(src);
    return true;
  }

  // Keyboard ◀ ▶: shift a panel one lane, clamped at the edges (no-op at a boundary).
  function moveAcross(panels, id, delta, cols) {
    const src = panels.find((p) => p.id === id);
    if (!src) return false;
    const to = Math.max(0, Math.min(cols - 1, colOf(src, cols) + delta));
    if (to === colOf(src, cols)) return false;
    src.col = to;
    return true;
  }

  // Keyboard ▲ ▼: reorder a panel within its own lane (no-op at the lane ends).
  function moveWithinLane(panels, id, delta, cols) {
    const src = panels.find((p) => p.id === id);
    if (!src) return false;
    const lane = panels.filter((p) => colOf(p, cols) === colOf(src, cols));
    const j = lane.indexOf(src) + delta;
    if (j < 0 || j >= lane.length) return false;
    const target = lane[j];
    panels.splice(panels.indexOf(src), 1);
    let to = panels.indexOf(target);
    if (delta > 0) to += 1;
    panels.splice(to, 0, src);
    return true;
  }

  // One-time migration: spread pre-lanes panels (no integer col) round-robin across
  // the columns so the board looks composed rather than all stacked in lane 0.
  function migrateCols(panels, cols) {
    let changed = false;
    panels.forEach((p, i) => { if (!Number.isInteger(p.col)) { p.col = i % cols; changed = true; } });
    return changed;
  }

  const api = { colOf, reorderInto, moveToLane, moveAcross, moveWithinLane, migrateCols };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { lanes: api });
})(typeof self !== 'undefined' ? self : globalThis);
