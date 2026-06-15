/*
 * ypuf — unsaved-input dirty tracker (U3 / R5, R7).
 *
 * Runs in the page's isolated world. Reports ONLY a boolean — never any page
 * content — so the SW can know, at auto-close time, whether a tab had unsaved
 * input. Because a discarded tab has no live DOM to inspect later, we capture
 * the last-known value WHILE the tab is alive: a clean baseline on load, dirty
 * on the first edit, clean again on submit/reset. background.js writes it into
 * the per-tab store; a frozen/unobserved tab degrades to "unknown" → fail-safe.
 */
(function () {
  'use strict';

  if (window.__ypufDirtyTracker) return;
  window.__ypufDirtyTracker = true;

  let dirty = null;
  function report(value) {
    if (value === dirty) return;
    dirty = value;
    try { chrome.runtime.sendMessage({ type: 'dirty', dirty: value }); } catch { /* SW asleep / context gone */ }
  }

  const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  const onEdit = (e) => {
    const t = e.target;
    if (t && typeof t.matches === 'function' && t.matches(EDITABLE)) report(true);
  };

  report(false); // clean baseline now that we're live
  document.addEventListener('input', onEdit, true);
  document.addEventListener('change', onEdit, true);
  window.addEventListener('submit', () => report(false), true);
  document.addEventListener('reset', () => report(false), true);
})();
