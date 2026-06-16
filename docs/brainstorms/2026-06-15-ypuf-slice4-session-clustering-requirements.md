---
date: 2026-06-15
topic: ypuf-slice4-session-clustering
status: requirements
actors: [A1]
flows: [F1, F2]
---

# ypuf Slice 4 — Session clustering + context restore

## Summary

When you let a tab go (manual or auto), ypuf snapshots the **working set** it was
open with — the spawn-tree siblings, same-window neighbours, and tabs you were
ping-ponging between. Later, recalling a set-member offers *"this was open with N
others — bring back the set?"*: a partial, editable, **opt-in** restore that
brings your working context back together, not just the one tab. There is no
"sessions" surface to manage. The set is computed **live at let-go** from the
open tabs (snapshot, not reconstruct), so it works immediately without banking
new signal. Reuses slice 1's capture + recall/reopen paths and the shelf.

---

## Problem Frame

A1 (tab-drowning knowledge worker) doesn't keep a single tab — they keep a
*working context*: "my Tuesday tax research" is a 1040 page, the payments page, a
Reddit thread, and a spreadsheet, open together. Letting go and recalling one
page at a time loses the set; rebuilding it means re-finding four tabs by hand
(or Chrome's all-or-nothing "reopen closed window"). Restoring the **set** —
partial and editable, because clustering is sometimes wrong — is what makes
let-go safe for a whole context, not just a page (CONTEXT §5d, §10). It ships
after recall + auto-let-go because it reuses their capture and reopen paths.

---

## Actors

- **A1. Tab-drowning knowledge worker** (established). Works in clusters of
  related tabs; wants to set a working context aside and bring it back as a set.

---

## Key Flows

- **F1. Let a tab go → snapshot its working set**
  - **Trigger:** A1 lets go of a tab (manual or auto-let-go).
  - **Steps:** ypuf computes the tab's working set from the **live** open tabs at
    that moment — spawn-tree (`openerTabId`), same-window, recent co-activation —
    applies the privacy gate, and records the set (sibling page identities) on the
    let-go record.
  - **Outcome:** the let-go page carries its working context; a tab open alone
    carries no set.
  - **Covered by:** R1, R2, R3, R4, R5

- **F2. Recall a set-member → bring back the set**
  - **Trigger:** A1 recalls/reopens a let-go page that has a set (≥2 members).
  - **Steps:** ypuf offers *"this was open with N others — bring back the set?"* →
    A1 sees the members, unchecks the odd one out → restore reopens the checked
    members, deduped against tabs already open.
  - **Outcome:** the working context is back together, edited to what A1 actually
    wants, on A1's command (never auto-restored).
  - **Covered by:** R6, R7, R8, R9, R10, R11

---

## Requirements

Traces to CONTEXT §5d (restore the context, not just the tab) and §10 (sibling
clustering via `openerTabId` + temporal burst + co-activation).

**Foundation / reuse**
- R1. Reuse slice 1's capture path and recall/reopen path, the shelf, and slice
  2's per-tab state — the cluster is computed from the **live** open tabs at
  let-go (`chrome.tabs.query`), a **snapshot**, not a reconstruction from banked
  signal (the clustering signals aren't banked today, so no waiting period).
- R2. Same privacy posture as capture: the set is **local-only** (an additive
  record field; nothing transmitted) and stores only sibling **page identities**
  (the recall entry / URL), not page content beyond what slice 1 already captures.
  Stored sibling URLs inherit capture's **query-strip** (no query string persisted),
  so a token in a sibling's URL is never banked. Because letting go one tab records
  the URLs of still-open siblings the user did not individually let go, the feature
  is **disclosed** (a discoverable note on the set affordance / onboarding), and a
  page that exists in the store **only** as a set member is independently forgettable.

**Cluster snapshot at let-go (F1)**
- R3. On let-go (manual **and** auto), snapshot the tab's **working set** from the
  open tabs at that moment, using: the **spawn-tree** (`openerTabId` chain),
  **same-window** membership, and **recent co-activation** (tabs A1 ping-ponged
  between). Orphans (no opener — pasted URLs, bookmarks, restored sessions) fall
  back to temporal-burst + co-activation. On an **auto-sweep**, the open-tab
  snapshot is taken **once before** the sweep closes any tab, so siblings closed
  later in the same sweep still appear in each other's sets — a per-tab snapshot
  taken inside the close loop would record inconsistent, order-dependent sets.
- R4. Clustering is **conservative / precise and size-capped** — a tight,
  trustworthy set over a broad one — and **same-window** in v1. The v1 floor
  (tunable in dogfooding): **spawn-tree and recent co-activation are strong
  inclusion signals; same-window membership alone is not sufficient** (A1's window
  holds unrelated tabs), and the set is capped at a small default (**≤ ~8
  members**) so it can never be a whole-window dump. A tab with no confident
  siblings gets **no set** (recalling it brings back just the one page).
- R5. The set **excludes** blocklisted / incognito / restricted-scheme siblings
  (gate before inclusion), exactly like capture. Incognito exclusion is mechanized
  by checking each candidate sibling's `incognito` flag; the extension declares
  **no `incognito` permission**, so the gate cannot silently become a no-op.

**Restore the set (F2)**
- R6. When A1 recalls/reopens a page that **is a member of a set** (≥2 live
  members), ypuf offers **"this was open with N others — bring back the set?"** —
  where **N is the live surviving count** (members since forgotten are not
  counted, so the number never overstates what can be restored). The set is
  queryable from **any** member, not only the page that was the snapshot anchor,
  so recalling any sibling surfaces the same offer. The offer is **passive and
  dismissible**: recalling the single page is never gated by it, so the <1s
  single-page recall is unchanged.
- R7. Restore is **partial and editable**: each member is shown and toggleable;
  A1 can uncheck members before restoring. **Never all-or-nothing.** Members are
  labelled like recall entries (**title + host**), with a **hostname fallback**
  for a URL-only member (a never-captured or blocklisted sibling). Unchecking
  **all** members collapses to recalling just the anchor page — the surface
  closes and no extra tabs open.
- R8. Restore reopens the **checked** members, **deduped against tabs already
  open** (an already-open member is focused, not duplicated). Each lands at the
  top of its page (no scroll restore in v1). Reuses the recall/reopen path, which
  applies the same **restricted-scheme gate** as capture (no `javascript:` /
  `data:` navigation). Stored sibling URLs are **best-effort** — a URL may be
  stale by restore time (moved, expired, logged-out); restore makes no staleness
  guarantee.
- R9. The "bring back the set?" affordance appears wherever a set-member is
  reopened — the **recall command bar** and the **shelf** — and **dismisses once
  a restore completes**.

**Calm / safety / storage**
- R10. ypuf **never auto-restores** a set — restore is always a user action.
  Clustering errors are recoverable (uncheck) and never destructive.
- R11. A set-member that was separately let-go restores by its recall entry; a
  member known only by URL (e.g. a blocklisted snapshot, or a sibling that was
  never captured) restores by **URL navigability**.
- R12. The set is stored on the let-go record (additive; no migration) and is
  covered by forget/purge: forgetting a page removes it from any set it belongs
  to, and forgetting a page that *has* a set does not strand the siblings' own
  records. **This cross-record consistency is real work, not free** — forgetting
  a page must update every other record whose set lists it (a full-store scan on
  forget, or a reverse-membership index; the store is small, so the scan cost is
  acceptable). The exact storage shape is a planning call (see Outstanding
  Questions).

---

## Acceptance Examples

- **AE1. Covers R3, R4.** Given a tab opened from a link within a same-window
  cluster, when A1 lets it go, then its record carries the working set (the
  sibling pages); a tab the user had open alone carries no set.
- **AE2. Covers R6, R7.** Given a let-go page that had a set of 4, when A1 recalls
  it, then a "bring back the set? (4)" surface shows the members, each toggleable.
- **AE3. Covers R8.** Given the set surface with one member unchecked and one
  member already open in a tab, when A1 restores, then only the checked members
  reopen and the already-open one is focused, not duplicated.
- **AE4. Covers R5.** Given a working set that included a banking page, when the
  set is snapshotted, then the banking page is **not** in the set.
- **AE5. Covers R10.** Given auto-let-go closes a zombie that had a set, when the
  sweep runs, then the set is snapshotted but **nothing reopens** until A1 asks.
- **AE6. Covers R12.** Given a set-member that A1 forgets, when the forget
  completes, then it is removed from the set and the rest of the set is intact.

---

## Success Criteria

- A1 can let go a working context and bring it back as a set in a couple of
  clicks — and trusts the set because it's tight, editable, and never restores
  without being asked.
- The clustering is right often enough that the offered set usually needs no
  editing; when it's wrong, unchecking the stray page is trivial and the set is
  never a 40-tab dump.
- Nothing about clustering or restore transmits data or captures sensitive
  siblings; the privacy posture is unchanged from slices 1–3.
- `ce-plan` can decompose slice 4 from this doc without inventing the clustering
  behavior, the restore interaction, or the scope boundaries.
- **Dogfooding check:** tabs-only restore actually delivers the §5d "resume the
  context" feeling — it reads as your work coming back, not a tab-dump that
  reopens. If it lands as the latter, scroll restore is promoted from a v2
  delight to a v1 necessity rather than deferred by default.

---

## Scope Boundaries

- **Named / browsable / persistent "sessions"** as first-class entities to
  curate — out (the §9 session-manager / junk-drawer anti-pattern). The set is
  an ephemeral property of a let-go page, not a managed list.
- **Reconstruct-from-banked-signal clustering** (computing clusters at recall
  time from a continuously-banked opener/co-activation graph) — out; v1
  snapshots at let-go.
- **Scroll position / exact-place restore** — deferred to v2 (each restored page
  lands at the top). Capturing scroll or any form/selection state is out
  (CONTEXT R16 privacy; scroll deferred).
- **Cross-window clustering** — out; v1 clusters within a single window.
- **Re-clustering, merging, or editing a set after let-go** (beyond the
  uncheck-at-restore) — out.
- **Auto-restoring a set** (on startup or otherwise) — out; always opt-in (R10).

---

## Key Decisions

- **Snapshot the set at let-go, not reconstruct on recall.** The clustering
  signals aren't banked today, so computing the cluster from the *live* open tabs
  at let-go ships immediately with no banking wait, and the set is the working
  context as it actually was when you set it down.
- **No "sessions" surface.** The set is a property of a let-go page surfaced at
  recall, not a managed list — keeps the product calm and off the
  session-manager genre CONTEXT §9 rejects.
- **Conservative / precise + size-capped + partial-editable.** Clustering is
  sometimes wrong; the mitigation is a tight set you trust, recoverable by
  unchecking, never a tab dump, and never auto-restored. Over-inclusion is
  recoverable (uncheck); the cap prevents a whole-window dump.
- **Tab set only in v1.** "Resume the context" = the tabs are back together;
  scroll/exact-place restore is a finicky v2 delight, not the core value.
- **Restore dedupes against open tabs.** Reopening the set focuses
  already-open members instead of duplicating them — restore brings back what's
  missing, not a second copy of what's there.

---

## Dependencies / Assumptions

- **Slices 1–3 are shipped** (capture path, recall/reopen, the shelf, per-tab
  state, the privacy gate). Slice 4 layers on top.
- **The clustering signals are not banked today** — `tabstate` keeps only a
  `noOpener` boolean, not the `openerTabId` value, co-activation, or window. v1
  therefore computes the cluster from the live `chrome.tabs.query` at let-go;
  recent co-activation can be approximated from slice-2 `tabstate`
  (`lastActivatedAt`/`activations`) or a light dedicated track (a planning call).
- **`openerTabId`, `windowId`, and active-tab events are available** from
  `chrome.tabs` — the spawn-tree and same-window signals are present at let-go.

---

## Outstanding Questions

_No blocking product questions remain. The below are technical/design calls for
planning._

### Deferred to Planning

- [Affects R3/R4] The exact clustering signals, weights, thresholds, and the
  size cap — tune against real browsing during dogfooding (R4 sets a directional
  v1 floor; the precise numbers are still a dogfood call). The co-activation
  source (reuse slice-2 `tabstate` vs a light dedicated recent-co-activation
  track) is a planning decision. **Note (feasibility, from doc-review):**
  `tabstate` stores only `lastActivatedAt` + an `activations` count — no pairwise
  ping-pong history — so co-activation is **not reconstructable** from existing
  banked signal. The orphan fallback (R3) leans entirely on co-activation; if the
  approximate source proves too weak, orphan tabs get no set. Resolve the source
  before decomposing R3.
- [Affects R6/R7/R8] The restore-set UI: where the "bring back the set?" surface
  renders (inline in the recall result / shelf row vs a small panel), and the
  toggle/restore interaction.
- [Affects R12] Where the set lives on the record (inline sibling list vs a
  separate keyed store) and how forget keeps sets consistent across members
  (the cross-store-purge invariant from slice 2 applies).
- [Affects R8] How a "still open" sibling is detected and focused vs reopened
  (origin+path match against live tabs, like `reopenRecord`).
