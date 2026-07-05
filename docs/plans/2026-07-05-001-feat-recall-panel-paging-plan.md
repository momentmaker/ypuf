# Recall Panel Paging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the new-tab Recall panel flip past its 6-row peek and walk the whole let-go archive in calm pages of 7 — via `]`/`[` keys and subtle `‹ ›` arrows — without becoming a management dashboard.

**Architecture:** A new pure module (`lib/recallpage.js`) decides which record ids belong on a given page; the service worker builds a deduped, reverse-chronological archive from a lightweight meta read (`store.listMetaRecent`, no page content) and hydrates only the visible page. Page 0 stays today's intent-ranked proactive peek; pages 1+ are the chronological remainder. The board's Recall panel gains a pager footer + a `goToPage` loader and exposes a small `recallPager` controller the global keydown handler drives.

**Tech Stack:** Vanilla JS MV3 extension (no build step). Node's built-in test runner (`node --test`) + `fake-indexeddb` for the pure/store tests. DOM/browser code is verified by manual dogfood (load-unpacked), per the repo's existing convention (`tests/MANUAL-DOGFOOD.md`).

## Global Constraints

- **Page size is 7** for the board Recall panel, *including the initial load* (page 0 = proactive top 7). The **⌘⇧K overlay peek stays 6** and must not change.
- **Keys are `]` (next) / `[` (previous)** — NOT `n`/`p` (`p` is *protect* in `boardkeys.js`).
- **`G` → last (oldest) page; `gg` → first (newest) page** — archive-global, cursor on the end row.
- **No new controls beyond the two arrows.** No bulk-select, no bulk-prune, no full-page console (CONTEXT.md §9 — browse-*to-recall*, not browse-*to-organize*).
- **Page-derived text stays host-rendered text-only** — reuse `lib/shelf-render.js` builders; never `innerHTML`.
- **No new permission. Nothing leaves the device.**
- **Never load full page content for the whole archive** — meta read + per-page hydration only.
- **New decidable logic is a pure, node-tested lib** (pattern 18). Reduced-motion gate any new motion.
- Test command: `npm test` (runs `node --test tests/*.test.js`). Single file: `node --test tests/<file>.test.js`.

---

## File Structure

- **Create** `extension/lib/recallpage.js` — pure page-id selector `pageIds({archive, page0Ids, page, pageSize})`.
- **Create** `tests/recallpage.test.js` — node tests for the selector.
- **Modify** `extension/lib/store.js` — add `listMetaRecent()` (lightweight, reverse-chronological, no content).
- **Modify** `tests/store.test.js` — test `listMetaRecent`.
- **Modify** `extension/background.js` — import `recallpage`; rewrite the blank-query branch of `getRecallResults` to page; pass `page`/`pageSize` from the `recall-search` handler.
- **Modify** `extension/lib/boardkeys.js` — map `]`→`pageNext`, `[`→`pagePrev`.
- **Modify** `tests/boardkeys.test.js` — assert the two new intents (and field yield).
- **Modify** `extension/newtab/newtab.js` — pager footer + `goToPage` + chrono-page rendering + `recallPager` controller (panel); wire `pageNext`/`pagePrev`/`G`/`gg` in the global keydown handler; update `CHEATSHEET` + f-hint targets.
- **Modify** `extension/newtab/newtab.css` — pager footer styles.
- **Modify** `CHANGELOG.md`, `tests/MANUAL-DOGFOOD.md` — document the feature + dogfood steps.

---

### Task 1: Pure page-id selector (`lib/recallpage.js`)

**Files:**
- Create: `extension/lib/recallpage.js`
- Test: `tests/recallpage.test.js`
- Modify: `extension/background.js:15-40` (importScripts list) and `extension/background.js:42` (destructure)

**Interfaces:**
- Produces: `recallpage.pageIds({ archive, page0Ids, page, pageSize }) -> { ids: string[], page: number, pageSize: number, total: number, hasMore: boolean }`.
  - `archive`: deduped, reverse-chronological array of `{ id, url, timestamp, snoozeState }` metas.
  - `page0Ids`: string ids chosen for page 0 (the proactive peek), in ranked order.
  - Page 0 returns `page0Ids` verbatim; pages ≥1 return a `pageSize` slice of `archive` with `page0Ids` removed (still reverse-chronological). `total` = `archive.length`.

- [ ] **Step 1: Write the failing test**

Create `tests/recallpage.test.js`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const rp = require('../extension/lib/recallpage.js');

// Build a reverse-chronological archive of metas from ids (newest first).
const A = (...ids) => ids.map((id, i) => ({ id, url: 'https://e.com/' + id, timestamp: 1000 - i, snoozeState: null }));

test('page 0 returns the peek ids in ranked order; hasMore when the archive is larger', () => {
  const archive = A('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'); // 8 total
  const page0Ids = ['b', 'a', 'c'];                          // proactive order, not chronological
  const r = rp.pageIds({ archive, page0Ids, page: 0, pageSize: 3 });
  assert.deepEqual(r.ids, ['b', 'a', 'c']);
  assert.equal(r.page, 0);
  assert.equal(r.pageSize, 3);
  assert.equal(r.total, 8);
  assert.equal(r.hasMore, true);
});

test('page 1 returns the reverse-chronological remainder, excluding page 0', () => {
  const archive = A('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
  const page0Ids = ['b', 'a', 'c'];
  const r = rp.pageIds({ archive, page0Ids, page: 1, pageSize: 3 });
  assert.deepEqual(r.ids, ['d', 'e', 'f']); // archive order minus a/b/c
  assert.equal(r.hasMore, true);            // g,h remain
});

test('the last partial page reports hasMore false', () => {
  const archive = A('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
  const page0Ids = ['a', 'b', 'c'];
  const r = rp.pageIds({ archive, page0Ids, page: 2, pageSize: 3 });
  assert.deepEqual(r.ids, ['g', 'h']);
  assert.equal(r.hasMore, false);
});

test('paging past the end returns an empty page with no more', () => {
  const archive = A('a', 'b', 'c', 'd');
  const page0Ids = ['a', 'b', 'c'];
  const r = rp.pageIds({ archive, page0Ids, page: 5, pageSize: 3 });
  assert.deepEqual(r.ids, []);
  assert.equal(r.hasMore, false);
});

test('page 0 hasMore is false when the whole archive fits the peek', () => {
  const archive = A('a', 'b', 'c');
  const r = rp.pageIds({ archive, page0Ids: ['a', 'b', 'c'], page: 0, pageSize: 7 });
  assert.equal(r.hasMore, false);
});

test('empty archive is safe', () => {
  const r = rp.pageIds({ archive: [], page0Ids: [], page: 0, pageSize: 7 });
  assert.deepEqual(r.ids, []);
  assert.equal(r.total, 0);
  assert.equal(r.hasMore, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/recallpage.test.js`
Expected: FAIL — `Cannot find module '../extension/lib/recallpage.js'`.

- [ ] **Step 3: Write the implementation**

Create `extension/lib/recallpage.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/recallpage.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Register the module in the service worker**

In `extension/background.js`, add the import after line 30 (`'lib/proactive.js',`):

```js
  'lib/proactive.js',
  'lib/recallpage.js',
  'lib/rationale.js',
```

Then add `recallpage` to the destructure on line 42:

```js
const { store, vectorstore, embed, modelasset, search, capture, cluster, exclusion, signal, tabstate, eligibility, protection, eagerness, digest, snooze, privacy, titles, recallrank, recallmerge, recallquery, proactive, recallpage, rationale } = self.ypuf;
```

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (all existing tests + the new file).

- [ ] **Step 7: Commit**

```bash
git add extension/lib/recallpage.js tests/recallpage.test.js extension/background.js
git commit -m "feat(recall): pure page-id selector for archive paging"
```

---

### Task 2: Lightweight ordered-meta read (`store.listMetaRecent`)

**Files:**
- Modify: `extension/lib/store.js` (add function near `listRecent` at line 174; export in the `api` object at line 337)
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: the existing `withStore(mode, fn)` helper (`store.js:95`).
- Produces: `store.listMetaRecent() -> Promise<Array<{ id, url, timestamp, snoozeState }>>`, reverse-chronological, carrying **no** page content.

- [ ] **Step 1: Write the failing test**

Add to `tests/store.test.js` (append after the existing tests):

```js
test('listMetaRecent returns lightweight, reverse-chronological projections (no content)', async () => {
  await store.put(rec({ id: 'a', timestamp: 100, content: 'AAAA' }));
  await store.put(rec({ id: 'b', timestamp: 300, content: 'BBBB' }));
  await store.put(rec({ id: 'c', timestamp: 200, content: 'CCCC', snoozeState: 'sleeping' }));

  const metas = await store.listMetaRecent();

  assert.deepEqual(metas.map((m) => m.id), ['b', 'c', 'a']); // newest-first by timestamp
  assert.equal(metas[0].content, undefined);                 // page content is NOT carried
  assert.equal(typeof metas[0].url, 'string');
  assert.equal(typeof metas[0].timestamp, 'number');
  assert.equal(metas[1].snoozeState, 'sleeping');            // preserved for filtering
  assert.equal(metas[2].snoozeState, null);                  // absent snoozeState → null
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/store.test.js`
Expected: FAIL — `store.listMetaRecent is not a function`.

- [ ] **Step 3: Write the implementation**

In `extension/lib/store.js`, add this function immediately after `listRecent` (after line 178):

```js
  // Lightweight recency-ordered projection for the recall panel pager: id + url +
  // timestamp + snoozeState only, via a cursor so page CONTENT is never materialised
  // for the whole store (a getAll() would deserialise every ~200 KB body). Newest-first.
  async function listMetaRecent() {
    const out = await withStore('readonly', (s) => new Promise((resolve, reject) => {
      const acc = [];
      const req = s.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve(acc); return; }
        const v = cur.value;
        acc.push({ id: v.id, url: v.url, timestamp: v.timestamp, snoozeState: v.snoozeState || null });
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    }));
    out.sort((a, b) => b.timestamp - a.timestamp);
    return out;
  }
```

Then add `listMetaRecent` to the exported `api` object (line 337-343), next to `listRecent`:

```js
    reset, openDB, put, get, getAll, listRecent, listMetaRecent, getByDomain, getByCanonicalKey,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/store.test.js`
Expected: PASS (existing + new test).

- [ ] **Step 5: Commit**

```bash
git add extension/lib/store.js tests/store.test.js
git commit -m "feat(store): listMetaRecent — content-free recency projection for paging"
```

---

### Task 3: Page the blank-query branch of `getRecallResults` (service worker)

**Files:**
- Modify: `extension/background.js` — `getRecallResults` (blank-query `else` branch ~1271-1285; `results` declaration ~1242; return ~1290) and the `recall-search` message handler (line 1498).

**Interfaces:**
- Consumes: `store.listMetaRecent()` (Task 2), `recallpage.pageIds(...)` (Task 1), existing `recallmerge.dedupeRecords`, `proactive.rank`, `cluster.originPathKey`, `projectStored`, `rationale.compose`, and `PIVOT_SCAN_LIMIT` (`background.js:1208`).
- Produces: for a blank query, `getRecallResults` returns `{ results, total, pivots, page, pageSize, hasMore, archiveTotal }`. `total` (raw `store.count`) is unchanged for existing consumers (the overlay). `archiveTotal` = pageable let-go count; `hasMore`/`page`/`pageSize` drive the board pager. Search and pivot branches are unchanged.

> **Note on the overlay:** it sends `recall-search` with no `page`/`pageSize`, so `page` defaults to 0 and `pageSize` defaults to `proactive.DEFAULT_CAP` (6). Its blank peek stays the proactive top 6, identical to today. It ignores the extra fields.

- [ ] **Step 1: Add a `pageInfo` accumulator next to `results`**

In `getRecallResults`, find `let results = [];` (≈ line 1242) and add below it:

```js
  let results = [];
  let pageInfo = null;
```

- [ ] **Step 2: Replace the blank-query `else` branch**

Replace the existing final `else { ... }` branch (the "Proactive 'reaching for these'" block, ≈ lines 1271-1285) with:

```js
  } else {
    // Proactive "reaching for these" (U9) + calm paging past the peek (recall panel paging).
    // Page 0 stays the intent-ranked peek; pages 1+ walk the REST of the let-go archive
    // reverse-chronologically. A content-free meta read builds the deduped archive; only the
    // visible page's records are hydrated. A page you have OPEN now, or a snoozed page, is
    // not a pageable let-go — omit both (mirrors the pre-paging proactive filter).
    const pageSize = (opts.pageSize > 0) ? opts.pageSize : proactive.DEFAULT_CAP;
    const page = (opts.page > 0) ? opts.page : 0;
    const openTabs = await chrome.tabs.query({}).catch(() => []);
    const openKeys = new Set(openTabs.map((t) => (t.url ? cluster.originPathKey(t.url) : null)).filter(Boolean));
    const archive = recallmerge.dedupeRecords(
      (await store.listMetaRecent())
        .filter((m) => m.url && !m.snoozeState && !openKeys.has(cluster.originPathKey(m.url)))
    );
    // Page 0 = the proactive peek, ranked over the recent window (unchanged behaviour, just
    // cap 6→7 when the board asks). proactive.rank scores by url only, so metas rank exactly
    // as full records did. The same ids are excluded from the chronological tail on pages 1+.
    const page0Ids = proactive.rank(archive.slice(0, PIVOT_SCAN_LIMIT), durable, now, { cap: pageSize }).map((m) => m.id);
    const sel = recallpage.pageIds({ archive, page0Ids, page, pageSize });
    const records = (await Promise.all(sel.ids.map((id) => store.get(id)))).filter(Boolean);
    results = records.map((r) => projectStored(r, durable));
    pageInfo = { page: sel.page, pageSize: sel.pageSize, hasMore: sel.hasMore, archiveTotal: sel.total };
  }
```

- [ ] **Step 3: Merge `pageInfo` into the return value**

Find the return at the end of `getRecallResults` (≈ line 1290):

```js
  return { results, total, pivots: parsed };
```

Replace with:

```js
  return Object.assign({ results, total, pivots: parsed }, pageInfo || {});
```

- [ ] **Step 4: Forward `page`/`pageSize` from the message handler**

Find (line 1498):

```js
  if (msg.type === 'recall-search') return respond(getRecallResults(msg.q, { oneBox: !!msg.oneBox }));
```

Replace with:

```js
  if (msg.type === 'recall-search') return respond(getRecallResults(msg.q, { oneBox: !!msg.oneBox, page: msg.page, pageSize: msg.pageSize }));
```

- [ ] **Step 5: Run the full suite (guards against import/reference breakage)**

Run: `npm test`
Expected: PASS. (`getRecallResults` itself needs `chrome`/`store` and isn't node-tested; this confirms the pure libs it now calls and the rest of the suite are green.)

- [ ] **Step 6: Manual smoke — overlay peek unchanged, blank recall works**

Load unpacked (`chrome://extensions` → Developer mode → Load unpacked → select `extension/`), reload the extension, then:
1. Press ⌘⇧K on any page with several let-go pages present → the blank peek shows up to 6 rows as before. PASS if unchanged.
2. Open a new tab → the Recall panel still shows its peek (row count/behaviour verified fully in Task 5).

- [ ] **Step 7: Commit**

```bash
git add extension/background.js
git commit -m "feat(recall): serve paged blank-query results (page/pageSize/hasMore/archiveTotal)"
```

---

### Task 4: `boardkeys` — map `]`/`[` to paging intents

**Files:**
- Modify: `extension/lib/boardkeys.js:35-41` (the `MAP`)
- Test: `tests/boardkeys.test.js`

**Interfaces:**
- Produces: `boardkeys.intent(']', ctx) === 'pageNext'` and `boardkeys.intent('[', ctx) === 'pagePrev'` when no field is focused; `'none'` when `ctx.fieldFocused` (so the keys type literally in the search box).

- [ ] **Step 1: Add the failing assertions**

In `tests/boardkeys.test.js`, inside the existing `test('intent maps the vim normal-mode keys', ...)`, add after the `assert.equal(m('g'), 'g'); assert.equal(m('G'), 'bottom');` line:

```js
  assert.equal(m(']'), 'pageNext'); assert.equal(m('['), 'pagePrev');
```

And add a new test after it:

```js
test('intent yields ]/[ to a focused field (they must type literally in search)', () => {
  const ctx = { fieldFocused: true };
  assert.equal(bk.intent(']', ctx), 'none');
  assert.equal(bk.intent('[', ctx), 'none');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/boardkeys.test.js`
Expected: FAIL — `]` maps to `'none'`, expected `'pageNext'`.

- [ ] **Step 3: Add the mappings**

In `extension/lib/boardkeys.js`, update `MAP` (lines 35-41) to add the two keys. The comment above `MAP` already explains arrows are reserved for lane reorder; extend it and add the entries:

```js
  // Arrows are deliberately NOT mapped: board cells own ◀▶▲▼ for lane reorder
  // (newtab.js makeDraggable), so the recall cursor stays on j/k to avoid a collision.
  // Paging uses ]/[ (vim-idiomatic next/prev) — NOT n/p, since p is already 'protect'.
  const MAP = {
    j: 'down', k: 'up',
    o: 'open', Enter: 'open', r: 'restoreSet',
    d: 'forget', u: 'undo', p: 'protect',
    ']': 'pageNext', '[': 'pagePrev',
    '/': 'search', g: 'g', G: 'bottom',
    e: 'edit', f: 'hints', ',': 'settings', '?': 'help', Escape: 'escape',
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/boardkeys.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/lib/boardkeys.js tests/boardkeys.test.js
git commit -m "feat(boardkeys): map ]/[ to pageNext/pagePrev intents"
```

---

### Task 5: Recall panel pager — `goToPage`, chrono pages, footer, controller

**Files:**
- Modify: `extension/newtab/newtab.js` — the `ypuf` panel `mount` (≈ 1995-2440) and one top-level declaration (≈ 1748).
- Modify: `extension/newtab/newtab.css` — pager footer styles (after the `.shelf-older` block, ≈ line 547).

**Interfaces:**
- Consumes: `send`, `proactive`-paged `recall-search` response `{ results, page, hasMore, archiveTotal }` (Task 3); existing mount-scope helpers `renderProactive`, `group`, `row`, `HL`, `panelEmpty`, `recallPuffSvg`, `syncProtectMarks`, `puffArmed`, `boardLastOpen`, `cssEsc`, `search`; top-level `clearKbdCursor`.
- Produces: top-level `recallPager` (or `null`) with `{ next(), prev(), first(), last() }`, each returning a Promise that resolves after the page renders. Consumed by Task 6.

- [ ] **Step 1: Declare the top-level controller handle**

In `extension/newtab/newtab.js`, find (≈ line 1747-1748):

```js
  let kbdCursor = -1;
  let pendingG = false;   // first 'g' of a 'gg' (jump-to-top) sequence
```

Add a line below:

```js
  let recallPager = null;   // recall panel paging controller {next,prev,first,last}; set on mount, nulled on teardown
```

- [ ] **Step 2: Add paging state + a chrono renderer + the pager footer inside the mount**

In the recall panel `mount`, find the proactive state block (≈ lines 2256-2258):

```js
      let seq = 0;
      let renderedSeq = -1;   // the seq of the batch currently painted — Enter is inert until it catches up to seq
      let timer = null;
```

Add below it:

```js
      const PAGE_SIZE = 7;    // calm page (incl. the initial peek) for the recall panel
      let currentPage = 0;
      let lastTotal = 0;      // pageable let-go count from the last render (drives 'N let go' + gg/G)
      let lastHasMore = false;
```

Then, immediately after the existing `renderProactive` function (which ends at ≈ line 2273 with `return true; }`), add a chronological-page renderer and the pager footer:

```js
      // Pages 1+ walk the archive reverse-chronologically under quiet recency headers
      // (Today / Yesterday / This week / Earlier), reusing the highlight group labels the
      // ⌘⇧K overlay uses. Each bucket opens a new <ul> so headers interleave cleanly.
      function renderChronoPage(target, items) {
        target.textContent = '';
        const now = Date.now();
        let ul = null;
        let lastLabel = null;
        for (const it of items) {
          const label = HL ? HL.groupLabel(it.timestamp, now) : 'Earlier';
          if (label !== lastLabel) {
            target.appendChild(group(label));
            ul = document.createElement('ul');
            ul.className = 'recent';
            ul.setAttribute('role', 'list');
            target.appendChild(ul);
            lastLabel = label;
          }
          ul.appendChild(row(it, [T.timeAgo ? T.timeAgo(it.timestamp) : ''], { action: 'open' }));
        }
      }

      // The calm pager footer: subtle ‹ › arrows (only when the archive is more than one
      // page) + a muted "N let go" count, sharing the row with the existing search route.
      function renderPager(target, info) {
        const foot = document.createElement('div');
        foot.className = 'recall-pager';

        const nav = document.createElement('div');
        nav.className = 'recall-pager-nav';
        if (info.total > PAGE_SIZE) {
          const prev = document.createElement('button');
          prev.type = 'button'; prev.className = 'shelf-page shelf-page-prev';
          prev.textContent = '‹'; prev.title = 'Newer ([)';
          prev.setAttribute('aria-label', 'Newer let-go pages');
          prev.disabled = info.page <= 0;
          prev.addEventListener('click', () => { if (info.page > 0) goToPage(info.page - 1); });

          const next = document.createElement('button');
          next.type = 'button'; next.className = 'shelf-page shelf-page-next';
          next.textContent = '›'; next.title = 'Older (])';
          next.setAttribute('aria-label', 'Older let-go pages');
          next.disabled = !info.hasMore;
          next.addEventListener('click', () => { if (info.hasMore) goToPage(info.page + 1); });

          nav.append(prev, next);
        }

        const count = document.createElement('span');
        count.className = 'recall-count';
        if (info.total) count.textContent = `${info.total} let go`;

        const older = document.createElement('button');
        older.type = 'button'; older.className = 'shelf-older';
        older.textContent = 'Search all let-go pages…';
        older.addEventListener('click', () => search.focus());

        foot.append(nav, count, older);
        target.appendChild(foot);
      }
```

- [ ] **Step 3: Replace `loadProactive` with `goToPage` and set the controller**

Replace the entire `loadProactive` function and its call (≈ lines 2275-2310) — from the `// Load the proactive set...` comment through `loadProactive(++seq);` — with:

```js
      // Load a page under a seq token so a fast keystroke (which bumps seq) supersedes a slow
      // page load (Pattern 17 — no late paint over live search results). Page 0 is the
      // proactive peek; pages 1+ are the chronological remainder. Clears the keyboard cursor
      // (the caller repaints it for keyboard paging; a mouse click leaves it clear = calm).
      function goToPage(n) {
        const mySeq = ++seq;
        clearKbdCursor();
        return send('recall-search', { q: '', oneBox: true, page: n, pageSize: PAGE_SIZE }).then((resp) => {
          if (destroyed || mySeq !== seq) return;
          renderedSeq = mySeq;
          const items = (resp && resp.results) || [];
          currentPage = (resp && typeof resp.page === 'number') ? resp.page : n;
          lastTotal = (resp && resp.archiveTotal) || 0;
          lastHasMore = !!(resp && resp.hasMore);
          recentWrap.textContent = '';

          if (!items.length && currentPage === 0) {   // first run / everything forgotten — calm empty state
            recentWrap.appendChild(panelEmpty(recallPuffSvg(),
              'Nothing let go yet. Let a tab go with ⌘⇧L — its content stays findable.',
              'Then find it again by what the page said — not just its title.'));
            return;
          }

          if (currentPage === 0) renderProactive(recentWrap, items);
          else renderChronoPage(recentWrap, items);
          syncProtectMarks();   // protected-list may have resolved before any rows existed — re-mark now

          // The puff — rows let go since the last board open arrive with a soft settle.
          // Only meaningful on page 0 (the recent peek); one-shot, disarmed after first paint.
          if (currentPage === 0 && puffArmed && boardLastOpen > 0) {
            for (const it of items) {
              if (it.autoClosed && it.timestamp > boardLastOpen) {
                const r = recentWrap.querySelector('[data-id="' + cssEsc(it.id) + '"]');
                if (r) r.classList.add('puff');
              }
            }
          }
          if (currentPage === 0 && puffArmed) puffArmed = false;

          renderPager(recentWrap, { page: currentPage, total: lastTotal, hasMore: lastHasMore });
        });
      }

      // How many pages exist: page 0 (the peek) + ceil(remainder / PAGE_SIZE). Used by G.
      function lastPageIndex() {
        const remainder = Math.max(0, lastTotal - PAGE_SIZE);
        return remainder > 0 ? Math.ceil(remainder / PAGE_SIZE) : 0;
      }

      // The controller the global keydown handler drives (]/[ and gg/G). Each returns the
      // goToPage promise so the caller can place the cursor after the new page renders.
      recallPager = {
        next: () => (lastHasMore ? goToPage(currentPage + 1) : Promise.resolve()),
        prev: () => (currentPage > 0 ? goToPage(currentPage - 1) : Promise.resolve()),
        first: () => goToPage(0),
        last: () => goToPage(lastPageIndex()),
      };

      goToPage(0);
```

- [ ] **Step 4: Force page 0 on query-clear**

In `applyQuery`, find the empty-query branch (≈ lines 2360-2365):

```js
        if (!q) {   // empty → restore the full panel (re-fetch proactive if a prior keystroke dropped it)
          results.textContent = '';
          renderChips(null);
          if (!recentWrap.firstChild) loadProactive(mine);
          return;
        }
```

Replace with:

```js
        if (!q) {   // empty → always return to page 0 of the archive (clearing a query resets paging)
          results.textContent = '';
          renderChips(null);
          goToPage(0);
          return;
        }
```

- [ ] **Step 5: Null the controller on teardown**

Find the mount's teardown return (≈ line 2417):

```js
      return () => { destroyed = true; clearTimeout(timer); for (const t of undoTimers) clearTimeout(t); undoTimers.clear(); }; // cancel the debounce, late renders + pending undo timers
```

Replace with:

```js
      return () => { destroyed = true; recallPager = null; clearTimeout(timer); for (const t of undoTimers) clearTimeout(t); undoTimers.clear(); }; // cancel the debounce, late renders + pending undo timers
```

- [ ] **Step 6: Add the pager footer CSS**

In `extension/newtab/newtab.css`, add after the `.shelf-older { margin-top: 9px; ... }` rule (≈ line 547):

```css
/* Recall paging footer: subtle ‹ › arrows + a muted "N let go" count sharing the row with
   the "Search all…" route. Arrows appear only when the archive is more than one page. */
.recall-pager { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; margin-top: 9px; }
.recall-pager-nav { display: inline-flex; gap: 2px; }
.shelf-page {
  font: inherit; font-size: 14px; line-height: 1; background: none; border: none; cursor: pointer;
  color: var(--accent-slate); padding: 3px 8px; border-radius: 6px;
}
.shelf-page:hover:not(:disabled) { background: var(--warm-gray); }
.shelf-page:focus-visible { outline: 2px solid var(--accent-amber); outline-offset: 1px; }
.shelf-page:disabled { color: color-mix(in srgb, var(--ink) 26%, transparent); cursor: default; }
.recall-count { font-size: 11px; color: var(--muted); }
.recall-pager .shelf-older { margin: 0 0 0 auto; }   /* push the search route to the right edge */
```

- [ ] **Step 7: Run the suite (no regressions in the pure libs)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Manual dogfood — mouse paging**

Reload the unpacked extension. Ensure you have >7 let-go pages (let several tabs go with ⌘⇧L). Open a new tab, then:
1. The Recall panel shows **7** rows under "Reaching for these", a "N let go" count, and (if >7) a `›` arrow enabled with `‹` dimmed. PASS if the initial load is 7.
2. Click `›` → the next 7 appear under a recency header (e.g. "This week" / "Earlier"), `‹` now enabled. No row from page 1 repeats. PASS.
3. Click `›` to the last page → `›` dims. Click `‹` back to page 0 → the proactive peek returns. PASS.
4. Type a query → results replace the panel (no pager). Clear the query → panel returns to page 0. PASS.
5. Row hover still shows protect/forget; clicking a title still opens. PASS (panel otherwise unchanged).

- [ ] **Step 9: Commit**

```bash
git add extension/newtab/newtab.js extension/newtab/newtab.css
git commit -m "feat(recall): pageable Recall panel — arrows, N-let-go count, time-bucket pages"
```

---

### Task 6: Keyboard integration — `]`/`[`, `G`/`gg`, cheatsheet, hints

**Files:**
- Modify: `extension/newtab/newtab.js` — the global keydown switch (≈ 1929-1968), the `g`/`bottom` cases (≈ 1932-1936), the `CHEATSHEET` const (459-472), and `hintTargetEls` (1808).

**Interfaces:**
- Consumes: top-level `recallPager` (Task 5), `boardkeys.intent` returning `pageNext`/`pagePrev` (Task 4), and existing `jumpKbd(toEnd)` (`newtab.js:1777`).

- [ ] **Step 1: Add the `pageNext`/`pagePrev` cases**

In the keydown switch (≈ line 1929), add these two cases after the `case 'up':` line (≈ 1931):

```js
      case 'pageNext': e.preventDefault(); if (recallPager) recallPager.next().then(() => jumpKbd(false)); break;
      case 'pagePrev': e.preventDefault(); if (recallPager) recallPager.prev().then(() => jumpKbd(false)); break;
```

(`jumpKbd(false)` places the cursor on the first row of the freshly-rendered page, so `j`/`k` continue naturally. A mouse click on the arrows does NOT go through here, so it leaves the cursor clear.)

- [ ] **Step 2: Make `G` jump to the last (oldest) page**

Find the `case 'bottom':` line (≈ 1932):

```js
      case 'bottom': e.preventDefault(); jumpKbd(true); break;
```

Replace with:

```js
      case 'bottom':
        e.preventDefault();
        if (recallPager) recallPager.last().then(() => jumpKbd(true));   // oldest page, cursor on its last row
        else jumpKbd(true);
        break;
```

- [ ] **Step 3: Make `gg` jump to the first (newest) page**

Find the `case 'g':` block (≈ 1933-1936):

```js
      case 'g':
        e.preventDefault();
        if (wasPendingG) jumpKbd(false); else pendingG = true;
        break;
```

Replace with:

```js
      case 'g':
        e.preventDefault();
        if (wasPendingG) {
          if (recallPager) recallPager.first().then(() => jumpKbd(false));   // newest page, cursor on its first row
          else jumpKbd(false);
        } else pendingG = true;
        break;
```

- [ ] **Step 4: Update the cheatsheet**

In the `CHEATSHEET` const (lines 459-472), change the `g g / G` line and add a paging line after it:

```js
    ['j / k', 'Move the recall cursor'],
    ['] / [', 'Next / previous page'],
    ['g g / G', 'Jump to first / last page'],
```

- [ ] **Step 5: Let f-hints label the pager arrows**

Find `hintTargetEls` (line 1808):

```js
  const hintTargetEls = () => [...document.querySelectorAll('.recent-item[data-id] .title.clickable, .topsite, .shelf-more, .shelf-older')]
```

Replace the selector to include the pager arrows:

```js
  const hintTargetEls = () => [...document.querySelectorAll('.recent-item[data-id] .title.clickable, .topsite, .shelf-more, .shelf-older, .shelf-page')]
```

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: PASS (no pure-lib regressions).

- [ ] **Step 7: Manual dogfood — keyboard paging**

Reload the unpacked extension. With >14 let-go pages, open a new tab (do NOT click into the search box):
1. Press `]` → advances to page 1, cursor lands on its first row; `j`/`k` move within it. PASS.
2. Press `[` → back to page 0, cursor on first row. PASS.
3. Press `G` → jumps to the last (oldest) page, cursor on the last row. Press `g` `g` → returns to page 0, first row. PASS.
4. Focus the search box, press `]` → it types a literal `]` (does not page). PASS.
5. Press `?` → the cheatsheet lists `] / [` and `g g / G` with the paging descriptions. PASS.
6. Press `f` → hint badges appear on the `‹ ›` arrows too; typing a label pages. PASS.

- [ ] **Step 8: Commit**

```bash
git add extension/newtab/newtab.js
git commit -m "feat(recall): wire ]/[ paging + gg/G archive-end jumps into the board keys"
```

---

### Task 7: Docs — CHANGELOG + dogfood checklist

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `tests/MANUAL-DOGFOOD.md`

- [ ] **Step 1: Add a CHANGELOG entry**

Add an unreleased entry at the top of `CHANGELOG.md` (match the existing heading style — look at the top of the file and mirror it):

```markdown
## Unreleased

### Added
- **Recall panel paging.** The new-tab Recall panel now walks the whole let-go archive in
  calm pages of 7 — page 1 stays the "reaching for these" peek, later pages walk back
  reverse-chronologically under Today / This week / Earlier headers. Flip with the subtle
  `‹ ›` arrows beside "Search all let-go pages…", or `]` / `[` in the keyboard layer
  (`g g` / `G` jump to the newest / oldest page). A quiet "N let go" count reassures that
  nothing was lost. Still search-first and local-only; the ⌘⇧K overlay is unchanged.
```

- [ ] **Step 2: Add dogfood steps**

Append a section to `tests/MANUAL-DOGFOOD.md` (match its existing format):

```markdown
## Recall panel paging

Prep: let go of >14 pages (⌘⇧L) so the archive spans several pages.

- [ ] New tab → Recall panel shows exactly 7 rows under "Reaching for these" + a "N let go" count.
- [ ] `›` (or `]`) pages to the next 7 under a recency header; no row repeats page 1.
- [ ] `‹` (or `[`) pages back; on page 0 the `‹` arrow is dimmed.
- [ ] `G` jumps to the oldest page (cursor last row); `g g` returns to page 0 (cursor first row).
- [ ] Typing a query hides the pager; clearing it returns to page 0.
- [ ] In the search box, `]` and `[` type literally (do not page).
- [ ] ⌘⇧K overlay blank peek is unchanged (still ~6 rows, no pager).
- [ ] Reduced-motion OS setting: paging has no jarring motion.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md tests/MANUAL-DOGFOOD.md
git commit -m "docs(recall): changelog + dogfood steps for panel paging"
```

---

## Self-Review

**Spec coverage (`docs/brainstorms/2026-07-05-recall-panel-paging-requirements.md`):**
- P1 (pages of 7, incl. init; panel otherwise unchanged) → Task 5 (PAGE_SIZE, goToPage renders page 0 via renderProactive) + Task 3 (pageSize forwarded).
- P2 (page 0 proactive, pages 2+ reverse-chrono deduped) → Task 1 (recallpage) + Task 3 (page0Ids via proactive, archive deduped).
- P3 (`]`/`[` + `‹ ›` beside "Search all…", edge-dim, appear only when >1 page) → Task 4 (keys) + Task 5 (renderPager) + Task 6 (key cases).
- P4 (`n`/`p` not used; `p` stays protect) → Task 4 (MAP keeps `p: 'protect'`, adds `]`/`[`).
- P5 (`G` → last page / `gg` → first page) → Task 6.
- P6 (time-bucket headers on pages 2+; page 1 unchanged) → Task 5 (renderChronoPage using HL.groupLabel; renderProactive unchanged).
- P7 (muted "N let go" count) → Task 5 (renderPager `.recall-count`, using `archiveTotal`).
- P8 (paging suspended during query; clear → page 0) → Task 5 (applyQuery clear → goToPage(0); search path untouched).
- P9 (page change resets cursor to first row; page-0 behaviour preserved) → Task 5 (goToPage clears cursor; puff/protect on page 0) + Task 6 (jumpKbd after keyboard paging).
- P10 (no full-content load; `recall-search` gains page/pageSize; overlay peek stays 6) → Task 2 (listMetaRecent) + Task 3 (default pageSize=6 for the overlay; per-page hydration).

**Placeholder scan:** No TBD/TODO; every code step shows full code; manual steps are explicit. DOM tasks (5, 6) are verified by dogfood because the repo has no DOM test harness — this is called out, not hand-waved.

**Type consistency:** `recallpage.pageIds` returns `{ ids, page, pageSize, total, hasMore }` (Task 1); Task 3 maps `sel.total → archiveTotal` in the response; Task 5 reads `resp.archiveTotal → lastTotal` and `resp.hasMore → lastHasMore`, and `resp.page → currentPage`. `store.listMetaRecent` shape `{ id, url, timestamp, snoozeState }` (Task 2) matches what Task 3 filters/dedupes and what `recallpage` reads (`.id`). `recallPager` methods return Promises (Task 5); Task 6 chains `.then(jumpKbd(...))`. Consistent.
