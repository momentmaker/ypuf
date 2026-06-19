---
title: "feat: living-puff tab strip — slice 2 (the delight moments)"
type: feat
status: completed
date: 2026-06-19
origin: docs/brainstorms/2026-06-19-ypuf-living-puff-tab-strip-requirements.md
---

# feat: living-puff tab strip — slice 2 (the delight moments)

## Summary

Slice 2 adds the two one-shot delight moments deferred from slice 1: an **arrival**
(when a snoozed tab auto-returns while you're on the board, a particle floats down to
join the puff and the title briefly whispers "welcome back") and a **let-go puff** (when
the auto-sweep lets a tab go, a particle drifts off the puff — echoing the puff sound
that already plays). Both fire only while the board tab is visible, are reduced-motion-
gated, and reach the board via a small new service-worker → board broadcast that mirrors
the existing offscreen-audio one (pattern 8). The decidable particle paths are a pure
tested lib; the animation, listener, and title whisper are host glue validated in the harness.

---

## Problem Frame

Slice 1 made the favicon a calm, *resting* barometer of the snooze queue — but it only
ever *reflects* state, it never *reacts*. The brainstorm's delight beat (origin F3, AE8)
is the live moment: a tab you snoozed quietly comes home while you're looking, or the
desk clears itself with a soft puff. Those moments were deferred because the board had no
way to learn of the service-worker-side events that trigger them. See origin for the full
framing. This slice supplies that signal and the one-shot reactions.

---

## Requirements

- R13. When a snoozed tab auto-reopens while the board is open and visible, the favicon
  plays a one-shot **arrival** (a particle floats down to join the cluster) and the title
  briefly whispers a welcome-back caption, then both settle back to the resting barometer
  and the calm mood line.
- R14. When a tab is let go by the auto-sweep while the board is open and visible, the
  favicon plays a tiny one-shot **puff** (a particle drifts off the cluster), echoing the
  puff sound that already plays — adding no new sound.

**Origin actors:** A1 (the board owner, looking at the board), A2 (the service worker — emits the arrival/let-go events)
**Origin flows:** F3 (the arrival moment)
**Origin acceptance examples:** AE8 (board open + visible, a snoozed tab auto-returns → the favicon plays the arrival one-shot and the title whispers welcome-back, then both settle)

---

## Scope Boundaries

- One-shots fire **only while the board tab is visible** (`document.visibilityState === 'visible'`).
  There is no queue or replay — if you're not looking, the favicon simply reflects the updated
  state on your next glance (slice 1's `visibilitychange` refresh). Pull-not-push (§9).
- The **let-go puff fires on auto-close only** (where `puff()` already plays), not manual let-go
  (⌘⇧L): manual let-go happens on the active tab, so the board isn't visible to show it.
- **No new sound** — the let-go puff echoes the existing offscreen `puff()`; the arrival is silent.
- 100% local, no new permissions; reduced-motion-gated (under reduced-motion the animation and
  whisper are skipped — an arrival still refreshes the resting state, since the snooze queue changed).
- The new SW signal is a **transient broadcast event**, not persisted data — this is the one place
  slice 1's "no new SW data for the core" is deliberately extended.

### Deferred to Follow-Up Work

- Seasonal grace (autumn leaf / snowflake / firefly) — still parked (origin), not this slice.

---

## Context & Research

### Relevant Code and Patterns

- `extension/background.js` `puff()` (the offscreen sound) — `ensureOffscreen()` then
  `chrome.runtime.sendMessage({ target: 'offscreen', play: 'puff' })`. This **is the prior art**
  for a SW → extension-context broadcast (pattern 8); slice 2 adds a sibling `target: 'board'` one.
- `extension/background.js` `autoReopenDue` — reopens due snoozes and, on success, clears the snooze
  (`mutateSnooze` → `snooze.mark(rec, null)`). The **arrival** event is emitted here, per successful reopen.
- `extension/background.js` `runAutoSweep` — calls `puff()` per auto-close (`if (await autoCloseOne(…)) { closed += 1; puff(); }`).
  The **let-go** event is emitted here, alongside that `puff()`. (`handleLetGo`, the manual path, does not
  `puff()` and runs on another tab — out of scope, see Scope Boundaries.)
- `extension/newtab/newtab.js` — the slice-1 favicon controller (`favDraw` / `favFrame` / `syncFavicon` /
  `refreshFavState` / `initFavicon`; the reused offscreen canvas; the rAF breath gated on `reduceMotion()` +
  `!document.hidden`; the `visibilitychange` refresh). The one-shot reuses `favDraw` (drawing the resting
  frame + an overlay particle) and the established lifecycle discipline. The board's `send()` wrapper uses
  `chrome.runtime.sendMessage(msg, cb)` to talk *to* the SW; this slice adds a `chrome.runtime.onMessage`
  listener to receive *from* it.
- `extension/lib/puffscene.js` — the pure scene geometry (BOX = 32, role-tagged primitives). The one-shot
  particle path lib shares its coordinate box and composes with it.

### Institutional Learnings

- Pattern 8 (`docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`) —
  the offscreen-audio broadcast: a SW with no DOM messages an extension context via `runtime.sendMessage`
  with a `target` discriminator. The `target: 'board'` event mirrors this exactly.
- Pattern 18 — extract the decidable core: the one-shot particle path (progress → position/opacity) is pure
  and tested; only the rAF/canvas/title/visibility glue stays host-side.
- Pattern 17 — lifecycle: the one-shot rAF must supersede a prior one-shot, never leak, and not outlive a
  hidden tab or a board re-render (same discipline as the slice-1 breath loop).

### External References

- None. The SW→context broadcast, the favicon controller, and the pure-lib geometry are all established
  locally; no external research warranted.

---

## Key Technical Decisions

- **A `target: 'board'` runtime broadcast, mirroring `puff()`'s offscreen broadcast:** the SW emits
  `chrome.runtime.sendMessage({ target: 'board', event: 'arrival' | 'let-go' }, () => void chrome.runtime.lastError)`
  — best-effort, swallowing the "no receiving end" error when no board is open. The board adds a
  `chrome.runtime.onMessage` listener filtering `msg.target === 'board'`. A transient event, not stored data;
  zero new persistence, no new permission. Chosen over a storage/poll signal because snooze records live in
  IndexedDB (no `storage.onChanged` hook) and the broadcast pattern already exists for audio.
- **Arrival refreshes state; let-go does not:** an auto-reopen removes a tab from the snooze queue, so the
  arrival handler calls `refreshFavState()` (then animates if motion + visible). A let-go adds a recall record
  but doesn't touch the snooze queue, so the let-go handler only animates — no state refresh.
- **Reduced-motion skips the flourish, not the state:** under reduced-motion the one-shot animation and the
  title whisper are skipped; an arrival still refreshes the resting favicon (the queue changed), a let-go is a
  no-op. Keeps the reduced-motion experience purely state-based.
- **The one-shot overlays the resting frame:** the controller runs a short rAF (≈1.2 s arrival, ≈0.9 s let-go)
  that draws the normal resting favicon frame plus the transient particle (positioned by the pure path lib),
  then resumes the breath loop. The exact `favDraw` overlay-param shape is implementation detail (U3).
- **The title whisper restores via the single mood source:** the arrival sets `document.title` to
  `ypuf · welcome back` for the one-shot window, then restores by calling `renderMasthead()` (the slice-1/4
  mood-line source) — so an early restore from a concurrent refresh is harmless, never a stuck caption.

---

## Open Questions

### Resolved During Planning

- *One-shot reachability (slice-1 deferred):* a `target: 'board'` runtime broadcast from the SW at the
  auto-reopen-success and auto-close points; the board listens and animates only when visible.
- *Manual vs auto let-go:* auto-close only — manual let-go has no `puff()` and the board isn't visible then.
- *State on the events:* arrival refreshes the barometer (queue changed); let-go does not.

### Deferred to Implementation

- Exact one-shot **durations and easing**, and the transient particle's size/path endpoints — start from the
  values in U1/U3 and tune in the U4 harness against the 16px read.
- The exact `favDraw` signature for overlaying the one-shot particle (add an optional overlay param vs a
  separate one-shot draw path) — pick the lighter touch during implementation.
- Whether the welcome-back caption should vary (e.g., by time of day) — default to a single calm string;
  revisit only if it feels flat in dogfood.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation
> specification. The implementing agent should treat it as context, not code to reproduce.*

```
SERVICE WORKER (background.js)
  autoReopenDue ──(per successful reopen + snooze-clear)──► notifyBoard('arrival')
  runAutoSweep ──(alongside the per-close puff())─────────► notifyBoard('let-go')
        notifyBoard(e) = chrome.runtime.sendMessage({ target:'board', event:e }, swallow lastError)
                                   │  (broadcast — no open board = harmless no-op)
                                   ▼
BOARD (newtab.js)  chrome.runtime.onMessage  (msg.target === 'board')
   arrival → refreshFavState()                              ── always (queue changed)
           → if motion && visible: playMoment('arrival') + title whisper "ypuf · welcome back"
   let-go  → if motion && visible: playMoment('let-go')     ── animate only (no state change)

   playMoment(kind): a short rAF over D ms — each frame draws the resting favicon
     (favDraw) + a transient particle from puffmoment[kind](progress) overlaid;
     supersedes any prior one-shot; on end, resume the breath loop / restore the title.
```

Arrival particle: floats **down** from above the cluster, fading in as it joins. Let-go particle: drifts
**off** the cluster (up/away), fading out. Both paths are pure (`lib/puffmoment.js`), eased, in the BOX-32 space.

---

## Implementation Units

### U1. Pure one-shot particle paths — `lib/puffmoment.js`

**Goal:** A pure, tested lib giving the transient particle's position + opacity over a one-shot's progress,
for both the arrival and let-go moments.

**Requirements:** R13, R14

**Dependencies:** None

**Files:**
- Create: `extension/lib/puffmoment.js`
- Test: `tests/puffmoment.test.js`

**Approach:**
- `arrival(progress)` → `{ x, y, r, opacity }`: a particle eased from **above** the cluster (small `y`, low
  opacity) **down** to the cluster's base (larger `y`), fading **in** as it joins. `progress ∈ [0,1]`, eased
  (e.g. ease-out), coordinates in the same BOX (32) as `lib/puffscene.js`.
- `letGo(progress)` → `{ x, y, r, opacity }`: a particle eased **off** the cluster (up/away from the core),
  fading **out** to ~0 opacity by `progress = 1`.
- Pure: no canvas, no DOM, no time — `progress` is injected; deterministic. Out-of-range `progress` clamps to [0,1].
  Expose `BOX` (or reuse puffscene's) so the host scales consistently.

**Patterns to follow:**
- `extension/lib/puffscene.js` and `extension/lib/returnwindow.js` (pure, injected inputs, clamp, UMD/`self.ypuf` wrapper).

**Test scenarios:**
- Happy path: `arrival(0)` is above the cluster (small `y`) at low opacity; `arrival(1)` is at the cluster base
  (larger `y`) at full opacity. Covers AE8 (the "joins from above" shape).
- Happy path: `letGo(0)` sits at the cluster at full opacity; `letGo(1)` is off the cluster and ~0 opacity.
- Edge case: `arrival` `y` is monotonically non-decreasing and opacity non-decreasing across `progress` 0→1
  (it descends + fades in, never reverses); `letGo` opacity is monotonically non-increasing (fades out).
- Edge case: out-of-range `progress` (-1, 2) clamps to the `0` / `1` endpoints.
- Edge case: every returned primitive has finite numeric `x/y/r`, `opacity ∈ [0,1]`, and stays within BOX.
- Determinism: same `progress` → identical output.

**Verification:**
- `node --test tests/puffmoment.test.js` passes; the descend-and-join (arrival) and drift-and-fade (let-go)
  shapes and the clamp/determinism are pinned.

---

### U2. Service-worker board broadcast — arrival + let-go events

**Goal:** Emit a transient `target: 'board'` runtime broadcast at the auto-reopen-success and auto-close points.

**Requirements:** R13, R14

**Dependencies:** None

**Files:**
- Modify: `extension/background.js`

**Approach:**
- Add a small `notifyBoard(event)` helper: `chrome.runtime.sendMessage({ target: 'board', event }, () => void chrome.runtime.lastError)`
  — best-effort, swallowing the "no receiving end" error when no board page is open (the board may be closed).
- In `autoReopenDue`, after each **successful** reopen + snooze-clear (the `mutateSnooze` block), call `notifyBoard('arrival')`.
- In `runAutoSweep`, alongside the existing per-close `puff()`, call `notifyBoard('let-go')`.
- Mirrors `puff()`'s offscreen broadcast (pattern 8); a transient event with no persisted data and no new permission.

**Execution note:** Host glue — `chrome.runtime` side effect, no unit test; validated by the U4 dogfood/harness and U3's listener.

**Patterns to follow:**
- `extension/background.js` `puff()` (the `target: 'offscreen'` broadcast) and `ensureOffscreen`.

**Test scenarios:**
- Test expectation: none — `chrome.runtime.sendMessage` host glue (no chrome stub in the suite). Behavior is
  proven by U3's listener firing the one-shot in the harness/dogfood.

**Verification:**
- With the board open and visible, an auto-reopen and an auto-close each produce exactly one `target: 'board'`
  broadcast; with no board open, the emit is a harmless no-op (no unhandled-rejection noise).

---

### U3. The favicon one-shot + the board event listener

**Goal:** React to the `target: 'board'` events — play the arrival/let-go one-shot (when visible + motion welcome)
and whisper the welcome-back title on arrival — building on the slice-1 controller.

**Requirements:** R13, R14

**Dependencies:** U1, U2

**Files:**
- Modify: `extension/newtab/newtab.js`

**Approach:**
- In `initFavicon`, add a `chrome.runtime.onMessage` listener for `msg.target === 'board'` (return `false` — no async
  response): on `arrival` → `refreshFavState()` (the queue changed) and, if `!reduceMotion() && !document.hidden`,
  `playMoment('arrival')` + the title whisper; on `let-go` → if motion + visible, `playMoment('let-go')` (no refresh).
- `playMoment(kind)`: a short one-shot rAF over a fixed duration (≈1200 ms arrival, ≈900 ms let-go). Each frame
  computes `progress = elapsed / D`, draws the resting favicon frame **plus** the transient particle from
  `puffmoment[kind](progress)` overlaid (extend `favDraw` with an optional overlay particle, or a sibling draw),
  then on completion resumes the breath loop. Track the one-shot rAF handle; a new one-shot cancels the prior;
  cancel it on `visibilitychange → hidden` and never let it outlive a board re-render (pattern 17, mirroring the
  breath loop's start/stop).
- Title whisper (arrival only): set `document.title = 'ypuf · welcome back'` for the one-shot window, then restore
  by calling `renderMasthead()` (the single mood-line source). An early restore from a concurrent refresh is harmless.

**Execution note:** Host glue (canvas/DOM/`chrome.*`) — no unit tests; correctness is proven by U4's harness render
plus the pure `puffmoment` paths underneath.

**Patterns to follow:**
- The slice-1 favicon controller in `extension/newtab/newtab.js` (`favDraw`, the rAF start/stop, the `reduceMotion()`
  gate, the `visibilitychange` lifecycle) and pattern 17 (one-shot rAF must supersede + tear down cleanly).
- The existing `send()` / SW message wiring for the `chrome.runtime` listener shape.

**Test scenarios:**
- Test expectation: none — host glue. The decidable paths it consumes are covered by U1; the integrated behavior
  is validated in U4 (Covers AE8: arrival animation + welcome-back whisper, then settle).

**Verification:**
- With the board visible and motion allowed: an arrival broadcast animates a particle descending to join + whispers
  the title, then settles to the refreshed state; a let-go broadcast animates a particle drifting off, then settles.
  Under reduced-motion: no animation/whisper (an arrival still updates the resting state). No rAF leak across
  re-triggers, hide, or board re-render.

---

### U4. Harness validation + tune

**Goal:** Validate the arrival + let-go one-shots read correctly at 16px across themes and tune durations/easing.

**Requirements:** R13, R14

**Dependencies:** U3

**Files:**
- Create: a throwaway browser harness (e.g. `/tmp/living-puff-moments-harness.html`) loading the real libs — not committed.
- Modify (if tuning warranted): `extension/lib/puffmoment.js` (path endpoints/easing), `extension/newtab/newtab.js` (durations).

**Approach:**
- The established method: a harness that loads `puffscene.js` + `puffmoment.js` + the real CSS and renders each
  one-shot as a **frame sequence** (`progress` 0, 0.25, 0.5, 0.75, 1) at 16px (and larger for inspection) across
  light / dark / star, drawing the resting favicon + the overlay particle exactly as `favDraw` will. Screenshot via
  chrome-devtools.
- Read the sequences: does the arrival read as a particle **descending to join** the puff, and the let-go as one
  **drifting off**? Is the welcome-back title legible? Confirm the reduced-motion path is a clean no-animation state
  change. Tune the durations / easing / particle size to what reads as calm at 16px (the geometry constants land
  back in `lib/puffmoment.js`, the durations in the controller).

**Test scenarios:**
- Verification (visual): the arrival frame sequence shows a joining-from-above particle; the let-go shows a
  drift-off; both settle to the resting favicon; the night/star glow still composes; reduced-motion is a still state.

**Verification:**
- A screenshot set confirms both one-shots read correctly at 16px in every theme; any tuned constants are reflected
  in `lib/puffmoment.js` and its tests still pass.

---

## System-Wide Impact

- **Interaction graph:** the SW gains two best-effort `notifyBoard()` emits (autoReopenDue, runAutoSweep); the board
  gains one `chrome.runtime.onMessage` listener and a one-shot rAF. No new SW message *handlers* (the board doesn't
  reply), no new stored data, no new permission.
- **State lifecycle risks:** the one-shot rAF is module-scoped host state over a re-rendering board — it must
  supersede on re-trigger and tear down on hide/re-render (pattern 17), exactly like the slice-1 breath loop. The
  title whisper must restore via `renderMasthead()` so it can't stick.
- **Failure modes:** `notifyBoard` is best-effort (no open board → swallowed `lastError`); a missed event (board
  hidden) self-heals on the next `visibilitychange` refresh — nothing is lost.
- **Unchanged invariants:** the snooze/let-go SW flows, the offscreen `puff()` audio, the snooze data shape, and the
  slice-1 resting favicon are untouched; the broadcast is additive.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `notifyBoard` emits with no open board log "no receiving end" noise | Swallow `chrome.runtime.lastError` in the send callback (best-effort), mirroring how broadcasts are handled. |
| The one-shot rAF leaks or stacks across re-triggers / hide / re-render | Track the handle; a new one-shot cancels the prior; cancel on `visibilitychange → hidden` and at any board re-render teardown (pattern 17). |
| The title whisper gets stuck if a refresh races it | Restore is always via `renderMasthead()` (idempotent mood line); an early restore is harmless, never a stuck caption. |
| One-shots read as busy/un-calm at 16px | Single transient particle, short duration, eased; U4 validates the 16px read and tunes — keeps §9 calm. |
| Manual let-go (⌘⇧L) doesn't puff the favicon | By design — manual let-go runs on another tab where the board isn't visible (Scope Boundaries); no signal needed. |

---

## Sources & References

- **Origin document:** docs/brainstorms/2026-06-19-ypuf-living-puff-tab-strip-requirements.md (R13, R14, F3, AE8)
- **Slice 1 plan:** docs/plans/2026-06-19-002-feat-living-puff-tab-strip-plan.md (the resting favicon controller this builds on)
- Related code: `extension/background.js` (`autoReopenDue`, `runAutoSweep`, `puff()`/`ensureOffscreen`),
  `extension/newtab/newtab.js` (the favicon controller, `renderMasthead`, `send()`), `extension/lib/puffscene.js`
- Learnings: `docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md` (patterns 8, 17, 18)
- **Branch base:** off current `main` (slice 1 + the recall/snooze polish merged via #22). Keep commits atomic; run `node --test tests/*.test.js`.
