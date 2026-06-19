---
date: 2026-06-19
topic: living-puff-tab-strip
---

# The living-puff tab strip — favicon + title as ypuf's attention barometer

## Summary

Reimagine the new-tab board's browser-tab presence — its favicon and `<title>`
together — as one calm ambient instrument: a living "puff" favicon that breathes,
tints with the time of day (carrying the moon phase at night), and shifts its
particle configuration to mirror the snooze queue, while the title stays a serene
mood line. Ships as a core "barometer" slice first; the arrival/let-go delight
moments follow as slice 2.

---

## Problem Frame

The board's tab is the one ypuf surface that is *always* on screen — it sits in
the tab strip even when the board isn't the focused tab, and it's what you scan
when you have thirty tabs open. Today it's inert: a static `ypuf` title and a
static mark. That's a missed beat for a product whose whole identity is the
puff/ebb metaphor — things drift away, things come home, the air breathes — and
whose promise is a calm, glanceable relationship with your tabs. Meanwhile the
snooze queue (what's away, what's come back and is waiting) already knows things
the tab strip could quietly reflect, but a user has to open the board to see any
of it. The risk in closing that gap is the one ypuf exists to cure: a status
signal that becomes a nagging red badge, the cluttered thing calm is meant to
replace.

---

## Actors

- A1. The board owner: the single local user, glancing at the tab strip (often at
  a backgrounded ypuf tab) to sense — without opening the board — whether anything
  is drifting back or waiting.
- A2. The service worker (snooze engine): the existing source of `{back, snoozed}`
  state and the auto-reopen returns the barometer reflects. No new SW data.

---

## Key Flows

- F1. Render the barometer for the current state
  - **Trigger:** the board page loads, or its snooze/mood/theme state changes while open.
  - **Actors:** A1, A2
  - **Steps:** read the snooze state (`{back, snoozed}`) and the current mood/theme →
    choose the barometer state (clear / scheduled / back-now) → draw the puff to a
    canvas with the time-of-day tint (and the moon glow at night) → swap it in as the
    favicon → set the title to the calm mood line.
  - **Outcome:** the tab strip shows a calm, correctly-configured living puff and a
    serene title.
  - **Covered by:** R1, R2, R3, R5, R6, R7, R8, R9, R12

- F2. Breathe while watched, hold while away
  - **Trigger:** the board tab gains or loses focus/visibility.
  - **Actors:** A1
  - **Steps:** while the board tab is visible and motion is welcome, the puff breathes
    on a slow cycle → when the tab is hidden or backgrounded, the animation holds its
    last frame, but the barometer *state* still updates on snooze changes.
  - **Outcome:** a focused tab feels alive; a backgrounded tab shows the right state,
    frozen, without burning CPU.
  - **Covered by:** R4, R10, R11

- F3. The arrival moment (slice 2)
  - **Trigger:** a snoozed tab auto-returns while the board tab is open.
  - **Actors:** A1, A2
  - **Steps:** the favicon plays a one-shot "arrival" (a particle floats down to join
    the cluster) → the title briefly whispers a welcome-back caption → both settle back
    to the resting barometer state.
  - **Outcome:** a small, pull-only moment of "something came home."
  - **Covered by:** R13, R14

---

## Requirements

**The living puff favicon (calm — slice 1)**
- R1. The favicon is the ypuf puff mark, rendered to a canvas and installed as the
  tab's icon (replacing the static SVG icon), reusing the existing puff geometry.
- R2. The favicon tints with the same time-of-day mood as the masthead (dawn → dusk →
  night), and adopts the dark/star palette in those themes, reusing the existing mood
  engine — no separate mood source.
- R3. At night the puff carries the current moon phase as its glow, reusing the
  existing moon-phase utility.
- R4. When motion is welcome, the puff breathes — a barely-perceptible slow scale/
  opacity pulse on the same calm cadence as the snooze return-loop. Under
  reduced-motion it is a still mark.

**The barometer — favicon carries the status (useful — slice 1)**
- R5. The favicon's *configuration* (not a badge) encodes the snooze queue in three
  states, driven by the existing `{back, snoozed}` data: **clear** (one puff at rest),
  **scheduled** (faint particles drift upward, proportional to what's coming back), and
  **back-now** (particles settle downward plus a soft amber dot).
- R6. The amber dot is the load-bearing, dependable "back-now" signal; the up-vs-down
  particle drift is a calm flourish layered on top of it.
- R7. The barometer never reads as an alert: no red, no numeral badge, no count baked
  into the icon — a sky, not a notification.

**The title — calm caption (slice 1)**
- R8. The title is always a serene mood line (the masthead's mood/time caption,
  e.g. "ypuf · Friday morning"), never a status count — so it ages gracefully wherever
  it is recorded (history, window title).
- R9. The title's mood text stays consistent with the masthead's living sub-line.

**Behaviour, performance, and calm (slice 1)**
- R10. The breathing animation runs only while the board tab is focused/visible; when
  the tab is hidden or backgrounded it holds its last rendered frame.
- R11. The barometer *state* still updates when the board tab is backgrounded (on a
  snooze change), so a glance at a background tab shows the correct configuration even
  though it isn't breathing.
- R12. Everything is 100% local and pull-only: no network, no new permissions, no
  sound, no notifications. The favicon is drawn on-device from existing assets.

**Delight moments (slice 2)**
- R13. When a snoozed tab auto-returns while the board is open, the favicon plays a
  one-shot "arrival" (a particle floats down to join) and the title briefly whispers a
  welcome-back caption before settling.
- R14. When a tab is let go (Ebb) with the board open, the favicon plays a tiny puff
  (a particle drifts off), echoing the puff sound that already plays — adding no new
  sound of its own.

---

## Acceptance Examples

- AE1. **Covers R5.** Given nothing is snoozed, when the board loads, the favicon is a
  single puff at rest and the title is the plain mood line.
- AE2. **Covers R5.** Given tabs are snoozed for later (none returned yet), when the
  board loads, the favicon shows faint upward-drifting particles and no amber dot.
- AE3. **Covers R5, R6.** Given one or more tabs have returned and are waiting, when the
  board loads, the favicon shows the amber dot with particles settled downward.
- AE4. **Covers R4, R10.** Given the OS prefers reduced motion, when the board is open,
  the favicon is a still mark in the correct barometer state — it does not breathe.
- AE5. **Covers R8.** Given any barometer state, when the title is read, it shows only
  the calm mood line — never a count like "2 back now".
- AE6. **Covers R3.** Given the night mood/theme, when the favicon renders, the puff
  carries the current moon phase as its glow.
- AE7. **Covers R11.** Given the board tab is backgrounded and a snoozed tab returns,
  when the user glances at the tab strip, the favicon already shows the back-now
  configuration (state updated though not animating).
- AE8. **Covers R13.** Given the board tab is open and visible, when a snoozed tab
  auto-returns, the favicon plays the arrival one-shot and the title briefly whispers
  welcome-back, then both settle.

---

## Success Criteria

- A glance at the tab strip — even at a backgrounded ypuf tab — tells the owner
  whether anything is drifting back or waiting, and it never once feels like a nag.
- The tab feels alive and on-brand (the puff breathing, the time-of-day warmth) while
  staying within §9 calm; reduced-motion users get a still, correct mark.
- The state→barometer mapping and the particle layout are pure, node-tested decidable
  cores (pattern 18), so the visual states are pinned without a browser.
- A harness render shows the favicon correct across all three barometer states and
  every theme/mood, so planning can implement without inventing the thresholds.

---

## Scope Boundaries

- Seasonal grace (autumn leaf / snowflake / firefly) is parked — a rare future delight,
  not v1 or slice 2.
- No new sound, permissions, or network: the arrival is visual-only; the let-go puff
  just echoes the sound that already plays.
- No changes to the on-page masthead puff mark or the shipped `ypuf-mark.svg` icon file
  — this is the favicon + title only.
- The title never carries a status count — status lives entirely in the favicon.
- Slice 2 (the arrival + let-go delight moments) is not part of the first shippable
  slice.

---

## Key Decisions

- Calm title, favicon carries all status: cleanest split of "calm vs useful" across the
  two surfaces, and the title ages gracefully wherever it's recorded.
- Moon-phase glow ships in slice 1: it's cheap (the moon-phase utility already exists)
  and extends the time-of-day tint layer rather than adding a new one.
- Breathing animates only when the board tab is focused; barometer state updates in the
  background: browsers throttle hidden tabs anyway, and the *state* is what matters at a
  glance — the breath is the at-rest flourish.
- The amber dot is the dependable back-now signal; the up/down particle drift is a
  flourish: hedges the 16px legibility risk so the state always reads even if the drift
  doesn't.
- Reuse existing assets — the puff geometry, the mood engine, the moon-phase utility,
  and the `{back, snoozed}` snooze data — so no new data, sound, or permission is
  introduced.

---

## Dependencies / Assumptions

- Reuses the snooze engine's `{back, snoozed}` payload, the board's mood engine
  (the masthead mood/time caption), the moon-phase utility, and the puff-mark geometry.
- Assumes a canvas → data-URL favicon swap works in the new-tab extension page (a
  standard technique) — to be confirmed in the browser harness.
- Bases off `main` after the snooze-panel PR (#21) merges.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] Exact particle-count thresholds and mapping — how many
  snoozed tabs map to how many drift particles, and the cap before it reads as busy.
  Tune in the harness.
- [Affects R1, R4, R10][Technical] Favicon redraw mechanics and perf — rAF vs a slow
  interval, pausing on `visibilitychange`, and keeping each redraw cheap.
- [Affects R5, R6][Needs research] 16px legibility — validate in the harness that
  upward-drift vs settle-down read as distinct states; if not, the dot + title carry it.
- [Affects R8, R9][Technical] How the title mood line stays in sync with the masthead's
  living sub-line (shared source vs recomputed).
- [Affects R13, R14][Technical] One-shot reachability — the board tab must be open to
  show the arrival/let-go moment; confirm the trigger (a snooze-return storage event)
  and whether the one-shot plays only while visible or queues for the next focus.
