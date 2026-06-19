/*
 * ypuf — snooze scheduling logic (U1 / R4, R6, R8, R9).
 *
 * Pure: turn a preset into a return schedule, decide what is due, and own the
 * snooze state transitions — all from an injected `now`, no chrome. The service
 * worker does the storage + alarm side effects.
 *
 * A schedule is EITHER `{returnAt:<ms>}` (a clock time) OR `{untilStartup:true}`
 * ("when I'm back" — resolved only by the startup path, never a numeric sentinel
 * that the every-wake overdue sweep would flip immediately).
 *
 * The default clock times are tunable constants (dogfooding will refine them).
 */
(function (root) {
  'use strict';

  const LATER_TODAY_MS = 3 * 3600 * 1000; // "later today" = a few hours on
  const MORNING_HOUR = 9;                  // "tomorrow morning" / weekend / next week
  const EVENING_HOUR = 18;                 // "this evening"
  const SATURDAY = 6;
  const MONDAY = 1;

  function dayAtHour(now, dayOffset, hour) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  }

  // The next occurrence of `hour:00` strictly after `now` (today, else tomorrow).
  function nextAtHour(now, hour) {
    const today = dayAtHour(now, 0, hour);
    return today > now ? today : dayAtHour(now, 1, hour);
  }

  // The next `dow` (0=Sun..6=Sat) at `hour:00` strictly after `now`, searching
  // from `minDays` out (0 lets today count; 1 forces a future week).
  function nextDow(now, dow, hour, minDays) {
    for (let i = minDays; i <= minDays + 7; i++) {
      const t = dayAtHour(now, i, hour);
      if (new Date(t).getDay() === dow && t > now) return t;
    }
    return dayAtHour(now, minDays + 7, hour);
  }

  function resolve(preset, now, custom) {
    switch (preset) {
      case 'later-today': return { returnAt: now + LATER_TODAY_MS };
      case 'this-evening': return { returnAt: nextAtHour(now, EVENING_HOUR) };
      case 'tomorrow-morning': return { returnAt: dayAtHour(now, 1, MORNING_HOUR) };
      case 'this-weekend': return { returnAt: nextDow(now, SATURDAY, MORNING_HOUR, 0) };
      case 'next-week': return { returnAt: nextDow(now, MONDAY, MORNING_HOUR, 1) };
      case 'custom':
        if (typeof custom !== 'number' || !Number.isFinite(custom)) throw new Error('snooze custom requires a finite timestamp');
        return { returnAt: custom };
      case 'when-im-back': return { untilStartup: true };
      default: throw new Error('unknown snooze preset: ' + preset);
    }
  }

  const isSnoozed = (r) => !!(r && r.snoozeState === 'snoozed');

  // Overdue clock snoozes only — untilStartup records carry no numeric returnAt,
  // so the every-wake sweep never touches them (they resolve on startup).
  function dueSnoozes(records, now) {
    return records.filter((r) => isSnoozed(r) && typeof r.returnAt === 'number' && r.returnAt <= now);
  }

  // The re-arm set on startup: every still-snoozed clock record. A past
  // `returnAt` simply fires its alarm immediately, which the guarded flip absorbs.
  function pendingClock(records) {
    return records.filter((r) => isSnoozed(r) && typeof r.returnAt === 'number');
  }

  // The startup-resolve set: every still-snoozed "when I'm back" record.
  function pendingStartup(records) {
    return records.filter((r) => isSnoozed(r) && r.untilStartup === true);
  }

  // Partition overdue clock snoozes into the set to auto-reopen (web-scheme,
  // soonest-return first, capped to avoid a cold-start tab flood) and the rest to
  // merely surface as "back now" (the cap overflow + any non-web records). A
  // user-scheduled return is honored by reopening; the cap keeps a week-away gap
  // from dumping every tab at once.
  function splitDue(records, now, cap, isWebUrl) {
    const due = dueSnoozes(records, now).slice().sort((a, b) => (a.returnAt || 0) - (b.returnAt || 0));
    const reopen = [], backNow = [];
    for (const r of due) {
      if (isWebUrl(r.url) && reopen.length < cap) reopen.push(r);
      else backNow.push(r);
    }
    return { reopen, backNow };
  }

  // `null` clears the snooze entirely (reopen → a normal tab).
  function mark(record, state) {
    const r = Object.assign({}, record, { snoozeState: state });
    if (state === null) { delete r.returnAt; delete r.untilStartup; }
    return r;
  }

  const api = { resolve, dueSnoozes, pendingClock, pendingStartup, splitDue, mark };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { snooze: api });
})(typeof self !== 'undefined' ? self : globalThis);
