/*
 * ypuf — recall "why this" rationale (Recall v2 / U10).
 *
 * Pure: name the ONE quiet signal that makes a recall row worth a glance — or '' to
 * suppress it. The panel renders this as a small inline meta icon (with the phrase as
 * its tooltip + aria-label), so a zero-signal row adds no marker at all.
 *
 *   compose(row) -> "often revisited" | ""
 *
 * Only revisit FREQUENCY is surfaced (the `frequent` flag the SW stamps from foreground
 * returns). Session membership is intentionally NOT a clause here: it's already shown by
 * the row's ⊕N "bring back the set" chip, so a second "same session as <host>" line would
 * be redundant. Born-equal-safe by construction (Pattern 19): frequency never implies
 * recall/reopen activity, so a never-recalled row (lastAccessed === timestamp) earns
 * nothing false.
 */
(function (root) {
  'use strict';

  function compose(row) {
    if (!row) return '';
    return row.frequent ? 'often revisited' : '';
  }

  const api = { compose };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { rationale: api });
})(typeof self !== 'undefined' ? self : globalThis);
