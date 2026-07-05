/*
 * ypuf — recall panel paging selector (pure core, pattern 18).
 *
 * Decides which record ids belong on a given page of the let-go archive. The SW
 * builds `archive` (a deduped, reverse-chronological list of lightweight metas) and
 * `page0Ids` (the proactive peek), then this maps (page, pageSize) -> ids:
 *   - page 0  -> the peek, in its ranked order;
 *   - page N  -> the reverse-chronological remainder (archive minus the peek), sliced.
 * No peek row ever reappears on a later page. Pure + node-tested (tests/recallpage.test.js).
 */
(function (root) {
  'use strict';

  function pageIds({ archive, page0Ids, page, pageSize } = {}) {
    const list = Array.isArray(archive) ? archive : [];
    const size = pageSize > 0 ? Math.floor(pageSize) : 1;
    const total = list.length;
    const p = page > 0 ? Math.floor(page) : 0;

    if (p === 0) {
      const ids = Array.isArray(page0Ids) ? page0Ids.slice() : [];
      return { ids, page: 0, pageSize: size, total, hasMore: total > ids.length };
    }

    const on0 = new Set(page0Ids || []);
    const remainder = list.filter((m) => m && !on0.has(m.id));
    const start = (p - 1) * size;
    const slice = remainder.slice(start, start + size);
    return { ids: slice.map((m) => m.id), page: p, pageSize: size, total, hasMore: start + size < remainder.length };
  }

  const api = { pageIds };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ypuf = Object.assign(root.ypuf || {}, { recallpage: api });
})(typeof self !== 'undefined' ? self : globalThis);
