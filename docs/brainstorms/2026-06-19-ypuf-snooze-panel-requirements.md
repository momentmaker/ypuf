---
title: Snooze panel — a dedicated "coming back" surface
status: ready-for-planning
created: 2026-06-19
type: feature
actors: [A1 dogfooder/end-user]
origin: refinement of docs/brainstorms/2026-06-15-ypuf-slice3-snooze-requirements.md (post auto-reopen, PR #18)
---

# Snooze panel — a dedicated "coming back" surface

## Problem frame

Snooze (send a tab away until later, with a guaranteed return) was originally bundled
into the recall ("ypuf") panel as part of "the let-go net" (`docs/CONTEXT.md` §f). That
bundling predates **auto-reopen** (PR #18): timed snoozes now reopen their tab in the
background at the return time, so "Back now" is no longer the main return path — it only
catches "when I'm back" (untilStartup) returns + edge cases (cap overflow, non-web,
reopen failures).

Auto-reopen reshaped snooze from a *backward-looking* archive fragment into a
*forward-looking* **"coming back" queue** — what's away, and when it returns. That is
conceptually distinct from recall (searching the let-go archive), so snooze earns its
own board panel. The just-shipped recall redesign (PR #20) already pulled the panel into
a clean single-purpose shape, which this split completes.

## Actors

- **A1 — the dogfooder / end-user.** Snoozes tabs from the in-page overlay (`⌘⇧S`) or the
  popup; opens the new-tab board to see what's coming back and to act on returns.

## What we're building

A new board panel, **Snooze** (resolved in planning; "Coming back" was the alternative), that
surfaces snooze as a calm forward timeline. Top to bottom:

1. **Back now** (pinned group, hidden when empty) — returns waiting for a click: "when
   I'm back" resolutions + the rare edge cases. Sage accent; the actionable part, so it
   sits up top. (Same treatment shipped for the recall panel in PR #20, relocated here.)
2. **The "coming back" timeline** — still-snoozed tabs grouped by **return window**,
   soonest first: *Later today · This evening · Tomorrow · This weekend · Next week ·
   Later · When you're back*. Each group has a quiet header; the forward mirror of the
   recall panel's Today/Yesterday/Earlier groups.
3. **Empty state** (when nothing is snoozed AND nothing is back) — always present, never
   hidden: a calm teaching line that sells auto-reopen — e.g. *"Nothing's away. Send a tab
   off with ⌘⇧S — it comes back on its own."* — over a **return-loop** background
   animation (below).

### Per-row behavior

Each snoozed/back-now row is host-rendered text-only (favicon + title + host, reusing the
recall row), plus:

- **Return-time label** — "back this evening", "back Sat 9am", "back next time you're
  here" (untilStartup). Calm, human.
- **Open** (click the title) — opens the page now; ends the snooze.
- **Wake** — "bring back now" (reuses `snooze-wake`).
- **Inline re-snooze** — push the tab further ("actually… next week"); hover/cursor-
  revealed, reuses `snooze-resnooze`.
- **Bring back the set (⊕N)** — when the snoozed tab was part of a session (siblings),
  the same chip as the recall panel wakes the whole research set together.

Secondary actions (Wake, re-snooze, ⊕N) are quiet at rest and revealed on hover / focus /
keyboard-cursor — the recall panel's established pattern, so the panel stays glanceable.

### Empty-state animation — "the return loop"

A small tab/dot gently **drifts up and away, pauses, then floats back down and settles**,
on a slow loop, behind the teaching line. It *shows* the snooze promise (send it off, it
returns on its own) while it charms. Reduced-motion-gated (static when motion isn't
welcome), calm, on-brand with the puff vocabulary. Only runs while the empty state is
shown.

## Key flows

- **F1 — Glance at what's coming back.** Open a new tab → the Snooze panel shows the
  return-window timeline (and Back now if any). The user reads "what's away, and when" at
  a glance without acting.
- **F2 — A return arrives.** A timed snooze auto-reopens (no panel action needed); the row
  leaves the timeline. A "when I'm back" snooze surfaces under **Back now** on startup; the
  user clicks it to reopen (or it waits).
- **F3 — Act on a snoozed tab.** From a row: Wake it now, re-snooze it further, open it, or
  bring back its whole set.
- **F4 — Empty desk.** Nothing snoozed → the teaching empty state + return-loop animation
  invites the feature and reassures (auto-reopen means nothing is lost).

## Scope boundaries

**In scope**
- The Snooze panel (always present, teaching empty state) with the return-window timeline,
  Back-now pinned group, per-row Wake / open / inline re-snooze / bring-back-the-set, and
  the return-loop empty-state animation.
- Removing snooze rendering from the recall panel (recall → pure search + let-go archive).
- A pure, tested return-window bucketing core (mirrors `lib/timegroup.js`).
- Surfacing the panel on existing boards (a one-time seed) + the panel picker entry.

**Deferred for later (parked, not cut)**
- **"Came back" relief** — a "N tabs came back today" Zeigarnik line. Needs the SW to start
  logging recent auto-returns (new data + retention). Revisit once the panel is in.
- **Bulk actions** (wake-all / "bring back the weekend set") — risks the cluttered control
  panel §9 rejects; not now.
- **A separate "next return" header glance** — redundant with the timeline's soonest group.

**Outside this product's identity**
- No notifications / push on return (§9 interrupt rejection holds — pull-only).
- No cloud/sync of the snooze queue (100% local).

## Constraints (ypuf identity — load-bearing)

- **Calm by design (§9):** quiet, glanceable, pull-not-push; never a scan-and-manage
  control panel. Secondary actions hidden at rest.
- **Privacy / local-only:** page content never transmitted; titles/URLs are page-derived →
  host-rendered text-only via `lib/shelf-render.js` (no innerHTML).
- **Reduced-motion-gated** motion (the return loop, any transitions).
- **Reuse the established patterns:** `registerPanelType` in `extension/newtab/newtab.js`;
  the SW `snooze-list` / `snooze-wake` / `snooze-resnooze` / `recall-open` messages (no new
  SW data work for the core); the pure-tested-lib convention (pattern 18) for the
  return-window bucketing; the 3-column independent-height board grid (`lib/lanes.js`).

## Success criteria

- A user with snoozed tabs sees them grouped by **when they come back**, soonest first, at
  a glance — and can Wake / re-snooze / open / bring-back-the-set from a row.
- A user with nothing snoozed sees a calm teaching empty state + the return-loop animation,
  and understands tabs come back on their own.
- The recall panel no longer shows snooze (it is pure search + archive).
- The panel holds §9 calm: quiet at rest, no notifications, secondary actions revealed only
  on intent.
- The return-window bucketing is covered by unit tests; no innerHTML for page-derived
  content; motion is reduced-motion-gated.

## Acceptance examples

- **AE1 — Timeline.** Snooze tab A "this evening", B "this weekend", C "when I'm back".
  The panel shows *This evening → A*, *This weekend → B*, *When you're back → C*, in that
  order.
- **AE2 — Auto-reopen leaves the timeline.** At 6pm, A auto-reopens (background tab); its
  row disappears from the timeline; no Back-now entry for A.
- **AE3 — "When I'm back" surfaces.** On next browser startup, C moves to the **Back now**
  pinned group; clicking it opens C and clears it.
- **AE4 — Re-snooze.** On B's row, "→ next week" re-snoozes B; B moves from *This weekend*
  to *Next week*.
- **AE5 — Empty.** With nothing snoozed or back, the panel shows the teaching line over the
  return-loop animation; with reduced-motion, the line shows statically.

## Open questions (for planning / low-stakes)

- **Label:** "Snooze" (recognizable verb, matches the picker/feature) vs "Coming back"
  (matches the forward framing). Lean "Snooze"; tunable.
- **Exact return-window buckets** and their boundaries (map to the snooze presets vs
  compute from `returnAt`) — a planning/lib detail; compute from `returnAt` to handle
  custom times.
- **Existing-board seeding:** how the panel appears for boards saved before it existed
  (one-time migration vs addable-only) — planning detail; intent is present-by-default.
