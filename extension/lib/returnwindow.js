/*
 * ypuf — snooze return-window grouping (Snooze panel).
 *
 * Pure: bucket pending snooze records into the forward "coming back" timeline —
 * Later today / This evening / Tomorrow / Later this week / This weekend /
 * Next week / Later / When you're back — soonest first, untilStartup last. The
 * forward mirror of lib/timegroup.js. Windows are computed from each record's
 * `returnAt` (so custom times + re-snoozes group uniformly); `untilStartup`
 * records carry no time and sort last. `now` is injected; boundaries are local.
 * Empty groups are dropped; a record with neither field is skipped, not crashed.
 */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const HOUR = 3600000;
  const EVENING_HOUR = 18; // mirrors lib/snooze.js EVENING_HOUR — "this evening" starts at 6pm

  function startOfDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function windows(records, now) {
    const T = startOfDay(now);
    const eveningStart = T + EVENING_HOUR * HOUR;
    const tomorrow = T + DAY;
    const dayAfter = T + 2 * DAY;
    const dow = new Date(T).getDay();                 // 0 Sun .. 6 Sat
    const comingSat = T + ((6 - dow + 7) % 7) * DAY;  // this week's Saturday (today if it is Sat)
    const weekendStart = Math.max(dayAfter, comingSat); // the weekend, minus what today/tomorrow already claim
    const weekendEnd = comingSat + 2 * DAY;           // the following Monday 00:00
    const nextWeekEnd = weekendEnd + 7 * DAY;

    // First matching window wins; ranges are disjoint, ordered chronologically.
    // `today` also catches an overdue-but-still-snoozed returnAt (r < T) so nothing is lost.
    const defs = [
      { key: 'today', label: 'Later today', test: (r, u) => !u && typeof r === 'number' && r < eveningStart },
      { key: 'evening', label: 'This evening', test: (r, u) => !u && r >= eveningStart && r < tomorrow },
      { key: 'tomorrow', label: 'Tomorrow', test: (r, u) => !u && r >= tomorrow && r < dayAfter },
      { key: 'thisweek', label: 'Later this week', test: (r, u) => !u && r >= dayAfter && r < comingSat },
      { key: 'weekend', label: 'This weekend', test: (r, u) => !u && r >= weekendStart && r < weekendEnd },
      { key: 'nextweek', label: 'Next week', test: (r, u) => !u && r >= weekendEnd && r < nextWeekEnd },
      { key: 'later', label: 'Later', test: (r, u) => !u && r >= nextWeekEnd },
      { key: 'startup', label: "When you're back", test: (_r, u) => u === true },
    ];
    const groups = defs.map((d) => ({ key: d.key, label: d.label, items: [] }));
    for (const it of (Array.isArray(records) ? records : [])) {
      const idx = defs.findIndex((d) => d.test(it.returnAt, it.untilStartup));
      if (idx >= 0) groups[idx].items.push(it);   // neither returnAt nor untilStartup → skipped
    }
    return groups.filter((g) => g.items.length);
  }

  const api = { windows };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { returnwindow: api });
})(typeof self !== 'undefined' ? self : globalThis);
