---
title: "ypuf — light/dark/star theming, a visual upgrade, and a puff logo"
type: requirements
status: ready-for-plan
date: 2026-06-18
actors: [A1]
---

# ypuf — light/dark/star theming, a visual upgrade, and a puff logo

## North star

Make ypuf as **calm and beautiful at night as it is by day**, and as polished as the
sibling pilgrim pages — a tri-mode (**light / dark / star**) theme plus a restrained
visual upgrade across *both* the new-tab board and the popup, anchored by a real **puff
logo**. Borrow pilgrim's design language (parchment palette, Cormorant Garamond + Lato,
the constellation night mode), but keep ypuf's soul: the amber *puff* accent and the
time-of-day mood. Nothing here adds a knob the product is meant to cure — a theme toggle
and a nicer surface deepen *calm*, they don't clutter it (§9: "calm comes from panel
**design**, not minimalism").

## Problem frame

Dogfooding the shipped board surfaced three things at once:

1. **No dark mode.** ypuf is a constant-companion surface (every new tab, the popup), yet
   it's bright-paper only — harsh at night, and out of step with the user's other
   surfaces, which already have a calm light/dark/star system (pilgrim).
2. **It could look nicer.** The board is calm but not yet *premium*; small friction is
   visible (faint popup hint numbers, title text colliding with hover icons).
3. **No identity mark.** There's no ypuf logo — the toolbar/extension icon and the
   new-tab favicon have no considered mark; the masthead's amber dot is a de-facto
   stand-in.

A1 (the ypuf user / owner) wants the whole thing to feel like one designed product, themed
to the time of day and their preference, without losing the warmth that makes it ypuf.

**Actors:** A1 — the ypuf user (single-user, on-device; also the dogfooding owner).

## Requirements

### Theme system (tri-mode)

- **R1 — Three modes, hybrid base.** Light, dark, and star, built on a pilgrim-derived
  token system (parchment/ink/stone/moss/rust/dawn/fog mapped to ypuf's needs), with
  ypuf's **amber accent preserved** as the signature and the existing **`data-mood`
  time-of-day system reconciled** into each theme as a *tint within* the mode, not a
  competing palette.
- **R2 — One toggle, cycles + persists.** A single control cycles **light → dark → star
  → light**. The choice persists in `chrome.storage` (local-only, never transmitted) and
  applies to the board, popup, and panels. First run defaults to the OS
  `prefers-color-scheme` (dark OS → dark; light → light; star is opt-in, never
  auto-selected).
- **R3 — Toggle reachable everywhere it's needed.** The toggle appears in the **board
  masthead** and the **popup header**, and the **settings overlay** carries a theme row.
  All three drive the same persisted state and stay in sync across open surfaces (a change
  in one tab converges the others, like the existing board-config converge).
- **R4 — Star is the full constellation, but calm.** Star mode = the deep-navy
  (`#0a0a12`) + lavender palette **and** a subtle, slow, **reduced-motion-gated**,
  perf-cheap starfield drifting *behind* the board (ambient background, never a
  distraction; off entirely under `prefers-reduced-motion: reduce`). The popup may show
  star as color-only (a starfield in a 340px popup is optional/deferrable).
- **R5 — Sandboxed panels theme too.** The RSS and crypto panels render in null-origin
  iframes (pattern 16); the active theme is pushed across the existing postMessage channel
  so they go dark/star **with** the board — no bright-white panels punched into a dark
  board. The theme value is not page content, so the privacy boundary is unchanged.
- **R15 — The toggle is a live moon phase.** The mode control *is* the icon: it renders
  **tonight's actual lunar phase** as a small moon in light + dark (dimmer in light), and a
  **star** glyph in star mode. The phase is computed **locally from the date** (pure
  on-device math, no network — pilgrim's `moon.js` is the precedent). Clicking cycles the
  modes (R2); the phase makes the toggle a quiet celestial delight that pairs with the
  night themes. Any glow/breath on it is reduced-motion-gated; the phase itself is static.

### Visual upgrade (the "look nicer" pass)

- **R6 — Adopt the pilgrim type system, self-hosted.** Cormorant Garamond (display +
  body) + Lato (UI/labels), **self-hosted woff2** in `extension/fonts/` (no external CDN
  — nothing leaves the machine, same rule that already self-hosts Fraunces). **Fraunces is
  retired.**
- **R7 — Restrained component polish, not a re-layout.** A calm polish pass over the
  existing surfaces — recall rows, cards/panels, masthead, spacing — using pilgrim's
  radius (8/12/20), shadow recipes, transition timing, and spacing rhythm. The board's
  layout, panel set, and lane system are **unchanged**; this is finish, not structure.
- **R8 — Every surface themes from tokens.** All board + popup chrome derives its color
  from CSS custom properties so the three modes (and the mood tint) flow without
  per-component overrides. Page-derived content stays `textContent`/`createElementNS`
  only (no innerHTML regression).
- **R9 — All new motion is reduced-motion-safe.** Any breathing/twinkle/starfield/theme
  transition is gated behind `@media (prefers-reduced-motion: no-preference)`; with reduce
  set, modes still switch instantly and correctly, just without animation.

### Logo / mark

- **R10 — A "puff" mark from one SVG.** Evolve the masthead's amber accent dot into a
  soft *release* — a dot with a faint puff/halo or mid-dissipation — as a single SVG mark
  that reads at **16px** and scales up. It echoes the let-go puff (the U6 animation) and
  the brand metaphor ("the sound of a tab being let go").
- **R11 — The mark is the icon + favicon + masthead.** The same mark generates the
  **extension toolbar icon** (the required PNG sizes), the **new-tab favicon**, and the
  **masthead** wordmark lockup. It themes with the modes (amber on light/dark → lavender
  in star) wherever it's rendered live (raster icon set is exported per-size).

### Fold-in fixes (polish bugs from dogfooding)

- **R12 — Readable popup quick-open keys.** The popup vim quick-open hint badges (1-9)
  must be clearly legible in every mode (the current muted-on-warm-gray contrast is too
  faint).
- **R13 — Title never collides with row icons.** Recall-row title text reserves room for
  the hover-revealed protect/forget icons — no overlap at any width, in popup or board.
- **R14 — One quick-open model.** Unify the popup and board: **drop the popup's 1-9
  number badges** in favor of the board's `j/k` cursor + `f`-hints model, so both surfaces
  navigate the same way (less chrome, one thing to learn). *(If dogfooding shows the popup
  genuinely needs at-a-glance numbers, revisit — but default to unify-down.)*

## Acceptance examples

- **AE1 (R1, R2, R3).** A1 clicks the masthead toggle: the board fades from light to dark;
  the open popup and the RSS/crypto panels follow; reopening any new tab is dark; clicking
  again → star (navy + starfield); again → light. The choice survives a browser restart.
- **AE2 (R2).** On a fresh profile with the OS in dark mode, the first new tab opens in
  **dark** without any prior choice; star is never auto-selected.
- **AE3 (R4, R9).** In star mode a slow starfield drifts behind the board; with macOS
  "Reduce motion" on, star mode shows the navy palette with **no** starfield and no
  twinkle — and switching modes is instant.
- **AE4 (R5).** With an RSS panel and a crypto panel on the board, switching to dark turns
  *both* panels dark in step with the board — no white rectangles.
- **AE5 (R6, R7).** The board + popup read in Cormorant Garamond / Lato with pilgrim-grade
  spacing and card finish; the masthead no longer uses Fraunces; nothing requests a font
  from the network (verifiable: offline, fonts still render).
- **AE6 (R10, R11).** The browser toolbar shows the ypuf puff mark; a pinned new-tab shows
  the puff favicon; the masthead shows the same mark — all recognizably one logo, crisp at
  the toolbar's tiny size.
- **AE7 (R12, R13).** In the popup, the quick-open keys are easy to read in light, dark,
  and star; a long recall title is never overrun by the protect/forget icons on hover.
- **AE8 (R15).** On a waxing-crescent night the toggle shows a waxing crescent; a week
  later it's a first-quarter moon — the same date the phone's calendar would show, with the
  machine offline (computed locally). Clicking it cycles light → dark → star, and in star
  mode it becomes a star.

## Scope boundaries — hold the §5f / §9 line

**In scope (v1):** tri-mode theming (light/dark/star) on board + popup + sandboxed panels;
the Cormorant/Lato type system (self-hosted); a restrained component-polish pass; the puff
logo → icon/favicon/masthead; the live moon-phase toggle (R15); the three fold-in fixes;
the toggle in masthead + popup + settings.

**Deferred for later (not v1):**
- A starfield *inside the popup* (color-only star is fine for the 340px popup in v1).
- pilgrim-podcast's `data-time` / `data-season` palette **shifts** beyond ypuf's existing
  mood (the mood stays as-is, reconciled into the theme, not expanded into seasonal
  repainting).
- Per-panel theme accents (e.g., the pilgrim "whisper" category colors).

**Outside this product's identity (do not add):**
- New panel types, a board re-layout, or any new "dashboard" surface (§5f/§9 — the board
  stays calm and dismissible).
- Theme-driven *behavior* changes (the theme is purely visual; auto-let-go, eligibility,
  and all SW logic are untouched).
- Cross-device theme sync via a server (on-device only; `chrome.storage` is the boundary).

### Parked (do not re-litigate without new info)

- The board must stay quiet, calm, and never accrete into the cluttered thing it cures
  (§9). A theme + a nicer finish is *design*, not added surface — this is allowed; adding
  knobs/panels is not.

## Suggested sequencing (each slice ships standalone)

1. **Token system + light/dark** — define the pilgrim-derived CSS-variable system, map
   ypuf's amber + mood into it, self-host Cormorant/Lato, add the toggle (masthead + popup
   + settings) with `chrome.storage` persistence + `prefers-color-scheme` default. Ships a
   working light/dark across all *host-rendered* surfaces. Fold in R12/R13 here (they're
   token-touch fixes).
2. **Panels + star** — push the theme across the postMessage channel to the sandboxed
   panels; add star mode (navy/lavender palette) + the reduced-motion-gated starfield.
3. **Logo + polish** — the puff mark (SVG → icon set + favicon + masthead), the restrained
   component-polish pass, and R14 (unify quick-open). Ships the "looks nicer / has a logo"
   feeling.

## Open questions (resolve at plan/design time)

- **Mood × theme reconciliation:** exactly how the existing `data-mood` tint composes with
  dark/star (a smaller hue nudge in dark? suppressed in star?) — a design-tuning detail
  for the plan.
- **Token mapping vs verbatim:** whether to use pilgrim's hex values verbatim or retune a
  few for ypuf's amber signature and contrast (esp. R12 legibility) — plan/design call.
- **Starfield source:** port/adapt pilgrim's `Universe.js` vs. a smaller bespoke canvas —
  a plan-time implementation choice, bounded by "slow, perf-cheap, reduced-motion-gated."
- **Icon export pipeline:** how the single SVG becomes the per-size PNG toolbar icons with
  no build step (a one-time generation step vs. a checked-in raster set) — plan call.
- **Moon-phase rendering (R15):** port/adapt pilgrim's `moon.js` phase math vs. a small
  bespoke SVG that draws the terminator from a 0–1 phase value; which slice it lands in
  (with the toggle in slice 1, or with the polish pass in slice 3) — plan call.

## Notes

- Design source (already researched): `../pilgrim-landing` and `../pilgrim-podcast` share
  one core system — parchment/ink/stone palette, Cormorant Garamond + Lato, radius
  8/12/20, `[data-theme="dark"]` + `body.constellation` star mode with a canvas starfield,
  a cycle-toggle persisted to storage. podcast adds time/season overlays (deferred here).
- Privacy invariants hold throughout: self-hosted fonts (no CDN), theme stored locally and
  never transmitted, no innerHTML for page-derived content, the SW message guard unchanged;
  the only new cross-boundary data is a theme string to the sandboxed panels.
- This brainstorm follows the merged board keyboard/settings/soul slice (PR #11); the puff
  mark deliberately echoes that slice's U6 puff animation.
