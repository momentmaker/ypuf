---
title: "feat: Recall v2 — recall superpowers (intent-ranked, one-box, proactive)"
type: feat
status: active
date: 2026-06-22
origin: docs/brainstorms/2026-06-22-ypuf-recall-superpowers-requirements.md
deepened: 2026-06-22
---

# feat: Recall v2 — recall superpowers (intent-ranked, one-box, proactive)

## Summary

Upgrade the new-tab Recall panel's search by pointing the engine's own signals at it:
blend revisit/dwell/recency into MiniSearch ranking, unify open tabs + let-go archive +
snoozed into one deduped query whose action adapts per state, add episodic pivots
(`with:` / time phrases), polish the result UX (matched-phrase highlight, streaming,
Enter-to-act), surface a proactive "reaching for these" set before the user types, and
attach a quiet "why this" line per result. Built from four new pure-tested cores (ranking,
query-parse, proactive-rhythm, rationale) plus a co-located dedup/merge helper and thin
SW/panel glue; no new Chrome permissions; semantic recall (R12–R15) is a separate later slice.

---

## Problem Frame

Recall works today but is *literal* — it ranks by text alone (`lib/search.js` MiniSearch),
searches only the let-go archive, and only helps once the user types. The engine already
knows how much each page was cared about (`lib/signal.js`), what it was open with
(`lib/cluster.js`), and which pages are open / let-go / snoozed right now — but none of that
reaches the search box. See origin: `docs/brainstorms/2026-06-22-ypuf-recall-superpowers-requirements.md`.

---

## Requirements

- R1. Intent-ranked results: blend `signal.js` revisit/dwell/recency into text relevance.
- R2. The blend is tunable; intent can lift a weaker text match, exact matches stay competitive.
- R3. One-box search across open tabs + let-go archive + snoozed, deduped by URL.
- R4. Result action adapts by state: open → jump; let-go → restore; snoozed → "coming back"/wake.
- R5. Episodic pivots: narrow by session (`with: <…>`) and time ("last tuesday", "this morning").
- R6. Streaming results; top result restorable/openable with a single Enter.
- R7. Matched phrase highlighted inline in the content excerpt (text-only).
- R8. Typo-forgiving fuzzy search.
- R9. Proactive blank-state: before typing, show "reaching for these" by recency + frequency rhythm.
- R10. The proactive set stays calm and yields to live search on the first keystroke.
- R11. Each result carries a quiet, signal-derived "why this" rationale.

**Origin actors:** A1 (dogfooder / end-user)
**Origin flows:** F1 (type to find / one box), F2 (zero-type recall), F3 (pivot on context), F4 (semantic — out of scope here)
**Origin acceptance examples:** AE1 (R3,R4), AE2 (R1,R2), AE3 (R9,R10), AE5 (R5), AE6 (R7,R8) — AE4 covers the deferred semantic slice and is out of scope.

> **Note on R9 (post-review):** this slice ranks the proactive set by **recency (`lastActiveAt`)
> + frequency (`revisits`)**, not a full per-URL time-of-day histogram. The histogram is deferred
> (see Scope Boundaries) because its storage/retention cost outweighed unproven fidelity gains.

---

## Scope Boundaries

- **Semantic recall (R12–R15)** — the opt-in embedding model + "recall by meaning" is a
  separate later slice (origin Key decision). Not in this plan.
- **Chrome browser history as a source** — stays OUT (origin Key decision); one-box = ypuf-owned
  states only. No `history` permission; no new permissions at all for this slice.
- **User-created tags / folders** — remain rejected (origin §9). Pivots surface the engine's
  grouping, never user-declared labels.
- **No changes to the MiniSearch index schema / reconcile logic** — open tabs are unified at
  query time, not indexed (snoozed pages are already indexed via the let-go pipeline).

### Deferred to Follow-Up Work

- **Per-URL time-of-day hour histogram** (24-bucket `hourHist`) — deferred from U8 after review:
  25× per-URL storage with unbounded key growth + a migration, for unproven fidelity over
  `lastActiveAt` + `revisits`. Revisit only if dogfood shows recency+frequency misses the "you
  reach for this at 9am" rhythm.
- **Named / saved session clusters** for `with: <name>` — clusters are anonymous today; this slice
  ships the thin pivot (filter by sibling URL/host). Stable cluster identity is a later data change.
- **Parity of the one-box + adaptive actions/pivots in the `⌘⇧K` command-bar / popup recall path** —
  this slice keeps the overlay safe (it must not receive `kind:'open'` rows it can't action — see
  U3), but the overlay's own adaptive UI/pivots are a follow-up.

---

## Context & Research

### Relevant Code and Patterns

- `extension/lib/search.js` — MiniSearch v7.1.1 view; `CONFIG.storeFields = ['id']`,
  `SEARCH_OPTS = { boost, fuzzy: 0.2, prefix: true }`; `search(q, opts)` merges per-call opts.
  `boostDocument(id, term, storedFields)` is invoked with only the *stored fields* (`{id}`).
  `excerptAround(content, query, radius)` returns a trimmed/collapsed plain-text snippet.
- `extension/lib/signal.js` — durable `{ dwell: {url:ms}, revisits: {url:count} }`, **keyed by the
  exact full URL**; `deleteByUrl`/`deleteByDomain` currently clear only `dwell`+`revisits`.
- `extension/lib/cluster.js` — `originPathKey(url)` (origin+pathname) is the **public** canonical
  dedup key already used in `background.js` (`getRecallResults` open-tab exclusion, `reopenUrl`).
  `computeSet` sibling sets are anonymous URL lists stamped on the let-go record (no name/id).
- `extension/lib/store.js` — record `{ id, url, host, title, content, excerpt, timestamp,
  lastAccessed, byteSize, contentLess, autoClosed?, siblings?, snoozeState?, returnAt?,
  untilStartup? }`; IDB is source of truth; `siblingKey` is **private** (not exported).
- `extension/lib/highlight.js` — `segments(text, query) -> [{text, hl}]`, literal lowercased
  `indexOf` matching, rendered text-only.
- `extension/lib/shelf-render.js` — `itemRow` + `toDom` (textContent/setAttribute only; never
  innerHTML). `extension/newtab/newtab.js` — `registerPanelType` (Recall = `'ypuf'`),
  `row(it, tags, action)`, `renderList`, `applyQuery` (180ms debounce → `send('recall-search')`,
  guarded by a `seq` token), the blank-q `list-recent` render (guarded only by `if (destroyed)`),
  `panelEmpty`, `reduceMotion()`, the `boardkeys`-driven keyboard cursor, `clearKbdCursor`.
- `extension/background.js` — `getRecallResults(q)` (loads the signal map, projects `frequent`,
  `store.get` per hit), `projectTab` (url+title only), `reopenRecord`, `snoozeList`/`snoozeWake`,
  the `onMessage` dispatch (checks `sender.id === chrome.runtime.id`), `maybePrune`/`store.prune`.
- `extension/overlay/overlay.js` — the `⌘⇧K` command bar **shares** `recall-search` →
  `getRecallResults` and acts via `recall-open`.
- `extension/lib/timegroup.js`, `extension/lib/returnwindow.js` — injected-`now` time bucketing;
  the reference style for the relative-phrase parser.

### Institutional Learnings

From `docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`:

- **Pattern 3:** reconcile only heals index↔store. Open tabs live *outside* the index → unify at
  query time, dedup after, **don't index open rows**. (Snoozed rows are already in the index.)
- **Pattern 9:** signal is keyed by exact URL; if the dedup key and the signal lookup key differ,
  signal won't attach. This slice's dedup key (`originPathKey`, origin+pathname) is **coarser** than
  the signal key (full URL) — they intentionally differ, so the boost must reconcile them (aggregate
  signal across the full-URLs that collapse to one key) and degrade to text-only when none banks.
- **Pattern 19 (born-equal):** `lastAccessed === timestamp` means "never recalled." The trap ships
  *despite* green pure-core tests when the integration seam feeds a non-production `ageMs`. Test it
  end-to-end at the U3 projection, in the production record shape.
- **Patterns 17 & 20:** streaming re-renders every keystroke → reset cursor state at the top of each
  render, and guard async search **and** the proactive blank-q load with the *same* `seq` token (the
  live code guards the blank-q render with `if (destroyed)` only — that is insufficient).
- **Pattern 6 / 15:** every async `onMessage` branch must `sendResponse({error})`; the UI tolerates
  `!resp`; validate caller tab-ids against the SW's own live enumeration.
- **Pattern 18:** extract decidable cores (ranking, query-parse, merge, proactive, rationale).
- **Pattern 25:** test relative-weekday parsing at several fixed weekdays.

---

## Key Technical Decisions

- **Unify at query time; only open tabs are net-new.** Snoozed pages are already in the index (same
  `letGo` pipeline) — their `kind` is derived from `record.snoozeState`. The one genuinely new source
  is live `chrome.tabs.query`. Open tabs carry **url+title only** (no content), so they are matched by
  substring/fuzzy over url/title and injected as `kind:'open'` candidates **before** the merge.
- **Dedup on `cluster.originPathKey` (public), no new key module.** Drop a separate `recallkey.js`
  `keyOf`; reuse the existing canonical key to avoid Pattern 9 divergence. The **merge** logic (the
  real new decision) is a small co-located tested helper.
- **Merge is field-level, not row-level.** The surviving row takes `kind` + `tabId` from the
  open/snoozed twin but **retains content, excerpt, siblings, timestamp** from the indexed (let-go)
  record, so highlight / `with:` / "why this" don't degrade on the most common dedup case.
- **Intent via `boostDocument`, reconciled with the signal key.** Build an id→url map for the
  candidate set before `search.search` (the callback only receives `{id}`); look signal up by the
  surviving row's full URL **and aggregate** across full-URLs that collapse to the same
  `originPathKey` (sum `revisits`/`dwell`) so heavily-used query-bearing pages still get lift.
  `storeFields` stays `['id']`. Normalize the unbounded text score and signal to comparable ranges.
- **Intent is a bounded tie-breaker, not an unbounded multiplier.** It may reorder only among rows
  clearing a minimum text-relevance floor, so a 200×-revisit daily-driver can't float to the top of
  unrelated queries. "Default conservative" (origin R2) is a concrete cap, not just a weight.
- **Proactive rhythm = `lastActiveAt` + `revisits`** (recency + frequency). The 24-bucket hour
  histogram is deferred (Scope Boundaries).
- **Overlay safety.** `getRecallResults` must not hand the `⌘⇧K` overlay `kind:'open'`/cross-state
  rows it can't action — gate the new rows behind a caller/source flag (panel-only) until the overlay
  is updated.
- **Highlight extends `highlight.segments` / `excerptAround`, text-only.** Highlight the term
  MiniSearch actually matched (from hit match metadata), since a fuzzy hit (`goggle`→`Google`) has no
  literal query substring in the content; exact-substring hits highlight as today.

---

## Open Questions

### Resolved During Planning

- Ranking injection: `boostDocument` + an id→url map + signal aggregation across collapsed URLs;
  intent applies as a bounded tie-breaker above a text-relevance floor.
- Cross-state dedup key: `cluster.originPathKey` (public); merge is field-level.
- Net-new source: only live open tabs (matched on url/title); snoozed via `snoozeState`.
- `with:` semantics: thin sibling-URL/host filter on let-go rows; open/snoozed pass through.
- Proactive rhythm: `lastActiveAt` + `revisits`; hour histogram deferred.
- New signal field retention: age-pruned on a recurring trigger + purged by forget/blocklist (U8).

### Deferred to Implementation

- Exact normalization curve, blend weights, the text-relevance floor value — tune via dogfood.
- Exact relative-phrase grammar coverage beyond the named set.
- Chip visual styling specifics (position/trigger/dismiss decided in U6; pixel styling at impl).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
query "github with: tax research"
        │
        ▼  recallquery.parse(q, now) → { text:"github", withTerm:"tax research", timeRange:null }
        │
        ▼  (SW: getRecallResults, panel-caller only emits the new rows)
   ┌─────────────────────────┬──────────────────────────────┐
   │ index hits (MiniSearch  │ live open tabs (chrome.tabs)  │   snoozed = index hits whose
   │  + boostDocument)       │  substring/fuzzy on url+title │   record.snoozeState is set
   │  carries let-go+snoozed │  → kind:'open' (no content)   │   (NOT a separate source)
   └───────────┬─────────────┴───────────────┬──────────────┘
               └────► merge(rows) by originPathKey, FIELD-LEVEL ◄──┘
                          │  surviving row: { kind, tabId?, content, siblings, reason }
                          ▼
        boost = bounded-tiebreak( textScore, aggregateSignal(url→originPathKey) )
                          │
                          ▼
   panel renders; action adapts by kind; highlight matched term; quiet "why this"
```

---

## Implementation Units

### U1. Ranking-blend core (`lib/rank.js`)

**Goal:** A pure, tested scorer that blends text relevance with intent as a bounded tie-breaker.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Create: `extension/lib/rank.js`
- Test: `tests/rank.test.js`

**Approach:**
- Pure `blend(textScore, { revisits, dwell, ageMs }, ctx) -> number`. Normalize the unbounded,
  query-relative text score and each signal component to comparable ranges. Apply intent **only as a
  bounded tie-breaker among rows that clear a minimum text-relevance floor** (e.g. `textScore ≥
  k·topScore`), so a very-high-revisit page with a marginal text match cannot outrank a strong exact
  match. Zero/absent signal → text-only. Weights + floor are named constants (tunable).

**Patterns to follow:** injected-input pure-lib shape of `lib/signal.js` / `lib/timegroup.js`.

**Test scenarios:**
- Happy path: two equal text scores, higher `revisits` ranks first (Covers AE2).
- Edge case: a 200×-revisit page with a *marginal* text match does NOT outrank a strong exact match
  with zero signal (cross-document dominance bounded).
- Edge case: zero signal → text-only baseline; never NaN/negative.
- Edge case: born-equal `ageMs` (from `lastAccessed === timestamp`) gives no recency lift (Pattern 19).
- Edge case: large text score not swamped by large revisit count, and vice versa.

**Verification:** Ordering assertions pass; the floor bounds intent; weights live in one place; no I/O.

---

### U2. Cross-state dedup/merge helper (reuse `cluster.originPathKey`)

**Goal:** Field-level merge of multi-source rows into one row per canonical key — no new key module.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `extension/lib/cluster.js` only if a recall-oriented alias for `originPathKey` helps;
  otherwise none (reuse as-is)
- Create: a small `merge(rows)` helper co-located with U3's unifier (no standalone `recallkey.js`)
- Test: `tests/recall-onebox.test.js`

**Approach:**
- Dedup by `cluster.originPathKey(url)` (the existing public canonical key; do **not** re-implement
  `siblingKey`, which is private and would risk Pattern 9 divergence).
- `merge(rows)` collapses rows sharing a key **field-level**: take `kind` + `tabId` from the
  open/snoozed twin (precedence open > snoozed > let-go for the *action*), but retain
  `content`/`excerpt`/`siblings`/`timestamp` from the indexed let-go record for display, highlight,
  `with:`, and "why this".

**Patterns to follow:** the existing `openKeys`/`originPathKey` dedup in `getRecallResults`.

**Test scenarios:**
- Happy path: an open tab + its let-go twin (differing hash/query) collapse to one row (Covers AE1).
- Edge case: trailing slash / query / hash canonicalize to the same key.
- Edge case: the merged open+let-go row keeps a non-empty excerpt AND its `siblings` (so highlight /
  `with:` don't silently degrade on the most common dedup case).
- Edge case: empty input → empty output; single row passes through unchanged.

**Verification:** Dedup is order-independent and deterministic; merged rows preserve display fields.

---

### U3. One-box recall in the service worker

**Goal:** Make `getRecallResults` unify index hits + live open tabs, intent-ranked, deduped, kind-tagged.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U1, U2

**Files:**
- Modify: `extension/background.js` (`getRecallResults`, `onMessage` dispatch, `projectTab`)
- Test: `tests/recall-onebox.test.js` (unifier seam) + extend `tests/search.test.js` (boost ordering)

**Approach:**
- Index hits already carry let-go **and** snoozed rows (`kind` from `record.snoozeState`). Add the one
  net-new source: filter live `chrome.tabs.query({})` by substring/fuzzy over **url+title** against the
  parsed text and inject matches as `kind:'open'` (no content) **before** the U2 merge — so an
  open-only tab with no archive twin still surfaces.
- **Filter incognito tabs** (`tab.incognito`) out of the open source (mirrors the existing
  `exclusion.classify` gate; incognito must never reach the NTP).
- Build an **id→url map** for the candidate set, then pass `{ boostDocument }` (U1) that resolves
  id→url→**aggregated** signal (sum `revisits`/`dwell` across full-URLs collapsing to the same
  `originPathKey`). Degrade to text-only on signal-load failure.
- Derive `ageMs` explicitly: `lastAccessed > timestamp ? now - lastAccessed : null` (born-equal → null).
- Add `focus-tab { tabId }`: resolve the id against a **fresh** `chrome.tabs.query` before
  `chrome.tabs.update`; no match → no-op `{ ok:false }` (Pattern 15). Every async branch
  `sendResponse({error})` on reject (Pattern 6).
- **Overlay safety:** gate the new `kind:'open'`/cross-state rows behind a panel-caller flag so the
  shared `⌘⇧K` overlay keeps its current behavior until updated.

**Execution note:** Start with a failing test for the unifier seam (merge + boost ordering + a
production-shaped born-equal record) before wiring `chrome.tabs`.

**Patterns to follow:** the blank-q open-tab exclusion + `originPathKey`; the `onMessage` dispatch;
`projectTab`.

**Test scenarios:**
- Happy path: a query matching an open tab, a let-go page, and a snoozed page returns all three,
  correct `kind`, one deduped row per key (Covers AE1).
- Happy path: an **open-only** tab (no let-go twin) surfaces on a url/title text match.
- Happy path: intent lifts a frequently-revisited hit above an equal-text stale hit (Covers AE2).
- Integration (Pattern 19): a production-shaped record with `lastAccessed === timestamp` passed
  end-to-end yields no recency lift and no "reopened" rationale.
- Error path: a tabs-query / signal-load failure still returns other sources and never hangs the channel.
- Integration: `focus-tab` with a stale/closed `tabId` resolves against live state and no-ops safely.
- Integration: incognito open tab never appears in results; the `⌘⇧K` overlay receives no `kind:'open'` row.

**Verification:** One query yields unified, deduped, bounded-ranked, kind-tagged rows; channel never
hangs; overlay unaffected; incognito excluded.

---

### U4. Adaptive result rows + actions (panel)

**Goal:** Render each result's action per `kind` (jump / restore / coming-back + wake), calmly.

**Requirements:** R4

**Dependencies:** U3

**Files:**
- Modify: `extension/newtab/newtab.js` (`row`, handlers, placeholder/no-results copy),
  `extension/lib/shelf-render.js` if a new affordance is needed; `extension/newtab/newtab.css`
- Test: `tests/shelf-render.test.js` (kind-aware row descriptor stays text-only)

**Approach:**
- Extend `row(it, …)` on `it.kind`: open → "jump" (`focus-tab`, `tabId` stored as a **data attribute**
  on the row, not a closure over an array index); let-go → restore (`recall-open`); snoozed → a
  **"coming back ⟨when⟩"** label (reuse the Snooze panel's `returnLabel` formatting) + wake
  (`snooze-wake`). Mark every primary action with a shared selector (e.g. `.row-primary-action`) so
  U7's Enter can dispatch uniformly without knowing `kind`.
- Kind signal stays calm: reuse the existing `.recall-snoozed` clock treatment for snoozed; a small
  `--accent-sage` marker for open; let-go is the default (no marker).
- Update the search **placeholder/aria-label** to the one-box scope ("Find any page — open, let go,
  or snoozed") and the **no-results** copy ("Nothing across open tabs, let-go pages, or snooze for
  …"). All page-derived text stays textContent-only.

**Patterns to follow:** existing `row` + `handlers.open`; the snooze clock-tag; `clickIn(row, sel)`.

**Test scenarios:**
- Happy path: `kind:'open'` exposes jump + carries `tabId` data attr; `kind:'snoozed'` shows the
  return label + wake; `kind:'let-go'` shows restore (Covers AE1).
- Edge case: page-derived title/host renders text-only (shelf-render assertion holds).
- Edge case: an open-tab row (no content) collapses to title+meta height (no empty excerpt span).
- Integration: keyboard `Enter`/`o` triggers the row's `.row-primary-action` regardless of kind.

**Verification:** Each kind shows the correct action at a calm visual weight; no innerHTML; copy reflects one-box.

---

### U5. Episodic pivot parser (`lib/recallquery.js`)

**Goal:** Parse a raw query into free text + `with:` term + a relative time range.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Create: `extension/lib/recallquery.js`
- Test: `tests/recallquery.test.js`

**Approach:**
- Pure `parse(q, now) -> { text, withTerm, timeRange: {from,to} | null }`. Split a `with: <…>`
  operator; recognize a small relative-phrase set ("today", "this morning", "yesterday",
  "last <weekday>", "this week") → `{from,to}` from injected `now`. Unrecognized input → `text`.

**Patterns to follow:** `lib/timegroup.js` / `lib/returnwindow.js` injected-`now` arithmetic.

**Test scenarios:**
- Happy path: "github with: tax research" → text "github", withTerm "tax research" (Covers AE5).
- Happy path: "last tuesday" → a `{from,to}` spanning that calendar Tuesday.
- Edge case (Pattern 25): "last tuesday" evaluated on several fixed `now` weekdays returns the correct
  prior Tuesday each time (no off-by-a-week).
- Edge case: plain "react hooks" → text only, `withTerm`/`timeRange` null.

**Verification:** Deterministic under injected `now`; weekday math correct across the week.

---

### U6. Wire pivots into search + chips UI

**Goal:** Apply parsed pivots as filters and offer them as quiet, dismissible type-ahead chips.

**Requirements:** R5

**Dependencies:** U5, U3

**Files:**
- Modify: `extension/background.js` (apply pivots), `extension/newtab/newtab.js` +
  `extension/newtab/newtab.css` (chips)
- Test: extend `tests/recallquery.test.js` for an extracted filter-application seam; chip behavior in
  `tests/MANUAL-DOGFOOD.md`

**Approach:**
- SW: filter **let-go rows** by `siblings[]` URL/host for `withTerm` and by `timestamp`/`lastAccessed`
  for `timeRange`. **Open/snoozed rows pass through `with:` unfiltered** (they have no cluster) — a
  pivot narrows the archive, it never hides a live tab. `timeRange` applies to all rows with a timestamp.
- Panel: chips appear **between the search input and the result list** only when the parser yields a
  non-null `withTerm`/`timeRange`; **dismiss = collapse the pivot back to plain text** in the query
  (not session-suppress). Chips never reflow the input or block typing.

**Patterns to follow:** the calm "secondary at rest, revealed on intent" convention.

**Test scenarios:**
- Happy path: `with: <host>` narrows let-go rows to that session while an open/snoozed match for the
  same term still shows (Covers AE5).
- Edge case: a time range with no matches yields an empty-but-valid result, not an error.
- Edge case: `with:` + free text filters on both; dismissing the chip restores the plain-text query.

**Verification:** Pivots narrow the archive without hiding live rows; chips stay calm and non-blocking.

---

### U7. Excerpt highlight + streaming + Enter-to-act

**Goal:** Highlight the matched term, stream results race-safely, and make Enter act on the live top hit.

**Requirements:** R6, R7, R8

**Dependencies:** U3

**Files:**
- Modify: `extension/lib/search.js` (`excerptAround` → expose match positions / matched terms),
  `extension/lib/highlight.js`, `extension/newtab/newtab.js` (render, `seq` guard, cursor reset,
  Enter inertness)
- Test: `tests/search.test.js`, `tests/highlight.test.js`

**Approach:**
- Highlight the **term MiniSearch actually matched** (from the hit's match metadata), since a fuzzy
  hit (`goggle`→`Google`) has no literal query substring in the content; exact-substring hits
  highlight as today. Render via `highlight.segments` as separate text nodes (never innerHTML).
  Document the existing ~8000-char excerpt window as the known bound. Omit the excerpt line entirely
  for content-less / open-tab rows.
- Streaming: keep the `seq` token + **reset cursor state at the top of each re-render** (Patterns
  17/20). **Make Enter inert while a newer generation is in flight** — guard the top-hit fallback
  (`recallRows()[0]`), not just the cursored path, so a fast typist's Enter can't fire on a stale batch.

**Patterns to follow:** the `seq` guard + `reduceMotion()`/`document.hidden` gating; `highlight.segments`.

**Test scenarios:**
- Happy path: a typo query ("quit goggle farm") matches and highlights the matched term ("Google") in
  the excerpt (Covers AE6).
- Edge case: a title/url-only hit (no content match) renders no highlight stub.
- Edge case: page-derived excerpt renders text-only.
- Integration: rapid keystrokes — a stale batch never re-shows; Enter during a pending newer batch acts
  on the newer top hit, never the stale one (covers the cursorless fallback).

**Verification:** Highlight is text-only and correct under fuzzy; streaming is race-safe; Enter is stale-proof.

---

### U8. Signal recency extension (`lastActiveAt`) + retention

**Goal:** Persist a per-URL `lastActiveAt` to power the proactive rhythm, with real retention bounds.

**Requirements:** R9 (recency dimension), and recency precision for R1

**Dependencies:** None

**Files:**
- Modify: `extension/lib/signal.js` (`emptyState`, `activate`, `deleteByUrl`, `deleteByDomain`),
  `extension/lib/privacy.js` (forget bundle/restore covers the new field),
  `extension/background.js` (a recurring age-prune; wire into `maybePrune`/the existing prune trigger)
- Test: `tests/signal.test.js` (extend)

**Approach:**
- Add `lastActiveAt: { [url]: ms }` to the durable, set in `signal.activate` (injected `now`).
  (The 24-bucket `hourHist` is deferred — Scope Boundaries.)
- **Close the privacy gaps the review found:** extend `deleteByUrl`/`deleteByDomain` to clear
  `lastActiveAt` (today they clear only `dwell`+`revisits`), and include it in the forget-undo
  bundle + `privacy.restorePage` (graceful no-op for pre-field bundles).
- **Design a real prune:** age-out `lastActiveAt` (and existing signal) entries for URLs not active in
  N days on the recurring prune trigger — deletion-only pruning never fires for visited-not-forgotten
  URLs, so it can't bound growth. Note `lastActiveAt`'s hour is local-time/DST-dependent (matches the
  existing `timegroup` convention) — fine, but the rhythm isn't DST-stable.

**Execution note:** Test-first on `activate` (deterministic via injected `now`).

**Patterns to follow:** existing `signal.activate`/`deleteByUrl`; `store.prune`'s recurring trigger.

**Test scenarios:**
- Happy path: activating a URL sets/refreshes `lastActiveAt` with the injected `now`.
- Edge case: `deleteByUrl`/`deleteByDomain` also clear `lastActiveAt` (no orphaned recency data).
- Integration: a forget→undo round-trip restores `lastActiveAt`; a pre-field bundle restores gracefully.
- Integration: the age-prune drops `lastActiveAt` for URLs stale beyond N days (growth bounded).

**Verification:** Recency accumulates deterministically; forget/blocklist fully purge it; growth is bounded.

---

### U9. Proactive blank-state recall

**Goal:** Before the user types, show a calm "reaching for these" set ranked by recency + frequency.

**Requirements:** R9, R10

**Dependencies:** U8, U1

**Files:**
- Create: `extension/lib/proactive.js` (pure ranker)
- Modify: `extension/background.js` (blank-q branch), `extension/newtab/newtab.js` (render + transition)
- Test: `tests/proactive.test.js`

**Approach:**
- Pure `rank(records, signal, now) -> orderedRecords` scoring "likely right now" from `lastActiveAt`
  (recency) + `revisits` (frequency); born-equal/zero-signal degrade gracefully; cap the set (~6, like
  `RECENT_GROUP_CAP`). SW returns it on the blank-q path.
- Panel: render as a quiet labelled "reaching for these" block that **replaces** the time-grouped
  recent shelf at blank-q (no double-render); rows carry `.recent-item[data-id]` so the **j/k cursor**
  reaches them. The "why this" line (U10) renders here too.
- **Race-safety (review fix):** the blank-q load must capture the **same `seq` token** as `applyQuery`
  (`const mine = ++seq; … if (mine !== seq) return`), not just `if (destroyed)`. On the first keystroke
  the proactive block **stays visible but dimmed until the first live render arrives** (no blank flash),
  then clears; a late proactive reply is dropped, never repainted over live results.

**Patterns to follow:** the blank-q "instant recent" branch; `barometer.compute` decides / `favDraw`
renders; `reduceMotion()` gating.

**Test scenarios:**
- Happy path: a URL with recent `lastActiveAt` + revisits ranks into the set (Covers AE3).
- Edge case: no signal → falls back to recent let-go (never empty-by-error); does not double-render the shelf.
- Edge case: born-equal records contribute no false recency.
- Integration: the first keystroke replaces the set with live results with no blank flash; a late
  proactive reply (resolving after the keystroke) is dropped, not painted over live results.

**Verification:** The zero-type set is sensible and calm; the keystroke hand-off is flash-free and race-safe.

---

### U10. "Why this" rationale

**Goal:** Attach a quiet, signal-derived rationale to each result without cluttering the row.

**Requirements:** R11

**Dependencies:** U3

**Files:**
- Create: `extension/lib/rationale.js` (pure composer)
- Modify: `extension/background.js` (attach `reason`), `extension/newtab/newtab.js` (`.recall-why` node)
- Test: `tests/rationale.test.js`

**Approach:**
- Pure `compose(record, signal, now) -> string` producing **one** highest-signal clause ("often
  revisited", "let go this morning", "same session as <host>") — not a concatenation. Born-equal
  (`lastAccessed === timestamp`) must NOT claim "reopened/recalled" (Pattern 19). Renders as the row's
  **last child**, styled like `.meta`; **suppressed entirely** when the rationale would be the
  no-signal fallback (so zero-history rows add no line). Applies on proactive rows too.

**Patterns to follow:** the `.meta`/tags line in `itemRow`; text-only rendering.

**Test scenarios:**
- Happy path: a frequently-revisited record yields "often revisited".
- Edge case: a never-recalled (born-equal) record yields no "reopened" claim (Pattern 19).
- Edge case: a no-signal record suppresses the line entirely (no empty/NaN).

**Verification:** Rationale is accurate, single-clause, born-equal-safe, text-only, and suppressed when empty.

---

## System-Wide Impact

- **Interaction graph:** `getRecallResults` (SW) gains the open-tab source + `focus-tab`, and feeds the
  recall panel render + keyboard layer; the **shared `⌘⇧K` overlay** must be insulated from the new
  rows (U3 gate); `signal.activate` gains `lastActiveAt`; `privacy.forgetPage`/`restorePage` + the
  prune trigger gain the new field.
- **Error propagation:** new async branches `sendResponse({error})` on reject; the panel tolerates
  `!resp` and partial source failure (Pattern 6).
- **State lifecycle risks:** streaming + proactive load share the `seq` token; cursor state resets per
  render; Enter is inert across generations; reconcile (index↔store) is unchanged.
- **API surface parity:** the `⌘⇧K` overlay shares `getRecallResults` — gated now, full adaptive
  parity deferred (Scope Boundaries).
- **Integration coverage:** dedup field-level preservation, born-equal at the projection seam, open-only
  tab matching, `focus-tab`-against-live-state, incognito exclusion — covered by `tests/recall-onebox.test.js`
  + `tests/MANUAL-DOGFOOD.md`.
- **Unchanged invariants:** MiniSearch index schema + `reconcile` unchanged; no new Chrome permissions;
  tags rejected; privacy local-only and text-only for page-derived content.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Signal key (full URL) ≠ dedup key (`originPathKey`) → intent silently drops on query/hash URLs | Boost aggregates signal across full-URLs collapsing to one `originPathKey`; degrade to text-only; tested (U3) |
| A high-revisit daily-driver dominates every query | Intent is a bounded tie-breaker above a text-relevance floor; cross-document dominance test (U1) |
| Open-only tabs invisible to search (not indexed, no content) | Substring/fuzzy match live tabs on url+title, inject as candidates before merge; open-only test (U3) |
| Proactive load races the first keystroke (live code guards only `destroyed`) | Capture the shared `seq` token; dim-until-live transition; drop late replies (U9) |
| Enter fires on a stale streaming batch via the top-hit fallback | Enter inert while a newer generation is in flight (U7) |
| New `lastActiveAt` not purged by forget/blocklist → privacy retention regression | Extend `deleteByUrl`/`deleteByDomain` + forget-undo bundle/restore (U8) |
| Signal map grows unbounded in URL-count (deletion-only prune never fires) | Age-prune stale URLs on the recurring trigger (U8) |
| Merged open+let-go row loses content/siblings | Field-level merge retains display fields from the let-go record; test (U2) |
| `⌘⇧K` overlay mis-actions new `kind:'open'` rows | Gate new rows behind a panel-caller flag until the overlay is updated (U3) |
| Born-equal misread as "recalled" despite green core tests | `ageMs` derivation specified; end-to-end production-shape test at the U3 seam (Pattern 19) |
| Incognito open tabs reach the NTP | Filter `tab.incognito` from the open source (U3) |
| Fuzzy hit has no literal substring to highlight | Highlight the matched term from MiniSearch match metadata, not the raw query (U7) |
| `focus-tab` acts on a stale caller id | Resolve against a fresh `chrome.tabs.query` before acting (Pattern 15, U3) |
| Page-derived text reaches innerHTML via new highlight/why-this | Render via `highlight.segments` / text nodes only |

---

## Phased Delivery

### Phase A — Ranking + one-box (U1–U4)
Bounded intent-ranked, deduped, kind-adaptive recall (incl. the overlay gate + Pattern-19 seam test).
The headline win; shippable on its own.

### Phase B — Pivots + UX polish (U5–U7)
Episodic `with:`/time pivots (open/snoozed pass-through), matched-term highlight, race-safe streaming,
stale-proof Enter.

### Phase C — Proactive + why-this (U8–U10)
`lastActiveAt` recency + retention/purge, the flash-free zero-type "reaching for these", and quiet
single-clause "why this".

Each phase is independently shippable as its own PR per the project's slice pipeline.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-06-22-ypuf-recall-superpowers-requirements.md](docs/brainstorms/2026-06-22-ypuf-recall-superpowers-requirements.md)
- Learnings: `docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`
- Related code: `extension/lib/search.js`, `extension/lib/signal.js`, `extension/lib/cluster.js`,
  `extension/lib/store.js`, `extension/lib/highlight.js`, `extension/lib/shelf-render.js`,
  `extension/lib/privacy.js`, `extension/newtab/newtab.js`, `extension/background.js`,
  `extension/overlay/overlay.js`
- Test runner: `npm test` (`node --test tests/*.test.js`)
- Review: deepened 2026-06-22 from a 6-persona ce-doc-review pass (coherence, feasibility, design,
  security, scope, adversarial).
