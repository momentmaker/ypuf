---
title: "feat: living-puff tab strip — slice 1 (the barometer)"
type: feat
status: active
date: 2026-06-19
origin: docs/brainstorms/2026-06-19-ypuf-living-puff-tab-strip-requirements.md
---

# feat: living-puff tab strip — slice 1 (the barometer)

## Summary

Slice 1 of the living-puff tab strip: render the ypuf puff mark to a canvas and
install it as the tab's favicon — breathing (reduced-motion-gated, focused-only),
tinted by the time-of-day mood (with a moon-phase glow at night), and shifting its
particle configuration to mirror the snooze queue (clear / drift-up / settle-down +
amber dot) — while the title becomes a calm mood line carrying no status count. The
decidable cores (state→barometer mapping, scene geometry) are pure tested libs; only
the canvas draw + favicon swap + animation loop are host glue.

---

## Problem Frame

The board's tab is the one ypuf surface always on screen — the favicon and title sit
in the tab strip even when the board isn't focused — yet today both are inert. See
origin for the full framing. The plan's job is to make that surface a calm, glanceable
barometer of the snooze queue without it ever becoming the nagging badge ypuf exists to
cure.

---

## Requirements

- R1. Favicon is the ypuf puff mark rendered to a canvas and installed as the tab icon,
  reusing the existing puff geometry (replacing the static SVG icon).
- R2. Favicon tints with the masthead's time-of-day mood (dawn → dusk → night) and the
  active dark/star palette, reusing the existing mood engine — no separate mood source.
- R3. At night the puff carries the current moon phase as its glow (reuse the moon-phase
  utility).
- R4. When motion is welcome, the puff breathes on a slow cadence; under reduced-motion
  it is a still mark in the correct state.
- R5. The favicon configuration encodes the snooze queue in three states driven by the
  existing `{back, snoozed}` data: clear (puff at rest), scheduled (faint particles drift
  up, proportional to the snoozed count), back-now (particles settle down + a soft amber
  dot).
- R6. The amber dot is the dependable back-now signal; the up/down particle drift is a
  flourish layered on top.
- R7. Never an alert: no red, no numeral badge, no count baked into the icon.
- R8. The title is always a serene mood line — never a status count and never a date (the
  date stays on the masthead; the tab caption is the mood line only).
- R9. The title's mood text stays consistent with the masthead's living sub-line.
- R10. Breathing runs only while the board tab is focused/visible; hidden → holds last
  frame.
- R11. Barometer state is recomputed eagerly on a snooze change (even while the tab is
  backgrounded) and the favicon is redrawn from it, so the tab strip is correct the moment
  the tab is next focused — the *animation* is focus-gated, the *state* is not. (Whether the
  redraw also reaches the tab strip while still hidden depends on the platform — see U5.)
- R12. 100% local, pull-only: no network, no new permissions, no new sound, no
  notifications.

**Origin actors:** A1 (the board owner), A2 (the service worker / snooze engine — source of `{back, snoozed}`, no new data)
**Origin flows:** F1 (render the barometer for the current state), F2 (breathe while watched, hold while away)
**Origin acceptance examples:** AE1–AE7 (slice-1 states, reduced-motion, moon-glow, calm title, background-state update). AE8/F3 (arrival) is slice 2 — out of scope here.

---

## Scope Boundaries

- No status count, numeral, or badge anywhere — in the icon or the title (R7, R8).
- No network, new permissions, or new sound; the favicon is drawn on-device from
  existing assets (R12).
- No changes to the on-page masthead puff mark or the shipped `extension/icons/ypuf-mark.svg`
  file — this slice touches the favicon (the `<link rel="icon">`) and the document title only.
- The title carries no date here — the masthead keeps the full `date · mood` line; the tab
  title is the shorter mood-only caption (see Key Technical Decisions).

### Deferred to Follow-Up Work

- Slice 2 — the delight moments: the arrival one-shot (a snoozed tab returns while the board
  is open → particle floats down + a brief welcome-back title whisper) and the let-go puff
  (origin R13, R14, F3, AE8). Separate plan, after slice 1 ships.
- Parked (origin): seasonal grace (autumn leaf / snowflake / firefly).

---

## Context & Research

### Relevant Code and Patterns

- `extension/newtab/newtab.js` — the mood engine: `MOODS = [{from,key,line}…]`, `moodNow()`
  returns the current `{key, line}`, `renderMasthead()` sets `docBody.dataset.mood = m.key`
  and the `board-sub` line. The favicon tint reuses `m.key`; the title reuses `m.line`.
- `extension/newtab/newtab.js` — the **starfield host controller** is direct prior art for a
  reduced-motion-gated canvas animation that pauses: a `reduceMotion()` helper
  (`matchMedia('(prefers-reduced-motion: reduce)')`), `startStarfield`/`stopStarfield`, a
  `starRAF = requestAnimationFrame(frame)` / `cancelAnimationFrame` loop, a `syncStarfield()`
  gate, and a `matchMedia('change')` listener that starts/stops live. The favicon controller
  mirrors this shape. Pure positions live in `extension/lib/starfield.js`; the host owns the canvas.
- `extension/lib/moonphase.js` — `phase(date) → [0,1)`, `phaseName(p)`. `extension/lib/moonrender.js`
  — `geometry(phase) → {f, waning, shadowX}` (illuminated fraction + shadow offset). Note: `shadowX` is
  in a **32-unit SVG viewBox** (it can reach ~42 at full moon), so it must not be fed to the canvas
  directly — use `geometry().f` (the illuminated fraction, in [0,1]) to key the glow.
- `extension/newtab/newtab.html` — the static favicon `<link rel="icon" type="image/svg+xml"
  href="../icons/ypuf-mark.svg" />` (line 7) and the puff-mark SVG geometry (the four circles, in
  the masthead `.puff-mark`). The four-circle geometry is the canvas source.
- Snooze data: the `snooze-list` SW message → `{back, snoozed}` (already used by the snooze panel).
- Theme palette: `extension/style.css` CSS vars (`--ink`, `--paper`, `--accent-amber`, …) vary by
  theme and by `body[data-mood=…]`; `getComputedStyle(document.body)` resolves the live values,
  keeping the canvas palette in sync with the board without a second source of truth.

### Institutional Learnings

- Pattern 18 (`docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`)
  — extract the decidable core out of host glue into pure node-tested libs. Here: the state→barometer
  mapping and the scene geometry become libs; the canvas/DOM/animation stays host-side.
- Pattern 17 — async-gated / re-runnable host surfaces need an `alive` flag (or generation token) so a
  late callback can't write through a torn-down panel or stack a duplicate loop. The favicon controller
  is module-scoped host state over a re-rendering board; apply the same discipline.
- Pattern 16 — the favicon is drawn from local geometry + counts only; no page-derived bytes reach it.

### External References

- None. The codebase has a strong local pattern (the starfield canvas controller) for canvas + rAF, and
  canvas → `toDataURL` → `<link rel="icon">` is a standard technique on regular pages. The one unproven
  point — whether Chrome honors a *dynamic favicon href swap on an extension new-tab page* (vs. preferring
  the manifest icon) — is settled by a small spike at the top of U5 before U3 is built out, not by external
  research. (The starfield canvas is prior art for drawing, not for the favicon swap — it never touches the icon.)

---

## Key Technical Decisions

- **Two pure libs, host-thin:** `lib/barometer.js` (counts → abstract state) and `lib/puffscene.js`
  (state + breath → drawable primitives) are pure and tested; the canvas draw, palette read, favicon
  swap, and rAF loop are the only host glue. Keeps the riskiest decisions (thresholds, geometry) pinned
  without a browser.
- **Palette via `getComputedStyle`, not a second source:** the controller reads `--ink` / `--paper` /
  `--accent-amber` off the live body, so theme + mood tinting come for free and never drift from the board.
  Note the asymmetry: the `data-mood` overrides in `newtab.css` are scoped to the light theme only, so in
  dark/star themes the favicon varies by *theme* but not by mood — `getComputedStyle` already resolves this
  correctly, so don't add a redundant mood→color path expecting a dark-mode mood tint that never arrives.
- **Moon glow: phase-keyed intensity, drawn behind the core, low opacity:** the glow is keyed to
  `moonphase.phase()` / `geometry().f` (illuminated fraction) — *not* `geometry().shadowX` (a 32-unit SVG
  coordinate). It renders behind the core at ~20–30% max opacity so the amber dot stays the highest-contrast
  element even in the busiest frame (back-now at night). An actual crescent shape is a U5 stretch, not the
  default. Active **iff `moodNow().key === 'night'`** — no secondary time check, so glow and night tint stay
  co-incident.
- **Throttled redraw, not 60fps:** breathing is a ~4–5s pulse, so re-encoding the favicon (`toDataURL`)
  every animation frame is wasteful — redraw on a slow cadence and only when the breath value moves enough.
  Loop is gated on `reduceMotion()` and `!document.hidden`; hidden or reduced-motion renders one still frame
  and stops.
- **Title is mood-line only (no date):** the masthead keeps `date · mood`; the tab title is the shorter
  `ypuf · <mood line>` (e.g., "ypuf · a still night"), reusing `moodNow().line` so R9 sync is automatic and
  the title ages gracefully wherever it's recorded.
- **State refresh + the R11 mechanism:** recompute the barometer on load, on snooze-record changes (try the
  existing board converge signal first; fall back to `chrome.storage.onChanged`), and on
  `visibilitychange → visible`. The change-driven redraw updates the tab strip *if* the platform honors a
  background favicon swap (the U5 spike confirms this); the `visibilitychange → visible` redraw guarantees the
  tab strip is correct the instant the tab is focused. Only the *animation* is focus-gated; a foreground state
  change is a hard snap between frames (no interpolation — that's slice 2).
- **Amber dot is load-bearing; drift is a flourish (R6):** the dot carries back-now even if the 16px
  up-vs-down drift proves too subtle — validated in U5.

---

## Open Questions

### Resolved During Planning

- *Title in history (origin deferred):* the title is the mood line only — no count or date to freeze stale.
- *Mood/title sync (origin deferred):* both derive from the single `moodNow()` source; no duplication.
- *Redraw mechanics/perf (origin deferred):* rAF-driven but redraw-throttled to a slow cadence, paused on
  hidden + reduced-motion; one still frame when not animating.
- *Moon-glow fidelity:* default to a phase-keyed glow **intensity** (`geometry().f`), behind the core, low
  opacity — not a crescent (its `shadowX` is in a 32-unit SVG space). A crescent is a U5 stretch only.
- *Background-refresh hook:* try the existing board converge signal first; add a `chrome.storage.onChanged`
  subscription only if there isn't one to ride.
- *Reduced-motion legibility:* the still frame carries state by configuration (particle presence/position +
  dot), so scheduled stays distinct from clear without motion — an explicit decision, not a gap.

### Deferred to Implementation

- Exact particle **cap** and per-state counts (how many snoozed/back map to how many drift particles before
  it reads busy at 16px) — start small (~3–4 max) and tune in U5; the constant lives in `lib/barometer.js`.
- Whether Chrome honors a dynamic favicon href swap in the tab strip on an extension new-tab page — settled
  by the U5 spike before U3 is built out (fallback noted in Risks).

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation
> specification. The implementing agent should treat it as context, not code to reproduce.*

```
 snooze-list {back, snoozed} ─► barometer()  ─► {state, particles, dot, drift}   (lib/barometer.js, pure)
                                                          │
 mood/theme palette (getComputedStyle) ─┐                 ▼
 moonphase.phase() (night only) ────────┼──► puffscene(barometer, breath) ─► [{x,y,r,opacity,role}]   (lib/puffscene.js, pure)
 breath phase (rAF, gated on            │                 │                     role ∈ core | particle | dot
   reduceMotion + !hidden) ─────────────┘                 ▼
                                          host: draw primitives on offscreen canvas (palette per role)
                                                          │
                                                          ▼
                                          canvas.toDataURL() ─► <link rel="icon"> href swap

 moodNow().line ─► document.title = "ypuf · <line>"   (no count)
```

States: **clear** = base puff at rest. **scheduled** (snoozed>0, none back) = base puff + N particles
drifting up. **back-now** (back>0) = base puff + particles settled down + amber dot. `breath ∈ [0,1]`
modulates core scale/opacity and the drift offset; a fixed breath gives the reduced-motion still frame.

Draw order, back→front: **moon glow → core circles → drift particles → amber dot** — the dot draws
last so a particle can never occlude it (R6). The still frame conveys state by *configuration* (particle
**presence/position** + the dot), not by motion: a reduced-motion user still sees scheduled (particles
present, up) vs. clear (bare puff) vs. back-now (dot) — they just lose the breath/drift animation.

---

## Implementation Units

### U1. Pure barometer mapping — counts to state

**Goal:** A pure lib mapping the snooze queue to the abstract barometer state.

**Requirements:** R5, R6, R7, R11

**Dependencies:** None

**Files:**
- Create: `extension/lib/barometer.js`
- Test: `tests/barometer.test.js`

**Approach:**
- `barometer({ back, snoozed })` → `{ state, particles, dot, drift }`, where `back`/`snoozed` are integer
  **counts** — the host passes `resp.back.length` / `resp.snoozed.length`, never the raw arrays (`array > 0`
  coerces to a silent `false`, which would map every queue to `clear`). The `state` string is `'clear'` /
  `'scheduled'` / `'back-now'` (one canonical spelling, matching the origin and the spec). States: `clear`
  (back 0, snoozed 0) → no particles, no dot, drift `'none'`; `scheduled` (snoozed>0, back 0) →
  `particles = min(snoozed, CAP)`, no dot, drift `'up'`; `back-now` (back>0) → dot true,
  `particles = min(back, CAP)`, drift `'down'`. `back-now` dominates when both are present (the dominant
  signal is "come get these").
- `CAP` is a module constant (start ~3–4; tuned in U5). No color, no geometry, no DOM — counts and flags only.
- Fail safe: non-numeric / undefined / malformed input → `clear`, never throws (mirrors `returnwindow`/`timegroup`).

**Patterns to follow:**
- `extension/lib/returnwindow.js` and `extension/lib/timegroup.js` (pure, injected inputs, fail-safe, UMD/`self.ypuf` wrapper).

**Test scenarios:**
- Happy path: empty queue (0, 0) → `clear` (0 particles, no dot). Covers AE1.
- Happy path: snoozed count > 0, back 0 → `scheduled`, drift `up`, dot false. Covers AE2.
- Happy path: back count > 0 → `back-now`, drift `down`, dot true. Covers AE3.
- Edge case: `snoozed` count above CAP → `particles === CAP` (clamped).
- Edge case: both back>0 and snoozed>0 → `back-now` wins (dot true, drift down).
- Edge case: `null` / `undefined` / non-numeric fields → `clear`, no throw.

**Verification:**
- `node --test tests/barometer.test.js` passes; every state and the clamp/dominance/fail-safe cases are pinned.

---

### U2. Pure puff scene — state + breath to drawable primitives

**Goal:** A pure lib composing the favicon scene geometry from the barometer state and a breath phase.

**Requirements:** R1, R4, R5, R6

**Dependencies:** U1 (consumes its `{state, particles, dot, drift}` shape)

**Files:**
- Create: `extension/lib/puffscene.js`
- Test: `tests/puffscene.test.js`

**Approach:**
- `scene(barometerResult, breath)` → array of `{ x, y, r, opacity, role }` where `role ∈ 'core' | 'particle' | 'dot'`.
  Core circles come from the base puff geometry (the four circles, normalized to the canvas box). `breath ∈ [0,1]`
  modulates a subtle core scale/opacity (the breath) and the particle drift offset. Particles are positioned above the
  core for `up` (smaller `y`) and below for `down`; the dot is a single small `dot`-role circle in a fixed corner.
- Deterministic: same inputs → same primitives (so the reduced-motion still frame is just a fixed breath, e.g. `0.5`).
- No color and no canvas — the host maps each `role` to a palette color and does the 2D draw. No DOM, no `chrome.*`.

**Technical design:** *(directional)* the base puff = 4 normalized circles (role `core`); `scheduled`/`back-now` append
`particles` extra circles offset by `drift` × a breath-driven distance; `back-now` also appends one `dot` circle. Reduced
motion → call with a constant breath. The host draws roles back→front (glow, core, particle, dot), so the dot is never occluded.

**Patterns to follow:**
- `extension/lib/starfield.js` `generate(...)` (pure geometry the host draws), and the pure-lib wrapper convention.

**Test scenarios:**
- Happy path: `clear` state → only `core` roles, count equals the base circle count, no `dot`.
- Happy path: `scheduled` with N particles → `core` + N `particle` roles, all positioned above the core (drift up), no `dot`.
- Happy path: `back-now` → `core` + settled `particle` roles below the core + exactly one `dot` role. Covers AE3.
- Edge case: `breath = 0` vs `breath = 1` change core scale and particle offset deterministically (assert the delta).
- Edge case: reduced-motion fixed breath → stable, repeatable scene (idempotent across calls). Covers AE4.
- Edge case: a `scheduled` scene at the fixed (reduced-motion) breath still includes its N `particle` roles in the up
  position — so it is structurally distinct from `clear` with no motion (the still frame carries the state).
- Edge case: dot role appears only in `back-now`, never in `clear`/`scheduled`.

**Verification:**
- `node --test tests/puffscene.test.js` passes; role composition, drift direction, dot presence, and breath determinism are pinned.

---

### U3. Favicon controller — canvas draw, palette, swap, animation loop (host glue)

**Goal:** Wire the pure libs into a live favicon: draw the scene to an offscreen canvas, install it as the tab icon,
and animate/refresh it under the calm/perf constraints.

**Requirements:** R1, R2, R3, R4, R7, R10, R11, R12

**Dependencies:** U1, U2

**Files:**
- Modify: `extension/newtab/newtab.js` (the favicon controller, beside the starfield/mood controllers)
- Modify: `extension/newtab/newtab.html` (give the `<link rel="icon">` an id; it becomes the swap target)

**Approach:**
- An offscreen canvas (e.g. 32×32, device-pixel-aware for crispness). Read the palette from
  `getComputedStyle(document.body)` (`--ink`/`--paper`/`--accent-amber`) so theme + mood tint come for free; map each
  scene `role` to a fill (`core` → ink/paper puff tone, `particle` → a faint tone, `dot` → `--accent-amber`).
- Moon glow: active **iff `moodNow().key === 'night'`** (no secondary time check, so glow and night tint stay
  co-incident). A soft glow whose intensity is keyed to `moonphase.phase()` / `geometry().f` — *not*
  `geometry().shadowX` (a 32-unit SVG coordinate) — drawn behind the core at ~20–30% max opacity so the amber dot
  stays the highest-contrast element. A crescent shape is a U5 stretch, not the default. Modest — a glow, not a second mark.
- Draw order, back→front: **moon glow → core → drift particles → amber dot.** The dot draws last so a particle can
  never occlude it (R6, the load-bearing signal).
- Draw → `canvas.toDataURL()` → set on the `#favicon` link. Animate via an rAF loop gated on `reduceMotion()` and
  `!document.hidden`, **redraw-throttled** to a slow cadence (only re-encode when the breath value moves past a small
  threshold). Reduced-motion or hidden → render one still frame (fixed breath) and stop the loop.
- State source: on board load `send('snooze-list')` → `barometer({ back: resp.back.length, snoozed: resp.snoozed.length })`
  → render. Recompute on snooze-record changes (**try the existing board converge signal first**; fall back to a
  `chrome.storage.onChanged` hook) and on `visibilitychange → visible`. The change-driven redraw updates the tab strip *if*
  the platform honors a background favicon swap (confirmed by the U5 spike); the `visibilitychange → visible` redraw
  guarantees the strip is correct the instant the tab is focused (R11). A foreground state change is a **hard snap** between
  frames — no interpolated transition (that's slice 2). Recompute mood/tint each render.
- Lifecycle: `let alive`/teardown discipline (pattern 17) and a `matchMedia('change')` listener (like `syncStarfield`)
  so toggling OS reduced-motion starts/stops the breath live; never leak the rAF or listeners.

**Execution note:** Host glue — no unit tests; correctness is proven by U5's harness render + the pure libs underneath.

**Patterns to follow:**
- The starfield host controller in `extension/newtab/newtab.js` (rAF start/stop, `reduceMotion()` gate, `matchMedia('change')`
  listener, hidden canvas) and the existing `visibilitychange` refocus handling.

**Test scenarios:**
- Test expectation: none — host glue (canvas/DOM/`chrome.*`). Behavior is validated via U5's harness; the decidable cores
  it consumes are covered by U1/U2.

**Verification:**
- Loading the board swaps the static SVG favicon for the canvas puff; it breathes when focused with motion allowed, holds
  still under reduced-motion or when hidden, tints by mood/theme, glows by moon phase at night, and shows the right
  barometer configuration for the current snooze queue. No rAF/listener leaks across board re-renders (pattern 17).

---

### U4. Calm mood-line title

**Goal:** The document title becomes the serene mood line, carrying no status count.

**Requirements:** R8, R9

**Dependencies:** None

**Files:**
- Modify: `extension/newtab/newtab.js` (set `document.title` from `moodNow()`)

**Approach:**
- Set `document.title = 'ypuf · ' + moodNow().line` on load and on `visibilitychange → visible` (and wherever the masthead
  re-renders), reusing the same `moodNow()` source as the masthead so the two never drift (R9). No count, ever (R8).

**Execution note:** Host glue — trivial string from the shared mood source; no unit test.

**Patterns to follow:**
- `renderMasthead()` in `extension/newtab/newtab.js` (same `moodNow()` source).

**Test scenarios:**
- Test expectation: none — host glue (a string from the existing tested mood source). Covered observationally in U5 (AE5).

**Verification:**
- The tab title reads `ypuf · <mood line>` matching the masthead's mood, in every barometer state — never a count (AE5).

---

### U5. Harness validation — 16px legibility across states, themes, moon, reduced-motion

**Goal:** Validate the favicon reads correctly at favicon size across all states/themes and tune the particle/dot params;
confirm the amber-dot fallback if up/down drift is indistinct.

**Requirements:** R1, R2, R3, R4, R5, R6

**Dependencies:** U3 (the swap spike below runs *before* U3 is built out)

**Files:**
- Create: a throwaway browser harness (e.g. `/tmp/living-puff-harness.html`) loading the real `style.css` + libs — not committed.
- Modify (if tuning warranted): `extension/lib/barometer.js` (CAP), `extension/lib/puffscene.js` (sizes/offsets).

**Approach:**
- **First, the swap spike (de-risks U3):** before building the full controller, load a minimal page that draws a canvas →
  `toDataURL` → swaps the `#favicon` href, open it as a tab, and screenshot the **tab strip** (not just the canvas) via
  chrome-devtools to confirm Chrome actually picks up the dynamic favicon on an extension new-tab page. If it doesn't, stop
  and choose the fallback (see Risks) before committing U3.
- The established verification method: an HTML file loading the real CSS + `barometer.js`/`puffscene.js`, rendering the
  favicon canvas at 16px (and 32px for inspection) across the matrix — 3 barometer states × {light, dark, star} × the moods
  × moon-glow at night × the reduced-motion still frame — then a chrome-devtools MCP screenshot.
- Read the screenshots against concrete pass criteria: (a) does the **amber dot** read at 16px (R6), specifically on the
  light/dawn `--paper` background (amber-on-paper is the weakest-contrast case — if it fails, bump the dot size or use a
  darker amber / thin outline in light themes)? (b) in the **back-now-at-night** frame (the busiest — core + particles + dot +
  glow), is the amber dot still visually dominant over the moon glow? (c) do **up-drift vs settle-down** read as distinct
  (R5)? If the drift is too subtle at 16px, accept the origin's stated fallback — the dot + title carry the state — and dial
  particles down. Tune the CAP / circle sizes / dot size to what actually reads, landing changes back in the U1/U2 constants.

**Execution note:** Verification + tuning unit — the harness is a throwaway artifact (per prior slices), not committed.

**Patterns to follow:**
- The browser-harness + chrome-devtools screenshot method used to verify the snooze panel and prior board work.

**Test scenarios:**
- Verification (visual): each of the 3 states is distinguishable at 16px in each theme; the amber dot is legible in back-now
  (covers R6); the moon glow shows at night (AE6); the reduced-motion frame is a correct still mark (AE4).

**Verification:**
- A screenshot set confirms all states/themes/moon/reduced-motion render correctly at 16px; any param changes are reflected in
  the pure libs and their tests still pass.

---

## System-Wide Impact

- **Interaction graph:** the favicon controller reads `snooze-list` (no new SW message) and the live theme/mood palette; it
  installs an rAF loop, a `matchMedia('change')` listener, a `visibilitychange` handler, and a snooze-change subscription.
- **State lifecycle risks:** the rAF loop and listeners are module-scoped host state over a board that re-renders — they must
  be torn down / not double-started (pattern 17), exactly as the starfield controller is.
- **API surface parity:** none — this is a new-tab-page-only surface; no overlay/popup parity needed.
- **Unchanged invariants:** the on-page masthead puff and `ypuf-mark.svg` are untouched; the snooze SW messages and data shape
  are unchanged (read-only consumer); no new permissions or network.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Up/down particle drift unreadable at 16px | The amber dot is the load-bearing back-now signal (R6); U5 validates and dials particles down if needed — the dot + title still carry the state. |
| Re-encoding the favicon every frame burns CPU | Redraw-throttled to a slow cadence; loop paused on hidden + reduced-motion (one still frame). |
| rAF loop / listeners leak across board re-renders | Mirror the starfield controller's start/stop + the pattern-17 `alive`/teardown discipline. |
| Background tabs are throttled so the favicon can't animate when hidden | Accepted by design (R10): animation is focus-gated. State is recomputed on change and the strip is correct the instant the tab is focused (R11); whether it also repaints while still hidden is platform-dependent and confirmed by the U5 spike. |
| Chrome may ignore a dynamic favicon href swap on an extension new-tab page (preferring the manifest icon) — the whole feature rests on this | The **U5 swap spike** validates the tab-strip swap *before* U3 is built out. Fallback if unsupported: generate the icon via the service worker (or a manifest-icon workaround), evaluated before committing U3. (The starfield canvas is prior art for drawing, not for the favicon swap.) |
| `moonrender.geometry().shadowX` is in a 32-unit SVG space (≈42 at full moon) | Don't feed it to the 32px canvas; key the glow off `geometry().f` (illuminated fraction) instead — captured in Key Technical Decisions. |

---

## Sources & References

- **Origin document:** docs/brainstorms/2026-06-19-ypuf-living-puff-tab-strip-requirements.md
- Related code: `extension/newtab/newtab.js` (mood engine, starfield controller, `visibilitychange`),
  `extension/lib/moonphase.js`, `extension/lib/moonrender.js`, `extension/lib/starfield.js`, `extension/newtab/newtab.html`
- Learnings: `docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md` (patterns 16, 17, 18)
- **Branch base:** this is a paper artifact and can be reviewed now; the build branches off `main` **after** PR #21
  (feat/snooze-panel) merges. The origin requirements doc is currently untracked on the snooze-panel branch (kept off that
  PR deliberately) and will be committed alongside this plan on the living-puff branch at build time.
