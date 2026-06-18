/*
 * ypuf — auto-let-go eagerness (board settings / U3, R3).
 *
 * Pure: maps a calm eagerness label (timid / balanced / bold) to the staleness window
 * the auto-let-go sweep uses. §5a's "start timid, earn the right to be bolder", as a
 * setting — never a raw-days slider. `balanced` is the default, equal to the shipped
 * 3-day behavior, so an untouched install is unchanged. Built test-first
 * (tests/eagerness.test.js).
 */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const DEFAULT = 'balanced';

  // Ordered timid→bold for the overlay's segmented control; `days` is the real window.
  const LEVELS = [
    { key: 'timid', label: 'Timid', days: 7 },
    { key: 'balanced', label: 'Balanced', days: 3 },
    { key: 'bold', label: 'Bold', days: 1 },
  ];

  function toWindowMs(key) {
    const level = LEVELS.find((l) => l.key === key) || LEVELS.find((l) => l.key === DEFAULT);
    return level.days * DAY;
  }

  const api = { LEVELS, DEFAULT, toWindowMs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { eagerness: api });
})(typeof self !== 'undefined' ? self : globalThis);
