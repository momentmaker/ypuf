---
title: "feat: Snooze panel — a dedicated coming-back surface"
type: feat
status: active
created: 2026-06-19
origin: docs/brainstorms/2026-06-19-ypuf-snooze-panel-requirements.md
---

# feat: Snooze panel — a dedicated "coming back" surface

Split snooze out of the recall ("ypuf") panel into its own board panel: a forward
**timeline of what's coming back, and when**. Recall becomes pure search + let-go archive.

Origin requirements: `docs/brainstorms/2026-06-19-ypuf-snooze-panel-requirements.md`
(A1 actor; flows F1–F4; acceptance examples AE1–AE5).

---

## Problem frame

Auto-reopen (PR #18) made timed snoozes reopen their tab in the background at the return
time, so "Back now" is no longer the main return path — it only catches "when I'm back"
(untilStartup) returns + edge cases. That reshaped snooze into a forward-looking queue
("what's away, when it returns"), conceptually distinct from recall (searching the let-go
archive). The recall redesign (PR #20) already made the panel single-purpose; this split
completes it.

This is a UI/host-glue change on the new-tab board. It reuses the shipped `snooze-list` /
`snooze-wake` / `snooze-resnooze` / `recall-open` / `restore-set` messages, with **one tiny
SW addition**: `projectSnooze` in `extension/background.js` must include `siblings` in the
`snooze-list` payload (mirroring `listRecent`) so the panel knows whether to show the ⊕N
"bring back the set" chip (U5). `restore-set` itself already reads `siblings` from the store,
so the action works regardless — only the panel-side *show-the-chip* decision needs the field.

---

## Key technical decisions

- **Panel label = "Snooze"** (open question resolved). Recognizable verb; matches the
  feature name, the popup's snooze surfaces, and reads clearly in the panel picker. The
  "coming back" framing lives in the timeline group headers + the empty-state copy, not the
  panel title. *Tunable; "Coming back" was the alternative.*
- **Return windows computed from `returnAt`** (open question resolved), not from the
  original preset. Computing from the stored timestamp handles custom snooze times and
  re-snoozes uniformly; the preset is not always present on the record. Mirrors how
  `lib/timegroup.js` buckets the recall list — a new pure tested lib does the forward case.
- **Reuse, don't reinvent.** The snooze panel renders rows via `lib/shelf-render.js`
  (text-only, no innerHTML — pattern 16), reuses the recall row / `.panel-group-label` /
  `.back-now-pinned` CSS, and the existing SW messages. The empty-state animation is the
  only net-new visual.
- **Present-by-default via a one-time seed**, addable + removable. Snooze is a hero feature
  → discoverable, but the user can remove the panel if they don't use it.
- **Empty-state animation = CSS keyframes** on a single small element (the "return loop"),
  not a canvas. One drifting element doesn't warrant a render loop; CSS is lighter and
  trivially `prefers-reduced-motion`-gated.

---

## Resolved design & feasibility decisions (doc review)

Cross-cutting decisions the units inherit, resolved so the implementer doesn't re-invent them:

- **Keyboard model:** the snooze panel's controls (open title, Wake, re-snooze, ⊕N) are
  native `<button>`/clickable elements — reachable by **Tab / Enter / Space** with
  `focus-visible` outlines. The recall panel's document-level `j/k` cursor layer does **not**
  extend to the snooze panel (it's scoped to recall `.recent-item` rows and not a primary
  keyboard-nav surface). Stated explicitly so no one extends the global layer arbitrarily.
- **Accessible labels:** secondary controls carry **row context** in their `aria-label`
  (e.g. `Wake — {title}`, `Snooze later — {title}`, `Bring back the {N} tabs {title} was open
  with`), so two rows aren't both a bare "Wake" to a screen reader. Group `<h3>` headers use
  `aria-label = "{window} — {n} tab(s)"` — **noun "tab(s)"**, not "page(s)" (snooze rows are
  live tabs coming back, not let-go pages).
- **Two label scopes (don't conflate):** the return-**window** is the *group header*
  ("This evening", "When you're back") from `returnwindow.windows`; the return-**time** is
  the *per-row meta tag* ("back this evening", "back Sat 9am", "back next time you're here").
  Different strings, different render sites.
- **Overdue-return rows:** a timed snooze whose `returnAt` is already past but still
  `snoozeState === 'snoozed'` (fired while the browser was closed, before the SW sweep) renders
  its meta tag as **"due earlier"** rather than a future time. The SW normally resolves these
  to Back-now first, so this is a transient-window safety net, not the common path.
- **Loading / failure = fail-open:** the panel body is blank while `snooze-list` is in flight
  (same as recall); on no-response/error it shows the **teaching empty state** (calm), never an
  error label.
- **Populated → empty transition:** none — the empty state appears immediately on the remount
  that clears the last row (§9 calm; no crossfade).
- **AE3 works via fresh mounts:** each new-tab open mounts the panel fresh and re-requests
  `snooze-list`, so a "when I'm back" snooze resolved on startup shows under Back-now the next
  time a new tab is opened — no live storage-listener refresh needed for the core.
- **Empty-state element identity (anti-AI-slop):** the return-loop element is a small **tab
  chip** — a ~14×9px rounded rectangle in the warm/puff palette (`var(--warm-gray)`, ~0.5
  opacity at rest) echoing the popup's tab-chip shape and the puff vocabulary — not a generic
  dot. (Exact pixels tunable in U6.)
- **Panel `buildForm`:** returns a truthy `() => ({})` readConfig (no per-instance config),
  matching `topsites` — a falsy return would block adding the panel from the picker.

---

## System-wide impact

- `extension/newtab/newtab.js` — the board host: a new `registerPanelType('snooze', …)`;
  the existing `ypuf` panel mount loses its snooze rendering (`backNowWrap`, the
  `snooze-list` handler, `snoozedRow`).
- `extension/background.js` — `DEFAULT_BOARD` gains the snooze panel; the board-config
  load path seeds it once for existing boards.
- `extension/newtab/newtab.html` — load the new pure lib.
- `extension/newtab/newtab.css` — snooze-panel styles + the return-loop keyframes.
- New pure lib `extension/lib/returnwindow.js` + `tests/returnwindow.test.js`.
- The SW snooze data model + messages are unchanged.

---

## Implementation units

Two phases. **Phase 1** ships a working Snooze panel and removes snooze from recall;
**Phase 2 (U5–U6)** adds the delighters. Each unit is an atomic commit. **U-IDs are by
concept, not landing order** — the required Phase-1 commit sequence is **U1 → U2 → U4 → U3**
(seed the panel before removing snooze from recall, so snooze is never homeless).

### U1. Pure return-window bucketing lib

**Goal:** A pure, tested core that buckets pending snooze records into ordered "coming
back" windows, soonest first.
**Requirements:** F1 (glance at what's coming back), AE1, AE4.
**Dependencies:** none.
**Files:** create `extension/lib/returnwindow.js`; create `tests/returnwindow.test.js`.
**Approach:** Mirror `lib/timegroup.js` shape (UMD/DI wrapper exporting `self.ypuf` +
`module.exports`; injected `now`; empty groups dropped). Export
`windows(records, now) -> [{ key, label, items }]`, ordered soonest-first, with
`untilStartup` records last. Buckets computed from each record's `returnAt`
(number) or `untilStartup` (bool):

| key | label | rule (relative to injected `now`, local time) |
|-----|-------|-----------------------------------------------|
| `today` | Later today | `returnAt` is today, before the evening hour (18:00) |
| `evening` | This evening | `returnAt` is today, ≥ 18:00 |
| `tomorrow` | Tomorrow | `returnAt` is the next calendar day |
| `weekend` | This weekend | `returnAt` is the coming Sat/Sun, not already covered above |
| `nextweek` | Next week | `returnAt` is within the following calendar week |
| `later` | Later | `returnAt` beyond that |
| `startup` | When you're back | `untilStartup === true` (no `returnAt`) — sorts last |

Items within a group keep caller order (the SW already sorts snoozed soonest-first).
Records that are not `snoozeState === 'snoozed'` are out of scope for this lib (Back-now is
rendered separately). Keep the hour/day constants named + tunable (reuse the spirit of
`lib/snooze.js`'s `EVENING_HOUR`/`MORNING_HOUR`). **Directional sketch (not a spec):** like
`timegroup.bucketByTime` but forward, with a `untilStartup`-last rule and window predicates
instead of past-day predicates.
**Patterns to follow:** `extension/lib/timegroup.js` (structure + the `findIndex` fallback
bucket); `extension/lib/snooze.js` (hour/day constants, `dayAtHour`/`nextDow` helpers worth
reusing for boundary math).
**Test scenarios** (`tests/returnwindow.test.js`):
- Covers AE1. Records due this-evening / this-weekend / untilStartup bucket into
  `evening`, `weekend`, `startup` in that order; `startup` is last.
- Soonest-first ordering across windows (today before evening before tomorrow…).
- Each boundary: a `returnAt` at exactly 18:00 today → `evening` (not `today`); 17:59 →
  `today`; midnight tonight vs tomorrow → `tomorrow`.
- Weekend vs next-week boundary (a Saturday `returnAt` this week → `weekend`; the same
  weekday next week → `nextweek`).
- `untilStartup: true` with no `returnAt` → `startup`, never crashes.
- Empty groups dropped; non-array input → `[]`; intra-group order preserved.
- Covers AE4. After a re-snooze that moves `returnAt` from weekend to next week, the record
  buckets into `nextweek` (verified at the lib level by passing the new `returnAt`).
**Verification:** `node --test tests/returnwindow.test.js` green; all windows + boundaries
asserted.

---

### U2. The Snooze panel type (timeline + back-now + rows + empty state)

**Goal:** Register a new `snooze` board panel that renders the back-now group, the
return-window timeline, per-row open/Wake, return-time labels, and the (static) teaching
empty state.
**Requirements:** F1, F2, F3 (open/Wake), AE1, AE2, AE3, AE5 (partial — teaching line only;
the animation is added in U6).
**Dependencies:** U1.
**Files:** modify `extension/newtab/newtab.js` (new `registerPanelType('snooze', …)` before
`loadAndRender()`); modify `extension/newtab/newtab.html` (script tag for
`lib/returnwindow.js`); modify `extension/newtab/newtab.css` (snooze styles).
**Approach:** A host-rendered panel mirroring the `topsites`/`ypuf` panel shape
(`label: 'Snooze'`, `hint: 'tabs coming back'`, `addable: true`, `network: false`,
`buildForm` with a one-line local-only note, `mount(ctx)` returning a teardown). On mount,
`send('snooze-list')` → render:
- **Back now** (pinned, only if `back.length`) — reuse the `.back-now-pinned` + group
  rendering; rows are open-on-click (`recall-open`). Hidden when empty.
- **Coming back timeline** — `returnwindow.windows(snoozed, Date.now())` → a quiet `<h3>`
  group header per window (with an SR count, like the recall panel's `group()`), each a
  `role="list"` of rows. Each row: favicon + title + host (via `shelf-render.itemRow`, the
  same `row()` favicon/error-hide treatment as recall) + a **return-time label** ("back
  this evening" / "back Sat 9am" / "back next time you're here") as the row meta tag + a
  **Wake** control (`snooze-wake`, then `ctx.remount()`).
- **Empty state** (when `!back.length && !snoozed.length`) — a calm `<p>` teaching line
  ("Nothing's away. Send a tab off with ⌘⇧S — it comes back on its own.") inside an
  `.snooze-empty` container that **also includes the decorative placeholder element**
  (`<span class="return-loop" aria-hidden="true">`); U6 only *activates* it via CSS keyframes,
  so U6 needs no further JS render here.
Guard the async render with the `alive`/`destroyed` flag (pattern 17) and `if (alive)` at
the `.then`. Page-derived title/host go through `shelf-render` textContent only (pattern
16 — no innerHTML). The return-time label is derived from `returnAt`/`untilStartup` (a
small host helper formatting via `toLocaleString`, mirroring the popup's `whenLabel`).
**Patterns to follow:** `extension/newtab/newtab.js` `registerPanelType('topsites', …)`
(panel shape, `alive` flag, `buildForm`); the recall panel's `group()` / `groupBlock()` /
`row()` / favicon-error-hide / `.back-now-pinned` (reuse the CSS, re-implement the small
mount locally — snooze rows don't need protect/forget); `extension/popup/popup.js`
`whenLabel(returnAt)` for the return-time label format.
**Test scenarios:** Host-glue (DOM + chrome), not unit-tested — covered by U1's lib tests +
`tests/MANUAL-DOGFOOD.md`. Add manual checks: Covers AE1 (timeline order), AE2 (an
auto-reopened tab leaves the timeline), AE3 (a when-I'm-back tab appears under Back now on
startup and clears on click), AE5 (empty state shows the teaching line). Note in the doc:
any decidable label/format logic that grows should be extracted to a tested lib later.
`Test expectation: none at the unit level — pure logic lives in U1; host render is manual.`
**Verification:** Loading the board with snoozed tabs shows the windowed timeline +
Back-now; Wake/open work; empty state shows when nothing is snoozed; no innerHTML; reduced
motion unaffected (U2 adds no motion).

---

### U3. Remove snooze from the recall (ypuf) panel

**Goal:** The recall panel becomes pure search + let-go archive — no snooze rendering.
**Requirements:** Success criterion "recall panel no longer shows snooze."
**Dependencies:** U2, U4 (so snooze has a home before it leaves recall — land U3 after the
panel exists and is seeded).
**Files:** modify `extension/newtab/newtab.js` (the `ypuf` panel mount).
**Approach:** Delete the snooze pieces from the `ypuf` mount: `backNowWrap` and `snoozeWrap`
(creation + `body.append`), the `send('snooze-list')` handler, and `snoozedRow`. **Critical:
also update `searchMode` to drop both refs** — it currently iterates
`[reliefWrap, digestWrap, backNowWrap, recentWrap, snoozeWrap]`; leaving the deleted names
there throws a `ReferenceError` when search is used. It becomes `[reliefWrap, digestWrap,
recentWrap]`. Delete `SNOOZE_GROUP_CAP` (now unreferenced). `recallScroll` becomes
`[results, recentWrap]`. Leave the recall search, time-grouped recent, favicons, cursor, and
the search keyboard-nav intact.
**Patterns to follow:** the just-shipped recall redesign in the same file.
**Test scenarios:** Manual (host glue). Verify the recall panel still: shows the
time-grouped recent list, search + keyboard nav, favicons, ⊕N set chip, "Show N more" — and
shows **no** Back-now/Snoozed groups. `Test expectation: none at the unit level — manual
regression in tests/MANUAL-DOGFOOD.md.`
**Verification:** Recall panel renders with no snooze groups; snooze content appears only in
the new Snooze panel; existing recall behaviors unregressed.

---

### U4. Seed the Snooze panel onto boards

**Goal:** The Snooze panel appears by default — on fresh installs and on boards saved before
it existed — placed in a sensible column; still removable/addable.
**Requirements:** Scope ("surface the panel on existing boards + the picker entry").
**Dependencies:** U2.
**Files:** modify `extension/background.js` (`DEFAULT_BOARD`); modify
`extension/newtab/newtab.js` (the board-config load path, `loadAndRender`).
**Approach:** Add `{ id: 'snooze-1', type: 'snooze', col: 1 }` to `DEFAULT_BOARD` (fresh
installs). For existing boards, a **one-time idempotent seed** in `loadAndRender` after the
config loads: if a guard flag (e.g., `config._snoozeSeeded`) is unset, set it **on the local
`config` object** and append the snooze panel when absent, then `saveConfig()`. **The flag
must live on the same `config` the board persists** — set it before any later `saveConfig`,
or a subsequent save (which writes the whole `config`) drops the flag and re-runs the seed.
The flag makes it one-time, so a user who later removes the panel keeps it removed. Place it
via the lanes column field (`spec.col`, read by `lanes.colOf`; `col: 1` is valid since
`COLS = 3`) — column 1 (the middle lane), beside the recall panel in column 0; revisit if
column 1 is crowded (see Deferred to implementation). `addable: true` (from U2) gives it a
picker entry + remove control.
**Patterns to follow:** `extension/background.js` `DEFAULT_BOARD`; the recall-panel pinned-
sibling scrub's one-time-migration shape (a guard flag, idempotent); `extension/lib/lanes.js`
`colOf` (the `col` field contract).
**Test scenarios:** Manual (chrome/storage). Verify: fresh install shows both panels; an
existing single-ypuf board gains the Snooze panel once on next open; removing it and
reopening does **not** re-add it (flag persisted); the panel sits in column 1.
`Test expectation: none at the unit level — config migration is chrome-dependent; manual
in tests/MANUAL-DOGFOOD.md.`
**Verification:** Snooze panel present by default on new + existing boards, in column 1,
removable and re-addable, and not force-re-added after removal.

---

### U5. Per-row delighters — inline re-snooze + bring-back-the-set

**Goal:** From a snoozed row, push the tab further (re-snooze) and bring back its whole
session set — quiet at rest, revealed on hover/focus/cursor.
**Requirements:** F3 (re-snooze, set), AE4.
**Dependencies:** U2.
**Files:** modify `extension/newtab/newtab.js` (the snooze panel mount); modify
`extension/newtab/newtab.css` (re-snooze control + reuse the `.set-restore` chip styles).
**Approach:**
- **Inline re-snooze:** a single quiet **"Later →"** trigger on each snoozed row that
  expands *in place* to exactly **two** forward presets — **`this-evening`** and
  **`next-week`** (the two most common push-forwards from `lib/snooze.js` `resolve()`) — plus
  a Cancel, mirroring the popup's collapsed-then-expanded re-snooze shape but scoped to two
  (not the full 6-preset picker, which stays in the overlay/popup — §9 calm). Picking a preset
  does `send('snooze-resnooze', { recordId, preset })` then `ctx.remount()`. The trigger is
  hover/cursor-revealed; the expanded presets are native `<button>`s (Tab/Enter/Space). An
  inflight guard (mirror the recall set-chip) so a double-press doesn't double-fire.
- **Bring back the set (⊕N):** when a snoozed record has `siblings`, render the same
  `.set-restore` chip as recall (`send('restore-set', { recordId, urls })`, inflight-
  guarded), revealed on hover/focus/cursor. Reuse the recall chip's CSS + aria-label.
**Patterns to follow:** the recall panel's `.set-restore` chip (inflight guard, aria-label,
hover/cursor reveal); `extension/lib/snooze.js` `resolve()` presets; the existing
`snooze-resnooze` SW handler.
**Test scenarios:** Manual (host glue) + the U1 lib already proves the window a re-snoozed
record lands in. Covers AE4: re-snoozing a weekend tab to next week moves its row from
*This weekend* to *Next week* after remount. Verify the set chip only shows when `siblings`
exist; both controls are keyboard-reachable + inflight-guarded.
`Test expectation: none at the unit level — actions reuse tested SW handlers; manual in
tests/MANUAL-DOGFOOD.md.`
**Verification:** Re-snooze moves a row to the correct later window; ⊕N reopens the session
set, deduped; both quiet at rest, no double-fire.

---

### U6. The return-loop empty-state animation

**Goal:** A calm, cute, reduced-motion-gated background animation for the empty state — a
tab gently drifts up and away, pauses, floats back, and settles, on a slow loop.
**Requirements:** AE5; the brainstorm's "return loop" decision.
**Dependencies:** U2.
**Files:** modify `extension/newtab/newtab.css` (keyframes + `.snooze-empty` /
`.return-loop` styling). **CSS-only** — U2 already renders the `.return-loop` placeholder span
inside `.snooze-empty`, so no `newtab.js` change is needed here.
**Approach:** Style + animate the `.return-loop` element (the tab chip from the Resolved
decisions section) with CSS `@keyframes`: translateY up + fade out, hold, translate back +
settle, on a calm multi-second loop. Wrap the keyframe animation in
`@media (prefers-reduced-motion: no-preference)` so reduced-motion users see the static chip
(the teaching line still reads). No canvas, no JS loop. The element is decorative
(`aria-hidden`, set in U2); the teaching text carries the meaning. It only exists while the
empty state is shown (U2 renders the empty state only when nothing is snoozed/back), so the
loop stops as soon as the panel has content.
**Patterns to follow:** the landing/extension motion convention — every animation gated
behind `prefers-reduced-motion` (e.g., the puff `chip-puff`/`breathe` keyframes, the
board's reduced-motion guards); `aria-hidden` on decorative motion (the hint-layer pattern).
**Test scenarios:** Manual/visual. Covers AE5: empty state shows the line + the looping
drift with motion enabled, and a static element with reduced motion. Verify it does not run
when the panel has snoozed/back items. `Test expectation: none — pure CSS/visual; manual +
reduced-motion check in tests/MANUAL-DOGFOOD.md.`
**Verification:** A charming, calm loop on the empty state; fully static under reduced
motion; decorative (not announced); absent when the panel has content.

---

## Scope boundaries

**In scope:** U1–U6 above — the Snooze panel (timeline + back-now + rows + teaching empty
state + return-loop animation), removal of snooze from recall, the seed/migration, and the
return-window lib.

**Deferred to follow-up work**
- **"Came back" relief** ("N tabs came back today") — needs the SW to log recent auto-
  returns (new data + retention). Its own slice once the panel is in. *(see origin: Scope →
  Deferred for later.)*
- **Bulk actions** (wake-all / "bring back the weekend set") — §9 clutter risk; not now.
- **A separate "next return" header glance** — redundant with the timeline's soonest group.

**Outside this product's identity** *(carried from origin)*
- No notifications / push on return (§9 interrupt rejection — pull-only).
- No cloud/sync of the snooze queue (100% local).

---

## Risks & mitigations

- **Snooze homeless during the cutover.** Mitigation: land U2 (panel) + U4 (seed) before U3
  (remove from recall), so snooze always has a surface.
- **Migration re-adds a removed panel.** Mitigation: the one-time guard flag (U4) — append
  only when the flag is unset, then set it.
- **Empty-state animation distracts / fights §9.** Mitigation: slow period, calm easing,
  reduced-motion-gated, decorative, and only while empty.
- **Re-implementing recall row helpers in the snooze mount drifts from recall.** Mitigation:
  reuse `shelf-render` + the shared CSS; keep the snooze mount thin; note any logic worth
  extracting to a tested lib (label formatting) as a follow-up rather than duplicating.

---

## Verification strategy

- `node --test tests/*.test.js` green (U1 adds `tests/returnwindow.test.js`; the whole suite
  must stay green after the recall-panel edits in U3).
- `node --check` on changed JS.
- Manual board verification per the new `tests/MANUAL-DOGFOOD.md` snooze-panel checklist
  (AE1–AE5), incl. light/dark/star themes + a reduced-motion pass for U6.
- A browser harness (the established method) for the panel render + the animation if useful.

---

## Deferred to implementation

- Exact return-window boundary constants + the precise weekend/next-week predicate (settle
  while writing U1's tests).
- The exact re-snooze preset subset shown inline (U5) — pick the 1–2 most useful forward
  presets against `lib/snooze.js`.
- The return-loop element's exact shape/keyframe timing (U6) — tune visually.
- The lane/column the migration uses if column 1 looks crowded in practice (U4).
