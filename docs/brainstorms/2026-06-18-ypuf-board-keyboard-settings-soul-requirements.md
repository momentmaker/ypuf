---
title: "ypuf board — keyboard layer, calm settings, and soul"
type: requirements
status: ready-for-plan
date: 2026-06-18
actors: [A1]
---

# ypuf board — keyboard layer, calm settings, and soul

## North star

Make the calm board *yours to drive and a joy to feel* — without adding a single
knob the product is meant to cure. Three threads from dogfooding the shipped board
(PR #9 redesign + PR #10 dogfood pass): **(A)** shed text-clutter and give the user
calm control (icons + a gear→settings overlay to tune auto-let-go and never-touch);
**(B)** deepen the *feeling* of a clear desk (the visual puff + a relief digest);
**(C)** make the whole board **keyboard-first** (a vim-flavored layer that's invisible
until used). Every addition is about *control* or *feeling*, never a dashboard.

---

## Problem frame

Dogfooding the board surfaced three frictions:
- **Text-clutter & no control.** `forget`, `Edit board`, `+ daily one-line` are text
  affordances (low-grade clutter), and auto-let-go's timing is **hardcoded**
  (`STALE_WINDOW_MS = 3 days` in `extension/background.js`) — the user can't tune the
  hero behavior even though §5a explicitly calls it "a heuristic to tune."
- **The soul is deferred.** The signature **visual puff** (§5e) was scoped out of the
  redesign as a "bonus"; the relief moment is a single daily line, not the
  clear-desk payoff §5e is about.
- **Keyboard-first lives in islands.** The popup quick-open (PR #10), the `Ctrl/⌘+Shift+K`
  command bar, and the snooze overlay are each keyboard-driven, but the **board itself**
  isn't navigable by keyboard.

**Origin actor:** A1 — the dogfooding board user (power-user leanings; wants calm + speed).

**Load-bearing line (CONTEXT §5f / §9):** the board is *calm by design, not minimalism*,
and must never become the manual-organization / control-panel "junk drawer" §9 rejects.
A settings surface and a keyboard layer are both clutter risks if mis-shaped — so the
settings overlay stays a few small groups (not a knobs-dashboard) and the keyboard layer
is **invisible until used**.

---

## Requirements

### Chunk A — Calm chrome & control

- **R1. Iconify the board affordances.** Replace the text `forget` (recall rows),
  `Edit board`, and `+ daily one-line` with **icons** (e.g. trash/✕, pencil/gear, a
  quiet line/quote glyph). Each carries a `title` + `aria-label`; the forget icon stays
  hover/focus-revealed (calm at rest). Legible, never cryptic.
- **R2. Gear → settings overlay.** A gear icon in the masthead opens a **calm settings
  overlay** — a slide-over *on the board* (not a separate page), `Esc`/backdrop closes.
  First-party board UI (no sandbox needed).
- **R3. Auto-let-go control (the headline).** In the overlay: an **on/off** toggle
  (consolidates the popup's auto-status) + **eagerness presets — Timid / Balanced / Bold**
  mapping to roughly **~7 / 3 / 1 quiet days**, with the real window shown subtly
  ("lets go after ~3 quiet days"). Persisted; the SW reads it as the stale-window
  threshold (replaces the hardcoded constant). **No raw-days slider** (§5a calm).
- **R4. Never-touch group.** In the overlay: view + quick add/remove of **protected
  ("never-touch") sites** — today reachable only in the popup. This is the direct lever
  on §5a's #1 risk ("one wrong close loses the user forever").
- **R5. Board group (minimal).** A couple of quiet board toggles in the overlay: the
  **one-line on/off** moves here from the masthead button; optionally time-of-day mood
  and the let-go sound. Keep it to ~3 small groups total — **not** a wall of toggles.
- **R6. One-tap never-touch from recall rows.** A "protect this site" action on each
  recall row (alongside forget) — one click adds the site to never-touch. Pairs with R4;
  prevents the #1 risk right where you see let-go pages.

### Chunk B — Soul (the feeling of a clear desk, §5e)

- **R7. Visual puff on let-go.** A soft visual dissipation ("puff") on the board when a
  tab is let go — pairs with the existing audio puff. **Lead with the reliable case**
  (newly-let-go items puff into the recent shelf on board open); live-while-open puff is
  a bonus *only if* a cheap existing signal lets the board observe a let-go. Responsive-
  only, reduced-motion-safe, never interrupts. (Revisits the redesign's deferred R11.)
- **R8. "Your week, unburdened" digest.** A calm relief summary — e.g. *"47 let go this
  week · 0 lost · 12 recalled"* — extending the existing once-daily `relief-claim` into a
  richer (weekly) emotional payoff. Local-only, quiet, never a badge or nag.

### Chunk C — Keyboard layer (vim-flavored, invisible until used)

- **R9. Board normal-mode.** When the board has focus and **no field is focused**:
  `j`/`k` move a recall cursor, `Enter`/`o` open the focused page, `x` forget (+`u`
  undo), `p` protect its site, `/` focus recall search, `g g`/`G` top/bottom, `e` toggle
  Edit board, `Esc` blur/close.
- **R10. `f` link-hints (the marquee move).** Press `f` → Vimium-style letter badges on
  every **host-rendered** clickable board element (recall rows, top-sites); type the hint
  to activate. Generalizes the popup's `1–9` hints to the whole board. *(Headlines inside
  sandboxed panel iframes — RSS/crypto — are a stretch; see Open Questions.)*
- **R11. `?` cheatsheet.** A calm keyboard-help overlay listing the bindings — the
  discoverability surface for an otherwise-invisible layer.
- **R12. Stays calm.** The keyboard layer shows nothing until used, is reduced-motion-safe,
  and never hijacks keys while typing in any field (recall search, settings inputs).

---

## Acceptance examples

- **AE1 (R3).** Set eagerness to **Bold** → a tab idle ~1 day is auto-let-go; set **Timid**
  → ~7 days. The overlay shows the real window. Default stays Balanced (~3 days).
- **AE2 (R6).** Click **protect** on a recall row → that site joins never-touch; auto-let-go
  never closes it again, and it appears in the overlay's never-touch list.
- **AE3 (R7).** Let a tab go with the board open → a soft puff dissipates on the board with
  the sound; with reduced-motion set, no animation fires.
- **AE4 (R8).** Open the board → a calm "N let go this week · 0 lost · M recalled" line; it
  never badges or nags.
- **AE5 (R9/R10/R11).** On the board, press `f` → letter hints appear on every clickable
  thing; type a hint → it opens. `j`/`k` move the recall cursor, `x` forgets (with `u`
  undo), `?` shows the cheatsheet, `/` jumps to search.
- **AE6 (scope guard).** The settings overlay shows ~3 small groups (no knobs wall); the
  board never auto-plays/notifies; there are no tags/folders, no `:` command palette, no
  raw-days slider.

---

## Scope boundaries — hold the §5f / §9 line

- **No raw-days slider** — eagerness presets only (§5a "it just works").
- **No `:` command palette and no edit-mode `hjkl`** — parked (great later; not needed to
  feel keyboard-first).
- **No knobs-dashboard** — the settings overlay stays ~3 small groups.
- **No tags / folders / manual organization** — §9's Toby line. The overlay is *settings*,
  not a tab-management control panel.
- **No interrupt motion** — the puff + any reveal are responsive-only and
  `prefers-reduced-motion`-safe; the keyboard layer is invisible until used.
- **No new network surface** — settings, digest, puff, and keyboard layer are 100% local.

### Parked (do not re-litigate without new info)
- `:` command palette (fuzzy "do anything"), edit-mode panel `hjkl`, `f`-hints reaching
  *into* sandboxed panel iframes, a per-panel settings model, cross-device sync of settings.

---

## Suggested sequencing (each chunk ships standalone)

1. **Chunk A — Calm chrome & control:** R1 icons · R2 gear→overlay · R3 eagerness · R4
   never-touch group · R5 board toggles · R6 one-tap protect. *(Biggest day-to-day value;
   unblocks tuning the hero.)*
2. **Chunk B — Soul:** R7 visual puff · R8 weekly digest.
3. **Chunk C — Keyboard layer:** R9 normal-mode · R10 `f`-hints · R11 `?` cheatsheet ·
   R12 calm guarantees. *(Builds on the popup vim from PR #10.)*

---

## Open questions (resolve at plan/design time)

- **Eagerness → days mapping:** start at 7 / 3 / 1 and tune; confirm Balanced stays the
  current 3-day default so existing behavior is unchanged for users who don't touch it.
- **Settings overlay form:** reuse the crafted add-picker card styling, or a dedicated
  slide-over panel? (design-time)
- **Digest cadence & home:** daily line vs weekly summary vs both; rendered in the ypuf
  panel header vs a quiet board line. Needs the SW to expose weekly counts (extends the
  existing `relief-claim`).
- **`f`-hints into iframes:** RSS/crypto headlines live in null-origin sandboxed iframes
  (pattern 16); the host can't badge elements inside them. v1 scopes `f`-hints to
  host-rendered clickables (recall rows, top-sites). Reaching into the sandbox (host asks
  the sandbox to show hints, sandbox reports a chosen index back over the channel) is a
  stretch.
- **Live-while-open puff:** only wire it if a cheap existing let-go signal exists for the
  board to observe (a `storage.session`/`local` key the SW flips); do not add polling.

---

## Notes

- The keyboard layer builds directly on the popup vim quick-open (PR #10).
- The eagerness control replaces the hardcoded `STALE_WINDOW_MS` in
  `extension/background.js`; never-touch = the existing protection/blocklist surface.
- The whole effort stays inside the board host + popup + SW config; no new permissions,
  no new network surface, no manifest changes expected.
