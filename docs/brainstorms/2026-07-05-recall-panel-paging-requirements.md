---
title: Recall panel paging — walk the whole let-go archive, calmly
status: ready-for-planning
created: 2026-07-05
type: feature
actors: [A1 dogfooder/end-user]
origin: owner idea (2026-07-05) — "arrows + n/p to page through the whole saved list." Steered inside docs/CONTEXT.md §9 (the "scan-everything dashboard" line) to a search-first, calm paging of the existing Recall panel, not a browse-all console.
---

# Recall panel paging — walk the whole let-go archive, calmly

## Summary

Let the new-tab **Recall panel** flip past its 6-row peek so the user can reach the
*whole* let-go archive without typing a query — as **calm pages of 7**, not a wall.
Page 1 stays today's intent-ranked "reaching for these" peek; pressing `]` / `[`
(or clicking subtle `‹ ›` arrows beside the existing "Search all let-go pages…"
footer) walks back through the rest of the archive newest→oldest, under quiet
time-bucket headers, with a muted "N let go" reassurance count. The panel itself is
**unchanged** — same rows, same per-row actions, same empty state; we are only
surfacing pagination. Nothing becomes a management dashboard, and search stays one
keystroke away.

---

## Problem frame

The Recall panel shows a deliberately calm peek — `proactive.DEFAULT_CAP = 6` "reaching
for these" rows — and past that hands the user off to search via a "Search all let-go
pages…" button (`newtab.js` `loadProactive`). That is the right default: the best search
is the one you never run. But there is no way to simply *wander* the archive: to flip
through what you've let go, in order, when you don't have a query in mind. The owner
asked for exactly this — "arrows and n/p to see the whole list."

Taken literally, "see the whole list, paginated" brushes the **§9 parked line**: a
*"scan-everything and manually prune" dashboard* is explicitly the opposite of ypuf's
philosophy and stays rejected. The job underneath the ask, though, is on-mission —
**findability / reachability**: "let me get back to any let-go page, even one I can't
name." So we serve it the calm way: page the *existing* panel in place. Same surface,
same calm, no console — just flippable.

The literal keys the owner proposed (`n`/`p`) collide: `p` is already **protect** in the
board's vim layer (`boardkeys.js`). So paging uses `]` / `[` (vim-idiomatic next/prev)
plus clickable `‹ ›`.

---

## Actors

- **A1 — the dogfooder / end-user.** Opens a new tab, wants to browse back through pages
  they've let go — without a query — to re-find something, or just to reassure themselves
  nothing was lost. Keyboard-first; also clicks.

---

## What we're building

### Requirements

**Calm paging of the archive (page 1 = today's peek)**
- P1. The Recall panel paginates the let-go archive in **pages of 7**, *including the
  initial load* — page 1 is the existing proactive "reaching for these" set, now 7 rows
  (was 6). The panel's rows, per-row actions (open / forget / protect / undo / restore
  set), favicons, puff arrival, and empty state are otherwise **unchanged**.
- P2. **Page 1 stays the intent-ranked peek** (`proactive.rank`). **Pages 2+** are a
  reverse-chronological walk-back through the *rest* of the let-go archive (newest→oldest),
  deduped against page 1 so no page-1 row reappears.

**Navigation (keys + subtle arrows)**
- P3. `]` = next page (older), `[` = previous page (newer) in the board's vim layer.
  Subtle clickable `‹ ›` arrows sit **beside the existing "Search all let-go pages…"
  footer**. `‹` is dimmed/inert on page 1; `›` on the last page. The arrows appear only
  when the archive exceeds one page.
- P4. `n` / `p` are **not** used for paging — `p` is *protect* in `boardkeys.js` and stays
  so. `]` / `[` avoid the collision and read as paging.
- P5. `G` jumps to the **last (oldest) page**, cursor on its last row; `gg` jumps to the
  **first (newest) page**, cursor on its first row — extending the existing vim `g`/`G`
  from page-local to archive-global (vim's own gg/G "start/end of file" semantics, where
  the file is now the whole paged archive).

**Orientation (quiet, not a dashboard)**
- P6. Each chronological page (2+) shows quiet recency **group headers** (Today / Yesterday
  / This week / Earlier) where the bucket changes, reusing the highlight group-label logic
  (`lib/highlight.js` `groupLabel`, as the ⌘⇧K overlay already does). Page 1 keeps its
  current look (the intent-ranked peek is not time-ordered).
- P7. A quiet, muted **"N let go" count** (the size of the pageable archive) shows in the
  footer — a "nothing's lost" reassurance signal, never a prominent metric.

**Behavior with search + on page change**
- P8. Paging is **suspended while a query is active** — typing shows live search results
  exactly as today (no pager). Clearing the query returns to page 1.
- P9. Changing page **resets the keyboard cursor to the first row** of the new page
  (`boardkeys.moveCursor` / `reanchor`). All existing page-1 behavior (puff arrival,
  protect marks, click-to-open) is preserved.

**Backend paging (no full-content blowup)**
- P10. The service worker serves pages **without loading full page content for the whole
  archive**. A lightweight ordered-meta read (id, url-key, timestamp, state — *not*
  `textContent`) builds the deduped ordered list; only the **visible page's** records are
  hydrated (`store.get`). `recall-search` gains `page` (0-indexed) + `pageSize` and returns
  `{ results, page, pageSize, hasMore, total }`. `page: 0` is the first/peek page ("page 1"
  in the prose above); it is behavior-unchanged except the board requests `pageSize: 7`. The
  **⌘⇧K overlay peek stays at 6** and is not touched by this slice.

---

## Key flows

- PF1 — **Flip through history.** New tab → panel shows the top **7** "reaching for these".
  Press `]` (or click `›`) → the next 7, reverse-chronological, under a *This week* /
  *Earlier* header. `[` / `‹` walks back toward newer. `/` still jumps to search anytime.
  *Covered by:* P1, P2, P3, P6, P8.
- PF2 — **Jump to the ends.** `gg` → newest page + first row; `G` → oldest page + last row.
  *Covered by:* P5.
- PF3 — **Quiet reassurance.** The footer reads "42 let go" — everything's reachable,
  nothing lost. *Covered by:* P7.

---

## Acceptance examples

- PAE1 — **Page size + init.** *Covers P1.* First load shows exactly **7** rows (the
  proactive peek), not 6.
- PAE2 — **Walk-back ordering.** *Covers P2.* `]` from page 1 shows the next 7 let-go pages
  in reverse-chronological order; none duplicate a page-1 row (dedup against page 1 holds).
- PAE3 — **Arrows, keys, and the collision.** *Covers P3, P4.* `]`/`[` page the panel;
  clicking the dimmed `‹` on page 1 does nothing; pressing `p` on a cursored row still
  **protects** it (never "previous").
- PAE4 — **Ends.** *Covers P5.* On page 1, `G` jumps to the last page with the cursor on the
  oldest row; `gg` returns to page 1, first row.
- PAE5 — **Time headers + count.** *Covers P6, P7.* Page 3 shows an *Earlier* header where
  the bucket changes; the footer reads a muted "42 let go".
- PAE6 — **Query suspends paging.** *Covers P8.* Typing shows live search results with no
  pager; clearing the query returns to page 1.
- PAE7 — **No content blowup; overlay untouched.** *Covers P10.* Paging a 500-page archive
  never loads all page text (only the 7 visible records hydrate); the ⌘⇧K overlay peek is
  still 6 and otherwise byte-for-byte unchanged.

---

## Success criteria

- A user can reach **any** let-go page by flipping pages — with **zero typing** — and the
  panel still feels calm (7 at a time, quiet headers, no controls beyond the arrows).
- The beloved page-1 peek is **unchanged in ranking**; only its row count (6→7) and the
  ability to page past it are new.
- Paging is correct at scale: a large archive pages without duplicates, in stable
  reverse-chronological order, and without loading full page content for non-visible pages.
- The §9 line holds: no bulk-select, no bulk-prune, no full-page console — this is
  browse-*to-recall*, not browse-*to-organize*.
- Privacy holds: page-derived titles stay host-rendered text-only (`lib/shelf-render.js`,
  no innerHTML); no new permission.
- The pure paging/selection logic is node-tested (pattern 18); `boardkeys` gains
  `]`/`[` → `pageNext`/`pagePrev` intents with tests.

---

## Scope boundaries

**In scope**
- Paging the new-tab **Recall panel** (page size 7, page 1 = proactive peek, pages 2+
  reverse-chronological deduped), the `]`/`[` keys + `‹ ›` arrows, `G`/`gg` archive-end
  jumps, quiet time-bucket page headers, the muted "N let go" count, and the SW paging seam
  (`page`/`pageSize`, lightweight meta read + per-page hydration).

**Deferred (parked, not cut)**
- **⌘⇧K overlay paging** — the same backend `page` param would let the overlay page its
  blank-query peek with `←`/`→` (a clean ↑↓ rows / ←→ pages mnemonic). Small follow-up;
  out of this slice to keep the surface count down.
- **Paging *search-result* pages** — search caps at ~20–30 hits and scrolls; a pager only
  earns its place if results ever exceed a page. Not now.
- **A subtle "2 / 6" page position** — time headers + the count already orient; add only if
  dogfood shows people lose their place.

**Outside this product's identity**
- **A "scan-everything and manually prune" dashboard** — the §9 line. This is calm,
  in-place, per-row-action-only paging of the existing panel, explicitly *not* a management
  console. Recorded here so it is not re-litigated as scope creep.
- **Bulk selection / bulk forget / manual organization** — same line; per-row actions only.

---

## Constraints (ypuf identity — load-bearing)

- **Calm by design (§9):** the panel stays a quiet peek that happens to flip. No new
  controls beyond two arrows; headers and count are muted secondary text; motion (if any on
  page change) is reduced-motion-gated.
- **§9 reconciliation (explicit):** paging the whole archive is reachability, not a prune
  dashboard — same surface, no bulk controls, search one keystroke away. This is the "new
  info" that keeps it on the right side of the parked line.
- **Privacy / local-only (§7):** page-derived text host-rendered text-only
  (`lib/shelf-render.js`); no innerHTML; no new permission; nothing leaves the device.
- **Reuse shipped foundations:** `proactive.rank` (peek), `recallmerge.dedupeRecords`
  (dedup), `lib/highlight.js` `groupLabel` (time buckets), `boardkeys.js` (vim layer +
  `moveCursor`/`reanchor`), the store / IndexedDB index, and the pure-tested-lib convention
  for the new paging/selection core.

---

## Key decisions

- **Surface = the board Recall panel only** (the panel the owner named; where the vim layer
  lives; arrows read naturally beside "Search all let-go pages…"). The overlay is a
  deferred follow-up on the same backend.
- **Page 1 = the intent-ranked peek; pages 2+ = reverse-chronological, deduped against
  page 1.** Preserves the magic *and* gives a predictable, complete timeline (chosen over
  pure-chronological, which loses the frequency-aware peek, and over proactive-everywhere,
  which makes deeper pages feel arbitrary).
- **Keys `]` / `[`, not `n` / `p`** — `p` is protect (`boardkeys.js`); `]`/`[` avoid the
  collision and read as paging. `G`/`gg` extend to archive ends.
- **Page size 7**, including the initial load — a slightly fuller peek that still scans
  without scrolling; applied to the board request only (overlay peek stays 6).
- **Paging suspended during search** — search is still the fast path; paging is the
  no-query wander. Clearing the query returns to page 1.
- **No full-archive content load** — lightweight ordered-meta read + per-page hydration, so
  a large archive pages cheaply.

---

## Dependencies / Assumptions

- Builds entirely on shipped foundations (see Constraints); **no new permission**.
- Assumes the store can yield a lightweight recency-ordered projection (id, url-key,
  timestamp, state) without the ~200 KB `textContent` per record — either via a cursor
  projection or a slim listing method (technical, plan-time).
- Assumes `recallmerge.dedupeRecords` collapses same-page records on url-key + newest-wins
  using only those meta fields (holds today).
- Assumes `proactive.rank` accepts a `cap` opt (it does: `opts.cap`), so page 1 → 7 is a
  parameter change, not a rewrite.

---

## Open questions (for planning / low-stakes)

- **[Affects P3/P7][visual]** Exact footer layout — `‹ ›`, the "N let go" count, and
  "Search all let-go pages…" sharing one calm row (side-by-side vs stacked). Tune in build.
- **[Affects P3][UX]** Clamp vs wrap at the ends. Lean **clamp** (calmer, predictable) —
  `‹` inert on page 1, `›` inert on the last page.
- **[Affects P10][Technical]** Meta-read implementation — an IndexedDB cursor projection
  vs. raising the existing scan limit. Lean cursor projection so it scales past a few
  hundred let-go pages.
- **[Affects P7][Technical]** Whether "N let go" counts snoozed/open pages. Lean: count the
  **pageable** archive only (let-go, not currently open, not snoozed) so the number matches
  what paging can actually reach.
- **[Affects P2][Technical]** Whether page-1 proactive ids are recomputed per request (to
  exclude from the chronological tail) or passed from the client. Lean: recompute in the SW
  (deterministic, stateless).
