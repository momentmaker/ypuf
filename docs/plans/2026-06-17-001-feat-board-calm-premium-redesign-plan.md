---
title: "feat: ypuf board calm-premium redesign (the warm desk)"
type: feat
status: active
date: 2026-06-17
origin: docs/brainstorms/2026-06-17-ypuf-board-calm-premium-redesign-requirements.md
---

# feat: ypuf board calm-premium redesign ("the warm desk")

## Summary

Elevate the shipped slice-5 panel board from "plain grid" to a **crafted, alive,
soulful** new-tab surface — *the warm desk you're glad to land on* — without
betraying the calm identity. The work is **craft + atmosphere + soul, executed with
restraint**: refined cards with a per-type accent and colored crypto deltas; a
tactile paper materiality + a real display typeface; a time-of-day palette and a
living masthead with responsive-only motion; the let-go made the emotional hero
(puff, relief, gentle recall); and an ambient daily one-line from `um.fz.ax`
(cached-daily, locally-random-picked, governed exactly like a slice-5 network panel).
All local except the one-line; all motion answers the user, never interrupts.

---

## Problem Frame

The board (slice 5, PR #8) works but feels utilitarian — flat cards, a bare masthead,
dead-feeling whitespace, no soul. A1 (dogfooding) wants it to feel "almost like a
Trello board." The brainstorm (see origin) resolved that **Trello's card *craft* is
worth borrowing but its *organizational metaphor* (columns/lists/manual sorting) is
the §9-rejected "declared organization" pattern** — so this redesign borrows the bones
(beautiful movable cards) and keeps ypuf's calm warm-paper skin. The load-bearing
constraint: the board must never become "the cluttered thing it's meant to cure"
(CONTEXT §5f/§9). The design bar is Things 3 / Arc / Teenage Engineering / iA Writer —
calm-premium, not a dashboard.

---

## Requirements

Traces to the origin requirements doc (R1–R16). Grouping by the four pillars + one-line:

- **Craft baseline:** R1 refined cards · R2 per-type accent (a dot) · R3 colored crypto
  deltas (▲green/▼red on the change only) · R4 drag lift.
- **Materiality:** R5 paper texture + layered depth + warm vignette · R6 a characterful
  self-hosted display typeface + real hierarchy · R7 light/depth on cards.
- **Atmosphere:** R8 time-of-day palette drift (local clock, no network) · R9 living
  masthead (wordmark + date + a soft mood line) · R10 responsive-only micro-motion.
- **Soul:** R11 the puff (visual on let-go) · R12 a once-daily relief moment · R13
  gentle recall surfacing; recall is the board's center of gravity.
- **One-line:** R14 a quiet bottom aphorism from `um.fz.ax/self/one-line.md` (text-only)
  · R15 cache the list daily + pick locally per tab · R16 pattern-16 network governance.
- **Top sites (post-plan, A1-requested during dogfooding):** R17 a *most-visited* sites
  panel (Brave-style) — **measured** importance, not **declared** organization, so it
  holds the §9 line. Local-only (`chrome.topSites`), http(s)-filtered, page-derived
  titles rendered `textContent`-inert, favicons via the local MV3 `_favicon` endpoint
  (no network). See U7.

**Origin actors:** A1 (the dogfooding board user).
**Origin acceptance examples:** AE1 (R8), AE2 (R3), AE3 (R4,R10), AE4 (R14,R15),
AE5 (R11,R12), AE6 (scope boundary — no columns/backdrop/badges/auto-motion).

---

## Scope Boundaries

Hold the §5f / §9 line:

- **No** named columns / lists / manual sorting (declared organization — that's Toby).
- **No** board backdrop, Trello colors, dense chrome, add-card-per-list, kanban /
  active-management framing.
- **No** interrupting motion (auto-play, notify, modal, attention-demanding animation);
  motion is responsive-only and respects `prefers-reduced-motion`.
- **No** external font / asset CDN — everything self-hosted (privacy).
- **No** new network surface beyond the one user-configured one-line; the time-of-day,
  craft, materiality, masthead, and soul are all 100% local/CSS.

### Deferred to Follow-Up Work
- A user-configurable one-line *source* URL (v1 hardcodes the `um.fz.ax` default behind
  the opt-in toggle).
- Animated time-of-day transitions *between* opens (v1 computes the palette once at
  board open — a glance surface doesn't need a live-drifting gradient).
- Bringing the full popup relief/streak surface to the board (v1 surfaces the existing
  relief-claim primitive only).

---

## Context & Research

### Relevant code and patterns (authoritative — these are the slice-5 files this extends)
- **`extension/newtab/newtab.js`** — the board host: `renderBoard`, the panel registry,
  `mountSandbox` (host↔sandbox channel), the broker (`brokerLoad`/`brokerRefresh` — SWR
  cache + single-flight + hardened fetch), the ypuf panel mount, the crypto panel
  `draw`, the edit-mode + drag reorder.
- **`extension/newtab/newtab.css`** + **`extension/style.css`** — the warm-paper `:root`
  tokens (`--ink`/`--paper`/`--warm-gray`/`--accent-*`/`--card-bg`/`--shadow`/`--radius`)
  the whole calm palette derives from. Time-of-day (R8) swaps these tokens.
- **`extension/panels/sandbox.{html,js}`** + **`extension/lib/channel.js`** — the
  text-only render surface + the envelope/intent kernel. Colored deltas (R3) extend the
  line schema here.
- **`extension/lib/sourceurl.js`** — the URL/SSRF validator the one-line reuses.
- **`extension/background.js`** — the relief-claim (`relief-claim`) + the audio puff
  (`ensureOffscreen`/`puff` via the offscreen doc); the board reuses these for R11/R12.
  The `local`/`session` storage helpers and the board-config SW messages.

### Institutional learnings
`docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`
(16 patterns). Directly bearing:
- **Pattern 16 (network-panel isolation)** — the one-line is "another network source":
  validate URL → hardened fetch (`credentials:'omit'`/`no-referrer'`/`redirect:'error'`)
  → text-only render → success-only cache → disclosure. It reuses the existing broker.
- **Pattern 2 (persist timestamps; never memoize a rejection)** — the one-line's
  daily-list cache is `{value, fetchedAt}` with a 24h TTL; success-only.
- **Pattern 5 (no-build DI pure modules)** — the one-line markdown parser is a pure,
  test-first `lib/*` module.

### Research posture
No external research dispatched — the work extends files this author built in slice 5,
the patterns are documented locally, and the one design dependency (a self-hosted
display font) is a known, bounded choice. The font must be **openly licensed and
self-hostable** (e.g. Fraunces / Newsreader / Instrument Serif); exact pick deferred to
implementation.

---

## Key Technical Decisions

- **Time-of-day is local and class-based (R8).** Compute a "mood" bucket from
  `new Date().getHours()` (e.g. dawn / day / dusk / night) at board open and toggle a
  `data-mood` (or class) on `<body>`; CSS overrides the warm-paper `:root` tokens per
  mood. No network, no animation loop, recomputed on open. The palette only *shifts
  warmth/lightness* — it never leaves the warm-paper family.
- **Colored deltas via a structured-but-still-text line (R3).** Extend the channel line
  schema with two optional fields: `tail` (a string, e.g. `"+2.3%"`) and `tone`
  (a validated enum `pos | neg`). `channel.sanitizeLines` passes only those; the sandbox
  renders `text` then a toned `tail` span. No raw HTML/number-as-markup ever crosses —
  the same text-only guarantee, just two text fields instead of one. The crypto `draw`
  splits price vs change and sets `tone` from the sign.
- **One-line = cache-the-list-daily, pick-locally-per-tab (R14–R16).** The broker fetches
  `um.fz.ax/self/one-line.md` with a **24h TTL**, caches the *parsed list*; each board
  open reads the cached list and `Math.random`-picks one line, rendered text-only at the
  board footer. Endpoint hit ~once/day; fresh line every open. Governed by pattern 16
  (validate, hardened fetch, grant, disclosure). **Opt-in:** a board setting
  (`oneLine.enabled` in `boardConfig`), default off, enabled via an edit-mode toggle that
  requests the `um.fz.ax` grant in-gesture (the slice-5 request-first discipline).
- **Responsive-only motion (R10).** CSS transitions on `transform`/`opacity` keyed to
  class changes that fire on user action (drop, mount, recall result). No keyframe
  auto-loops; gate everything behind `@media (prefers-reduced-motion: no-preference)`.
- **Reuse the soul primitives (R11–R13).** The audio puff (offscreen) and the
  `relief-claim` SW message already exist (popup uses them). The board listens for the
  let-go signal while open to fire a *visual* puff (R11), and calls `relief-claim` once
  per board-open to surface the daily relief line (R12). Recall surfacing (R13) is a
  CSS entrance on the existing ypuf-panel result rows — no new SW work.
- **Self-hosted font (R6).** Add `extension/fonts/<face>.woff2` + an `@font-face` in
  `style.css`; the masthead + headings use it, body stays system-ui. No CDN.

---

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

```
BOARD OPEN
  │
  ├─ compute mood from local clock ──→ <body data-mood> ──→ CSS swaps :root tokens (R8)
  ├─ render living masthead (wordmark · date · mood line)                         (R9)
  ├─ render panels (cards: accent dot, lift on drag, gentle entrance)        (R1,R2,R4,R10)
  │     └─ crypto line → { text:"BTC $67,041", tail:"+2.3%", tone:"pos" } ──→ sandbox  (R3)
  ├─ relief-claim (SW) → if claimable, show "N let go today — all findable"        (R12)
  └─ one-line (if enabled):                                                    (R14–R16)
        broker.load({ url: um.fz.ax/.md, ttl: 24h, parse: oneline.parse })
          ├─ fresh/stale list from cache ──→ pick random locally ──→ footer (textContent)
          └─ cold → fetch (validated, hardened) → parse list → cache → pick

WHILE BOARD OPEN
  └─ let-go happens ──→ visual puff on the board (pairs with the existing audio puff)  (R11)
```

---

## Output Structure

    extension/
      fonts/
        <display-face>.woff2     # self-hosted masthead/heading face (R6)
      lib/
        oneline.js               # pure markdown-list parser (R15), test-first
        lanes.js                 # pure lane-placement math (extracted from newtab.js; code-review follow-up)
    tests/
      oneline.test.js
      lanes.test.js

(Everything else modifies existing slice-5 files.)

---

## Implementation Units

### U1. Card craft + per-type accent + drag lift

**Goal:** Cards read as refined, tactile objects with a quiet per-type accent and a
satisfying lift while dragging.

**Requirements:** R1, R2, R4

**Dependencies:** none (builds on `fix/slice5-board-polish`)

**Files:**
- Modify: `extension/newtab/newtab.css`, `extension/newtab/newtab.js` (set a
  `data-type` on each panel cell so CSS can place the accent dot)
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:** Softer layered card shadow + tighter header/internal rhythm. A small
**accent dot** in the panel header colored per type (recall=amber, feed=slate,
crypto=sage — reuse the `--accent-*` tokens); set `cell.dataset.type = spec.type` in
`panelCell`/`mountPanel` and drive the dot from CSS. Drag lift: on `.dragging`, a slight
`transform: scale/translate` + raised shadow (transition-gated by reduced-motion). Keep
the grip + amber drop-line.

**Patterns to follow:** the existing `.panel`/`.panel-head`/`.panel-grip` styles; the
`--accent-*` tokens in `style.css`.

**Test scenarios:**
- `Test expectation: MANUAL-DOGFOOD`. Checklist: each panel shows a type-colored accent
  dot; cards have a soft, layered shadow; dragging a card lifts it and it settles on
  drop; nothing animates unprompted; with reduced-motion set, no lift transition fires.
  *(Covers AE3 partial)*

**Verification:** The board reads as crafted cards with quiet per-type identity; drag
feels lifted; calm at rest.

---

### U2. Colored crypto deltas (structured text-only line)

**Goal:** The 24h change shows ▲ green / ▼ red while the rest of the line stays calm
ink — without weakening the text-only guarantee.

**Requirements:** R3

**Dependencies:** none

**Files:**
- Modify: `extension/lib/channel.js` (`sanitizeLines` passes `tail` + validated `tone`),
  `extension/panels/sandbox.{html,js}` (render the toned tail), `extension/newtab/newtab.js`
  (crypto `draw` emits `{text, tail, tone}`)
- Test: `tests/broker-channel.test.js`

**Approach:** Add to the per-line sanitizer: keep `text` (string, as today), plus an
optional `tail` (string) and `tone` (`'pos'|'neg'` only — any other value dropped). The
sandbox renders `text` then, if present, a `<span class="tail tone-pos|tone-neg">`
(textContent, inert) — color from CSS. The crypto `fmt`/`draw` returns the price as
`text` and the signed change as `tail` with `tone` from the sign; unavailable stays
plain. No raw HTML, no number rendered as markup — two text fields, same R13 guarantee.

**Execution note:** Extend `tests/broker-channel.test.js` first — assert `sanitizeLines`
keeps `tail`/`tone`, coerces non-string `text`, and **drops an unknown `tone`** and any
non-`{text,tail,open,tone}` field.

**Patterns to follow:** the existing `sanitizeLines` (drop-unknown-fields discipline) and
the sandbox `lineNode` textContent render.

**Test scenarios:**
- `sanitizeLines([{text:'BTC $67k', tail:'+2.3%', tone:'pos', url:'x'}])` → keeps
  `{text, tail:'+2.3%', tone:'pos'}`, drops `url`.
- `tone:'evil'` (unknown) → dropped; `tone` only survives for `pos`/`neg`.
- A `tail` that is a number/object → coerced or dropped (never rendered as markup).
- `Test expectation: MANUAL-DOGFOOD`: a real crypto panel shows a green up-move and a red
  down-move; the price stays ink; an `<img onerror>` smuggled into a tail renders inert.
  *(Covers AE2)*

**Verification:** `node --test tests/broker-channel.test.js` passes; crypto deltas are
colored; the text-only guarantee holds for the new fields.

---

### U3. Materiality — paper, depth, vignette, type system

**Goal:** The board feels like a crafted physical surface: warm paper, layered depth, a
faint vignette, and a real display typeface.

**Requirements:** R5, R6, R7

**Dependencies:** U1

**Files:**
- Create: `extension/fonts/<display-face>.woff2`
- Modify: `extension/style.css` (`@font-face`, a `--font-display` token, paper texture +
  vignette on the board), `extension/newtab/newtab.css` (card depth/highlight)
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:** Self-host one openly-licensed display serif; add `@font-face` +
`--font-display`. The board gets a subtle warm paper texture (a tiled, tiny,
low-contrast noise/grain via CSS — no external image; a data-URI or a CSS gradient
grain) and a faint radial vignette. Cards get layered soft shadows + a 1px top
highlight so they read as objects catching light. Establish a type hierarchy
(`--font-display` for masthead/headings, system-ui for body).

**Patterns to follow:** the warm-paper `:root` tokens; the existing card shadow.

**Test scenarios:**
- `Test expectation: MANUAL-DOGFOOD`: the masthead renders in the display face (font
  loads locally, no network request to a CDN — check the Network tab); the board has a
  subtle paper warmth + vignette; cards read as layered objects; nothing is loud.
  *(Covers R5–R7)*

**Verification:** The board reads as a warm crafted object; the display face is
self-hosted (no CDN request); calm preserved.

---

### U4. Atmosphere — time-of-day palette + living masthead + micro-motion

**Goal:** The board feels alive and yours: the palette warms with the hour, the masthead
greets the moment, and motion answers your touch.

**Requirements:** R8, R9, R10

**Dependencies:** U3 (type system feeds the masthead)

**Files:**
- Modify: `extension/newtab/newtab.html` (masthead markup), `extension/newtab/newtab.js`
  (compute mood; render masthead date + mood line; class-gate entrance motion),
  `extension/newtab/newtab.css` (per-mood token overrides; transition rules)
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:** At board open, bucket `new Date().getHours()` into dawn/day/dusk/night and
set `<body data-mood>`; CSS overrides the warm-paper tokens per mood (warmer/lower at
night, cool/light in the morning — always within the warm-paper family). The masthead
becomes: wordmark (display face) · the date · a soft mood line keyed to the bucket
("a quiet evening"). Micro-motion: cards/results get a gentle entrance (opacity/translate
transition) on mount; the drag lift (U1) settles with a soft spring — all gated behind
`prefers-reduced-motion: no-preference` and only firing on open/user-action.

**Patterns to follow:** the existing `renderBoard`/masthead structure; the slice-5
"never update while reading" calm rule (motion only on open/action).

**Test scenarios:**
- `Test expectation: MANUAL-DOGFOOD`: opening at 9am vs 9pm shows a perceptibly warmer
  palette in the evening; the masthead shows the date + a mood line; cards enter gently
  on open; with reduced-motion, entrances are instant; nothing loops or auto-plays.
  *(Covers AE1, AE3)*

**Verification:** The board's mood shifts with the clock; the masthead feels alive;
motion is responsive-only and reduced-motion-safe.

---

### U5. Soul — the puff, the relief moment, gentle recall

**Goal:** The let-go is the board's emotional center — a visible puff, a daily relief
line, and recall that feels like gently picking something back up.

**Requirements:** R11, R12, R13

**Dependencies:** U4

**Files:**
- Modify: `extension/newtab/newtab.js` (ypuf panel: relief line via `relief-claim`;
  recall-result entrance; visual puff on let-go signal), `extension/newtab/newtab.css`
  (puff + recall entrance styles), `extension/background.js` (only if a board-visible
  let-go needs a new lightweight signal — prefer reusing an existing one)
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:** On mount, the ypuf panel calls `relief-claim`; if claimable, render a calm
"N let go today — all still findable" line (R12, dismissible, once/day — the SW already
gates the claim). Recall results surface with the gentle entrance from U4 (R13). For the
puff (R11), **lead with the reliable case**: newly-let-go items entering the recent
shelf on board open get a soft puff entrance (a visual dissipation-into-place), since
the common path is "open the new tab and see what you let go." Live-while-open puff (a
let-go in another tab while the board is showing) is a **bonus** — only wire it if a
*cheap* existing signal exists (a `storage.session`/`local` key the SW already flips on
let-go that the board can observe via `storage.onChanged`); do **not** add IndexedDB
observation or polling for it. Either way it pairs with the existing audio puff.

**Patterns to follow:** the popup's relief rendering; the existing `relief-claim` SW
handler; the offscreen audio puff.

**Test scenarios:**
- `Test expectation: MANUAL-DOGFOOD`: first board open of the day after some let-gos
  shows the relief line; it doesn't reappear later the same day; recall results surface
  gently; letting a tab go while the board is open shows a soft puff + the sound; none of
  it nags or badges. *(Covers AE5)*

**Verification:** The board *feels* the calm of letting go; relief is once-daily and
quiet; recall surfaces gently.

---

### U6. One-line — ambient daily aphorism

**Goal:** A single quiet aphorism at the board footer, fresh each open, from `um.fz.ax`,
governed exactly like a slice-5 network panel.

**Requirements:** R14, R15, R16

**Dependencies:** none (reuses the U-independent broker); ships last so the calm board
exists first

**Files:**
- Create: `extension/lib/oneline.js`, `tests/oneline.test.js`
- Modify: `extension/newtab/newtab.js` (the footer one-line: opt-in toggle, grant,
  broker load w/ 24h TTL, local random pick, text-only render, disclosure),
  `extension/newtab/newtab.html` + `.css` (footer one-line element),
  `extension/manifest.json` only if a new font/asset path needs declaring (likely not)
- Test: `tests/MANUAL-DOGFOOD.md`, `tests/oneline.test.js`

**Approach:** `lib/oneline.js` (pure, test-first): `parse(markdown) → [string]` — strip
the `>` preamble + `# one line` heading, keep non-empty aphorism lines, trim. The board
footer (opt-in via a `boardConfig.oneLine.enabled` toggle in edit mode): on enable,
request the `um.fz.ax` grant in-gesture (request-first); then `broker.load({ cacheKey:
'oneline', url: 'https://um.fz.ax/self/one-line.md', ttlMs: 24h, parse: oneline.parse })`,
`Math.random`-pick one line from the returned list, render it text-only (textContent) at
the board footer with a quiet disclosure ("from um.fz.ax"). Hits the endpoint ~once/day;
a fresh line every open from the cached list. Cold/denied/failed → no footer (calm
degrade), never blocks the board.

**Execution note:** Build `lib/oneline.js` test-first.

**Patterns to follow:** `lib/rss.js`/`lib/sourceurl.js` UMD + DI test pattern; the slice-5
broker (`brokerLoad`), the request-first grant flow, the panel disclosure + text-only
render; pattern 16.

**Test scenarios:**
- `oneline.parse(<the real .md sample>)` → the array of aphorisms, preamble + `# one line`
  heading + blank lines stripped, each trimmed.
- A markdown blob with only a heading / empty → `[]` (calm, no throw).
- A line containing markup (`<img onerror>`) → returned as inert literal text (rendered
  via textContent downstream).
- `Test expectation: MANUAL-DOGFOOD`: enabling the one-line requests the `um.fz.ax` grant
  in the same click; a quiet aphorism shows at the footer with a disclosure; reloading
  shows a *different* line with **no new network request** (served from the daily cache);
  denying the grant leaves no footer (no error); the URL is validated (a non-https/private
  source is rejected). *(Covers AE4)*

**Verification:** `node --test tests/oneline.test.js` passes; the footer shows a fresh
daily-cached aphorism, text-only, opt-in, grant-gated, with disclosure; endpoint hit
~once/day.

---

### U7. Top sites panel (added post-plan, A1-requested)

**Goal:** A calm "most-visited sites" panel (the thing Brave puts on its new tab),
on-brand because it surfaces *measured* importance rather than *declared* organization.

**Requirements:** R17

**Dependencies:** none (a panel type like rss/crypto, but `network: false`)

**Files:**
- Modify: `extension/manifest.json` (add the `topSites` + `favicon` permissions),
  `extension/newtab/newtab.js` (register the `topsites` panel type),
  `extension/newtab/newtab.css` (the top-sites list styles)
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:** Register a `topsites` panel type (host-rendered, first-party — like the
ypuf panel, not the sandbox). `mount` calls `chrome.topSites.get`, filters to `http(s)`
URLs only (`isHttpUrl`), caps the list (~8 — a glance, not a wall), renders each as an
anchor with the page title (`textContent`, inert) + a favicon from the local MV3
`_favicon` endpoint (`chrome.runtime.getURL('/_favicon/?pageUrl=…&size=32')` — a local
lookup, never a network fetch). A broken favicon drops itself quietly; an unavailable
`chrome.topSites` degrades to a calm message.

**Privacy posture (load-bearing):** `chrome.topSites` returns the user's most-visited
URLs — browsing-history-adjacent data. It **stays on-device**: the panel is `network:
false`, the favicons are the local `_favicon` lookup, and nothing about top sites is
fetched, transmitted, or written to a network source. Only `http(s)` schemes are ever
rendered/openable (no `javascript:`/`chrome:`/`data:`). This is consistent with
CONTEXT §7 (privacy) and §9 (measured, not declared, importance).

**Test scenarios:**
- `Test expectation: MANUAL-DOGFOOD`: the panel shows your most-visited sites with
  favicons; clicking one navigates; a fresh profile shows the "browse a little" empty
  state; the favicon load makes no request to a third-party host (check the Network tab);
  with `chrome.topSites` unavailable, the panel shows a calm unavailable message.

**Verification:** The panel surfaces most-visited sites, local-only, http(s)-only,
text-only titles; no network egress; calm at rest.

---

## System-Wide Impact

- **Interaction graph:** all new behavior lives in the board host (`newtab.js`) + CSS +
  the sandbox line schema (U2). The only new SW touch is a possible lightweight let-go
  signal for the visual puff (U5) — prefer reusing an existing signal. The one-line (U6)
  reuses the existing broker; **no new fetch path**.
- **Security boundary:** unchanged and reused. The one-line is "another network source"
  under pattern 16 (validate → hardened fetch → text-only → cache → disclosure → opt-in
  grant). The colored-delta line (U2) keeps the text-only guarantee — the channel test
  asserts the new `tail`/`tone` fields can't smuggle markup. The top-sites panel (U7)
  adds **no** network surface: `topSites` + `favicon` are local APIs (the favicon is the
  local `_favicon` lookup), and the panel is `network: false`.
- **Permissions:** two new local permissions — `topSites` (U7) and `favicon` (U7
  favicons). Both are on-device reads; neither opens a network or host-permission surface.
- **Privacy:** the only network addition is the opt-in one-line; everything else
  (time-of-day, craft, materiality, masthead, soul, top sites) is local/CSS. Top sites is
  browsing-history-adjacent but stays 100% on-device, http(s)-filtered, text-only. No
  external font CDN.
- **Unchanged invariants:** the recall/let-go engine, the SW broker, the 100%-local
  recall data, the slice-5 network governance, and the calm/no-interrupt rule are all
  preserved. Every motion is responsive-only + reduced-motion-safe.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| "Awesome" creeps into clutter (loses the calm identity) | Every unit holds the §5f/§9 line; the guard ("calm glance vs dashboard to manage") is in scope boundaries; motion is responsive-only; phased delivery lets A1 steer each pass. |
| The one-line leaks IP/timing to `um.fz.ax` on every tab | Cache the list with a 24h TTL + pick locally per tab → endpoint hit ~once/day; opt-in + disclosed + hardened fetch (pattern 16). |
| Colored delta weakens the text-only guarantee | `tail`/`tone` are sanitized text/enum only (no HTML); channel test asserts unknown-field + bad-tone drop. |
| Time-of-day palette drifts out of the warm-paper family (jarring) | Mood overrides only warmth/lightness within the token family; computed once at open, no live loop. |
| Display font bloats load / phones a CDN | Self-host one woff2; no external font request (dogfood-verified). |
| Motion annoys / fights calm | Responsive-only (open/action), `prefers-reduced-motion` gated, no keyframe loops. |

---

## Phased Delivery

Each phase ships standalone — stop anywhere with a coherent, calm result:

1. **Visual foundation** — U1 (craft) · U2 (colored deltas) · U3 (materiality).
2. **Life** — U4 (atmosphere) · U5 (soul).
3. **Ambient network** — U6 (one-line).

This is also the screenshot-and-steer order: the biggest visible jump (U1–U3) lands
first; A1 reacts before the more behavioral passes.

---

## Documentation / Operational Notes

- After landing, consider a `/ce-compound` note if a reusable pattern emerges (e.g. the
  structured-but-text-only line schema, or the cache-daily-pick-locally network shape).
- No backend, no telemetry. The only new runtime behavior is the opt-in one-line fetch.
- Update `tests/MANUAL-DOGFOOD.md` with a redesign section (each unit's checklist).
- **Code-review follow-ups (PR #9):** the Trello lane-placement math was extracted from
  `newtab.js` into a pure, unit-tested `extension/lib/lanes.js` (`tests/lanes.test.js`) —
  this is the documented compounding-throughline pattern (untested host-glue is where
  each slice's worst bug hides). The pre-existing crypto/rss teardown-before-
  `panelHasAccess`-resolves leak (a torn-down panel could still install a 60s CoinGecko
  interval + visibility/focus listeners) was also fixed in this PR with an `alive` guard,
  matching the top-sites/relief guards — so every async panel mount now bails if torn
  down before its access check resolves.

---

## Sources & References

- **Origin:** [docs/brainstorms/2026-06-17-ypuf-board-calm-premium-redesign-requirements.md](docs/brainstorms/2026-06-17-ypuf-board-calm-premium-redesign-requirements.md)
- Related code: `extension/newtab/newtab.{html,js,css}`, `extension/style.css`,
  `extension/panels/sandbox.{html,js}`, `extension/lib/{channel,sourceurl,rss}.js`,
  `extension/background.js`
- Prior slice: `docs/plans/2026-06-16-002-feat-ypuf-slice5-newtab-panel-board-plan.md` (PR #8)
- Learnings: `docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`
  (patterns 2, 5, 16)
- Prerequisite branch: `fix/slice5-board-polish` (add-form dismiss, content-hug height,
  scroll cap, drag reorder, multi-ticker hint)
