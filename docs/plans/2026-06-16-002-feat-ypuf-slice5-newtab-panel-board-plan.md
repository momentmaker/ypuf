---
title: "feat: ypuf slice 5 — new-tab panel widget board"
type: feat
status: active
date: 2026-06-16
origin: docs/brainstorms/2026-06-16-ypuf-slice5-newtab-panel-board-requirements.md
---

# feat: ypuf slice 5 — new-tab panel widget board

## Summary

The new-tab page becomes a calm panel board: a new `extension/newtab/` page
(`chrome_url_overrides.newtab`) hosting a responsive grid of panels. The **ypuf
panel** host-renders recall / shelf / back-now against the **existing SW message
API** (no new SW data work) via a small extracted, text-only render helper.
**Network panels (RSS, crypto) run in sandboxed
iframes** with no `chrome.*`/storage handle; the **privileged board host page** is
their broker — it validates the source URL, fetches (with the host-permission
grant), parses, caches (stale-while-revalidate), and feeds **sanitized text** to
the sandboxed panel via `postMessage`. Three new pure `lib/*` modules (URL
validator, RSS parser, swappable crypto adapter) are built test-first.

---

## Problem Frame

ypuf's let-go net (slices 1–4) has no home on the surface A1 sees most — the new
tab is still Chrome's default. §5f decided the new tab should be a calm,
glanceable **panel board** with ypuf's recall/shelf as one panel; A1 also wants a
couple of useful glances (their newsletters, a token price). Those are the first
panels that reach the network, so the load-bearing privacy rule — panels never
see browsing data — becomes a structural boundary to build, not a free
consequence. Full motivation, actors, and acceptance examples live in the origin
doc (see Sources & References).

---

## Requirements

Traces to the origin requirements doc (R1–R13). Plan-relevant grouping:

- R1. The board is the new-tab page, **calm by design** (quiet, glanceable, never
  notifying/badging; a panel never updates while the board is open); **toggleable**
  via a board minimal-mode (see Key Technical Decisions for the Chrome limitation).
- R2. An internal **panel-source interface** (render / configure / fetch+refresh /
  disclose). R9/R12/R13 are enforced **structurally** — the broker is the sole
  fetch/validate/render path and the sandbox removes network/storage capability from
  panels — *not* by the interface signature (a JS object shape can't enforce isolation).
  "Closed in v1" = no plugin execution, not no user-chosen sources.
- R3. ypuf panel present by default; fresh install shows it + an "add a panel"
  affordance; board config persists locally.
- R4. **ypuf panel** = recall/shelf/back-now, a wider-column rendering reusing the
  message API (+ a small extracted, text-only render helper). Zero network.
- R5. **RSS feed panel** — A1 adds a feed URL; latest headlines, click-to-open.
- R6. **Crypto price panel** — glanceable price; **provider swappable** behind the
  fetch (CoinGecko v1); **degrades calmly** (last-known + "unavailable").
- R7. Compose via a board **edit mode**: add/configure/remove/toggle + reorder
  (drag-to-swap + keyboard nudge); no free-form drag.
- R8. Multiple instances per type, each labelled.
- R9. **Isolation is structurally enforced** — networked panels run in an isolated
  context with no handle to IndexedDB/`chrome.storage`/`chrome.*`.
- R10. Direct fetch (no backend); opt-in; per-panel **disclosure** of source host +
  what the third party learns; CoinGecko disclosed as ypuf-chosen infra.
- R11. **Cache + stale-while-revalidate**, per-type TTL (RSS ~30 min, crypto ~60 s),
  success-only; cold cache → calm placeholder, never blocks the board.
- R12. **Source-URL validation** (https-only, block private/loopback/link-local IPs,
  reject `javascript:`/`data:`/`file:`) before any fetch.
- R13. **Safe text-only rendering** of fetched content (no `innerHTML`).

**Origin actors:** A1 (tab-drowning knowledge worker / board user)
**Origin flows:** F1 (open → board), F2 (compose), F3 (network panel refresh)
**Origin acceptance examples:** AE1 (R1,R3), AE2 (R5), AE3 (R6), AE4 (R9), AE5/AE9
(R11), AE6 (R10), AE7 (R7), AE8 (R8), AE10 (R12), AE11 (R13)

---

## Scope Boundaries

- **Arbitrary user-added plugin *types* / a plugin marketplace** — out (interface
  built but closed; opens later).
- **Other ambient panels** (weather, calendar, notepad, clock) — out for v1.
- **The jivx vocab panel** and **board-config sync** — out (later).
- **Runtime AI/LLM** — out (§6).
- **A backend / fetch-proxy** — out; the board host fetches directly.
- **User-facing TTL/refresh knobs** — out (tuned defaults).

### Deferred to Follow-Up Work

- A "clear all panel caches" surface — if/when a global privacy-clear is added, panel
  caches are a store it must reach (learnings pattern 13/14). Not in v1.
- Updating the MV3 patterns doc with a 16th pattern (network-panel isolation) — a
  post-landing `/ce-compound`, not part of this slice.

---

## Context & Research

### Relevant Code and Patterns

- **`extension/manifest.json`** — has `optional_host_permissions: ["<all_urls>"]`
  (the grant mechanism) and `permissions` incl. `storage`/`scripting`. **Lacks**
  `chrome_url_overrides`, a `sandbox` key, and `content_security_policy.sandbox` —
  all net-new for slice 5.
- **`extension/popup/popup.{html,js}` + `extension/style.css`** — the recall/shelf/
  snooze UI + `:root` calm design tokens the ypuf panel re-renders; `itemRow`,
  `render`/`loadRecent`, `renderSnooze`/`snoozedRow`/`showResnooze`, the
  `textContent`-only rule, and the stale-async seq-guard. `body.popup{width:340px}`
  is popup-fixed — the board needs wider-column variants.
- **`extension/background.js`** — the `onMessage` router (`sender.id===chrome.runtime.id`
  gate + the `respond` always-answer wrapper); the **19 reusable message types** the
  ypuf panel calls (`list-recent`, `recall-search`, `recall-open`, `restore-set`,
  `snooze-list`/`-wake`/`-resnooze`, `whats-indexed`, `auto-summary`, …); the
  `session`/`local` storage helpers; the `chrome.permissions.request` +
  `permissions.onRemoved` host-grant flow (`enableAuto`/`autoDisable`).
- **`extension/overlay/overlay.js`** — the closed-shadow-root + `textContent`-only
  render precedent (DOM isolation, **not** capability isolation — see KTD).
- **`extension/offscreen/offscreen.{html,js}`** — the "separate extension HTML page
  + own JS + `sender.id` trust gate" shape, the template for `newtab/` and a
  sandboxed `panels/` page.
- **`extension/lib/cluster.js` / `snooze.js`** — the UMD wrapper + DI test pattern
  (`tests/cluster.test.js` `opts()`/table tests) for the new pure modules.

### Institutional Learnings

`docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`
(15 patterns). Bearing on slice 5:

- **Pattern 1 (SW-as-broker; render-only UI; remove capability structurally):** the
  model for R9 — the board host is the new broker; prefer the mechanism that
  *removes* capability (sandboxed iframe) over a coding convention. The new-tab page
  is extension-origin (more privileged than the overlay), so an `innerHTML` path or
  an `allow-same-origin` panel iframe is the single most likely highest-severity
  finding — exactly the new seam.
- **Pattern 15 (validate caller-supplied identifiers against host-owned state):** R12
  — validate a feed URL before storing it as fetchable; "open this headline"
  intersects against URLs the host itself parsed, not whatever the panel claims.
- **Pattern 6 (always answer async onMessage):** every new board/fetch handler must
  answer even on throw — calm degradation (R6/R11) silently becomes a hung panel
  otherwise.
- **Pattern 5 (no-build DI pure modules):** the URL validator, RSS parser, and crypto
  adapter are ideal DI-tested pure `lib/*` modules.
- **Pattern 2 (persist timestamps; never memoize a rejection):** R11 cache freshness
  is `now - fetchedAt` from a stored timestamp; cache successes only, keep last-known
  on failure, never memoize a poisoned fetch.
- **Patterns 13/14 (forget consistency):** reassuring — panel config/caches hold no
  recall data, so page-forget does not fan into the board. A future global clear must
  reach panel caches (deferred).
- **Pattern 7 (serialize shared-key writes):** board config can race if two new-tab
  pages mutate `boardConfig` concurrently — funnel config writes through one chain.

### External References

None used — local + adjacent patterns (closed shadow root, separate HTML page,
host-permission flow) + the research grounding covered the MV3 sandbox/CSP specifics.

---

## Key Technical Decisions

- **Isolation = sandboxed iframe + board-host-as-broker.** Network panels (RSS,
  crypto) render in a sandboxed iframe (`allow-scripts`, **no** `allow-same-origin`
  → null origin, no `chrome.*`/storage/`window.parent` reach). A sandboxed panel
  *can't* do a host-permission-backed fetch, so the **privileged board-host page**
  (extension origin, holds the grant) does the fetch/validate/parse/cache and posts
  **sanitized text** to the panel; the panel posts back only validated intents. The
  **service worker stays out of the network path** (it remains the broker for recall
  data via the existing messages). This resolves origin Outstanding-Question
  "isolation mechanism" per learnings patterns 1 + 15. *(see origin: R9)*
- **Only network panels are sandboxed; the ypuf panel is host-rendered — but its
  strings are still attacker-*influenced*.** R9's iframe isolation applies to
  *networked* panels (attacker-controlled feed/crypto bytes). The ypuf panel renders
  in the privileged host page against the 19 shipped messages — BUT recall
  titles/URLs are page-derived (`background.js` builds records from `document.title`),
  so a page can set `document.title` to `<img onerror=…>`. The host-rendered ypuf
  panel therefore **renders every string via `textContent`** (R13 binds to it too),
  and the host-render helper is extracted (`lib/shelf-render.js`) so the text-only
  guarantee is **unit-testable** (an automated XSS-title assertion, not a dogfood
  line). An `innerHTML` in the privileged host is full-extension XSS.
- **"Toggleable" = a board minimal-mode, not a conditional override.** Chrome doesn't
  allow a *conditional* `chrome_url_overrides` — once set, the board is always the new
  tab. v1 ships a board **minimal mode** (a near-blank calm page that keeps the engine)
  for users who don't want the full board; truly restoring Chrome's native new tab is
  done via Chrome's extension settings (documented, not programmatic). *(see origin:
  R1)*
- **Fetch lives in the board-host page, not the SW.** The host page is privileged
  (extension origin + host grant) and is the natural broker for its panels; keeping
  fetch off the SW avoids waking/holding the worker for network I/O and keeps the SW
  the single broker for *recall* data only.
- **Cache: `chrome.storage.local` `{ value, fetchedAt }` per panel, success-only,
  `now - fetchedAt` TTL.** Survives restart so a warm new-tab is instant; never caches
  a failed fetch; cold cache shows a calm placeholder (Pattern 2 + R11).
- **Per-origin host grants** (`chrome.permissions.request({origins:[feedOrigin]})`) —
  a **net-new** grant helper, NOT a call into the popup's `enableAuto` (which requests
  broad `<all_urls>`). "Reuse the popup flow" = the **in-gesture discipline**, not the
  function. The helper **short-circuits if `<all_urls>` is already held** (a user who
  enabled auto-let-go needs no new grant), else requests the feed origin; a **denied
  grant** shows the panel a "needs access" state, never a silent-empty. Per-origin is
  the smaller privacy surface (origin: Dependencies — was "open"; resolved here).
- **The 3 new lib modules are pure + test-first** (`lib/sourceurl.js` validator,
  `lib/rss.js` parser, `lib/cryptoProvider.js` adapter) — but per the learnings
  meta-lesson, green pure-module tests are necessary-not-sufficient; review attention
  concentrates on the host↔sandbox↔network glue.

---

## Open Questions

### Resolved During Planning

- *Isolation mechanism* → sandboxed iframe + host-as-broker (KTD).
- *Where fetch lives* → the board-host page (KTD).
- *Cache location/shape* → `chrome.storage.local` `{value, fetchedAt}`, success-only.
- *Host-permission model* → per-origin grants reusing the popup flow.
- *"Toggleable" semantics* → board minimal-mode (Chrome can't conditionally override).

### Deferred to Implementation

- Exact RSS format coverage (RSS 2.0 / Atom / JSON Feed) and whether v1 attempts
  feed-discovery from a site URL vs requires the raw feed URL — start with RSS+Atom,
  raw-URL only.
- Exact TTL constants (RSS ~30 min, crypto ~60 s) — dogfood-tunable. The open-board
  refresh model is **resolved** (U6: in-page interval that stages + flushes on refocus,
  with an "as of HH:MM" stamp); only the constants are deferred.
- The CoinGecko endpoint shape + batching multiple tokens in one call (the adapter's
  internal detail).
- The precise `postMessage` envelope *fields* between host and sandboxed panel — an
  implementation detail of U4's channel. (The channel's **security** properties —
  source/target validation, sanitized-only payload — are specified in U4, not deferred.)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review,
> not implementation specification. The implementing agent should treat it as
> context, not code to reproduce.*

```
                         NEW-TAB BOARD PAGE  (extension origin, privileged)
                         ┌───────────────────────────────────────────────┐
 chrome_url_overrides →  │  newtab.js — board host + BROKER               │
                         │   • loads boardConfig (chrome.storage.local)   │
                         │   • renders responsive grid + edit mode        │
                         │                                                │
   ypuf panel (trusted, host-rendered)   network panel (per source)       │
   ┌──────────────────────────┐          host-side adapter:               │
   │ recall / shelf / back-now│          • sourceurl.validate (R12)       │
   │ via SW messages (reuse)  │          • fetch (host grant)             │
   └─────────┬────────────────┘          • rss.parse / cryptoProvider     │
             │ chrome.runtime             • cache {value, fetchedAt}      │
             ▼  .sendMessage              • postMessage(sanitized text) ──┐│
   ┌──────────────────┐                                                   ││
   │ SERVICE WORKER   │  ← recall data only, never the network          ││
   │ (existing broker)│                                                  ▼│
   └──────────────────┘                          ┌──────────────────────────┐
                                                 │ SANDBOXED IFRAME panel    │
   THIRD PARTY (feed host / CoinGecko)           │ allow-scripts, NO         │
        ▲   host page fetch (validated,          │ allow-same-origin →       │
        └── only the configured source)          │ null origin, no chrome.*  │
                                                 │ renders TEXT only (R13);  │
                                                 │ posts back validated      │
                                                 │ intents (open headline)   │
                                                 └──────────────────────────┘
```

The board host is the only privileged context; the SW brokers recall data; the
sandboxed panel can render but cannot reach storage, `chrome.*`, the parent DOM, or
the network with the extension's grant.

---

## Output Structure

    extension/
      newtab/
        newtab.html        # the board page (chrome_url_overrides.newtab)
        newtab.js          # board host + broker (grid, edit mode, fetch/cache)
        newtab.css         # board layout (reuses :root tokens from style.css)
      panels/
        sandbox.html       # the sandboxed-iframe render surface (manifest sandbox)
        sandbox.js         # text-only render + postMessage intents (no chrome.*)
      lib/
        shelf-render.js    # host-render helpers (text-only, unit-testable)
        sourceurl.js       # R12 URL validator (pure)
        channel.js         # host↔sandbox envelope build/validate (pure)
        rss.js             # RSS/Atom parser → text-only fields (pure)
        cryptoProvider.js  # swappable crypto adapter (CoinGecko v1, pure-ish)
    tests/
      shelf-render.test.js
      sourceurl.test.js
      broker-channel.test.js
      rss.test.js
      cryptoProvider.test.js

---

## Implementation Units

### U1. New-tab board page + manifest + sandbox plumbing

**Goal:** The board renders as the new tab — an empty calm responsive grid with an
"add a panel" affordance — and the sandbox/CSP plumbing exists for later units.

**Requirements:** R1, R3 (shell), R9 (sandbox plumbing)

**Dependencies:** None

**Files:**
- Modify: `extension/manifest.json`
- Create: `extension/newtab/newtab.html`, `extension/newtab/newtab.js`,
  `extension/newtab/newtab.css`
- Create: `extension/panels/sandbox.html`, `extension/panels/sandbox.js`
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:**
- manifest (name the exact shapes): `"chrome_url_overrides": { "newtab":
  "newtab/newtab.html" }`; `"sandbox": { "pages": ["panels/sandbox.html"] }`; and
  `"content_security_policy": { "extension_pages": "<default — no inline/remote
  script>", "sandbox": "sandbox allow-scripts; default-src 'none'; script-src 'self';
  object-src 'none'; connect-src 'none'; img-src 'none'; child-src 'none'; frame-src
  'none';" }`. The `default-src 'none'` + explicit `connect-src 'none'`/`img-src 'none'`
  **structurally remove the panel's ability to make its own network request** (no
  `fetch`/`XHR`/`<img>` egress — R9 requires the capability be *absent*, not merely
  unused); the panel loads only its own bundled `sandbox.js`, and all data arrives via
  the host's `postMessage`.
- `newtab.html`/`newtab.js`: the board shell — a responsive grid + an "add a panel"
  affordance; renders empty for now. **Grid model (decide here):** max **3 columns** on
  a wide viewport, collapsing to 2/1 as width drops; panels flow top-to-bottom within
  columns. **No hard panel cap** — R8's "multiple instances per type" is honored in full
  (A1's 5 feeds + ypuf + crypto all fit); clutter is governed by *behavior* (no
  badging/notifying, fixed-height cells, the calm rules) and the natural top-to-bottom
  flow, not an arbitrary count. Reuse `:root` tokens from `style.css`; calm by design
  (no animation/auto-play).
- `sandbox.html`/`sandbox.js`: a minimal sandboxed render surface that echoes a
  `postMessage` payload as `textContent` — proves the host↔sandbox channel + that the
  sandbox has no `chrome.*` (it's null-origin).

**Patterns to follow:** `extension/offscreen/offscreen.{html,js}` (separate HTML page
+ own JS); `extension/style.css` `:root` tokens; the overlay's `textContent` rule.

**Test scenarios:**
- `Test expectation: MANUAL-DOGFOOD` — chrome-mounted surface. Checklist: opening a
  new tab shows the board with no console errors; the grid + "add a panel" affordance
  render; a sandboxed test panel echoes a posted string as text and `chrome` is
  `undefined` inside it; **a `fetch()` / `new Image().src` from inside the sandbox is
  blocked by CSP (no network egress)**; **a forged intent posted from an unexpected
  source/frame is dropped by the host** (the real cross-frame `event.source` check the
  pure `broker-channel` test can't exercise). *(Covers AE1, AE4)*

**Verification:** A new tab renders the calm empty board; the sandboxed iframe
receives a `postMessage` and has no `chrome.*` access.

---

### U2. Board config + edit mode

**Goal:** A1 can add/configure/remove/toggle/reorder panels; the arrangement
persists; a minimal-mode toggle exists.

**Requirements:** R3, R7, R1 (minimal mode)

**Dependencies:** U1

**Files:**
- Modify: `extension/newtab/newtab.js`, `extension/newtab/newtab.css`
- Modify: `extension/background.js` (board-config message handlers, if brokered)
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:**
- `boardConfig` in `chrome.storage.local` (panels: type + per-instance config + order;
  plus a `minimalMode` flag). Multiple new-tab pages **can** mutate it concurrently, so
  writes are serialized — **not** "if they can race": route every config write through
  `board-save-config`/`board-get-config` SW messages (the SW is the single writer,
  `respond` pattern) so two open boards can't clobber each other (pattern 7).
- Edit mode: a **quiet, persistent "edit" affordance** (a small gear/pencil in a board
  corner — discoverable but calm, the board's one piece of resting chrome) toggles
  per-panel controls (configure, remove, reorder handles) + the add-panel affordance;
  exiting hides them. Reorder = drag-to-swap within grid slots + keyboard
  up/down/left/right nudge (left/right swaps with the adjacent column slot; focus order
  is row-major). **On remove, focus moves to the next panel (or the add affordance if
  none).** Panels are `role="region"` with an `aria-label` (the source label, R8); each
  sandboxed iframe carries a `title`.
- **Add-panel flow (decide here):** the affordance opens an **inline** picker (not a
  modal) — choose a panel type → an inline config form (e.g. feed URL / token list) →
  an **"Add panel" button**. On click, **mirror the popup's grant ordering exactly**
  (`popup.js` requests *first*, persists in the callback): (1) run **synchronous**
  `sourceurl.validate` only (a pure function — no `await`); (2) for a network type, call
  `chrome.permissions.request` as the **next synchronous statement** (any `await` before
  it consumes the user gesture and the grant throws "must be called during a user
  gesture"); (3) persist the panel config **inside the grant callback**, after the grant
  resolves. A denied grant still adds the panel in a "needs access" state (U4/U5).
- Minimal mode: a setting that renders a near-blank calm page (keeps the engine) — a
  single quiet line + a **"show board" affordance to exit** minimal mode, plus an
  in-app link to Chrome's extension settings for users who want Chrome's *native* new
  tab back (minimal mode is ours, not Chrome's — see the R1/AE1 note). Never a dead
  blank page with no way out.
- **Guard the existing `permissions.onRemoved` listener** (`background.js`): it
  currently calls `autoDisable()` on *any* origin removal — so revoking a feed panel's
  per-origin grant would silently disable auto-let-go (the hero feature). Gate it to
  `autoDisable()` only when the removed set actually drops `<all_urls>` (re-check
  `hasHostAccess()` / `perms.origins.includes('<all_urls>')`), not on a feed-origin
  removal.

**Patterns to follow:** the `local` storage helper + `boardConfig` paralleling
`autoEnabled`/`searchSnapshot`; the popup's seq-guard for stale async renders.

**Test scenarios:**
- `Test expectation: MANUAL-DOGFOOD`. Checklist: add a panel via the affordance →
  appears + persists across new-tab opens; enter edit mode → reorder (drag + keyboard)
  / remove / toggle → persists (AE7); two new-tab pages open + a reorder in one →
  no lost-write in the other; minimal mode → near-blank calm board, engine still runs.
  *(Covers AE7)*

**Verification:** Board composition persists; concurrent board tabs don't clobber
config; minimal mode renders calm.

---

### U3. ypuf panel (host-rendered, reuses the message API)

**Goal:** The recall / recently-let-go shelf / back-now panel on the board, at column
width, reusing the existing SW message API.

**Requirements:** R4, R3

**Dependencies:** U1, U2

**Files:**
- Create: `extension/lib/shelf-render.js` (host-render helpers, text-only)
- Create: `tests/shelf-render.test.js`
- Modify: `extension/newtab/newtab.js`, `extension/newtab/newtab.css`
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:**
- Render recall search + the recent shelf + the back-now/snoozed groups against the
  shipped messages (`recall-search`, `list-recent`, `recall-open`, `restore-set`,
  `snooze-list`/`-wake`/`-resnooze`). **Zero new SW work** — the data path is reused.
- **Extract a small host-render helper** (`lib/shelf-render.js`, UMD/DI like
  `lib/cluster.js`): the row/group builders that turn a recall record into DOM, every
  page-derived string written via `textContent`. The extraction is justified **by
  testability, not reuse** — it lets an automated test assert the text-only guarantee
  on the *host-rendered* panel (a record whose `title` is `<img onerror=…>` renders
  inert), closing the privileged-context XSS seam the KTD calls out. This slice does
  not require touching `popup.js` (it may keep its inline rendering).
- Host-rendered (not sandboxed) — but page-*influenced* (recall titles are page-set),
  so the `textContent` guarantee is load-bearing here, not cosmetic.

**Patterns to follow:** `popup.js` `itemRow`/`render`/`renderSnooze`/`snoozedRow`;
`style.css` `.recent-item`/`.snooze-*`/`.set-*` + tokens (wider-column variant).

**Test scenarios:**
- Automated (`tests/shelf-render.test.js`): a record whose `title`/`url` contains
  `<img src=x onerror=alert(1)>` / `"><script>` renders as **inert text** — the
  produced node's `textContent` equals the raw string and no child element is injected
  (asserts the privileged host can't be XSS'd by a page-set title). DI like
  `tests/cluster.test.js`, minimal DOM stub or `textContent`-only builders.
- `Test expectation: MANUAL-DOGFOOD`. Checklist: the ypuf panel shows recent let-go
  items + back-now; recall search returns + opens a result; the panel is present by
  default on a fresh board. Pure data path is already covered by slices 1–3 unit
  tests. *(Covers AE1)*

**Verification:** The ypuf panel surfaces recall/shelf/back-now and opens results,
reusing the existing messages with no new SW handlers.

---

### U4. Panel-source interface + the network broker

**Goal:** The host-side panel contract + the broker pipeline (validate → fetch →
parse → cache → sandboxed render), with the URL validator built test-first.

**Requirements:** R2, R9, R10, R11, R12, R13

**Dependencies:** U1

**Files:**
- Create: `extension/lib/sourceurl.js`, `tests/sourceurl.test.js`
- Create: `extension/lib/channel.js` (pure host↔sandbox envelope build/validate),
  `tests/broker-channel.test.js`
- Modify: `extension/newtab/newtab.js` (the broker + the panel-source contract),
  `extension/panels/sandbox.js` (the render channel)
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:**
- **Panel-source contract** (host-side): each panel type declares `{ needsNetwork,
  configSchema, fetch(config)→raw, parse(raw)→renderData (text-only), disclose()→host }`
  and a render target (host vs sandbox). Network panels route through the broker — and
  *cannot* do otherwise: the sandbox egress-CSP + the broker-as-sole-fetch-path make it
  structural, not a contract promise a panel could break (see R2).
- **Broker** (in `newtab.js`): on refresh, `sourceurl.validate` the configured URL
  (R12), check the cache (`{value, fetchedAt}`, `now - fetchedAt` vs per-type TTL,
  stale-while-revalidate), fetch only the configured source **with `credentials:'omit'`,
  `referrerPolicy:'no-referrer'`, and `redirect:'error'`** (never leak a cookie or the
  `chrome-extension://` referer to the feed host — R10; and never silently follow a 3xx
  from a validated public host to a private/loopback IP — the SSRF-redirect bypass;
  DNS-rebind remains an accepted residual `redirect:'error'` materially reduces), parse
  to text-only renderData, cache **successes only** — the cache `value` is the **parsed
  text-only struct, never the raw response/HTML** — and `postMessage` the sanitized data
  to the panel's sandboxed iframe. A **single-flight marker** (`{fetchingAt}` beside the
  cache key) coalesces concurrent refreshes of the same source so N open boards don't
  stampede the host. Cold cache → calm placeholder, never block the board. Validate
  panel→host intents against host-owned state (pattern 15). **Panel height is bounded** —
  a feed panel renders at most the latest **~8 headlines** in a fixed-height cell (no
  50-item walls); the persistent disclosure line sits in the cell **footer** and is
  *not* counted in the ~8; overflow is dropped, not scrolled.
- **`lib/sourceurl.js`** (pure, test-first): https-only, reject `javascript:`/`data:`/
  `file:`, block private/loopback/link-local IP ranges (SSRF).
- **`sandbox.js`**: renders the posted renderData as `textContent` only (R13); posts
  back only intent messages (e.g. "open headline N"). **postMessage is hardened both
  ways** (`lib/channel.js` builds/validates the envelope): a null-origin sandbox forces
  `targetOrigin: '*'`, so the host posts to the *specific* `iframe.contentWindow` and
  **puts no secret in the message** (only already-sanitized panel text); the host's
  inbound listener **validates that `event.source` is that panel's known
  `iframe.contentWindow`** and checks the envelope shape before acting on any intent,
  and the sandbox checks `event.source === window.parent`.

**Execution note:** Build `lib/sourceurl.js` test-first — it's a pure security control.

**Patterns to follow:** `lib/cluster.js` UMD + `tests/cluster.test.js` table tests;
SW-as-broker (pattern 1) recast as host-as-broker; pattern 15 intersect; pattern 2
success-only cache.

**Test scenarios:**
- Happy: `sourceurl.validate('https://example.com/feed')` → ok; a normal https URL
  passes.
- Edge/security: `http://192.168.1.1/feed`, `http://127.0.0.1/x`, `http://[::1]/x`,
  `http://169.254.0.1/x` → rejected (private/loopback/link-local). *(Covers AE10)*
- Edge/security: `javascript:alert(1)`, `data:...`, `file:///etc/passwd` → rejected.
  *(Covers AE10)*
- Edge: a malformed / non-URL string → rejected, no throw.
- Automated (`tests/broker-channel.test.js`): unit-tests the **pure** `lib/channel.js`
  kernel — the host→sandbox envelope carries only sanitized text fields (no raw
  URL/HTML); a panel→host "open headline N" intent is **intersected against the
  host-parsed link set** (pattern 15) — an out-of-range or forged index/URL is rejected,
  an in-range one resolves to the host's own URL; a malformed envelope is dropped. Pure
  objects, DI like `tests/cluster.test.js`. **This proves the intent-validation *logic*,
  not the real cross-frame boundary** — the `event.source ===` identity check against a
  live sandbox `contentWindow` is a browser-runtime property, verified by the
  forged-intent MANUAL-DOGFOOD step (U1), not here. (`channel.js` stays a thin pure
  module because the host page `newtab.js` is not node-requireable — extracting the
  kernel is what makes the security logic testable at all.)
- `Test expectation: MANUAL-DOGFOOD` for the broker glue: a sandboxed panel receives
  sanitized text and never gets a raw URL/HTML; cold cache shows a placeholder and the
  board renders unblocked; within-TTL re-open serves cache with no request. *(Covers
  AE4, AE5, AE9)*

**Verification:** `node --test tests/sourceurl.test.js tests/broker-channel.test.js`
passes (SSRF + scheme table; envelope sanitation + intent-intersect + source check);
the broker serves cache instantly, fetches only the configured validated source with
`credentials:'omit'`/`no-referrer`, and the sandboxed panel only ever receives
sanitized text.

---

### U5. RSS feed panel

**Goal:** A1 adds a feed URL; the panel shows the latest headlines (sandboxed,
text-only); click-to-open via a validated intent; per-origin grant; disclosure.

**Requirements:** R5, R8, R9, R10, R12, R13

**Dependencies:** U4

**Files:**
- Create: `extension/lib/rss.js`, `tests/rss.test.js`
- Modify: `extension/newtab/newtab.js` (RSS panel type + add-feed config + grant),
  `extension/panels/sandbox.js` (headline render)
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:**
- `lib/rss.js` (pure, test-first): parse RSS 2.0 + Atom (raw feed URL only in v1) into
  `[{ title, link, source, time }]` **text fields** — no HTML passthrough. The parser
  reads node values via **`.textContent` only, never `.innerHTML`**, and never
  re-serializes markup; a `<title>` carrying `<b>x</b>` / `<img onerror=…>` comes out
  as the inert text `x` / the literal string. (Uses `DOMParser` in the host context;
  the pure parser takes a string so it's node-testable.)
- RSS panel type: add-feed flow validates the URL (U4/R12), then grants access via a
  **net-new per-origin grant helper** (`chrome.permissions.request({origins:[feed
  origin]})`) that **short-circuits if `<all_urls>` is already held** (auto-let-go users
  need no prompt) — **not** a call into `enableAuto` (which requests broad `<all_urls>`);
  the in-gesture *timing* follows the popup precedent, the *scope* does not. Then
  fetches via the broker, renders headlines in the sandboxed panel; "open headline"
  intent is intersected against the host-parsed links (pattern 15) before
  `chrome.tabs.create`. A **denied grant** leaves the panel in a quiet "needs access"
  state with a re-request affordance — never a silent empty panel.
- Multiple feeds = multiple instances, labelled by source host (R8).
- Disclosure (R10): the panel shows its source host + "fetches this feed directly;
  the host sees your IP/timing."
- Error states (R11 calm degrade): **warm-fail** (had cache, refresh failed) keeps the
  last headlines + a quiet "couldn't refresh"; **cold-fail** (never fetched / grant
  denied) shows a calm "needs access" or "couldn't load `<host>`" placeholder — never
  an error badge, never blocks the board.

**Execution note:** Build `lib/rss.js` test-first (incl. an XSS-title fixture).

**Patterns to follow:** `lib/cluster.js` UMD + DI tests; the popup host-grant flow;
the broker from U4; `textContent` render.

**Test scenarios:**
- Happy: parse a well-formed RSS 2.0 + an Atom feed → `[{title,link,source,time}]`
  text fields.
- Edge: a feed item `<title>` containing `<img src=x onerror=…>` → parsed as inert
  text; rendered as text in the sandbox. *(Covers AE11)*
- Edge: malformed/empty feed → returns `[]`, no throw (calm).
- `Test expectation: MANUAL-DOGFOOD`: add a feed by URL → headlines appear, clicking
  opens (AE2); a second feed → a second labelled panel, remove one leaves the other
  (AE8); the disclosure shows the source host (AE6); adding a private-IP/`javascript:`
  feed URL is rejected (AE10).

**Verification:** `node --test tests/rss.test.js` passes (incl. XSS title); the RSS
panel renders headlines from a real feed in a sandbox, opens via validated intent, and
discloses its source.

---

### U6. Crypto price panel

**Goal:** A glanceable token price via a swappable provider (CoinGecko v1) that
degrades calmly; token config; disclosure.

**Requirements:** R6, R8, R9, R10, R11

**Dependencies:** U4

**Files:**
- Create: `extension/lib/cryptoProvider.js`, `tests/cryptoProvider.test.js`
- Modify: `extension/newtab/newtab.js` (crypto panel type + token config),
  `extension/panels/sandbox.js` (price render)
- Test: `tests/MANUAL-DOGFOOD.md`

**Approach:**
- `lib/cryptoProvider.js`: a swappable provider adapter — a `{ fetchPrices(tokens) →
  [{ token, price, change24h }] }` contract with a CoinGecko implementation (public
  no-key endpoint; batch tokens in one call). Pure parse of the provider response;
  the actual fetch is the broker's (host).
- Crypto panel type: glanceable price + 24h change in the sandboxed panel, periodic
  (not tick-by-tick); **degrade calmly** — on rate-limit/unreachable, keep last-known
  + a quiet "price unavailable", never errors/badges (success-only cache, R11).
- **Refresh while the board is open (swap-on-refocus):** the host page only exists while
  a board tab is open and the SW is excluded from the network path, so a left-open board
  refreshes via an **in-page `setInterval`** (host-side, ~the crypto TTL of 60 s) that
  **stages** the new value *without redrawing*, then **flushes the staged value on the
  next refocus** — a `visibilitychange`→visible / window `focus` event (the "looked away
  and came back" seam, the one moment the user is provably not mid-glance). This gives
  "never update while reading" a concrete, testable trigger instead of an undefined
  "mid-interaction" gate. A quiet **"as of 3:42pm"** stamp means a glance is never
  *silently* stale. Background refresh of a *closed* board is **out of scope** (no SW
  network); AE3/AE5 "updates on a schedule" = staged on the interval, surfaced on
  refocus, never flickering under the reader's eyes.
- Disclosure (R10): CoinGecko named as **ypuf-chosen infrastructure** (not a source A1
  added) + what it learns.

**Execution note:** Build `lib/cryptoProvider.js` test-first (response parse + the
degrade path).

**Patterns to follow:** `lib/cluster.js` UMD + DI tests; the broker; pattern 2
success-only cache + keep-last-known.

**Test scenarios:**
- Happy: parse a CoinGecko-shaped response for `[btc, eth]` → `[{token,price,change24h}]`.
- Edge: a rate-limit / error response → adapter signals failure (no throw); the panel
  keeps last-known + "price unavailable". *(Covers AE3)*
- Edge: an unknown token → handled gracefully (empty/unavailable, no throw).
- `Test expectation: MANUAL-DOGFOOD`: add a token → glanceable price with an "as of
  HH:MM" stamp; a left-open board stages a new value and swaps it in on refocus (tab
  blur→focus), never mid-glance (AE3); provider down → last-known + "unavailable", no
  error (AE3); disclosure names CoinGecko as ypuf-chosen infra (AE6).

**Verification:** `node --test tests/cryptoProvider.test.js` passes (parse + degrade);
the crypto panel shows a calm price and degrades without errors when the provider
fails.

---

### U7. Disclosure UX, cold-cache/calm polish, and dogfood

**Goal:** Finish the per-panel disclosure surface, the calm rules, the cold-cache
placeholder, and the slice-5 manual checklist.

**Requirements:** R1 (calm), R10, R11

**Dependencies:** U5, U6

**Files:**
- Modify: `extension/newtab/newtab.css`, `extension/newtab/newtab.js`,
  `extension/panels/sandbox.js`
- Modify: `tests/MANUAL-DOGFOOD.md`

**Approach:**
- Disclosure (R10): a quiet, persistent per-panel line ("fetches `<host>` · sees your
  IP & timing"; crypto: "CoinGecko, ypuf-chosen") in the **cell footer** — always
  visible, never a tooltip, never interactive; below the content, not counted in a
  feed's ~8-headline budget (U4).
- Calm (R1): enforce "a panel never updates its visible content **while the user is
  reading**" — refresh happens on open and (for short-TTL panels) on an in-page interval
  that **stages** updates and **flushes them on refocus** (`visibilitychange`→visible /
  window `focus`), never mid-glance; a quiet "as of HH:MM" stamp keeps a glance honest;
  no animation/auto-play.
- Cold-cache placeholder (R11): a calm "loading…" that never blocks the board.
- Add the **Slice 5** section to `tests/MANUAL-DOGFOOD.md` covering the board, edit
  mode, the ypuf panel, RSS, crypto, isolation, URL validation, XSS render, cold cache,
  disclosure, and minimal mode.

**Patterns to follow:** `style.css` calm tokens; the overlay/popup `textContent` rule.

**Test scenarios:**
- `Test expectation: MANUAL-DOGFOOD` — visual/chrome surface. Checklist entries per the
  Approach (disclosure visible; no update-while-reading; cold-cache placeholder
  non-blocking; minimal mode). *(Covers AE6, AE9)*

**Verification:** Each network panel discloses its source + what the third party
learns; the board never flickers while read; cold cache shows a calm placeholder; the
dogfood checklist covers the slice.

---

## System-Wide Impact

- **Interaction graph:** the board host (`newtab.js`) is a new privileged context that
  brokers panels; it talks to the SW (recall messages, reused) and to sandboxed panels
  (`postMessage`). New SW messages, if any, are board-config only (`board-*`) — never
  network fetch.
- **Error propagation:** a panel fetch/parse failure must never throw out of the broker
  or block the board render (pattern 8 catch-decoupled; R6/R11 calm degrade). Every new
  message handler answers even on throw (pattern 6).
- **State lifecycle risks:** `boardConfig` writes can race across multiple new-tab pages
  (pattern 7 — serialize); cache must persist `fetchedAt` and never cache a failure
  (pattern 2).
- **API surface parity:** the ypuf panel reuses the popup's message surface — no new
  recall API; the popup keeps working unchanged.
- **Security boundary (the load-bearing one):** the sandboxed-iframe wall (no
  `allow-same-origin`, no `chrome.*`, a sandbox CSP that **removes network egress** —
  `default-src`/`connect-src`/`img-src 'none'`) + URL validation + `redirect:'error'` +
  text-only render on **both** the sandboxed panels **and** the host-rendered ypuf panel
  (page-influenced titles) + hardened `postMessage` (live-`event.source`-validated,
  sanitized-only payload) + hardened fetch (`credentials:'omit'`/`no-referrer`) keep the
  privacy wedge structural rather than conventional. Automated coverage proves the
  *pure* kernels (`shelf-render`, `broker-channel` intent-logic, `sourceurl`); the
  *cross-frame* properties (the sandbox has no `chrome.*`/egress; the host drops a
  forged-source intent) are verified by MANUAL-DOGFOOD, since a node test can't hold a
  real frame. An `innerHTML` path (either context), an `allow-same-origin` iframe, a CSP
  that forgets `connect-src`, or an unvalidated `postMessage` source inverts it — the
  highest-stakes locus.
- **Unchanged invariants:** the recall/let-go/snooze/cluster engine, the SW broker, the
  100%-local recall data, and the privacy gate are unchanged; the board adds a *scoped,
  isolated, opt-in* network surface that touches none of them.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A panel reaches the recall index / `chrome.storage` (privacy-wedge break) | Sandboxed iframe (no `allow-same-origin`, no `chrome.*`); host-as-broker; the panel runtime *lacks* the capability. Reviewed as the slice's P1 locus. |
| A sandboxed panel phones home directly (its own `fetch`/`<img>`) | Sandbox CSP `default-src 'none'; connect-src 'none'; img-src 'none'` removes egress capability — the panel *can't* make a network request; all data arrives via the host's `postMessage`. |
| XSS from feed content in the extension-origin board | Text-only render (R13, `lib/rss.js` strips to text fields, sandbox renders `textContent`); tested with an XSS-title fixture. |
| XSS of the **privileged host** via a page-set recall title (`document.title`) | Host-rendered ypuf panel writes every string via `textContent` through `lib/shelf-render.js`; `tests/shelf-render.test.js` asserts an `<img onerror>` title renders inert. |
| Feed host learns the extension's identity (cookie / `chrome-extension://` referer) | Fetch with `credentials:'omit'` + `referrerPolicy:'no-referrer'`; disclosure states only IP/timing are seen. |
| A forged `postMessage` drives `chrome.tabs.create` | Host validates `event.source` is the known panel iframe (real-frame check, verified by the forged-intent dogfood step); "open" intents intersect host-parsed links (pattern 15); `tests/broker-channel.test.js` covers the intent-validation *logic* (pure), the dogfood covers the live boundary. |
| Per-origin grant collides with the shipped `<all_urls>` flow | The grant helper short-circuits when `<all_urls>` is already held; it is net-new, not a call into `enableAuto`. |
| Revoking a feed's per-origin grant silently disables auto-let-go | The shared `permissions.onRemoved` handler is gated to `autoDisable()` only when `<all_urls>` is actually dropped, not on any origin removal (U2). |
| SSRF via a feed URL (scheme, private IP, or 3xx redirect to a private IP) | `lib/sourceurl.js` validation before any fetch (https-only, private/loopback/link-local block, scheme reject; table-tested) **plus `redirect:'error'`** on the broker fetch so a validated public host can't 302 to a private IP. DNS-rebind is an accepted residual. |
| Provider (CoinGecko) rate-limit / death | Provider swappable behind the adapter; degrade calmly (last-known + "unavailable"); success-only cache. |
| New tab phones third parties on every open | Cache + stale-while-revalidate (per-type TTL); cold-cache placeholder; refresh-on-open. |
| `boardConfig` lost-write across concurrent new-tab pages | Serialize config writes through one chain (pattern 7). |
| "Toggleable" overpromises | Reframed as board minimal-mode + documented Chrome-settings restoration (Chrome can't conditionally override). |

---

## Documentation / Operational Notes

- Update `tests/MANUAL-DOGFOOD.md` with the slice-5 checklist (U7).
- No backend, no telemetry; the only new runtime behavior is opt-in third-party
  fetches the user configured. Note the §7 marketing-copy amendment (origin Outstanding
  Questions) as a docs follow-up.
- After landing, `/ce-compound` a 16th MV3 pattern (network-panel isolation: structural
  sandbox + host-as-broker + validate-fetched-URLs + text-only render + success-only
  cache) — the patterns doc has no precedent for a network surface.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-06-16-ypuf-slice5-newtab-panel-board-requirements.md](docs/brainstorms/2026-06-16-ypuf-slice5-newtab-panel-board-requirements.md)
- Related code: `extension/manifest.json`, `extension/popup/popup.{html,js}`,
  `extension/style.css`, `extension/background.js` (message router + host-grant flow),
  `extension/overlay/overlay.js`, `extension/offscreen/offscreen.{html,js}`,
  `extension/lib/cluster.js`
- Institutional learnings:
  `docs/solutions/architecture-patterns/mv3-local-content-indexing-extension-2026-06-14.md`
  (patterns 1, 2, 5, 6, 7, 13, 14, 15)
- Prior slices: `docs/plans/2026-06-16-001-feat-ypuf-slice4-session-clustering-plan.md`
