/*
 * ypuf — "your week, unburdened" digest (board soul / U7, R8).
 *
 * Pure: counts what auto-let-go did this week — let go, recalled, (never) lost — for the
 * calm relief line. Counts ONLY auto-closed records (so manual let-gos and snooze-wakes
 * don't inflate it), within the last 7 days: letGo by `timestamp`, recalled by
 * `lastAccessed`, lost always 0 (the recall index is the guarantee). Built test-first
 * (tests/digest.test.js).
 *
 * `recalled` requires `lastAccessed > timestamp`: store records are born with
 * lastAccessed === timestamp (store.put defaults it), and only a genuine recall calls
 * store.touch() to bump it later. Without the strict-greater guard every fresh let-go
 * would count as recalled, so the tally would read "N let go · N recalled" with no recalls.
 */
(function (root) {
  'use strict';

  const WEEK_MS = 7 * 86400000;

  function compute(records, now) {
    const inWeek = (t) => typeof t === 'number' && (now - t) >= 0 && (now - t) < WEEK_MS;
    let letGo = 0, recalled = 0;
    for (const r of (Array.isArray(records) ? records : [])) {
      if (!r || !r.autoClosed) continue;
      if (inWeek(r.timestamp)) letGo += 1;
      if (inWeek(r.lastAccessed) && r.lastAccessed > r.timestamp) recalled += 1;
    }
    return { letGo, recalled, lost: 0 };
  }

  const api = { compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { digest: api });
})(typeof self !== 'undefined' ? self : globalThis);
