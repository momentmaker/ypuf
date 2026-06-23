/*
 * ypuf — episodic recall query parser (Recall v2 / U5).
 *
 * Pure: split a recall query into free text + the engine's own grouping pivots —
 * a `with: <session>` operator and a relative time phrase — so recall can narrow
 * by *how the engine already filed a page* (who it was open with, when it was let
 * go), never a user-declared tag. `now` is injected so the day math is testable
 * without a clock, mirroring lib/timegroup.js / lib/returnwindow.js.
 *
 *   parse(q, now) -> { text, withTerm, timeRange: {from,to}|null, chips }
 *
 * `chips` is the panel's display model: one entry per active pivot, each carrying
 * a human label and the exact `phrase` substring to strip when the chip is
 * dismissed (dismiss collapses the pivot back into plain text, never suppresses).
 */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

  function startOfDay(now) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function timeRangeFor(phrase, now) {
    const sod = startOfDay(now);
    if (phrase === 'today') return { from: sod, to: sod + DAY };
    if (phrase === 'this morning') return { from: sod, to: sod + 12 * 3600000 };
    if (phrase === 'yesterday') return { from: sod - DAY, to: sod };
    if (phrase === 'this week') return { from: sod - new Date(now).getDay() * DAY, to: sod + DAY };
    const m = /^last (\w+)$/.exec(phrase);
    if (m && WEEKDAYS[m[1]] != null) {
      const todayDow = new Date(now).getDay();
      let delta = (todayDow - WEEKDAYS[m[1]] + 7) % 7;
      if (delta === 0) delta = 7;                 // "last tuesday" ON a Tuesday means a week ago
      const from = sod - delta * DAY;
      return { from, to: from + DAY };
    }
    return null;
  }

  // Longest / most-specific phrases first so "this morning" wins over a bare "this".
  const TIME_PATTERNS = [
    /\bthis morning\b/i,
    /\bthis week\b/i,
    /\btoday\b/i,
    /\byesterday\b/i,
    /\blast (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  ];

  function parse(q, now) {
    let head = (q || '').trim();

    // `with:` consumes the rest of the query as the session term (free text that
    // names a research set), so it's pulled off before time-phrase detection.
    let withTerm = null, withClause = null;
    const wi = head.toLowerCase().indexOf('with:');
    if (wi >= 0) {
      const term = head.slice(wi + 'with:'.length).trim();
      if (term) { withTerm = term; withClause = head.slice(wi); }
      head = head.slice(0, wi).trim();
    }

    let timeRange = null, timePhrase = null;
    for (const re of TIME_PATTERNS) {
      const m = re.exec(head);
      if (!m) continue;
      timePhrase = m[0];
      timeRange = timeRangeFor(m[0].toLowerCase(), now);
      head = (head.slice(0, m.index) + ' ' + head.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
      break;
    }

    const chips = [];
    if (withTerm) chips.push({ kind: 'with', label: withTerm, phrase: withClause });
    if (timeRange) chips.push({ kind: 'time', label: timePhrase, phrase: timePhrase });

    return { text: head, withTerm, timeRange, chips };
  }

  const api = { parse };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { recallquery: api });
})(typeof self !== 'undefined' ? self : globalThis);
