---
title: "feat: ypuf light/dark/star theming, a visual upgrade, and a puff logo"
type: feat
status: active
date: 2026-06-18
origin: docs/brainstorms/2026-06-18-ypuf-theming-visual-upgrade-requirements.md
---

# feat: ypuf light/dark/star theming, a visual upgrade, and a puff logo

## Summary

Give ypuf a tri-mode **light / dark / star** theme and a calm visual upgrade across the
new-tab board, the popup, and the sandboxed panels — borrowing pilgrim's design language
(parchment palette, Cormorant Garamond + Lato, the constellation night mode + a live
moon-phase toggle) while keeping ypuf's soul (the amber *puff* accent + the time-of-day
mood). Anchor it with a new **puff logo** that becomes the toolbar icon, the new-tab
favicon, and the masthead mark. Three slices, each shippable standalone:

1. **Token system + tri-mode color (all surfaces) + the moon toggle** — a themeable
   CSS-variable system (all three palettes), self-hosted Cormorant/Lato (Fraunces retired),
   pure `theme` + `moonphase` libs, the cycling moon-phase toggle wired into the board +
   popup + settings, persisted in `chrome.storage` with a `prefers-color-scheme` default,
   **and the sandboxed panels themed across the postMessage channel** (so no selectable mode
   ever ships with unthemed panels). Folds in the two token-touch fixes (R12, R13).
2. **Starfield** — add the reduced-motion-gated starfield canvas behind the board in star
   mode (the star *palette* and panel theming already ship in slice 1 — see Key Decisions).
3. **Logo + polish + quick-open unify** — the puff mark (SVG → icon set + favicon +
   masthead/popup), a restrained component-polish pass, and dropping the popup's 1-9
   number badges in favor of the board's `j/k` + `f`-hints model (R14).

(See origin: `docs/brainstorms/2026-06-18-ypuf-theming-visual-upgrade-requirements.md`.)

---

## Problem frame

ypuf is a constant-companion surface (every new tab + the popup) but is bright-paper only —
harsh at night and out of step with the user's other surfaces (pilgrim), which already have
a calm light/dark/star system. It is also calm-but-not-yet-premium (visible friction: faint
popup hint numbers, title text colliding with hover icons), and has no identity mark. This
plan themes + polishes + brands all surfaces as one designed product, without adding a knob
the product is meant to cure (§9: "calm comes from panel **design**, not minimalism").

**Actor:** A1 — the single-user, on-device ypuf owner/dogfooder.

---

## Requirements trace

| Req (origin) | Covered by |
|---|---|
| R1 tri-mode hybrid base + amber + mood reconciled | U1 |
| R2 one toggle cycles + persists + prefers-color-scheme default | U3, U4, U5, U6 |
| R3 toggle in masthead + popup + settings, cross-surface sync | U5, U6 |
| R4 star = palette (+ starfield, slice 2) | U1 (palette), U8 (starfield) |
| R5 sandboxed panels themed via postMessage | U7 |
| R6 self-hosted Cormorant + Lato, Fraunces retired | U2 |
| R7 restrained component polish (not re-layout) | U10 |
| R8 every surface themes from tokens | U1, U5, U6, U7, U8 |
| R9 all new motion reduced-motion-gated | U4 (toggle glow), U5, U7, U8 (starfield), U10 |
| R10 puff mark from one SVG, reads at 16px | U9 |
| R11 mark = toolbar icon + favicon + masthead | U9 |
| R12 readable popup quick-open keys (all modes) | U6 |
| R13 title never collides with row icons | U1 |
| R14 one quick-open model (drop popup 1-9) | U11 |
| R15 live moon-phase toggle, local math | U4, U5 |
| AE1–AE8 | exercised across U4/U5/U6/U7/U8/U9 verification + tests/MANUAL-DOGFOOD.md |

---

## Key technical decisions

- **A two-layer token system, not a palette swap.** Introduce a semantic token layer
  (e.g. `--bg`, `--surface`, `--card`, `--ink`, `--muted`, `--border`, `--accent`,
  `--accent-2`…) in `extension/style.css` and point every component at *those*. Define the
  raw pilgrim-derived values per mode in `:root` (light), `[data-theme="dark"]`, and
  `[data-theme="star"]`. The existing `--paper`/`--warm-gray`/`--accent-*` names are mapped
  onto the semantic layer (kept as aliases during transition so the ~40 existing
  `var(--paper)` call sites don't all have to change at once). ypuf's **amber stays the
  signature `--accent`**; pilgrim's stone/moss/rust/dawn fill the secondary accents.
- **`data-mood` becomes a within-theme tint, not a competing palette.** Today
  `body[data-mood="night"]` overrides `--paper`/`--ink` directly (newtab.css). Re-express
  mood as a *small* nudge layered under the active theme (a hue/lightness shift on the
  semantic bg/surface tokens), scoped so it composes inside light **and** dark, and is
  suppressed (or near-zero) in star. Exact tint values are a design-tuning detail for U1.
- **Slice 1 ships complete tri-mode theming across ALL surfaces — including the sandboxed
  panels; slice 2 adds only the starfield.** The token system is one atomic unit (star
  *colors* alongside light/dark), AND panel theming must land in the same slice the modes
  become selectable: otherwise picking dark/star in slice 1 would leave the sandboxed
  RSS/crypto panels light-on-transparent over a navy board — exactly the AE4 failure. So
  panel theming (U7) is part of slice 1, not slice 2. This refines the origin's slice split
  (which bundled palette + panels + starfield into slice 2): the *coherent theme* (all
  surfaces, all modes) is slice 1; the *delight* (the starfield) is the slice-2 enhancement.
  Each slice then ships genuinely standalone — slice 1 is never a half-themed intermediate.
- **Decidable cores are pure tested libs (pattern 18 / 5).** `lib/theme.js` (mode list,
  cycle, normalize, initial-resolve) and `lib/moonphase.js` (phase-from-date, phase-name)
  and `lib/starfield.js` (deterministic star field generation) are pure + node-tested; the
  DOM/canvas/`chrome.storage` orchestration stays in thin host glue. `lib/moonphase.js` ports
  the pure math from `../pilgrim-podcast/js/moon.js` (synodic-month phase); the canvas
  renderer is host glue (`lib/moonrender.js`). `lib/starfield.js` adapts (does not copy)
  `../pilgrim-podcast/js/universe.js`, reduced to a calm, perf-cheap subset.
- **Panel theming extends the pattern-16 channel, it doesn't pierce the sandbox.** Add a
  `kind:'theme'` envelope (`{ ypuf:'panel', v:1, kind:'theme', mode }`) to `lib/channel.js`;
  `panels/sandbox.js` applies `data-theme`/star to its own `<html>` and carries a per-mode
  token block in `panels/sandbox.html`. The host posts the current mode on mount and re-posts
  on every theme change. The payload is a single enum string — not page content — so the
  null-origin isolation and privacy boundary are unchanged.
- **Cross-surface sync reuses the existing converge.** The board already converges on
  `chrome.storage.onChanged` for `boardConfig`; theme changes ride the same mechanism
  (a `theme` key), so a toggle in one open surface updates the others live.
- **Self-host the fonts (no CDN).** Cormorant Garamond + Lato are SIL OFL; download the
  needed woff2 subsets into `extension/fonts/`, declare them with `@font-face`, and update
  `NOTICE.md`. Mirrors the existing Fraunces self-hosting; **nothing is fetched from a
  network at runtime** (verifiable offline). Fraunces (`extension/fonts/fraunces.woff2` + its
  `@font-face`) is removed.
- **No-build raster icons.** The puff mark is authored as one SVG; the per-size PNGs
  (`icons/icon16|48|128.png`) and the favicon are generated **once** from it and checked in
  (the exact export tool is an execution-time choice — see Deferred). The manifest already
  points at those paths.

---

## Implementation units

### Phase 1 — Token system, tri-mode color (all surfaces incl. panels), the moon toggle, fold-in fixes

### U1. Themeable token system (3 palettes) + mood reconciliation + R13
**Goal:** A semantic CSS-variable system with light/dark/star palettes, ypuf's amber mapped
in, `data-mood` re-expressed as a within-theme tint, and the recall-row title/icon collision
fixed.
**Requirements:** R1, R4 (palette), R8, R13.
**Dependencies:** none.
**Files:** Modify `extension/style.css` (semantic token layer + `:root` / `[data-theme="dark"]`
/ `[data-theme="star"]` palettes + amber mapping + `--focus-ring` + `--on-accent` +
`.recent-item .title` right-padding), `extension/newtab/newtab.css` (**rewrite** the
`body[data-mood=...]` rules; board chrome reads semantic tokens). Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** Add a semantic token layer and alias the existing names (`--paper` → `var(--bg)`,
etc.) so current call sites keep working; put `data-theme` on `<html>` so the theme sets the
palette *base*. Define the three palettes from the brainstorm's pilgrim values, retuned where
ypuf's amber/contrast needs it. **`data-mood` must be re-authored, not aliased:** today
`body[data-mood="night"]` *hard-overrides* `--paper`/`--ink` with light-mode hexes — if those
hex rules survive, a dark/star `<html>` would still get a light `--paper` at night (broken).
Delete the four mood hex blocks and re-express mood as a *relative* nudge on the semantic
bg/surface tokens (e.g. a `color-mix`/`calc` shift fed by a `--mood-*` var the palette
consumes), `data-mood` staying on `<body>` so it only nudges the theme base; suppress the
nudge (≈0) in star. Define `--focus-ring` per theme (amber on light/dark, lavender on star,
always high-contrast) and `--on-accent` (button foreground that tracks the accent per theme).
Fix R13 by reserving right-padding on `.recent-item .title` (room for the protect/forget
icons) so text never runs under them, in popup and board.
**Patterns to follow:** the existing `:root` block + `data-mood` overrides in
`extension/newtab/newtab.css`; pilgrim's `[data-theme="dark"]` structure; the reduced-motion
gating already in `newtab.css`.
**Test scenarios:** `Test expectation: none — pure styling/token restructure`, but with these
**verifiable floors**: in dark mode, body text (`--ink` on `--surface`) meets **4.5:1 at every
`data-mood` value**; in star, the mood nudge is suppressed; tab order shows a **visible
`--focus-ring`** on every focusable element in all three modes. Verify each existing surface
still reads correctly in light, and a long recall title no longer collides with the hover icons.
**Verification:** All board + popup chrome derives color from tokens; switching `data-theme` by
hand recolors everything incl. `data-mood=night`; a grep finds **no hard-coded colors at all**
(`#fff`/`#000` included, not just warm-paper hexes) in component rules; focus rings visible in
dark + star.

### U2. Self-host Cormorant Garamond + Lato; retire Fraunces
**Goal:** The pilgrim type system, self-hosted, replacing Fraunces.
**Requirements:** R6.
**Dependencies:** none (pairs with U1).
**Files:** Create `extension/fonts/cormorant-garamond-*.woff2`, `extension/fonts/lato-*.woff2`;
Modify `extension/style.css` (`@font-face` for both, set `--font-display` / `--font` /
`--font-ui`; remove the Fraunces `@font-face`), `extension/manifest.json` (add **`font-src
'self'`** to the `extension_pages` CSP), `NOTICE.md` (OFL attribution); Delete
`extension/fonts/fraunces.woff2` and drop `var(--font-display)` references to Fraunces.
**Approach:** Add `@font-face` blocks (`font-display: swap`, the weights pilgrim uses:
Cormorant 300/400/600 + ital, Lato 400/700). Repoint `--font-display` + body to Cormorant and
a new `--font-ui` to Lato; update the few `font-family: var(--font-display)` sites
(masthead, settings-title, the board-sub) as needed. **Structurally enforce no-CDN:** add
`font-src 'self'` to the `extension_pages` CSP so a stray `@font-face` URL to a font CDN is
*blocked by the browser*, not merely caught by the manual offline check — the privacy
invariant ("nothing leaves the machine") becomes enforced, not aspirational.
**Execution note:** Obtaining the woff2 is an execution step (download the OFL fonts, subset
if practical) — not a network dependency at runtime.
**Patterns to follow:** the existing Fraunces `@font-face` at `extension/style.css:15`.
**Test scenarios:** `Test expectation: none — font/styling.` `Covers AE5.` Verify offline:
disconnect the network, reload the board + popup → text still renders in Cormorant/Lato
(self-hosted), and the masthead no longer uses Fraunces.
**Verification:** No network font request (DevTools shows none); Fraunces file + `@font-face`
gone; surfaces read in the new type system.

### U3. `lib/theme.js` — pure theme-mode core (test-first)
**Goal:** The decidable core of the theme system as a pure, node-testable lib.
**Requirements:** R2.
**Dependencies:** none.
**Files:** Create `extension/lib/theme.js`, `tests/theme.test.js`; Modify
`extension/newtab/newtab.html` + `extension/popup/popup.html` (load the script).
**Approach:** Pure functions over the mode enum: `MODES = ['light','dark','star']`,
`next(mode)` (cycle, wrapping star→light), `normalize(stored)` (validate an arbitrary stored
value → a valid mode, default light), `resolveInitial(stored, prefersDark)` (stored wins;
else `prefersDark ? 'dark' : 'light'` — **star is never auto-selected**). UMD/DI wrapper
(pattern 5) so it loads in both HTML surfaces and `require()`s in node.
**Execution note:** Build test-first.
**Patterns to follow:** `extension/lib/eagerness.js`, `extension/lib/boardkeys.js` (same
pure-lib shape).
**Test scenarios:**
- `next('light')==='dark'`, `next('dark')==='star'`, `next('star')==='light'`.
- `normalize('garbage')==='light'`, `normalize(undefined)==='light'`, `normalize('star')==='star'`.
- `resolveInitial(null, true)==='dark'`; `resolveInitial(null, false)==='light'`;
  `resolveInitial('star', false)==='star'` (stored star honored); `Covers AE2.`
  `resolveInitial(null, true)` never returns `'star'`.
**Verification:** `node --test tests/theme.test.js` passes.

### U4. `lib/moonphase.js` — pure lunar-phase core (test-first)
**Goal:** Tonight's lunar phase from a date, as a pure lib (the toggle's data source).
**Requirements:** R15.
**Dependencies:** none.
**Files:** Create `extension/lib/moonphase.js`, `tests/moonphase.test.js`; Modify the two
HTML surfaces to load it.
**Approach:** Port the pure math from `../pilgrim-podcast/js/moon.js`: `phase(date)` →
`0..1` (synodic-month fraction from a known new moon), `phaseName(phase)` → the 8-name
bucket. No DOM, no `Date.now()` inside (caller passes the date so tests are deterministic).
**Execution note:** Build test-first.
**Patterns to follow:** `../pilgrim-podcast/js/moon.js` (`getMoonPhase`/`getMoonPhaseName`);
the pure-lib wrapper from `extension/lib/digest.js`.
**Test scenarios:**
- A known new-moon datetime → `phase ≈ 0` (within a small epsilon); +~14.77 days → `≈ 0.5`.
- `phaseName` boundary buckets (new / waxing-crescent / first-quarter / … / waning-crescent).
- Wrap-around + a pre-epoch date stay in `[0,1)` (the `((x % S)+S)%S` guard). `Covers AE8.`
**Verification:** `node --test tests/moonphase.test.js` passes.

### U5. Board theme wiring — moon toggle + apply/persist/converge + settings row
**Goal:** The board applies, persists, and syncs the theme, with a live moon-phase toggle in
the masthead and a theme row in the settings overlay.
**Requirements:** R2, R3, R9, R15.
**Dependencies:** U1, U2, U3, U4.
**Files:** Create `extension/lib/moonrender.js` (themeable moon/star renderer over
`lib/moonphase.js` — DOM via an *injected* container, following the `lib/shelf-render.js`
`toDom` precedent so a DOM helper can live in `lib/` without being node-unit-tested); Modify
`extension/newtab/newtab.js` (apply theme on boot, the masthead toggle that cycles +
re-renders the phase, persist, `chrome.storage.onChanged` converge, the panel `postTheme`
hook from U7, a settings-overlay theme row), `extension/newtab/newtab.html` (a **synchronous
pre-paint `<head>` bootstrap**, the toggle button in `.board-actions`, load
`moonrender`/`theme`/`moonphase`), `extension/newtab/newtab.css` (toggle + reduced-motion-gated
glow). Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** **No-FOUC pre-paint (R9-adjacent):** `chrome.storage` reads are async, so a bare
boot would paint light then repaint to dark/star — a flash on every new tab, worse with
reduce-motion. Apply the theme *before first paint* via a tiny synchronous inline `<head>`
script that reads a **`localStorage` mirror** of the theme (written alongside every
`chrome.storage` write) and sets `data-theme` on `<html>` immediately; `chrome.storage`
remains the cross-surface source of truth (the `onChanged` converge keeps both in sync). On
boot the module still calls `resolveInitial(stored, matchMedia('(prefers-color-scheme: dark)'))`
for first-run (no mirror yet). Click → `next()`, apply, persist (storage + mirror), re-render.
The toggle is a **real control, not decoration**: a dynamic `aria-label`/`title` names the
*next* mode (e.g. "Theme: dark — switch to star"); the glyph shows the current state (tonight's
moon in light/dark, a star in star). **Glyph legibility:** the moon is drawn with a visible
*stroke* (not fill-only) at a ≥18px rendered size so a thin crescent reads on light **and**
navy; the star glyph uses the lavender star accent, not amber. Glow/breath is gated behind
`@media (prefers-reduced-motion: no-preference)`. `moonrender` computes the phase from
`new Date()` at render time (note: `KNOWN_NEW_MOON` is locale-relative, acceptable for a soft
indicator); a long-lived tab may re-render the phase on theme toggle.
**Patterns to follow:** the `chrome.storage.onChanged` converge + `settingsOpen()`/
`closeSettings()` in `extension/newtab/newtab.js`; the `lib/shelf-render.js` injected-DOM
shape; the icon helper (`createElementNS`, never innerHTML).
**Test scenarios:** `Test expectation: MANUAL-DOGFOOD` — `Covers AE1, AE2, AE8.` Toggle
cycles light→dark→star→light; the board recolors; the choice survives reload; a second board
tab converges; first run with OS-dark opens dark (never star); the toggle shows tonight's moon
phase (a star in star mode) and its `aria-label`/tooltip names the next mode; opening a new tab
in dark/star shows **no flash of light** (pre-paint applied); with reduce-motion set, no toggle
animation but the mode still applies instantly.
**Verification:** Theme persists across restart; both tabs stay in sync; no FOUC on
dark/star new-tab open; the toggle renders the correct phase offline and is keyboard-operable
with a visible focus ring.

### U6. Popup theme wiring + toggle + R12 (readable keys)
**Goal:** The popup themes with the same control + persisted state, and its quick-open keys
are legible in every mode.
**Requirements:** R2, R3, R12.
**Dependencies:** U1, U3, U5 (reuses `moonrender`; U4 is transitive via U5).
**Files:** Modify `extension/popup/popup.js` (apply theme on open, the shelf-head toggle,
persist + converge), `extension/popup/popup.html` (toggle button in `.shelf-head`, load the
libs), `extension/style.css` (the `.popup .recent-item .hint` contrast, re-tokenized so it
reads on light/dark/star).
**Approach:** Mirror U5's apply/persist/converge in the popup document — including the
**synchronous pre-paint `<head>` bootstrap** (the popup also reads async `chrome.storage`, so
without it the popup flashes light on open) and the same next-state `aria-label`/tooltip on the
toggle. Re-token the hint badge color/border to a high-contrast token in every mode (R12)
instead of muted-on-warm-gray. (The popup opens fast and is small, so the FOUC is briefer than
the board's but still visible in dark/star.)
**Patterns to follow:** U5's wiring (pre-paint, toggle affordance, converge); the existing
popup `keydown` + `.hint` rendering in `extension/popup/popup.js`.
**Test scenarios:** `Test expectation: MANUAL-DOGFOOD` — `Covers AE1, AE7.` Toggling in the
popup themes it and converges with an open board; opening the popup in dark/star shows no flash
of light; the quick-open keys are clearly legible in light, dark, and star.
**Verification:** Popup matches the board's theme; no FOUC on open; hint keys readable in all modes.

### U7. Theme the sandboxed RSS/crypto panels (channel + sandbox + host re-post)
**Goal:** The sandboxed panels theme with the board — no light/inverted panels on a dark or
star board. **Ships in slice 1** (with the palettes) so no selectable mode is ever half-themed.
**Requirements:** R5, R8, R9.
**Dependencies:** U1, U5.
**Files:** Modify `extension/lib/channel.js` (a `theme` envelope builder + `tests/channel.test.js`
if present), `extension/panels/sandbox.js` (handle `kind:'theme'` → **validate `mode` against
an allow-list**, then set `data-theme`/star on its `<html>`), `extension/panels/sandbox.html`
(per-mode token block + tokenized styles), `extension/newtab/newtab.js` (a module-level
live-frame registry + a `postTheme` on `mountSandbox`; post the current mode on mount and
re-post to all live frames on theme change). Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** Extend the pattern-16 protocol with `{ ypuf:'panel', v:1, kind:'theme', mode }`.
**Live-frame registry:** today `mounted[]` only holds teardown fns and each panel's frame
handle is a local closure — so add a module-level `panelFrames` set; each `mountSandbox`
registers `{ frame, postTheme }` (where `postTheme` posts the theme, queued until `ready`
like `render`) and de-registers on teardown. The host posts the current mode right after
`ready`/first `render`, and on every theme change iterates `panelFrames`. **Defense in
depth:** the builder rejects an invalid `mode`, AND the sandbox validates
`msg.mode ∈ {light,dark,star}` before `setAttribute` (a crafted/garbled value is ignored).
The `event.source !== window.parent` guard already gates inbound; `mode` is an enum string
(not content), so the pattern-16 isolation/privacy boundary is unchanged.
**Patterns to follow:** the existing `kind:'render'`/`kind:'resize'` envelopes in
`extension/panels/sandbox.js` + `extension/lib/channel.js`; pattern 16.
**Test scenarios:**
- (pure, if `channel` builds the envelope) the theme-envelope builder produces a valid
  `{ypuf,v,kind:'theme',mode}` and rejects an invalid mode.
- `Test expectation: MANUAL-DOGFOOD` — `Covers AE1, AE4.` With an RSS + a crypto panel present,
  switching to dark turns both panels dark in step; star too; a newly added panel mounts in
  the current theme.
**Verification:** No bright panel on a dark/star board; panels follow live theme changes.

---

### Phase 2 — The starfield

### U8. The starfield (pure field lib + reduced-motion-gated canvas)
**Goal:** A slow, restrained, perf-cheap starfield behind the board in star mode.
**Requirements:** R4, R9.
**Dependencies:** U1, U5.
**Files:** Create `extension/lib/starfield.js` (pure: generate N stars `{x,y,r,phase}` from a
seed + viewport) + `tests/starfield.test.js`; Modify `extension/newtab/newtab.js` (mount/
teardown a `<canvas>` only in star mode + only under `prefers-reduced-motion: no-preference`;
a slow RAF twinkle/drift), `extension/newtab/newtab.html` (the canvas element),
`extension/newtab/newtab.css` (`#starfield` behind the grid, `z-index` below content).
Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** Pure `starfield.generate(count, w, h, seed)` returns deterministic positions
via an **explicit small seeded PRNG** (e.g. mulberry32) — *new* code, not from pilgrim:
`../pilgrim-podcast/js/universe.js` uses bare `Math.random()` with no seed, so determinism is
invented here, not ported (the plan adapts only its *visual feel*). Use a **fixed constant
seed** (a stable, identical-everywhere sky) unless a viewport-derived seed proves nicer; state
the choice in the lib. The host draws them on a low-cost RAF loop, mounted only when
(mode === star) AND motion is allowed, torn down on mode change / reduce-motion. Keep density +
speed calm; cap **per-star opacity ≤ ~0.6** and keep the text-bearing grid on the semi-opaque
`--surface` so the field never bleeds through behind text (text-over-starfield must still meet
AA) — or draw stars only outside the content bounds. The canvas is `pointer-events:none` and
behind all panels.
**Execution note:** Build `lib/starfield.js` test-first; treat perf (frame cost, teardown) as
a first-class acceptance check.
**Patterns to follow:** pattern 18 (pure core + thin canvas host); the reduced-motion gating
already in `extension/newtab/newtab.css`; the puff/panel teardown discipline.
**Test scenarios:**
- `generate(n, w, h, seed)` returns `n` stars, all within `[0,w]×[0,h]`, **same seed → same
  field** (deterministic), **different seeds → different fields** (the PRNG actually varies),
  and every star's opacity ≤ the cap.
- `Test expectation: MANUAL-DOGFOOD` — `Covers AE3.` Star mode shows a slow starfield; recall
  text over it stays readable (AA); with reduce-motion on, star shows the navy palette and
  **no** starfield; leaving star tears the canvas down (no leaked RAF).
**Verification:** Calm starfield in star mode only; text remains legible over it; zero
canvas/RAF when not in star or when reduce-motion is set; no measurable jank.

---

### Phase 3 — Logo, polish, quick-open unify

### U9. The puff logo — SVG mark → icon set + favicon + masthead/popup
**Goal:** One puff mark, rendered as the toolbar icon, the new-tab favicon, and the
masthead/popup lockup, themeable.
**Requirements:** R10, R11.
**Dependencies:** U1.
**Files:** Create the SVG source (e.g. `extension/icons/ypuf-mark.svg`) + regenerate
`extension/icons/icon16.png` / `icon48.png` / `icon128.png`; Modify `extension/newtab/newtab.html`
+ `extension/newtab/newtab.js` (mark in the masthead beside the wordmark, themed live),
`extension/popup/popup.html` + `extension/popup/popup.js` (mark in the shelf-head),
`extension/newtab/newtab.html` (`<link rel="icon">` favicon). `NOTICE.md` if needed.
**Approach:** Author the mark as the amber dot **mid-dissipation** — an asymmetric soft
release that *suggests motion* (a dot beginning to scatter/drift), single-color via
`currentColor` so it themes (amber on light/dark → lavender in star) wherever rendered live;
legible at 16px. **Negative constraints (avoid the generic AI logo):** no perfect-circle halo,
no symmetrical glow ring, no sparkle/twinkle cliché — the release should read as ypuf's calm
exhale, not a stock "magic" orb. Export the per-size PNGs once (tool is execution-time — see
Deferred) and check them in; add a favicon link to the new-tab page. The manifest already
references the icon paths.
**Patterns to follow:** the existing inline-SVG `icon()` helper + `ICONS` in
`extension/newtab/newtab.js` (createElementNS, `currentColor`, never innerHTML).
**Test scenarios:** `Test expectation: MANUAL-DOGFOOD` — `Covers AE6.` The toolbar shows the
puff mark; a pinned new tab shows the puff favicon; the masthead + popup show the same mark,
crisp at small sizes and recolored per theme.
**Verification:** One recognizable mark across toolbar/favicon/masthead/popup; crisp at 16px.

### U10. Restrained component-polish pass
**Goal:** Pilgrim-grade finish on the existing surfaces — finish, not structure.
**Requirements:** R7.
**Dependencies:** U1, U2.
**Files:** Modify `extension/style.css` + `extension/newtab/newtab.css` (radius 8/12/20,
shadow recipes, spacing rhythm, transition timing on recall rows, cards/panels, masthead,
popup shelf). Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** Apply pilgrim's radius/shadow/spacing/transition system to a **bounded,
enumerated** set of components — no layout, panel-set, or lane changes. Radius map (the
stopping point, so the pass can't balloon): **recall rows `.recent-item` → r8; card surfaces
`.panel` / `.card-bg` → r12; modals/overlays (settings, cheatsheet) → r20; masthead chrome →
r8/flat.** Polish exactly: `.recent-item` rows, `.panel` cards, the masthead `.board-actions`,
the popup `.shelf`/`.shelf-head`, the settings + cheatsheet overlays. **Explicitly NOT touched:**
the add-panel picker, the lane drag handles/drop affordances, the snooze panel internals — they
keep their current treatment. Keep §9: calm finish, not added surface. All transitions
reduced-motion-gated.
**Patterns to follow:** pilgrim `styles.css` radius/shadow/spacing tokens (from the brainstorm
research); the existing card/panel styles in `extension/newtab/newtab.css`.
**Test scenarios:** `Test expectation: none — styling.` `Covers AE5.` Verify the enumerated
components read as polished (the radius map applied, spacing, card finish, hover transitions)
with no layout/structure change and the not-touched list untouched.
**Verification:** The enumerated components match the radius map; no panel/layout regression;
the not-touched list is unchanged; motion reduced-motion-safe.

### U11. Quick-open unify — bring `f`-hints to the popup, then dogfood-gate dropping 1-9 (R14)
**Goal:** One navigation model — `j/k` + `f`-hints — available on both board and popup, with
the popup's `1-9` direct-open retired only after the board model is proven faster *there*.
**Requirements:** R14.
**Dependencies:** U6.
**Files:** Modify `extension/popup/popup.js` (add `f`-hints; keep/confirm `j/k`), `extension/popup/popup.html`
(load `boardkeys.js` + `hints.js` — the popup loads **neither** today, only the board does),
`extension/style.css` (a `.popup` hint-layer/badge surface — the board's `.hint-layer`/
`.hint-badge` are board-scoped). Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** This is **net-new popup wiring, not a drop-in reuse**: the popup loads neither
pure lib today and has no hint-overlay DOM/CSS, and `hints` page-coordinate positioning must be
confirmed against the popup's scrollable `.shelf` (not the board grid). **Dogfood-gate R14:**
the popup is a tiny grab-and-go surface where `1-9` is O(1) direct-open vs `j/k`+`f`'s cursor/
two-keystroke — and slice 1 (U6) deliberately makes the `1-9` badges *readable* (R12). So
**add `f`-hints alongside the existing readable `1-9` first; dogfood `j/k`+`f` in the popup for
a few days; remove `1-9` only if the board model proves at least as fast there.** Don't polish
(R12) then immediately delete (R14) on a hunch. Reuse the already-tested `boardkeys`/`hints`
libs for the new path.
**Patterns to follow:** the board's `j/k` + `f`-hints wiring in `extension/newtab/newtab.js`;
the existing popup `keydown` + `HINT_KEYS` in `extension/popup/popup.js`.
**Test scenarios:** `Test expectation: MANUAL-DOGFOOD` — in the popup, `j/k` moves a cursor and
`f` badges the rows + a letter opens one (positioned correctly over the scrollable shelf);
typing in the search field is not hijacked; the `1-9` removal lands only after the dogfood gate.
**Verification:** Popup gains the board's quick-open model; the `1-9` path is removed only post-
dogfood, not reflexively.

---

## System-wide impact

- **Surfaces:** board host (`newtab.js`/`newtab.css`/`newtab.html`), popup
  (`popup.js`/`popup.html`), shared `style.css` tokens, the sandboxed panels
  (`panels/sandbox.*` + `lib/channel.js`), fonts (`extension/fonts/`), icons
  (`extension/icons/`), `manifest.json` (icon paths already correct), `NOTICE.md`.
- **New pure libs:** `lib/theme.js`, `lib/moonphase.js`, `lib/starfield.js` (+ host
  `lib/moonrender.js`). All node-tested except the DOM renderer.
- **Storage:** one new `chrome.storage.local` key (`theme`) — local-only, never transmitted.
- **No new permission, no new network surface.** The only new cross-boundary datum is a theme
  enum string to the sandboxed panels (not page content). Privacy invariants (self-hosted
  fonts, no innerHTML for page-derived content, `sender.id`/`event.source` guards) hold.
- **The hero's safety is untouched:** no SW logic, eligibility, or auto-let-go behavior
  changes — this plan is purely presentational.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Token migration misses a hard-coded color → a surface doesn't theme | Alias old token names onto the semantic layer (U1); grep for **all** hard-coded colors (`#fff`/`#000` included, not just warm-paper hexes) in component rules; tokenize button foregrounds via `--on-accent`. |
| `data-mood` × theme clash (muddy/illegible at night) | **Delete** the `body[data-mood]` hex overrides and re-author mood as a *relative* nudge on the semantic tokens (U1), suppressed in star; verifiable floor — body text ≥ 4.5:1 at every mood in dark. |
| **Flash-of-light on every new-tab/popup open** (async `chrome.storage`) | Synchronous pre-paint `<head>` bootstrap reads a `localStorage` theme mirror and sets `data-theme` before first paint (U5/U6); `chrome.storage` stays the converge source of truth. |
| **Slice 1 ships a selectable dark/star with unthemed panels (AE4 break)** | Panel theming (U7) moved into slice 1 alongside the palettes — no mode is selectable before its panels are themed. |
| Starfield jank, leaked RAF, or text illegible over stars | Pure **seeded** field (new PRNG, not pilgrim's `Math.random`) + a calm RAF mounted only in star + motion-allowed, torn down on mode change; per-star opacity cap + text on the semi-opaque surface; perf + AA are first-class U8 checks. |
| Invisible focus ring on navy (dark/star a11y) | `--focus-ring` token per theme (U1) + a dogfood pass tabbing each surface in each mode. |
| Self-hosted fonts bloat / a stray CDN leak | Subset weights; `font-display: swap`; **`font-src 'self'` CSP** structurally blocks a CDN fetch (U2); verify offline (AE5). |
| Panel theme message races a panel still mounting | Post theme after `ready`/first render and on every change to a live-frame registry; sandbox validates `mode` + applies idempotently (U7). |
| Polishing popup `1-9` (R12) then deleting it (R14) wastes work / hurts grab-and-go speed | R14 is **dogfood-gated** (U11): add `f`-hints alongside the readable `1-9`, remove `1-9` only if the board model proves at least as fast in the popup. |

---

## Scope boundaries

**In scope:** tri-mode color theming (board + popup + sandboxed panels), the live moon-phase
toggle, self-hosted Cormorant/Lato (Fraunces retired), the starfield, the puff logo
(icon/favicon/masthead/popup), a restrained polish pass, R12/R13 fixes, `f`-hints in the popup
+ the dogfood-gated `1-9` removal (R14).

### Deferred for later (from origin)
- A starfield *inside the popup* (popup star is color-only in v1).
- pilgrim-podcast's `data-time`/`data-season` palette shifts beyond ypuf's existing mood.
- Per-panel theme accents (the pilgrim "whisper" category colors).

### Outside this product's identity (from origin)
- New panel types, a board re-layout, or any new dashboard surface (§5f/§9).
- Theme-driven *behavior* changes (theme is purely visual).
- Server/cross-device theme sync (on-device `chrome.storage` only).

### Deferred to Follow-Up Work (plan-local)
- The raster-icon export pipeline as a repeatable script (v1 generates the PNGs once and
  checks them in).

---

## Deferred to implementation (execution-time unknowns)

- **Exact palette hex retuning** for ypuf's amber signature + R12 contrast (start from the
  brainstorm's pilgrim values; tune by eye).
- **Mood-tint values** per theme (the within-theme nudge in U1).
- **Font acquisition + subsetting** (which woff2 weights/subsets to ship in U2).
- **Moon-phase render medium** — SVG terminator from a `0..1` phase vs. a small canvas
  (port of pilgrim's bezier); chosen in U5.
- **Starfield density/speed/draw medium** (canvas vs CSS) tuned for calm + perf in U8.
- **PNG export tool** for the icon set in U9 (no-build: one-time generation, checked in).

---

## Verification (whole plan)

- `node --test tests/*.test.js` passes (incl. new `theme`, `moonphase`, `starfield` libs).
- `tests/MANUAL-DOGFOOD.md` gains a theming section covering AE1–AE8 (toggle cycle + persist +
  converge; OS-dark default; **no FOUC** on dark/star open; offline fonts; panels theme in step;
  starfield only in star+motion with legible text; the puff mark across surfaces; readable keys
  in all modes; visible focus ring in all modes; no title/icon collision).
- Offline check: no runtime network request for fonts or anything else (`font-src 'self'` enforces it).
- Each slice ships standalone: **slice 1 = complete tri-mode theming across all surfaces
  (board + popup + sandboxed panels) + the moon toggle + the token-touch fixes**; slice 2 = the
  starfield; slice 3 = logo + polish + `f`-hints-in-popup (dogfood-gated `1-9` removal).
