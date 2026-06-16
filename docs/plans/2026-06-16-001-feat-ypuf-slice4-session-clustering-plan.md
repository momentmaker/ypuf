---
title: "feat: ypuf slice 4 — session clustering + context restore"
type: feat
status: completed
date: 2026-06-16
origin: docs/brainstorms/2026-06-15-ypuf-slice4-session-clustering-requirements.md
---

# feat: ypuf slice 4 — session clustering + context restore

## Summary

A new pure `extension/lib/cluster.js` computes a let-go tab's **working set** live
from `chrome.tabs.query` (spawn-tree + same-window + an approximate co-activation
read of the existing `tabstate.lastActivatedAt`); the set rides the existing
atomic `recordExtra` channel onto the let-go record as an additive `siblings`
field; `forget`/purge becomes cross-record-aware; restore reuses `reopenRecord`'s
origin+path dedup (factored into a shared helper, re-queried at restore time); and
an inline, passive, editable **"bring back the set?"** surface — modelled on the
snooze-row precedent — lets the user reopen the checked siblings on recall.

---

## Problem Frame

A1 (tab-drowning knowledge worker) keeps a *working context*, not a single tab.
Recalling one page at a time loses the set. Slice 4 makes let-go safe for a whole
context: snapshot the siblings at let-go, offer an opt-in partial restore at
recall. Full motivation, actors, and acceptance examples live in the origin doc
(see Sources & References).

---

## Requirements

Traces to the origin requirements doc (R1–R12). Plan-relevant grouping:

- R1. Compute the cluster **live** at let-go from `chrome.tabs.query` (snapshot,
  not reconstruct); reuse slice-1 capture + recall/reopen paths and the shelf.
- R2. Set is local-only, stores sibling **page identities** only (query-stripped
  URL + title + host); feature is disclosed; forgetting a page removes its stored
  siblings.
- R3. On let-go (manual **and** auto) snapshot the working set; **auto-sweep takes
  the snapshot once before the close loop**; orphans fall back to temporal-burst +
  co-activation.
- R4. Conservative/precise, same-window, size-capped (≤ ~8); spawn-tree +
  co-activation strong, same-window alone insufficient; no confident siblings → no
  set.
- R5. Exclude blocklisted / incognito / restricted-scheme siblings (gate before
  inclusion) via `exclusion.classify` + `tab.incognito`.
- R6. Recall a set-member (≥2 live members) → offer "this was open with N others";
  **N is the live surviving count**; the set is queryable from **any** member; the
  offer is passive/non-blocking.
- R7. Restore is partial + editable; members labelled title+host (hostname
  fallback); unchecking all collapses to recalling just the anchor.
- R8. Reopen the checked members, deduped against open tabs (focus, not
  duplicate); restricted-scheme gate; stored URLs are best-effort/stale-tolerant.
- R9. Affordance on the recall command bar **and** the shelf; dismisses on restore.
- R10. Never auto-restore.
- R11. Member restores by recall entry, or by URL navigability if known only by URL.
- R12. Set is additive on the record (no migration); forget scrubs the forgotten
  URL from every record's `siblings` (full-store scan); forgetting a page with a
  set does not strand the siblings' own records.

**Origin actors:** A1 (tab-drowning knowledge worker)
**Origin flows:** F1 (let go → snapshot the working set), F2 (recall a member →
bring back the set)
**Origin acceptance examples:** AE1 (R3, R4), AE2 (R6, R7), AE3 (R8), AE4 (R5),
AE5 (R10), AE6 (R12)

---

## Scope Boundaries

- Named / browsable / persistent "sessions" surface — out (§9 anti-pattern).
- Reconstruct-from-banked-signal clustering — out; v1 snapshots at let-go.
- Scroll / exact-place restore — out (v2); capturing form/scroll state out (R16).
- Cross-window clustering — out; v1 is same-window.
- Re-clustering / merging / editing a set after let-go (beyond uncheck) — out.
- Auto-restoring a set — out; always opt-in.

### Deferred to Follow-Up Work

- A dedicated recent-co-activation track (pairwise ping-pong history) — only if
  dogfooding shows the `lastActivatedAt` approximation is too coarse (see Key
  Technical Decisions). v1 ships with the approximation.
- A reverse-membership IndexedDB index for forget — only if the full-store scan
  proves too slow at real store sizes (it won't at current scale).

---

## Context & Research

### Relevant Code and Patterns

- **`extension/background.js`** — `handleLetGo` (builds the `{id,url,title,
  incognito,discarded,frozen}` tab object — **must add `openerTabId`+`windowId`**),
  `handleSnooze` (the `recordExtra` precedent: `{snoozeState, ...schedule}`),
  `buildDeps` (where a `queryTabs` dep is added), `projectTab` (the auto-sweep
  projector — **must add `openerTabId`+`windowId`**), `runAutoSweep` (its single
  pre-loop `chrome.tabs.query({})` is the snapshot point), `autoCloseOne`
  (`recordExtra` is `{autoClosed:true}` — merge siblings in), `reopenRecord` (the
  origin+path dedup via `key(u)=new URL(u).origin+pathname`; focus-or-create),
  `getRecallResults`/`listRecent` (result projection — add `siblings`/`setCount`),
  `forgetPage`/`forgetDomain`/`purgeDomainStores` (the cross-store purge invariant
  to extend), `mutateTabstate`/`_tabstateChain` (serialize-shared-key-writes).
- **`extension/lib/capture.js`** — `letGo(tab, deps, recordExtra)`; `recordExtra`
  is `Object.assign`'d into the single pre-close `store.put` in `buildRecord` /
  `buildFloorRecord`. The atomic additive channel `siblings` rides.
- **`extension/lib/exclusion.js`** — `classify(tab, userBlocklist)` (incognito →
  `never-index`; blocklist/restricted → `metadata-only` with `stripQuery`'d url;
  else `extractable`), `stripQuery` (`origin+pathname`), `isWebUrl`/`isInjectable`
  (the reopen scheme guard).
- **`extension/lib/tabstate.js`** — stored fields `createdAt, lastActivatedAt,
  activations, burst, dirty, host, noOpener`. **`openerTabId` value, co-activation
  pairwise history, and `windowId` are NOT stored** → cluster must compute live.
- **`extension/lib/store.js`** — record shape `{id,url,host,title,content,excerpt,
  timestamp,lastAccessed,byteSize,contentLess}`; additive fields ride untouched
  (no migration, DB VERSION unchanged); `getAll`/`put`/`remove`/`getByDomain`; no
  reverse index.
- **`extension/popup/popup.js` + `popup.html`** — `snoozedRow`/`showResnooze` (the
  inline swap-controls-in-a-row precedent for an editable member list),
  `renderSnooze`/`groupHeading`, `itemRow`/`mkBtn` (row/button builders; all
  page-strings via `textContent`), the `snoozeIntent` session-key handoff
  convention, the what's-indexed panel.
- **`extension/style.css`** — `.recent-item`, `.group-label`, `.snooze-controls`,
  `.snooze-panel` (reuse + one new controls class for the member list).
- **Test patterns** — `tests/capture.test.js` `makeDeps(over)` DI bundle + `ctx`
  side-effect capture (for glue: stub a `queryTabs` dep); `tests/snooze.test.js` /
  `tests/tabstate.test.js` pure-module style (for `lib/cluster.js`);
  `tests/MANUAL-DOGFOOD.md` for chrome-API/visual surfaces.

### Institutional Learnings

`docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`
(11 patterns). Bearing on slice 4:

- **Pattern 7 (serialize shared-key writes):** the `siblings` field rides a single
  atomic `store.put`, so it's race-safe by construction — but **any** new
  separately-keyed cluster/restore state written by >1 listener must route through
  a dedicated `mutate*` chain. v1 deliberately adds no such shared key.
- **Pattern 4 + the `recordExtra` mechanism:** snapshot-at-event into the single
  pre-close put; never a second termination-droppable write. The sibling query
  must complete *before* `letGo`'s `store.put`.
- **Pattern 1/4 (gate-then-collect):** sibling capture is a **new collector of
  other tabs' identities** — each sibling passes `exclusion.classify` before being
  written; excluded sibling → no entry. The privacy-side risk for the slice.
- **Pattern 4 (forget spans all stores):** slice 4 makes this **cross-record** for
  the first time — forgetting a URL must scrub it from other records' `siblings`.
- **Pattern 10 (termination-safe dedup + confirm-effect):** restore re-queries open
  tabs at restore time (not the stale snapshot), guards against double-open, and
  confirms each `tabs.create`.
- **Pattern 9 (per-URL signal can't gate per-tab):** reinforces snapshot-at-event
  for sibling identities rather than signal reconstruction.
- **Pattern 11 (scheduled returns):** **out of scope** — restore is recall-triggered,
  not time-scheduled; do not add alarms.

---

## Key Technical Decisions

- **Co-activation = approximate from existing `tabstate.lastActivatedAt`** (tabs
  active within a recent window of the anchor count as co-active), not a new
  dedicated track and not dropped. Rationale: `tabstate` has no pairwise ping-pong
  history (confirmed by research), but `lastActivatedAt` is a banked per-tab fact
  that gives a coarse temporal-burst signal — enough for the conservative orphan
  fallback without new banked state. A dedicated track is deferred to follow-up if
  dogfooding shows the approximation is too coarse. **Data-flow note (load-bearing):**
  `lastActivatedAt` lives in the `tabstate` **session store**, NOT on a `chrome.tabs`
  Tab object — so the SW loads the tabstate map and threads it into `computeSet`,
  which reads `tabstate[tab.id].lastActivatedAt` keyed by tab id (never `tab.lastActivatedAt`).
  *(see origin: Outstanding Questions — co-activation source)*
- **N = the stored `siblings` length (best-effort).** N is the count of stored
  sibling identities, decremented when a sibling's page is explicitly forgotten
  (R12 scrub). It is **not** a guaranteed live count: a sibling that was never its
  own record and is later closed normally is not scrubbed, so N can include a stale
  URL that restore reopens best-effort. This is a slight, honest relaxation of origin
  R6's "never overstates" wording — snapshot-at-let-go cannot track liveness of pages
  it never recorded. The offer text and restore stay best-effort (R8/R11).
- **"Queryable from any member" means any *let-go* member.** Each let-go record
  self-describes its own snapshot, so recalling any page that *was let go* surfaces
  the set it was closed with. A still-open sibling (never let go) has no record, so it
  becomes independently queryable only once it is itself let go (with its own
  freshly-computed set). Symmetric queryability across still-open siblings would need
  a cluster-id/mirroring store this slice deliberately rejects — the asymmetry is
  accepted, not hidden.
- **Set stored inline on each let-go record** as an additive `siblings` array of
  `{url,title,host}`, not a separate cluster-membership store. Rationale: each
  let-go page self-describes the working set it was closed with, which cleanly
  satisfies "queryable from any member" (whichever page you recall carries its own
  snapshot) **without** mirroring machinery or a cluster id. The cost — forget must
  scrub a forgotten URL from every record's `siblings` — is a full-store scan,
  acceptable at current store size and consistent with the existing per-record
  forget model. *(see origin: Outstanding Questions — where the set lives)*
- **Snapshot once before the auto-sweep close loop.** `runAutoSweep`'s single
  pre-loop `chrome.tabs.query({})` is the snapshot source for every candidate's
  set; `autoCloseOne` receives precomputed siblings. A per-tab re-query inside the
  loop would record order-dependent, inconsistent sets.
- **Add `openerTabId`+`windowId` to the tab projection.** Neither reaches the
  capture path today; both are added to `handleLetGo`'s inline object and
  `projectTab`, sourced live from the query (not from `tabstate`).
- **Restore reuses a shared reopen/dedup helper** extracted from `reopenRecord`
  (origin+path match; focus-or-create; `isWebUrl` gate), so restore and single-page
  reopen agree. Re-query open tabs at restore time.
- **N reproducibility:** `computeSet` stable-sorts before the cap so the same
  window produces the same set across runs (no reliance on `chrome.tabs.query`
  array order).

---

## Open Questions

### Resolved During Planning

- *Co-activation source* → approximate from `lastActivatedAt` (Key Technical
  Decisions); dedicated track deferred.
- *Where the set lives* → inline `siblings` on each record (Key Technical
  Decisions).
- *"Queryable from any member"* → satisfied for any *let-go* member (each record
  self-describes its snapshot); a still-open sibling is queryable only once itself
  let go (Key Technical Decisions — the asymmetry is accepted, not mirrored).
- *Forget cost* → full-store scan, no reverse index (acceptable at scale).
- *Command-bar vs shelf render* → the overlay (`overlay/overlay.js`) and popup are
  isolated content-script/popup contexts with no shared module; each renders its own
  small set affordance from the projected `siblings` (accepted duplication, U6).

### Deferred to Implementation

- Exact co-activation window (minutes) and the size cap's final value — tune in
  dogfooding; plan uses ≤ ~8 cap and a recent-activation window as the starting
  point.
- Exact spawn-tree traversal depth (direct opener + shared-opener siblings vs.
  multi-hop chain) — settle against real tab trees during implementation; start
  with direct-opener + shared-opener within the same window.
- The exact `coWindowMs` / `maxSize` default constants — pick concrete starting
  values before U1's cap/co-activation tests are written (not left `undefined`).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review,
> not implementation specification. The implementing agent should treat it as
> context, not code to reproduce.*

```
LET-GO (manual / snooze / auto-sweep)
  background.js: openTabs = chrome.tabs.query({})  +  tabstate map   ← single snapshot
        │                                                   (auto-sweep: once, pre-loop)
        ▼
  cluster.computeSet(anchorTab, openTabs, {classify, blocklist, tabstate, now, maxSize, coWindowMs})
        │   • anchor = the openTabs entry (by id) → id/openerTabId/windowId consistent w/ candidates
        │   • same-window filter (windowId === anchor.windowId)
        │   • spawn-tree: anchor.openerTabId chain + shared-opener siblings (live off the Tab object)
        │   • co-activation: |tabstate[id].lastActivatedAt − tabstate[anchor.id].lastActivatedAt| < coWindowMs
        │   • gate each via exclusion.classify(new URL(tab.url)) → drop never-index/restricted
        │   • map → {url: origin+pathname key, title, host}; stable-sort; cap ≤ maxSize
        ▼  siblings[]  (may be [])
  capture.letGo(tab, deps, recordExtra={ ...existingExtra, siblings })
        ▼
  store.put(record + siblings)   ← single atomic write (Pattern 4)

RECALL (command bar / shelf)
  getRecallResults / listRecent → project siblings (or setCount) onto the result
        ▼
  popup: record.siblings?.length ≥ 1  → render passive "bring back the set? (N)"
        ▼  user expands → checkable member list (title+host, hostname fallback)
  user restores → message {type:'restore-set', recordId, urls:[checked]}
        ▼
  background.js: liveTabs = chrome.tabs.query({})        ← re-query at restore time
        ▼  for each url: reopenUrl(url, liveTabs)  ← shared helper (focus | create), isWebUrl gate
        ▼  dismiss surface

FORGET (page / domain / blocklist)
  forget(id|host) → delete record(s) + store.scrubSibling(url)  ← full-store scan,
                                                                   strip url from every siblings[]
```

---

## Implementation Units

### U1. Pure cluster module (`lib/cluster.js`)

**Goal:** A pure, DI'd function that computes the sibling set from an anchor tab +
a live open-tabs array, with no `chrome.*` access.

**Requirements:** R1, R3, R4, R5

**Dependencies:** None

**Files:**
- Create: `extension/lib/cluster.js`
- Create: `tests/cluster.test.js`

**Approach:**
- `computeSet(anchor, openTabs, opts) -> sibling[]` where `opts =
  {classify, userBlocklist, tabstate, now, maxSize, coWindowMs}`. `tabstate` is the
  loaded id→state map — it carries `lastActivatedAt`, which is **not** present on a
  `chrome.tabs` Tab object.
- `anchor` is the entry **from `openTabs`** (located by id by the caller), so
  `anchor.id`/`anchor.openerTabId`/`anchor.windowId` are consistent with the
  candidate set — do **not** stamp these from a separately-queried `getActiveTab`
  object (their ids/opener could diverge from the snapshot).
- Same-window filter (`windowId === anchor.windowId`); exclude the anchor itself.
- Spawn-tree: include tabs sharing `anchor.openerTabId` and tabs whose
  `openerTabId === anchor.id` (direct children) and the anchor's opener; start with
  direct/shared-opener (multi-hop deferred to impl). `openerTabId`/`windowId` come
  live off the Tab objects in `openTabs`.
- Co-activation: include same-window tabs whose `tabstate[tab.id]?.lastActivatedAt`
  is within `coWindowMs` of `tabstate[anchor.id]?.lastActivatedAt` — the conservative
  orphan path when `openerTabId` is absent. Read the timestamp from the `tabstate`
  map, never off the Tab object.
- Gate every candidate via `opts.classify(new URL(tab.url), userBlocklist)`; **drop**
  `never-index` (incognito/restricted) entirely; **store the gate's already-stripped
  `url` for `metadata-only`, and for `extractable` strip the full href via a shared
  origin+pathname key** — `exclusion.stripQuery` takes a parsed `URL`, **never a raw
  string**, so call `stripQuery(new URL(tab.url))` (or reuse the `reopenRecord`
  `key()` helper). (R2 universal strip.)
- Map survivors to `{url, title, host}`; **stable-sort deterministically** (signal
  tier, then `tabstate[id].lastActivatedAt` desc, then tab id) before the cap so the
  same window yields the same set across runs; cap to `maxSize` (drop lowest-signal
  first: same-window-only before spawn-tree); return `[]` when no confident sibling.
- Follow the UMD-ish interop wrapper; export `{ computeSet }` on `self.ypuf.cluster`.

**Execution note:** Implement test-first — this is the pure core and the privacy
gate's first line.

**Patterns to follow:** `extension/lib/eligibility.js` (pure classifier shape),
`extension/lib/exclusion.js` (`classify`/`stripQuery` usage), the UMD wrapper in
every `lib/*.js`.

**Test scenarios:**
- Happy path: anchor + two same-window tabs sharing its `openerTabId` → both in the
  set as `{url,title,host}`. *(Covers AE1)*
- Happy path: an orphan anchor (no opener) + a same-window tab whose
  `tabstate[id].lastActivatedAt` (supplied via the map, not on the tab) is within
  `coWindowMs` → included via co-activation. Asserts the timestamp is sourced from
  the `tabstate` map.
- Edge: anchor open alone (no same-window siblings) → `[]`. *(Covers AE1)*
- Edge: more confident siblings than `maxSize`, all in the same signal tier →
  capped to `maxSize` **deterministically** (same survivors across repeated runs;
  asserts exact membership via the stable sort, not just the count).
- Edge: a candidate in a different window → excluded.
- Error/privacy: a blocklisted candidate → not in the set (gate drops it).
  *(Covers AE4)*
- Error/privacy: an incognito (`never-index`) candidate → not in the set.
- Privacy: an **extractable** (non-blocklisted) candidate whose URL carries a query
  string (`?token=abc`) → stored URL equals `origin + pathname` (query stripped).
  This pins the branch where `classify` returns the full `href`.

**Verification:** `node --test tests/cluster.test.js` passes; `computeSet` never
returns an excluded sibling and never returns a non-stripped URL.

---

### U2. Wire live cluster computation into the let-go paths

**Goal:** Compute the set live at manual let-go and snooze, and persist it via the
atomic `recordExtra` channel.

**Requirements:** R1, R2, R3

**Dependencies:** U1

**Files:**
- Modify: `extension/background.js`
- Test: `tests/capture.test.js`

**Approach:**
- Add `openerTabId` + `windowId` to **both** `handleLetGo`'s inline tab object
  (currently `{id,url,title,incognito,discarded,frozen}`, built from `getActiveTab()`)
  **and** `projectTab` — the manual path builds its own object and does not go
  through `projectTab`, so updating only `projectTab` would leave manual let-go with
  `undefined` opener/window and empty sets.
- Add a `queryTabs: () => chrome.tabs.query({})` dep to `buildDeps`, and load the
  `tabstate` map (reuse the existing `_tabstateChain` snapshot/`loadTabstate`).
- In `handleLetGo`: `openTabs = await queryTabs()`; locate the anchor **inside**
  `openTabs` by id (so its opener/window are consistent with the candidates);
  `siblings = cluster.computeSet(anchorFromSnapshot, openTabs, { classify,
  userBlocklist, tabstate, now, maxSize, coWindowMs })`; then `capture.letGo(tab,
  deps, { siblings })`. In `handleSnooze`: merge into the existing extra
  (`{ snoozeState, ...schedule, siblings }`).
- The siblings query + tabstate load complete **before** `letGo`'s `store.put`
  (Pattern 4 — no second write); `computeSet` is awaited before `capture.letGo`.
- `siblings` is additive; `store.js` and `capture.js` need no change (the
  `recordExtra` `Object.assign` already carries arbitrary fields).

**Patterns to follow:** the `{snoozeState, returnAt}` recordExtra flow in
`handleSnooze` (the exact additive-field precedent); `capture.test.js`'s
`recordExtra is stamped into the single pre-close store.put` test.

**Test scenarios:**
- Integration: `capture.letGo(tab, deps, { siblings:[{url,title,host}] })` persists
  `siblings` on the stored record (single put), mirroring the `autoClosed` test.
- Integration: a let-go with an empty/absent set stores no `siblings` (or `[]`) and
  behaves exactly as today.
- Integration: the manual let-go path passes a non-`undefined` `openerTabId` /
  `windowId` to `computeSet` (guards the projection regression — both the inline
  object and `projectTab` carry the fields).
- Edge: a blocklisted anchor still records its (gated) siblings while the anchor
  itself stays metadata-only — siblings ride the floor record too.

**Verification:** Letting a tab go in a multi-tab window stores a `siblings` array
of gated identities; existing capture tests still pass.

---

### U3. Auto-sweep snapshots the set once before the close loop

**Goal:** Each auto-closed zombie carries a consistent working set computed from a
single pre-sweep snapshot, not a per-tab re-query.

**Requirements:** R3, R10 (snapshot only; never restores)

**Dependencies:** U1, U2

**Files:**
- Modify: `extension/background.js`
- Test: `tests/capture.test.js`

**Approach:**
- In `runAutoSweep`, reuse the existing single `chrome.tabs.query({})` result as
  the snapshot and load the `tabstate` map **once** before the loop; for each
  candidate compute `cluster.computeSet(candidate, snapshot, { ...deps, tabstate })`
  **from that same snapshot** (the candidate is already a `snapshot` entry, so its
  opener/window are consistent) before the close loop mutates the tab set.
- Pass precomputed siblings into `autoCloseOne` **as a parameter** so its
  `recordExtra` becomes `{ autoClosed: true, siblings }`. `autoCloseOne` still
  re-verifies liveness via `chrome.tabs.get`, but must **not** recompute or drop the
  passed siblings.
- Do **not** call `chrome.tabs.query` or recompute the set per-tab inside
  `autoCloseOne`.

**Patterns to follow:** `runAutoSweep`'s candidate-gather-then-loop structure;
`autoCloseOne`'s `{autoClosed:true}` recordExtra.

**Test scenarios:**
- Integration: simulate a 3-zombie same-window cluster from one snapshot → each
  closed record's `siblings` reflects the **pre-sweep** set (the later-closed tabs
  still appear in earlier ones and vice-versa, order-independent). *(Covers AE5)*
- Edge: a single zombie open alone → `siblings` empty.
- Invariant: nothing reopens during the sweep (snapshot only). *(Covers AE5)*

**Verification:** Auto-closing a cluster yields consistent sibling sets regardless
of close order; the sweep never reopens a tab.

---

### U4. Store siblings + cross-record forget/purge consistency

**Goal:** Forgetting a page removes its URL from every other record's `siblings`,
and forgetting a page that has a set does not strand the siblings' own records.

**Requirements:** R2, R12

**Dependencies:** U2

**Files:**
- Modify: `extension/lib/store.js`
- Modify: `extension/background.js`
- Test: `tests/store.test.js`

**Approach:**
- Add `store.scrubSibling(url)` — **normalize the input** to the `origin+pathname`
  key first (an `extractable` record's own `.url` is the full `href`, so scrub must
  strip it before comparing — otherwise it never matches its stored stripped sibling
  form), scan `getAll()`, strip any `siblings` entry whose `origin+pathname` matches,
  `put` changed records, return the count touched.
- `forgetPage`: after the record delete, scrub its URL from other records' siblings —
  but **defer the scrub until the undo window (`capture.UNDO_MS`) expires**.
  `forgetPage` has a ~6s undo that restores only the forgotten record's own bundle; a
  one-way cross-record scrub would leave undo unable to re-insert the URL into the
  siblings it was stripped from. Deferring past the undo deadline keeps undo a clean
  full reversal and leaves the bundle shape unchanged.
- `forgetDomain` / `purgeDomainStores`: gather the affected **URLs** from
  `store.getByDomain(host)` **before** deletion (the existing code gathers `ids` —
  add `urls`), then scrub each. Domain forget has no undo, so scrub immediately.
- **Do NOT scrub on blocklist-add.** Blocklisting calls `privacy.retroactivePurge`,
  which *downgrades* records (strips content) but keeps them recallable — it is not a
  delete. Scrubbing would silently drop a still-recallable member from other sets, and
  the stored sibling URL is already query-stripped (nothing new leaks). Scrub is
  reserved for actual record deletion.
- Forgetting a page deletes its own record (its `siblings` go with it); the siblings'
  own records (if any) are untouched.

**Execution note:** Implement the `scrubSibling` store op test-first (fake-indexeddb).

**Patterns to follow:** the cross-store purge invariant in `purgeDomainStores`;
`store.getByDomain`/`remove` usage; `tests/capture.test.js` IDB setup.

**Test scenarios:**
- Integration: record A has `siblings` listing B's URL; forget B (past the undo
  window) → A's `siblings` no longer contains B; A's own record intact. *(Covers AE6)*
- Integration: B is an **extractable** record whose `.url` carries a query string →
  forgetting B still scrubs B's `origin+pathname` from A's siblings (input normalized).
- Integration: forget B then **undo within `UNDO_MS`** → B restored AND still present
  in A's siblings (scrub was deferred, so undo fully reverses).
- Integration: forget a page that itself has `siblings` → its record gone, the
  sibling pages' own records untouched (not stranded). *(Covers AE6)*
- Edge: forget a URL no record lists as a sibling → scrub touches 0 records, no error.
- Edge: domain forget scrubs every URL on that host from all `siblings` lists.
- Edge: **blocklist-add does NOT scrub** — the downgraded page stays a sibling of
  other records (still recallable).

**Verification:** After a forget (past its undo window) or a domain forget, no
record's `siblings` references the deleted URL; an in-window undo fully restores it;
blocklist does not strip siblings; sibling records are never collaterally deleted.

---

### U5. Restore the set — reopen, dedup, termination-safe

**Goal:** A `restore-set` handler reopens the checked siblings, deduped against
currently-open tabs, never auto-fired.

**Requirements:** R8, R10, R11

**Dependencies:** U2 (U5 reads the stored `siblings` and reopens; it does not call
U4's scrub, so it is build-independent of U4 and can land in parallel)

**Files:**
- Modify: `extension/background.js`
- Test: `tests/capture.test.js`

**Approach:**
- Factor `reopenRecord`'s dedup into a shared helper `reopenUrl(url, openTabs) ->
  {focused}|{created}` — origin+path match (`key(u)=origin+pathname`) to focus an
  open tab, else `chrome.tabs.create`; apply the `isWebUrl` scheme gate (R8). The
  helper is the dedup+create core only — not `reopenRecord`'s `store.touch` /
  snooze-clear / domain-protect side effects.
- `restore-set` message `{recordId, urls:[checked]}`: re-read `store.get(recordId)`
  and **intersect `urls` against `record.siblings`** — open only URLs the record
  actually stored (a compromised/replaying popup context can't open arbitrary URLs).
  Then `openTabs = await queryTabs()` **at restore time**, `reopenUrl` each surviving
  url; skip urls failing the scheme gate; confirm each create (Pattern 10).
- **Double-open guard:** dedup creates **within the single restore pass** (against
  URLs already opened in that pass) — a re-query alone doesn't close the
  read-before-write window when N creates fire concurrently — and the popup disables
  the Restore button on first tap. SW-death mid-fan-out is accepted: restore is
  user-triggered (never auto), so the user re-restores the still-checked members; no
  persisted claim needed (unlike auto-close).
- Stored URLs are best-effort: a stale/dead URL still navigates (no extra
  validation); restore makes no staleness guarantee.
- Restore only ever runs from an explicit user message — never on startup/alarm.

**Patterns to follow:** `reopenRecord` (origin+path dedup, focus-or-create,
domain-protect on `autoClosed`); Pattern 10 (confirm-effect, re-query at
operation time).

**Test scenarios:**
- Integration: restore 3 checked siblings, one already open → the open one is
  focused (not duplicated), the other two created. *(Covers AE3)*
- Edge: uncheck all → restore opens nothing (the caller sends an empty `urls`).
- Edge/privacy: a sibling with a `javascript:`/`data:` URL → skipped by the scheme
  gate.
- Integration: a sibling known only by URL (never-captured / blocklisted snapshot)
  → reopened by URL navigability. *(Covers R11)*
- Edge/security: `restore-set` carrying a URL **not** in `record.siblings` → that URL
  is skipped (the handler opens only stored siblings).
- Edge: the same `restore-set` fired twice / a duplicate url within one pass → the
  tab is opened once, not duplicated.
- Invariant: the handler is never invoked except by the explicit `restore-set`
  message (no alarm/startup path added).

**Verification:** Restoring a set reopens only the checked, missing siblings,
focusing already-open ones; no scheme-unsafe URL is navigated; restore is
user-triggered only.

---

### U6. Recall/shelf "bring back the set?" surface + disclosure

**Goal:** A passive, editable inline affordance on the recall result and the shelf
row that surfaces the set and triggers restore; the what's-indexed panel discloses
the feature.

**Requirements:** R6, R7, R9, R2 (disclosure)

**Dependencies:** U5

**Files:**
- Modify: `extension/background.js` (project the full `siblings` array onto
  `getRecallResults`/`listRecent`)
- Modify: `extension/popup/popup.js`
- Modify: `extension/popup/popup.html`
- Modify: `extension/overlay/overlay.js` (the recall command-bar surface — a separate
  injected content script, isolated from the popup)
- Modify: `extension/style.css`
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:**
- Project the **full `siblings` array** (not just a count) onto recall results and
  shelf items, so the member list renders immediately on expand with no second
  round-trip.
- For a row with `siblings.length ≥ 1` (`siblings` stores **non-anchor** members, so
  ≥1 ⇒ the anchor plus ≥1 other ⇒ R6's "≥2 members"), render a passive
  **"bring back the set? (N)"** as a `.link` button — N is `siblings.length`
  (best-effort, per Key Technical Decisions). It does **not** gate the single-page
  recall/open (R6 non-blocking).
- **Expand trigger:** clicking the "bring back the set? (N)" `.link` button swaps the
  affordance in place for a checkable member list (parallel to how `showResnooze`
  replaces the Later button's controls). Each member shows title + host, hostname-only
  fallback for a URL-only member (all via `textContent`); a Restore button sends
  `restore-set` with the checked urls.
- **Row-click conflict:** for set-bearing rows, do **not** attach the existing
  full-`<li>` `openOnClick` recall listener (it calls `window.close()`) — single-page
  open stays available via the title element as a distinct target, so clicking the set
  affordance/checkboxes never fires an accidental recall+close.
- **Uncheck-all:** unchecking every member relabels the Restore button to
  "Just open this page" — a deliberate second action that recalls only the anchor and
  closes; it never auto-fires on the last uncheck.
- **Dismiss:** a completed restore closes the popup (`window.close()`, matching the
  recall-open precedent); the command-bar overlay closes its own surface.
- **Command-bar surface:** the command bar is `overlay/overlay.js`, a content script
  isolated from the popup (no shared module system). Each surface renders its **own**
  small member-list affordance from the projected `siblings` (a duplicated renderer,
  not a shared module) and sends `restore-set`. (Accepted duplication — the two
  runtime contexts can't share an ES module without restructuring.)
- All page-derived strings via `textContent` (privacy rule).
- Add a what's-indexed disclosure line: letting go a tab also records the working
  set it was open with (sibling identities, query-stripped, gated) — and forgetting
  the page removes them.

**Patterns to follow:** `snoozedRow` + `showResnooze` (inline swap-controls row),
`renderSnooze`/`groupHeading`, `itemRow`/`mkBtn`, the what's-indexed panel,
`.recent-item`/`.group-label`/`.snooze-controls` CSS, the `snoozeIntent` session-key
handoff if a command-bar→popup intent is needed.

**Test scenarios:**
- `Test expectation: MANUAL-DOGFOOD` — chrome-tabs + visual surface. Checklist
  entries: a recalled set-member shows the "bring back the set? (N)" `.link` button;
  clicking it expands the toggleable member list in place (title+host); a URL-only
  member shows hostname fallback; clicking the affordance/checkboxes does **not**
  close the popup (no row-click conflict); unchecking all relabels Restore to "Just
  open this page" and does not auto-fire; restore reopens the checked members and
  closes the surface; single-page recall stays instant when the offer is present (not
  gated); the **same affordance appears on both the popup shelf and the command-bar
  overlay**; the what's-indexed panel names the working-set capture.
  *(Covers AE2, AE3)*

**Verification:** Recalling a member with a set surfaces the passive offer on both
the command bar and the shelf; restore reopens the checked members and dismisses;
single-page recall is unaffected; disclosure copy is present.

---

## System-Wide Impact

- **Interaction graph:** `handleLetGo`/`handleSnooze`/`runAutoSweep` → `cluster` →
  `capture.letGo` → `store.put`; `forget*`/`purgeDomainStores` → `store.scrubSibling`;
  popup recall/shelf → `restore-set` → `reopenUrl`. New message type `restore-set`
  in the router (wrap the async branch so a rejection still `sendResponse`s —
  Pattern 6).
- **Error propagation:** cluster computation must never block or fail the close —
  if `computeSet` throws, let-go proceeds with no `siblings` (best-effort, like the
  extraction-throws→floor precedent). Restore failures per-url are isolated
  (one bad url doesn't abort the rest).
- **State lifecycle risks:** `siblings` rides the single atomic put (no partial
  write). Forget-scrub must be cross-record-complete or a forgotten URL lingers in
  another record's set (Pattern 4). Restore re-queries at restore time to avoid
  acting on a stale snapshot (Pattern 10).
- **API surface parity:** both let-go entry points (manual, snooze) and the
  auto-sweep must compute siblings; the projection must reach **both** recall
  surfaces (command bar + shelf).
- **Integration coverage:** the snapshot-once-before-sweep behavior (U3), the
  cross-record scrub (U4), and the restore dedup (U5) are glue behaviors unit tests
  on `lib/cluster.js` alone won't prove — covered by `capture.test.js`/`store.test.js`
  DI tests and the MANUAL-DOGFOOD checklist.
- **Unchanged invariants:** the capture privacy gate, incognito exclusion
  (`incognito: not_allowed`), query-strip, single-atomic-put, and the snooze/alarm
  machinery are unchanged; `siblings` is purely additive (no DB migration); no
  `chrome.alarms` added.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Sibling capture leaks a sensitive/blocklisted URL (privacy regression) | Every candidate passes `exclusion.classify`; excluded → no entry; URLs query-stripped; incognito excluded via `tab.incognito` + manifest. Tested in U1. |
| Forget leaves a forgotten URL embedded in another record's set | `store.scrubSibling` full-store scan on every forget/blocklist; tested in U4. |
| Co-activation approximation too coarse (noisy/empty orphan sets) | Conservative window + cap; same-window-alone insufficient; dedicated track deferred as a tunable follow-up. |
| Restore reopens dead/stale URLs | Best-effort by design; scheme gate blocks unsafe schemes; dedup focuses live tabs; user edits the set before restoring. |
| Auto-sweep records order-dependent partial sets | Snapshot once before the close loop (U3); tested order-independent. |
| Restore double-opens on re-fire / SW death mid-fan-out | Intra-pass create dedup + popup Restore-button debounce + origin+path dedup against a restore-time re-query; SW-death partial-restore is accepted (user re-restores) since restore is user-triggered, not auto. |
| Forget-undo can't reverse a cross-record sibling scrub | Defer `forgetPage`'s scrub until the undo window expires; domain forget (no undo) scrubs immediately. |
| `restore-set` opens an arbitrary URL from a replaying popup context | Handler intersects requested urls against the stored `record.siblings` before opening. |

---

## Documentation / Operational Notes

- Update `tests/MANUAL-DOGFOOD.md` with the slice-4 restore + disclosure checklist
  (U6).
- After the slice lands, run `/ce-compound` to capture the new seams this corpus
  doesn't yet cover: the cross-record forget scrub and the sibling-gate edge cases.
- No migration, no new permissions, no alarms — load-as-is unchanged.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-06-15-ypuf-slice4-session-clustering-requirements.md](docs/brainstorms/2026-06-15-ypuf-slice4-session-clustering-requirements.md)
- Related code: `extension/background.js` (`handleLetGo`, `runAutoSweep`,
  `reopenRecord`, `forgetPage`, `projectTab`), `extension/lib/capture.js`,
  `extension/lib/exclusion.js`, `extension/lib/tabstate.js`, `extension/lib/store.js`,
  `extension/popup/popup.js`
- Institutional learnings:
  `docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`
  (patterns 1, 4, 6, 7, 9, 10)
- Prior slices: `docs/plans/2026-06-15-002-feat-ypuf-slice3-snooze-plan.md`,
  `docs/plans/2026-06-15-001-feat-ypuf-slice2-auto-let-go-plan.md`
