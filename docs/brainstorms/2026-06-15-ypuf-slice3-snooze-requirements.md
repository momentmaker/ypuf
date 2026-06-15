---
date: 2026-06-15
topic: ypuf-slice3-snooze
status: requirements
actors: [A1]
flows: [F1, F2]
---

# ypuf Slice 3 — Snooze

## Summary

Snooze is auto-let-go's **voluntary twin**: the user sets a tab aside now, and
ypuf guarantees it comes back at a chosen time. It captures the tab through
slice 1's exact let-go path (so it stays recallable while away) and closes it,
then — at the chosen time — surfaces it at the top of the **shelf** in a "back
now" state with a gentle icon badge. No tab auto-reopens; the return goes to the
shelf (ypuf's "inbox"), keeping the tab strip calm. Reuses the capture path, the
shelf, the store/index, and `chrome.alarms` (already wired in slice 2).

---

## Problem Frame

A tab-drowning knowledge worker (A1) keeps tabs open as open loops — "I'll deal
with this later." Today "later" means the tab stays open forever (the clutter
ypuf cures) or gets bookmarked into a junk drawer they never revisit. Snooze
gives "later" a real home: let the tab go *with a guaranteed return*, so closing
it costs nothing. It is the most-loved feature in email (Superhuman/Inbox);
CONTEXT §5c marks it a strong v1 candidate. It ships *after* auto-let-go because
it reuses the same capture-then-close path and the same recall safety net.

---

## Actors

- **A1. Tab-drowning knowledge worker** (established; the primary actor for
  slices 1–4). Wants to set a tab aside and trust it returns, without leaving it
  open or losing it.

---

## Key Flows

- **F1. Snooze a tab**
  - **Trigger:** A1 invokes snooze on the active tab (hotkey or popup control).
  - **Steps:** A small duration picker opens → A1 picks a return time → the tab
    is captured (gate-then-extract, same as let-go) and closed → it appears in
    the shelf marked "snoozed until X."
  - **Outcome:** The tab is gone from the strip; its content is recallable; it
    will return at the chosen time.
  - **Covered by:** R1, R2, R3, R4, R6

- **F2. A snooze returns**
  - **Trigger:** The chosen time arrives (or, if Chrome was closed, the next
    startup after it passed).
  - **Steps:** The item rises to the top of the shelf in a "back now" state +
    a gentle icon badge → A1 reopens it from the shelf when ready.
  - **Outcome:** The set-aside page is back in front of A1, on their schedule,
    without a tab having popped open unbidden.
  - **Covered by:** R8, R9

---

## Requirements

**Foundation / reuse**
- R1. Reuse slice 1's capture-then-close path and the store/index for snoozed
  tabs — a snoozed tab is captured and recallable exactly like a let-go tab.
  Reuse the shelf surface and `chrome.alarms` (added in slice 2) for scheduling.
- R2. Apply the **same privacy gate as let-go** (slice-1 R14/R15): incognito is
  never captured; blocklisted pages store title + URL only (query stripped);
  gate-before-extract. A snoozed blocklisted page returns by title + URL.

**Snooze trigger**
- R3. A1 can snooze the **active tab** via at least one explicit trigger (a
  keyboard shortcut and/or a popup control), which opens a duration picker. On
  confirm, the tab is captured and closed and a return is scheduled.
- R4. The picker offers preset returns: **later today · this evening · tomorrow
  morning · this weekend · next week · a custom date-time**, plus a context
  option **"when I'm back" (next Chrome startup)** — the §5c "until I'm back at
  my desk." (Exact default clock times for the relative presets are deferred to
  planning.)
- R5. v1 snooze acts on a **live tab only** — not on an existing shelf item.

**While snoozed**
- R6. A snoozed item appears in the shelf in a **distinct "snoozed until X"
  state** showing its return time, and remains **recallable** the whole time
  (search/recall finds it like any captured page).
- R7. From the shelf, A1 can **wake a snoozed item early** (wake-now → it
  becomes "back now" immediately) and **re-snooze** it (pick a new return time).

**Return**
- R8. At the scheduled time the item surfaces at the **top of the shelf in a
  "back now" state** with a gentle icon badge. **No tab auto-opens.** A1 reopens
  it from the shelf when ready (reusing the recall/reopen path).
- R9. **Guaranteed return:** if Chrome is closed when the time passes, the item
  surfaces as "back now" on the **next startup** (alarms re-armed on startup +
  an overdue check — the slice-2 lesson that `persistAcrossSessions` is
  unreliable). An overdue return indicates it has been waiting (e.g., "due
  yesterday"). "Guaranteed" means it *will* surface, even if late — never lost.
- R10. A snoozed item **never becomes an auto-let-go candidate** (it is not an
  open tab). Reopening a returned item from the shelf makes it a normal fresh
  tab thereafter, with no special handling needed.

**Privacy / storage / calm**
- R11. Snoozed items and their schedules are **local-only** (the existing index
  + `chrome.storage`); nothing is transmitted. **Forget/purge covers snoozed
  items** — forgetting a snoozed item also cancels its scheduled return.
- R12. Snooze should **feel like setting something down, not scheduling a
  task**: a minimal picker (no calendar-app complexity), and a return that is a
  gentle shelf nudge, never an alert or an auto-opened tab.

---

## Acceptance Examples

- **AE1. Covers R3, R4, R6.** Given a normal tab, when A1 snoozes it until
  tomorrow, then the tab closes, appears in the shelf as "snoozed until
  tomorrow," and is still findable by a phrase from its body in recall.
- **AE2. Covers R8.** Given a tab snoozed until 9am, when 9am arrives, then the
  item rises to the top of the shelf in a "back now" state with an icon badge,
  no tab opens, and reopening it from the shelf restores the page in under a
  second.
- **AE3. Covers R9.** Given a snooze due while Chrome was closed, when A1 next
  opens Chrome, then the item is "back now" (marked overdue), not lost.
- **AE4. Covers R7.** Given a snoozed item in the shelf, when A1 picks wake-now,
  then it becomes "back now" immediately; when A1 re-snoozes it, then it gets a
  new return time.
- **AE5. Covers R2.** Given a blocklisted banking page, when A1 snoozes it, then
  only its title + URL are stored (no content), and it returns by title + URL.
- **AE6. Covers R10.** Given a snoozed item, when the auto-let-go sweep runs,
  then the snoozed item is never auto-closed (it is not an open tab).

---

## Success Criteria

- A1 can snooze a tab in two keystrokes and trust it returns — and *feels* safe
  closing it because the return is guaranteed and the content is recallable
  meanwhile.
- Returns are reliable across browser restarts: a snooze due while Chrome was
  off surfaces on next open, never silently dropped.
- The return never interrupts: nothing auto-opens; the tab strip stays calm; the
  nudge is a shelf state + badge.
- `ce-plan` can decompose slice 3 from this doc without inventing snooze
  behavior, the preset set, or the return semantics.

---

## Scope Boundaries

- **Snoozing an existing shelf item** (re-setting-aside something already let go)
  — out of v1; snooze is a live-tab action.
- **Recurring / repeating snooze** ("every Monday") — out; one-shot returns only.
- **Snooze analytics / digests** ("you snoozed 12 tabs this week") — out.
- **Auto-reopening the tab** (foreground or background) — explicitly rejected in
  favor of the shelf nudge (keeps the tab strip calm; dissolves the auto-let-go
  re-close interaction).
- **A separate "snoozed" surface / page** — snoozed items live in the existing
  shelf with a state marker, not a new screen (calm; reuse).

---

## Key Decisions

- **Return to the shelf, not the tab strip.** ypuf's "inbox" is the shelf, so a
  returned snooze surfaces there with a gentle nudge rather than reopening a tab.
  This honors the calm promise and means a returned item is never an
  auto-let-go candidate (no reopened tab to immediately re-close).
- **Reuse the let-go capture path verbatim.** Snooze = "let go, but bring it
  back at X." Same gate, same extraction, same store/index — so snoozed content
  is recallable and the privacy rules are inherited, not reinvented.
- **Guaranteed-but-late over precise.** `chrome.alarms` is best-effort and its
  cross-session persistence is unreliable (slice-2 learning), so the contract is
  "it will surface, even if late, on next startup" — not "exactly on time."
- **A "when I'm back" context option.** Beyond clock times, "next Chrome
  startup" matches CONTEXT §5c's "until I'm back at my desk" and is a calm,
  intent-based return that composes naturally with the shelf nudge.

---

## Dependencies / Assumptions

- **Slices 1 + 2 are shipped** (capture path, shelf, store/index, recall reopen,
  `chrome.alarms` wiring, the badge, startup-rearm pattern). Snooze layers on
  top and reuses them.
- `chrome.alarms` minimum period (~30s) and best-effort firing are acceptable —
  snooze is not time-critical to the second.
- The shelf can represent multiple item states (let-go, snoozed-until-X, back-
  now); the popup already renders the recently-let-go list and is extended, not
  replaced.

---

## Outstanding Questions

_No blocking product questions remain. The below are technical/design calls for
planning._

### Deferred to Planning

- [Affects R4] Exact default clock times for relative presets (what is "tomorrow
  morning," "this evening," "this weekend," "next week"?) and the picker UI.
- [Affects R8/R6] The visual treatment of the "back now" vs "snoozed until X"
  shelf states and the badge behavior (does the snooze badge share or stack with
  the auto-let-go badge from slice 2?).
- [Affects R9] The overdue-check mechanism on startup and the alarm period for
  catching returns while Chrome is running.
- [Affects R11] Where the snooze schedule is persisted (alongside the record, or
  a separate schedule store) and how forget cancels a pending return — a
  planning decision, but the cross-store-purge invariant (slice-2 learning)
  applies.
