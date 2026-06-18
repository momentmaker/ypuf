---
title: "feat: ypuf board — calm settings, soul, and a vim keyboard layer"
type: feat
status: completed
date: 2026-06-18
origin: docs/brainstorms/2026-06-18-ypuf-board-keyboard-settings-soul-requirements.md
---

# feat: ypuf board — calm settings, soul, and a vim keyboard layer

## Summary

Three calm chunks on top of the shipped board (PR #9 redesign + PR #10 dogfood pass),
each shipping standalone: **(A) calm chrome & control** — iconify the board's text
affordances and add a gear→settings overlay that finally lets the user tune the hero
(auto-let-go eagerness) and manage never-touch sites, plus one-tap "protect this site"
from recall rows; **(B) soul** — the deferred visual puff and a weekly "your week,
unburdened" relief digest; **(C) a vim keyboard layer** over the board — normal-mode
navigation, `f` link-hints, and a `?` cheatsheet, invisible until used. Every addition
is *control* or *feeling*, never a knob the product is meant to cure (§5f/§9).

---

## Problem Frame

Dogfooding surfaced three frictions (see origin): text-clutter + **no control** over
auto-let-go (its window is the hardcoded `STALE_WINDOW_MS = 3 days` in
`extension/background.js`, even though §5a calls it "a heuristic to tune"); the
**deferred soul** (the signature visual puff was scoped out of the redesign, the relief
moment is a single daily line); and keyboard-first living only in **islands** (the popup
quick-out, the command bar, the snooze overlay) while the board itself isn't navigable.

The load-bearing constraint (CONTEXT §5f/§9): the board is *calm by design, not
minimalism*, and must never become the manual-organization control panel §9 rejects. A
settings surface and a keyboard layer are both clutter risks if mis-shaped — so the
settings overlay stays a few small groups, and the keyboard layer is **invisible until
used**.

---

## Requirements

Traces to the origin (R1–R12). Grouped by chunk:

- **A — Calm chrome & control:** R1 iconify forget/edit/one-line · R2 gear→settings
  overlay · R3 auto-let-go on/off + Timid/Balanced/Bold eagerness · R4 never-touch group ·
  R5 minimal board toggles · R6 one-tap protect from recall rows.
- **B — Soul:** R7 visual puff on let-go · R8 "your week, unburdened" digest.
- **C — Keyboard layer:** R9 board normal-mode · R10 `f` link-hints (host-rendered) ·
  R11 `?` cheatsheet · R12 calm/invisible-until-used.

**Origin actor:** A1 (the dogfooding board user). **Origin acceptance examples:**
AE1 (R3), AE2 (R6), AE3 (R7), AE4 (R8), AE5 (R9/R10/R11), AE6 (scope guard).

---

## Scope Boundaries

Hold the §5f / §9 line:
- **No raw-days slider** (eagerness presets only); **no knobs-dashboard** (overlay stays
  ~3 small groups); **no tags/folders/manual organization** (§9 Toby line); **no interrupt
  motion** (puff + reveals are responsive-only + `prefers-reduced-motion`-safe; the
  keyboard layer shows nothing until used); **no new network surface** (all local).

### Deferred to Follow-Up Work
- The `:` command palette and edit-mode panel `hjkl` (parked in origin).
- `f`-hints reaching *into* sandboxed RSS/crypto panel iframes (v1 = host-rendered
  clickables only — see Key Technical Decisions).
- Live-while-open visual puff (v1 = the reliable on-open case; live path only if a cheap
  existing let-go signal exists — see U6).

---

## Context & Research (authoritative seams this extends)

- **`extension/background.js`** — `STALE_WINDOW_MS` (line ~465) flows as `staleWindowMs:`
  into `eligDeps` → the pure `eligibility.classify` (line ~497/554); `autoEnabled` key +
  `auto-status` toggle; `protection.js` via `loadProtection`/`saveProtection`,
  `protected-list`/`protect-remove` messages (a `protect-add` is the one gap); `reliefClaim`
  (daily auto-closed count) + `RELIEF_KEY`; the offscreen `puff()`; the board-config SW
  messages; the `chrome.storage.onChanged` board convergence.
- **`extension/lib/eligibility.js`** — pure, DI'd with `staleWindowMs` as a threshold;
  **no change needed** — the eagerness control just feeds it a different number.
- **`extension/lib/protection.js`** — `protect`/`unprotect`/`isProtected`/`list`/`emptyState`
  all exist (`deleteByDomain` is the forget/purge path, not the never-touch remove); the
  never-touch state. **No lib change needed** — only the `protect-add` SW message is new.
- **`extension/newtab/newtab.{js,html,css}`** — the board host: masthead (`board-edit`,
  `oneline-toggle`), the ypuf recall panel (`addForget`, `row`, recall search), the
  add-picker card styling to mirror for the settings overlay, the `storage.onChanged`
  listener, `renderBoard`/teardown.
- **`extension/popup/popup.js`** — the vim quick-open (PR #10): `HINT_KEYS`, the
  `quick`/`cursor` model, `moveCursor`, the keydown handler — the pattern the board layer
  generalizes.
- **`extension/lib/shelf-render.js`** — host-rendered recall rows (the keyboard cursor +
  `f`-hints target these).

### Institutional learnings (`docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`)
- **Pattern 5 (no-build DI pure modules)** — every new decidable core (eagerness→days
  mapping, the keyboard cursor math, the hint-key assignment, the digest aggregation) is a
  pure `lib/*` module, test-first.
- **Pattern 18 (extract the pure core out of untested host glue)** — the keyboard layer's
  cursor/hint logic and the digest counts are extracted to tested libs, not left inline
  (the throughline: the board's worst bugs hide in untested host glue — the PR #10
  recall-click bug was exactly this).
- **Pattern 7 (serialized writes)** — settings writes (eagerness, protect-add) go through
  the SW's single-writer message handlers, never a naked board write.

---

## Key Technical Decisions

- **Eagerness is a persisted label → a threshold the SW reads (R3).** A pure
  `eagerness → staleWindowMs` mapping (Timid ~7d / Balanced ~3d / Bold ~1d) lives in a tiny
  tested lib; the setting persists in `local` (SW-owned, default `balanced` = the current
  3-day behavior, so untouched installs are unchanged). `eligibility.classify` is unchanged
  (already threshold-injected); the **sweep pre-reads** the eagerness once (alongside its
  other `await`s) and passes the resolved `staleWindowMs` into the still-synchronous
  `eligDeps`, so no call site changes shape. A `get-auto-config` SW message returns
  `{ enabled, eagerness }` for the overlay to render (the existing `auto-status` is reused
  for the on/off write).
- **"never-touch" (product) = "protection" (impl).** The product-facing label is
  *never-touch*; the implementation is the existing `protection.js` surface
  (`protect`/`unprotect`/`list`). Same thing — stated once so R4/U4's
  `protect-add`/`protect-remove` read clearly.
- **Settings overlay is first-party board UI (R2).** A slide-over panel on the board
  (not a sandbox, not a Chrome options page), styled like the crafted add-picker; `Esc` /
  backdrop / the gear toggle close it. It reads/writes via SW messages (auto config,
  protection) — the single-writer discipline (pattern 7).
- **Never-touch reuses the protection surface (R4/R6).** The overlay lists via
  `protected-list` and removes via `protect-remove` (→ `protection.unprotect`, *not*
  `deleteByDomain`, which is the forget/purge path); one-tap protect adds the one new
  `protect-add` SW message (`protection.protect(state, host)` — **already exists** in
  `protection.js` — + save). Same host-owned data the eligibility gate already honors (a
  protected site is never an auto-close zombie).
- **The digest is a weekly aggregate over the store (R8).** A `week-digest` SW handler
  computes, from the **auto-closed** records only (mirroring `autoClosedRecords()`, so
  snooze-wakes and manual let-gos don't inflate it — `reopenRecord` is also called by
  `snoozeWake`): *let go* = records with `timestamp` in the last 7d, *recalled* = those with
  `lastAccessed` in the last 7d, *lost* = 0 (the recall index is the guarantee). The counting
  is a pure tested function; the board renders a calm line in the ypuf panel — **hidden
  entirely when all three are 0** (no cold all-zeros line on first use). Local-only, no
  badge. (Extends the existing `autoSummary()` 7-day count.)
- **Visual puff leads with the reliable case (R7).** The board reads a `boardLastOpen`
  timestamp from `local` on mount, then writes `now`; records whose `timestamp >
  boardLastOpen` **and** `autoClosed` get a soft CSS dissipation-into-place entrance, gated
  behind `prefers-reduced-motion: no-preference`. (`list-recent` already returns `timestamp`
  + `autoClosed`, so no SW change.) Note: the existing offscreen **audio** `puff()` in
  `background.js` is a *prior slice's* unit (commented `U6/R12`); this U6 is the new
  *visual* half. Live-while-open puff is deferred unless a cheap existing signal (a
  `storage.session` key the SW flips on let-go that the board's `storage.onChanged` listener
  can observe) makes it free — no polling.
- **The keyboard layer is a board-scoped keydown with a pure cursor/hint core (R9–R12).**
  A single board keydown handler (active only when the board has focus and no field is
  focused) drives a recall cursor + actions; the cursor math and the hint-key assignment
  are pure tested libs (generalizing the popup's `HINT_KEYS`/`moveCursor`). `f` shows
  letter badges on **host-rendered** clickables (recall rows, top-sites) — it cannot reach
  into sandboxed RSS/crypto iframes (pattern 16 null-origin), so those are out of v1 scope.
  `?` opens a static cheatsheet overlay. Nothing renders until a key is pressed (§9 calm).

---

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

```
GEAR (masthead) ─▶ settings overlay (board slide-over)
   ├─ Auto-let-go: [on/off]  [Timid · Balanced · Bold]  → SW: set eagerness/enabled
   │       └─ eligDeps reads autoEagerness → staleWindowMs → eligibility.classify (unchanged)
   ├─ Never-touch: list (protected-list) · remove (protect-remove) · add (protect-add NEW)
   └─ Board: one-line on/off (moved here)

RECALL ROW ─▶ [open] [forget] [protect ←NEW] (forget+protect hover/focus-reveal as a pair) → SW protect-add

BOARD OPEN ─▶ week-digest (SW, autoClosed-only) → "47 let go this week · 0 lost · 12 recalled" (hidden if all 0)
          └─ rows let go since boardLastOpen (read+write the ts on mount) → CSS puff (reduced-motion-safe)

BOARD FOCUS, no field ─▶ keydown:
   j/k cursor · Enter/o open · x forget(+u) · p protect · / search · gg/G · e edit · Esc
   f → letter hints on host-rendered clickables → type to open
   ? → cheatsheet overlay
   (pure: cursor math + hint assignment in lib/*, tested)
```

---

## Implementation Units

### Phase A — Calm chrome & control

### U1. Iconify the board affordances
**Goal:** Replace the text `forget` / `Edit board` / `+ daily one-line` with calm,
labelled icons.
**Requirements:** R1
**Dependencies:** none
**Files:** Modify `extension/newtab/newtab.html` (masthead buttons), `extension/newtab/newtab.js`
(`addForget` glyph, edit/one-line button content), `extension/newtab/newtab.css` (icon styles);
Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** Swap button text for inline-SVG (or unicode) glyphs — trash/✕ for forget
(stays hover/focus-revealed), pencil-or-gear for edit, a quiet line/quote glyph for
one-line. Every icon keeps a `title` + `aria-label`. Legible, not cryptic.
**Patterns to follow:** the existing `.recall-forget` hover-reveal + `.board-edit` styles.
**Test scenarios:** `Test expectation: MANUAL-DOGFOOD` — each affordance shows an icon with
a tooltip; forget stays hidden until row hover/focus; keyboard-focusing each reveals it;
screen-reader reads the aria-label. *(Covers AE6 partial — calm at rest.)*
**Verification:** The masthead + recall rows read as quiet icons; no loss of function.

### U2. Settings overlay shell (gear → slide-over)
**Goal:** A gear icon in the masthead opens/closes a calm settings overlay on the board.
**Requirements:** R2
**Dependencies:** U1 (gear icon)
**Files:** Modify `extension/newtab/newtab.html` (gear button + overlay root),
`extension/newtab/newtab.js` (open/close, Esc/backdrop, focus management),
`extension/newtab/newtab.css` (slide-over styling); Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** A first-party slide-over panel (mirror the crafted add-picker card styling),
opened by the gear, closed by `Esc` / backdrop / re-click. `role="dialog"` +
`aria-modal="true"`; initial focus lands on the first interactive control; **Tab is trapped
within the overlay** while open (no focus-trap pattern exists in the repo yet — establish it
here so U10's cheatsheet overlay reuses it); focus restores to the gear on close. Empty shell
here; groups land in U3–U5.
**Patterns to follow:** the add-picker card (`openAddPicker`), the snooze-overlay
open/close + focus-restore shape.
**Test scenarios:** `Test expectation: MANUAL-DOGFOOD` — gear opens the overlay; initial
focus is the first control; **Tab cycles only within the overlay** (never reaches the board
behind it); `Esc`, backdrop, and re-click close it; focus returns to the gear; nothing
animates unprompted; reduced-motion → no slide animation.
**Verification:** A calm settings surface opens and closes cleanly with no clutter at rest.

### U3. Auto-let-go control — on/off + eagerness presets
**Goal:** Let the user turn auto-let-go on/off and choose Timid / Balanced / Bold; the SW
honors it as the staleness window.
**Requirements:** R3 *(Covers AE1)*
**Dependencies:** U2
**Files:** Create `extension/lib/eagerness.js` (pure label→ms mapping) + `tests/eagerness.test.js`;
Modify `extension/background.js` (persist `autoEagerness`; **pre-read it in `autoSweep`** and
pass `staleWindowMs` into the still-sync `eligDeps`; a `get-auto-config` (returns
`{ enabled, eagerness }`) + `set-auto-eagerness` message; reuse the existing `auto-status`
toggle for on/off), `extension/newtab/newtab.js` (the overlay's auto group);
Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** `eagerness.js`: `toWindowMs('timid'|'balanced'|'bold')` → ~7/3/1 days, default
`balanced` = the current 3-day behavior (untouched installs unchanged). The **sweep**
pre-reads the label (alongside its other awaits) and maps it to `staleWindowMs`, passed into
`eligDeps` — `eligDeps`/`eligibility.classify` stay synchronous and unchanged. The overlay
shows the on/off toggle + a **segmented three-button control** (Timid · Balanced · Bold) with
the real window subtly stated ("lets go after ~3 quiet days"); when auto-let-go is **off**,
the segmented control stays visible but **muted/non-interactive** (pre-arm before
re-enabling). **No raw-days slider.**
**Execution note:** Build `eagerness.js` test-first.
**Patterns to follow:** the popup `auto-status` toggle; the SW single-writer message
handlers; pattern 5 (DI/UMD lib).
**Test scenarios:**
- `eagerness.toWindowMs('bold')` ≈ 1 day; `'timid'` ≈ 7 days; `'balanced'` ≈ 3 days;
  unknown/missing → balanced (3 days).
- The mapping is monotonic (timid > balanced > bold).
- `Test expectation: MANUAL-DOGFOOD`: set Bold → a tab idle ~1 day becomes an auto-close
  candidate; set Timid → ~7 days; the overlay shows the real window; toggling off stops
  auto-let-go AND mutes the segmented control (still visible, non-interactive). *(Covers AE1)*
**Verification:** `node --test tests/eagerness.test.js` passes; the SW window follows the
setting; Balanced default preserves current behavior.

### U4. Never-touch group + one-tap protect from recall rows
**Goal:** View/manage never-touch sites in the overlay, and protect a site in one click
from a recall row.
**Requirements:** R4, R6 *(Covers AE2)*
**Dependencies:** U2
**Files:** Modify `extension/background.js` (add the one new `protect-add` message →
`protection.protect`+save; remove via the existing `protect-remove` → `unprotect`),
`extension/newtab/newtab.js` (overlay never-touch list via
`protected-list`/`protect-remove`/`protect-add`; a `protect` action on each recall row next
to forget), `extension/newtab/newtab.css`; Test `tests/protection.test.js`,
`tests/MANUAL-DOGFOOD.md`. (`protection.protect`/`unprotect` already exist — no `protection.js`
change.)
**Approach:** The overlay lists protected hosts; remove sends `protect-remove` →
`protection.unprotect` (*not* `deleteByDomain` — that's the forget/purge path). The recall-row
`protect` action derives the host from the row's *stored* record (not page-supplied) and sends
`protect-add`. On the recall row, **protect hover/focus-reveals as a calm pair with forget**
(both opacity-0 at rest, forget left / protect right) so the row stays calm. The overlay's
never-touch group is **recall-row-add-only in v1** (no manual domain input); when the list is
empty it shows a muted "No sites protected yet — protect a site from a recall row." A protected
site is never an auto-close zombie (the eligibility gate already honors protection — no gate
change).
**Patterns to follow:** the popup Protected-sites view; the existing `protect-remove` handler;
the recall-row `addForget` hover-reveal idiom.
**Test scenarios:**
- `protection.protect(state, 'a.test')` then `isProtected(state, 'a.test')` → true; idempotent
  on repeat; `list` includes it; `unprotect(state, 'a.test')` removes it.
- `Test expectation: MANUAL-DOGFOOD`: hovering a recall row reveals forget + protect together;
  click protect → the site appears in the overlay's never-touch list and is never auto-closed;
  remove it there → gone; an empty list shows the muted "protect a site from a recall row" line.
  *(Covers AE2)*
**Verification:** `node --test tests/protection.test.js` passes; protect/unprotect round-trips
from both the row and the overlay.

### U5. Board group in the overlay — relocate the one-line toggle
**Goal:** Move the one-line toggle into the overlay's board group, decluttering the masthead.
**Requirements:** R5
**Dependencies:** U2 (the overlay shell — U3/U4 render their own groups independently, so all
three can land together or stagger freely)
**Files:** Modify `extension/newtab/newtab.js` (move the `oneLine` enable/disable into the
overlay's board group), `extension/newtab/newtab.html` (remove the masthead one-line button),
`extension/newtab/newtab.css`; Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** Relocate the existing one-line opt-in (grant-in-gesture preserved) into the
overlay's board group. **v1 ships only the one-line relocation** — the board group is a single
toggle. Any future mood-on/off or let-go-sound toggle is a *separate* unit with its own
R-number (keeping the overlay within AE6's ~3-small-groups cap; "if cheap" is not a strong
enough guard for a §9-watched surface).
**Patterns to follow:** the existing `toggleOneLine` + `grantThenAdd` in-gesture flow.
**Test scenarios:** `Test expectation: MANUAL-DOGFOOD` — the one-line toggle now lives in
the overlay and still requests the grant in-gesture; the masthead is cleaner; the board group
holds exactly one toggle (no knobs wall). *(Covers AE6)*
**Verification:** One-line still opt-in/grant-gated from its new home; overlay stays minimal.

---

### Phase B — Soul

### U6. Visual puff on let-go
**Goal:** A soft visual dissipation pairs with the audio puff when let-go pages surface on
the board. *(Note: the existing offscreen **audio** `puff()` in `background.js` is a prior
slice's unit, commented `U6/R12`; this U6 is the new **visual** half — same name, different
unit.)*
**Requirements:** R7 *(Covers AE3 — the on-open case; AE3 as written also describes the
live-while-open puff, which is deferred below.)*
**Dependencies:** none (independent of A)
**Files:** Modify `extension/newtab/newtab.js` (read+write the `boardLastOpen` timestamp on
mount; mark newly-let-go rows for a one-shot puff entrance; optional live path),
`extension/newtab/newtab.css` (the puff keyframes, reduced-motion-gated);
Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** **Reliable case first.** On board mount, read a `boardLastOpen` timestamp from
`local`, then write `now`. Recall rows whose record `timestamp > boardLastOpen` **and**
`autoClosed` get a soft dissipation-into-place CSS entrance (fade + slight scale/settle), gated
behind `prefers-reduced-motion: no-preference`, one-shot (no re-animate on re-render).
(`list-recent` already returns `timestamp` + `autoClosed`, so no SW change.) **Live-while-open**
is a bonus *only if* a cheap signal exists: if the SW already flips (or can cheaply flip) a
`storage.session` key on let-go, the board's existing `storage.onChanged` listener can trigger
a puff — otherwise defer. No polling, never interrupts.
**Patterns to follow:** the redesign's `firstPaint` one-shot entrance + the
`prefers-reduced-motion` gating; the SW `puff()` decoupled side-effect.
**Test scenarios:** `Test expectation: MANUAL-DOGFOOD` — let a tab go, open a new board →
the new recall row puffs in softly with no other motion; with reduced-motion set, it
appears instantly; re-opening the board does NOT re-puff rows already seen (the
`boardLastOpen` advance); re-rendering within a session does not re-puff. *(Covers AE3 —
on-open case)*
**Verification:** The let-go feels like a soft release on the board; calm + reduced-motion-safe.

### U7. "Your week, unburdened" digest
**Goal:** A calm weekly relief line — what you let go, recalled, and (never) lost.
**Requirements:** R8 *(Covers AE4)*
**Dependencies:** none (independent of A; pairs with B)
**Files:** Create `extension/lib/digest.js` (pure: autoClosed records + now → {letGo, recalled, lost})
+ `tests/digest.test.js`; Modify `extension/background.js` (a `week-digest` message →
aggregate the **auto-closed** records), `extension/newtab/newtab.js` (render a quiet line in
the ypuf panel, hidden when all-zero); Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** `digest.js`: given the **auto-closed** records + now, count `letGo` = records
with `timestamp` within 7d, `recalled` = those with `lastAccessed` within 7d, `lost` = 0 (the
recall index is the guarantee). The SW `week-digest` loads the store, filters to auto-closed
(mirroring `autoClosedRecords()`, so snooze-wakes — which also call `reopenRecord` — and manual
let-gos don't inflate it), and calls `digest.compute`; the ypuf panel renders "N let go this
week · 0 lost · M recalled" — quiet, never a badge/nag, and **hidden entirely when all three
are 0** (no cold all-zeros line on first use).
**Execution note:** Build `digest.js` test-first.
**Patterns to follow:** `reliefClaim` / `autoSummary` (existing 7-day auto-closed counts) as the
precedent; pattern 5 lib; the relief line render in the ypuf panel.
**Test scenarios:**
- `digest.compute(records, now)` counts only auto-closed records within the 7d window for
  `letGo`; `recalled` counts only those with a `lastAccessed` in-window; `lost` is always 0;
  empty input → all zeros; a record let go 8 days ago is excluded.
- A record recalled today but let go 10 days ago counts toward `recalled`, not `letGo`.
- `Test expectation: MANUAL-DOGFOOD`: a fresh profile (nothing auto-closed) shows **no** digest
  line; after a week of use → a calm "N let go this week · 0 lost · M recalled" line; never a
  badge. *(Covers AE4)*
**Verification:** `node --test tests/digest.test.js` passes; the line reflects real weekly
activity and stays quiet.

---

### Phase C — Keyboard layer

### U8. Board normal-mode (cursor + actions)
**Goal:** Vim navigation over the board's recall rows when the board has focus.
**Requirements:** R9, R12 *(Covers AE5 partial)*
**Dependencies:** U4 (protect action for `p`); independent of B
**Files:** Create `extension/lib/boardkeys.js` (pure: cursor move/clamp + key→intent
mapping) + `tests/boardkeys.test.js`; Modify `extension/newtab/newtab.js` (a board-scoped
keydown that drives the recall cursor + actions, guarded against field focus),
`extension/newtab/newtab.css` (the cursor highlight); Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** A single document keydown active only when the board has focus and the target
is not an input/textarea/contenteditable. `j`/`k` move a recall cursor (pure clamp from
`lib/boardkeys.js`, generalizing the popup `moveCursor`), `Enter`/`o` open, `x` forget
(+`u` undo, reusing `addForget`'s path), `p` protect (U4), `/` focus recall search,
`g g`/`G` top/bottom, `e` toggle edit, `Esc` blur/close. The key→intent mapping is pure +
tested; the DOM application stays in the host. The cursor is a **subtle 2px left-bar accent
(`var(--accent-amber)`)** on the focused row — matching the existing panel focus-ring idiom,
calm during use, invisible at rest.
**Execution note:** Build `boardkeys.js` test-first (this is the throughline counter-move —
pattern 18 — keep the decidable core out of the host glue).
**Patterns to follow:** the popup vim quick-open (`HINT_KEYS`/`moveCursor`/keydown guard,
PR #10); the `lib/lanes.js` extraction shape (pure core + thin host).
**Test scenarios:**
- `boardkeys.moveCursor(cursor, delta, len)` clamps at both ends; from `-1` forward → 0,
  backward → len-1; empty list → no move.
- `boardkeys.intent(key, ctx)` maps `j/k/o/Enter/x/u/p/slash/g/G/e/Escape` to the right
  intent and returns none for unhandled keys; returns none when a field is focused.
- `Test expectation: MANUAL-DOGFOOD`: on the board (not in a field), `j`/`k` move a visible
  cursor over recall rows, `Enter`/`o` opens, `x` forgets (+`u` undo), `p` protects, `/`
  jumps to search, `Esc` clears; typing in the search box is never hijacked. *(Covers AE5)*
**Verification:** `node --test tests/boardkeys.test.js` passes; the board is fully
keyboard-navigable; fields keep their keys.

### U9. `f` link-hints (host-rendered)
**Goal:** Press `f` to label every host-rendered clickable with a hint key; type it to open.
**Requirements:** R10 *(Covers AE5 partial)*
**Dependencies:** U8
**Files:** Create `extension/lib/hints.js` (pure: assign hint labels to N targets; resolve
a typed prefix → target index) + `tests/hints.test.js`; Modify `extension/newtab/newtab.js`
(collect host-rendered clickables, badge them, consume the typed hint),
`extension/newtab/newtab.css` (the hint badges); Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** `f` enters hint mode: `hints.assign(n)` returns labels (single letters, then
two-letter for many targets); badges render over host-rendered clickables (recall rows,
top-sites); typing resolves via `hints.match(prefix, labels)`; `Esc` exits. Badge visual:
**`var(--accent-amber)` background, dark-ink text, ~10px monospace, absolute at the target's
top-left, z-index above panel content** — matches the accent system, readable on warm paper,
no new token. **Sandboxed panel iframes (RSS/crypto) are out of scope** — the host can't badge
inside a null-origin iframe (pattern 16); note this in the cheatsheet.
**Execution note:** Build `hints.js` test-first.
**Patterns to follow:** the popup's `HINT_KEYS` badge model (PR #10), generalized; pattern
18 (pure core).
**Test scenarios:**
- `hints.assign(3)` → 3 distinct single-char labels; `assign(40)` → unique labels, escalates
  to 2-char as needed; stable/deterministic order.
- `hints.match('a', labels)` → the index for label `a`, or a "needs more chars" / "no match"
  signal for ambiguous/absent prefixes.
- `Test expectation: MANUAL-DOGFOOD`: press `f` → letter badges appear on recall rows +
  top-sites (not inside RSS/crypto iframes); type a label → it opens; `Esc` clears the
  hints. *(Covers AE5)*
**Verification:** `node --test tests/hints.test.js` passes; `f`-hints open any host-rendered
clickable by keyboard.

### U10. `?` cheatsheet + calm guarantees
**Goal:** A discoverable keyboard-help overlay; the whole layer stays invisible until used.
**Requirements:** R11, R12 *(Covers AE5/AE6)*
**Dependencies:** U8, U9
**Files:** Modify `extension/newtab/newtab.js` (`?` opens a static cheatsheet overlay; a quiet
"Keyboard shortcuts: press ? on the board" line in the settings-overlay footer; ensure no key
renders anything until pressed), `extension/newtab/newtab.css` (cheatsheet styling);
Test `tests/MANUAL-DOGFOOD.md`.
**Approach:** `?` opens a calm overlay listing the bindings (incl. the `f`-hints iframe caveat);
`Esc`/backdrop closes; reuses U2's focus-trap pattern. **Passive discoverability:** since the
layer is invisible until used, the settings overlay (which the user has already opened) carries
one plain-text footer line — "Keyboard shortcuts: press ? on the board" — costing zero calm
budget on the board itself. Audit U8/U9 so nothing draws on the board until a key is pressed
(no persistent hint badges, no always-on cursor), reduced-motion-safe.
**Patterns to follow:** the settings-overlay open/close + focus trap (U2); the snooze-overlay backdrop.
**Test scenarios:** `Test expectation: MANUAL-DOGFOOD` — `?` shows the cheatsheet with all
bindings; the settings overlay footer mentions "press ? on the board"; the board shows no
keyboard chrome until a key is pressed; reduced-motion → no animation; in a field, `?` types a
literal `?`. *(Covers AE5, AE6)*
**Verification:** The layer is discoverable via `?` yet invisible at rest.

---

## System-Wide Impact

- **Surfaces:** all new behavior lives in the board host (`newtab.js`) + new pure `lib/*`
  modules + a few SW messages (`set-auto-eagerness`/`get-auto-config`, `protect-add`,
  `week-digest`). No manifest change, no new permission, **no new network surface**.
- **Security/privacy:** unchanged. Settings, digest, puff, and keyboard layer are 100%
  local; the digest reads only the local store; protect uses host-owned data. The one new
  message class (`protect-add`) is SW-validated like the rest (`sender.id`), and a protected
  host can only *reduce* auto-close risk.
- **The hero's safety:** the eagerness control feeds the existing pure eligibility gate a
  different threshold; the gate's keep/excluded bias (the #1-risk guard) is untouched.
- **Unchanged invariants:** the recall/let-go engine, the SWR broker, 100%-local recall,
  the calm/no-interrupt rule, reduced-motion safety.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Settings overlay accretes into a knobs-dashboard (§9) | Hold to ~3 small groups (AE6); eagerness is presets not a slider; review against §9 each unit. |
| Eagerness change alters the #1-risk gate | The mapping only changes `staleWindowMs`; `eligibility.classify`'s keep/excluded bias is unchanged; Balanced default = current behavior. |
| Keyboard layer hijacks typing | The keydown is guarded against input/textarea/contenteditable focus (U8/U10); covered by `boardkeys.intent` tests + dogfood. |
| `f`-hints can't reach iframe panels | Scoped to host-rendered clickables in v1; the limitation is stated in the `?` cheatsheet; iframe path deferred. |
| Live-while-open puff tempts polling | v1 ships only the on-open reliable case; live path gated on a cheap existing signal, never polling. |
| Untested host glue (the throughline) | Every decidable core (eagerness, digest, boardkeys, hints) is a pure test-first `lib/*` (patterns 5/18); DOM/chrome surfaces in MANUAL-DOGFOOD. |

---

## Phased Delivery

Each phase ships standalone — stop anywhere with a coherent, calm result:

1. **Phase A — Calm chrome & control:** U1 · U2 · U3 · U4 · U5. *(Highest day-to-day
   value; unblocks tuning the hero.)*
2. **Phase B — Soul:** U6 · U7. *(The feeling of a clear desk.)*
3. **Phase C — Keyboard layer:** U8 · U9 · U10. *(Builds on the popup vim from PR #10.)*

A and B are independent; C depends on A's U4 (the `p` protect action). Recommended order
A → B → C, but B can ship before A if desired.

---

## Documentation / Operational Notes

- Update `tests/MANUAL-DOGFOOD.md` with a section per unit (each unit lists its checklist
  above).
- Consider a `/ce-compound` note if a reusable pattern emerges (the "persisted-label →
  threshold the SW reads" config shape, or the "pure cursor/hint core + thin host" keyboard
  pattern — both extend pattern 18).
- No backend, no telemetry; the only behavioral additions are local.

---

## Sources & References

- **Origin:** [docs/brainstorms/2026-06-18-ypuf-board-keyboard-settings-soul-requirements.md](docs/brainstorms/2026-06-18-ypuf-board-keyboard-settings-soul-requirements.md)
- Related code: `extension/newtab/newtab.{html,js,css}`, `extension/background.js`,
  `extension/lib/{eligibility,protection,shelf-render}.js`, `extension/popup/popup.js`
- Prior PRs: momentmaker/ypuf#9 (board redesign), momentmaker/ypuf#10 (dogfood pass —
  snooze overlay, board forget, popup vim quick-open)
- Learnings: `docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`
  (patterns 5, 7, 16, 18)
