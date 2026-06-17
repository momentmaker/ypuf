---
title: "ypuf — calm-premium board redesign (the warm desk)"
type: requirements
status: active
date: 2026-06-17
actors: [A1]
---

# ypuf — calm-premium board redesign ("the warm desk")

## North star

The new-tab panel board (slice 5) works, but feels plain. This redesign elevates it
to feel **crafted, alive, and soulful** — *the warm desk you're glad to land on*, not
a widget dashboard. The insight: making a **calm** surface "awesome" is not about
density — it's **craft + atmosphere + soul, executed with restraint.** Reference bar:
Things 3 · Arc · Teenage Engineering · iA Writer (calm-premium), **not** a Bloomberg
terminal.

**Load-bearing identity (do not violate — CONTEXT §5f / §9):** "calm by design, not by
minimalism"; the board must never become "the cluttered thing it's meant to cure";
*measured* importance over *declared* organization; quiet and dismissible, never
interrupting. The guard on every borrow: **does this stay a calm glance, or start to
feel like a dashboard to manage?**

## Requirements

### Craft baseline (the foundation — extends the current cards)
- **R1.** Refined cards — softer layered shadow, better header + internal spacing and
  typographic rhythm.
- **R2.** A quiet **per-type accent** so recall / feed / crypto are parseable at a
  glance (a small colour marker — lean: a dot in the header). *Not* coloured card
  backgrounds.
- **R3.** **Coloured crypto deltas** — ▲ green / ▼ red on the 24h change only; the rest
  of the line stays calm ink. (Needs a small structured render: the sandbox line
  carries a `tone` for the change, validated like the rest of the channel payload.)
- **R4.** Drag polish — keep the grip + amber drop-line; add a subtle lift/shadow on the
  card being dragged.

### Materiality — make it a beautiful *object*
- **R5.** Tactile surface — warm paper texture + layered soft shadows so cards read as
  objects resting on a desk; a faint warm vignette on the board.
- **R6.** A real **type system** — a characterful display face for the masthead and a
  clear hierarchy across the board. **Self-hosted only** (no external font CDN —
  privacy).
- **R7.** Light & depth — cards catch a subtle highlight; depth communicates that panels
  are placeable objects (reinforces the drag).

### Atmosphere — make it alive and *yours*
- **R8.** **Time-of-day warmth** — the warm-paper palette drifts with the local clock
  (cooler/lighter morning → warmer/amber evening). Pure ambiance: no data, **no
  network**, computed from the device clock.
- **R9.** A **living masthead** — replace "ypuf · Edit board" with a quiet warm header:
  the wordmark with care, the date, and a soft mood line tied to the hour ("a quiet
  evening"). Calm, never noisy.
- **R10.** **Responsive-only micro-motion** — cards settle with a soft spring when
  dropped; recall results rise + fade in. Motion **only ever answers the user's
  action** — nothing auto-plays, notifies, or demands attention (holds §9).

### Soul — make the let-go the hero
- **R11.** **The puff** — a soft visual dissipation when a tab is let go, paired with the
  existing audio puff, surfaced on the board where it belongs.
- **R12.** **A relief moment** — a quiet, once-per-day acknowledgement on the board
  ("12 let go today — all still findable"). Calm and dismissible; never a badge or a
  nag. (The popup already has a relief primitive to draw from.)
- **R13.** **Satisfying recall** — recall results surface gently (the "set it down /
  pick it back up" feeling). The recall panel is the board's visual and emotional
  centre of gravity, not the weather/crypto widgets.

### One-line — an ambient thought
- **R14.** A single quiet aphorism, **bottom-centre** of the board, sourced from
  `https://um.fz.ax/self/one-line.md` (a markdown list of one-liners). Rendered
  **text-only** on the host (textContent, inert — page-influenced third-party text).
- **R15.** **Cache the whole list once a day; pick a random line locally per new tab.**
  Fresh thought every open, but the endpoint is hit ~once/day — minimal network and a
  minimal tracking surface. Strip the markdown preamble/heading; one aphorism per line.
- **R16.** **Network governance — reuses the slice-5 pattern (16):** validate the URL,
  fetch with `credentials:'omit'` / `referrerPolicy:'no-referrer'` / `redirect:'error'`,
  host grant for `um.fz.ax` (short-circuited by `<all_urls>`), success-only cache, and a
  quiet disclosure that the board fetches `um.fz.ax`. Opt-in posture (it's a network
  source) — see Open Questions.

## Acceptance examples
- **AE1.** Opening the board at 9am vs 9pm shows a perceptibly warmer/lower palette in
  the evening — same content, different light. (R8)
- **AE2.** A crypto panel shows `BTC $67,041` in calm ink with `▲2.3%` in green and a
  down move in red. (R3)
- **AE3.** Dragging a card lifts it slightly and it settles with a soft spring on drop;
  no other motion fires unprompted. (R4, R10)
- **AE4.** The bottom of the board shows one quiet aphorism; reloading the tab shows a
  different one without a new network request (served from the daily-cached list). (R14, R15)
- **AE5.** Letting a tab go shows a soft puff on the board and the audio puff together;
  once a day a calm "N let go today — all findable" line appears. (R11, R12)
- **AE6.** The board never shows columns, a board backdrop, add-card buttons, badges, or
  any auto-playing motion. (Scope boundary)

## Scope boundaries — hold the §5f / §9 line
- **No** named columns / lists / manual sorting (declared organization — that's Toby).
- **No** board backdrop, Trello colours, dense chrome, add-card-per-list, or the
  kanban / active-management framing.
- **No** interrupting motion — auto-play, notify, modal, or attention-demanding
  animation. Motion is responsive-only.
- **No** external font / asset CDN — everything self-hosted (privacy).
- The board stays a *calm glance*, never a *dashboard to manage*.

## Suggested sequencing (each ships standalone; stop anywhere with a coherent result)
1. **Craft baseline** (R1–R4) — builds on the existing `fix/slice5-board-polish` branch.
2. **Materiality** (R5–R7).
3. **Atmosphere** (R8–R10).
4. **Soul** (R11–R13).
5. **One-line** (R14–R16).

## Open questions (resolve at plan/design time)
- Per-type accent shape: dot-in-header vs thin coloured edge (lean: dot).
- Which characterful, self-hostable display face for the masthead.
- One-line default posture: opt-in vs default-on (it's a network call; opt-in is safer,
  default-on is more delightful — A1 is the only user and asked for it).
- How much of the puff / relief / recall soul to bring from the popup vs design fresh
  for the board.

## Notes
- Privacy stays intact: R8 (time-of-day) and the warm-desk craft are all local/CSS;
  the only network addition is the one-line (R14–R16), governed exactly like a panel.
- Origin/lineage: this is a follow-up redesign of the shipped slice-5 board
  (`docs/plans/2026-06-16-002-feat-ypuf-slice5-newtab-panel-board-plan.md`,
  PR #8). The card-craft prerequisites (add-form dismiss, content-hug height, scroll
  cap, drag reorder, multi-ticker hint) already live on `fix/slice5-board-polish`.
