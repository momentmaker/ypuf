/*
 * ypuf — pre-paint theme bootstrap (theming / U5+U6, R2/R9).
 *
 * Loaded SYNCHRONOUSLY in <head> (before the stylesheet paints) on both the board and
 * the popup, so the chosen theme is on <html> before first paint — no flash of light on
 * a dark/star surface. It is deliberately self-contained (it runs before lib/theme.js
 * loads) and reads `localStorage` (synchronous, shared across extension pages, local-only,
 * never transmitted). The main script reconciles + persists; this only sets the attribute.
 *
 * Inline scripts are forbidden by the extension_pages CSP (script-src 'self'), so this is
 * an external script — still render-blocking in <head>, so it runs pre-paint.
 */
(function () {
  'use strict';
  try {
    var t = localStorage.getItem('ypuf-theme');
    if (t !== 'light' && t !== 'dark' && t !== 'star') {
      t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable → default light theme stands */ }
})();
