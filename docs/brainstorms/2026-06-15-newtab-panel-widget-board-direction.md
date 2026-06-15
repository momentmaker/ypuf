---
date: 2026-06-15
topic: newtab-panel-widget-board-direction
status: direction-only
supersedes: "the flashcard/SRS widget (CONTEXT §5f) + jivx funnel (§8)"
---

# New-tab panel widget board — direction

A **direction-capture**, not a full requirements spec. The new-tab surface is
slice 5 (last, decoupled); this records the pivot decisions so they survive
until that slice is brainstormed in full. The decisions also live in
`docs/CONTEXT.md` §5f / §8 / §9 / §12 (the source of truth).

## The pivot

Out: the Anki/SRS **flashcard widget** and the **jivx flashcard funnel** as the
new-tab experience. In: a **panel-based widget board** as the new-tab page —
substantial panels, each a clean per-source "plugin." **printing-press**
(`github.com/mvanhorn/cli-printing-press`) is the *design inspiration* (one tidy
plugin per source), **not** its runtime — its Go binaries / MCP servers / agent
skills target AI coding agents, not ypuf's browser-extension users.

## Resolved decisions

- **Return-of-the-product home.** ypuf's own **recall + recently-let-go shelf +
  "back now" snoozed items** is one of the panels — the let-go net finally has a
  home on the new tab. Calm ambient panels (weather, calendar, a notepad…) sit
  alongside it.
- **Substantial panels, not a garnish.** The widget section is a real part of
  the page; each widget is a panel, ypuf's is one among several.
- **Curated now, pluggable later.** v1 ships a ypuf-curated panel set the user
  toggles and arranges, built on an internal per-source plugin interface that is
  *designed* to open to user-added sources later but is **closed in v1**. No
  user-facing "add an arbitrary API" surface in v1.

## Load-bearing rules (carry into the slice-5 brainstorm)

- **Calm by design, not by minimalism.** Now that the board is bigger than one
  widget, calm has to come from panel *design*: every panel quiet by default,
  earns its glance, never interrupts or notifies. This consciously revises
  CONTEXT §9's "no new-tab dashboard" — the line that still holds is *no manual
  scan-and-prune control panel; calm, ambient, glanceable only*.
- **Privacy is a held rule, not a free consequence.** The let-go/recall engine
  stays 100% local; page content is never transmitted or fed to a panel. A panel
  that hits the network is opt-in, per-source, and disclosed (CONTEXT §7). The
  "your browsing never leaves the device" wedge survives only because panels
  never see browsing data.

## Strategic consequence

Dropping the flashcard widget retires the **jivx funnel** (CONTEXT §8) — ypuf no
longer has a built-in monetization/acquisition engine and stands on its own.
jivx may return as *one optional panel* later, never as the new-tab experience.
This is a business decision flagged for the owner, not just a feature cut.

## Deferred to the slice-5 brainstorm

Which curated panels ship first; the internal plugin-interface shape; per-panel
privacy-disclosure UX; layout/arrange interactions; how/when the interface opens
to user-added sources. None of these block slices 3 (snooze) or 4 (clustering).
