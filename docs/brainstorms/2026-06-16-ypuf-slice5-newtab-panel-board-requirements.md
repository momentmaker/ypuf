---
date: 2026-06-16
topic: ypuf-slice5-newtab-panel-board
status: requirements
actors: [A1]
flows: [F1, F2, F3]
---

# ypuf Slice 5 — New-tab panel widget board

## Summary

The new-tab page becomes a **calm panel board**: the ypuf panel (recall +
recently-let-go shelf + back-now) you already have, plus user-configurable
**RSS-feed** and **crypto-price** panels — all built on one internal
**panel-source interface** so new panel types slot in later. You add, configure,
remove, and reorder panels in a responsive grid. Network panels fetch only the
source you chose, directly from the browser, cached and walled off from your
browsing and recall data. This is the pivot from the retired flashcard/jivx widget
(CONTEXT.md §5f, §8, §9) realized in full.

---

## Problem Frame

ypuf's let-go net (auto-archive, recall, snooze, session restore — slices 1–4) has
no home on the surface the user sees most: the new tab is still Chrome's default.
§5f decided the new tab should be a calm, glanceable **panel board** where ypuf's
own recall/shelf is one panel among a few quiet ambient ones — calm by *design*,
not minimalism, and never the cluttered dashboard §9 rejects. The user (A1, the
tab-drowning knowledge worker, dogfooding) wants that board to also surface a
couple of useful glances they currently have nowhere calm to put: their own
newsletter/RSS feeds and a crypto token price. Those are the first panels that
reach the network, so the load-bearing privacy rule — panels never see browsing
data — becomes a line to hold, not a free consequence.

---

## Actors

- **A1. Tab-drowning knowledge worker** (established; the board's user). Opens many
  new tabs a day; wants a calm home that surfaces their let-go net and a few
  useful glances, without becoming something to manage.

---

## Key Flows

- **F1. Open a new tab → the calm board.** The new-tab page renders the board: the
  ypuf panel plus whatever panels A1 has configured, quiet and glanceable, served
  instantly from cache. Covered by: R1, R3, R4, R11

- **F2. Compose the board.** A1 adds a panel of a curated type, configures it (a
  feed URL, a token), removes/toggles panels, and reorders them. Covered by: R2,
  R7, R8

- **F3. A network panel keeps itself current.** An RSS or crypto panel fetches only
  its own source, caches it, and refreshes quietly past its TTL — isolated from the
  recall index and disclosed. Covered by: R5, R6, R9, R10, R11, R12, R13

---

## Requirements

Traces to CONTEXT.md §5f (panel board), §7 (privacy), §8/§9 (retired flashcard /
held calm rule), §12 (v1 scope: curated panels + internal interface).

**Board foundation**
- R1. The new-tab page is the panel board (`chrome_url_overrides.newtab`),
  **default-on but toggleable**: the board is A1's new tab out of the box, and a
  setting restores Chrome's default new tab while keeping ypuf's engine (auto-let-go
  / recall / snooze) — so the board never forces the §9 "fastest uninstall"
  intrusion. **Calm by design**: every panel quiet by default, glanceable, never
  notifying, badging, auto-playing, or interrupting; **a panel never updates its
  visible content while the board is open** (content refreshes on tab-open, not while
  A1 is reading). It must not become a dashboard to manage (§9).
- R2. The board is built on an internal **panel-source interface** — a contract each
  panel type implements (render a glanceable view, expose its config, fetch+refresh
  if networked, declare its disclosure). The contract **mandates** the network-panel
  safety rules (R9 isolation, R12 URL validation, R13 safe rendering) so no panel can
  be built to violate them. v1 ships **3** implementations (R4–R6). **"Closed in v1"
  means no arbitrary code/plugin execution** (no user-facing add-a-plugin surface) —
  *not* "no arbitrary network sources": R5 deliberately allows user-supplied feed
  URLs, bounded by R9/R12/R13. The interface is *designed* to open to user-added
  plugin types later, but that surface is closed in v1.
- R3. The board ships with the **ypuf panel present by default**; A1 adds and
  configures the rest. On a **fresh install** the board shows the ypuf panel in the
  first slot plus a single persistent **"add a panel"** affordance in the next slot
  (not a modal, not a settings link). Board config (which panels, their settings,
  their order) persists locally.

**The three v1 panel types**
- R4. **ypuf panel** — recall (search the let-go index), the recently-let-go shelf,
  and "back now" snoozed items. It is a **wider-column rendering of the same
  recall/shelf/back-now UI the popup already provides**, reusing the same underlying
  module + the shipped slice-1–3 engine through the existing message API (a layout
  variant, not a fresh implementation); the popup toolbar icon stays available off
  the new tab. **Zero network.** The let-go net's home on the new tab.
- R5. **RSS feed panel** — A1 adds a feed URL; the panel shows that feed's latest
  headlines (title + source + time), each opening in a tab. Supports A1's own feeds
  (newsletters/blogs). Network — subject to R9 (isolation), R12 (URL validation),
  R13 (safe rendering), R10 (disclosure).
- R6. **Crypto price panel** — A1 picks **cryptocurrency token(s)** (e.g. BTC, ETH —
  the asset, not an API key); the panel shows a **glanceable** price (e.g. price +
  24h change), periodic, **not** a live ticker. The price **provider is swappable
  behind the panel's fetch** (CoinGecko's public no-key API is the v1 provider, not a
  hard contract), and the panel **degrades calmly** — last-known price + a quiet
  "price unavailable", never errors/badges — when the provider rate-limits or is
  unreachable. Network — subject to R9/R10/R12/R13.

**Compose / arrange**
- R7. A1 composes the board via a **board-level "edit" toggle**: entering edit mode
  reveals per-panel controls (configure, remove, reorder handles) and the add-panel
  affordance; exiting hides them so the resting board is just the calm glance.
  **Reorder** is drag-to-swap within the grid's slots, with keyboard up/down/left/
  right nudge controls in edit mode (accessibility). **No free-form drag-anywhere
  layout**; editing is a board affordance, not a separate settings app.
- R8. A panel type may have **multiple instances** where it makes sense (several RSS
  feeds, several tokens), each **labelled to tell them apart** (e.g. feed hostname /
  token symbol). This is configuration of a curated type, not a user-added plugin
  type.

**Network panel safety (load-bearing — the first network surface in a 100%-local product)**
- R9. **Isolation is structurally enforced, not a coding convention.** A networked
  panel runs in an **isolated context** (a sandboxed iframe, or a message-passing
  channel) with **no direct handle** to IndexedDB, `chrome.storage`, or the
  `chrome.*` APIs. The board host holds all local data; a panel communicates only
  through a narrow channel carrying render + config and **never the recall index,
  browsing/dwell signal, or page content**. The mechanism is a planning choice; the
  requirement is that the panel runtime *lacks the capability*, not that it chooses
  not to use it.
- R10. Network panels fetch **only their own configured source**, directly from the
  browser (no backend/proxy). Adding a network panel is the **opt-in**; each carries
  a quiet, persistent **disclosure** naming the source host **and what the third
  party learns** (A1's IP, request timing, source/token choices). Crypto's provider
  (CoinGecko) is **ypuf-chosen infrastructure**, not a source A1 added — its
  disclosure says so. The ypuf panel (no network) carries no disclosure.
- R11. Network panels **cache with stale-while-revalidate**: when a cached value
  exists a tab-open shows it **instantly** (never blocked on a fetch); a background
  refresh fires only past the per-type TTL. On a **cold cache** (first open, new
  profile, cleared storage, a just-added panel) the panel shows a **calm placeholder**
  and never blocks the rest of the board. Default TTLs: **RSS ~30 min, crypto ~60 s**
  (dogfood-tunable). **No user-facing TTL knob** in v1.
- R12. **Source-URL validation.** A user-supplied source URL is validated before any
  fetch: **https only** (http only with explicit care), **private / loopback /
  link-local IP ranges blocked** (no SSRF / LAN probing), and `javascript:` /
  `data:` / `file:` schemes **rejected** — at the input layer, in the panel-source
  contract.
- R13. **Safe rendering of fetched content.** Feed-sourced strings (title, source,
  description) are attacker-controlled; they are inserted as **text only**
  (`textContent` / safe nodes), **never** `innerHTML` / raw markup. The contract
  exposes a text-render primitive, not a raw-HTML one — an XSS in the new-tab page
  would run with full extension privileges, so this is non-negotiable.

---

## Acceptance Examples

- **AE1. Covers R1, R3.** Open a new tab → the calm board renders with the ypuf
  panel present; nothing notifies, badges, or interrupts. A setting restores Chrome's
  default new tab while ypuf's engine keeps running.
- **AE2. Covers R5.** Add an RSS feed by URL → an RSS panel appears showing that
  feed's latest headlines; clicking a headline opens it in a tab.
- **AE3. Covers R6.** Add a crypto token → a panel shows its glanceable price,
  updating quietly on a schedule (not tick-by-tick); when the provider is unreachable
  it shows the last-known price + a quiet "price unavailable", no error.
- **AE4. Covers R9.** A network panel's runtime has **no handle** to the recall
  index, the browsing/dwell signal, or page content — the isolated context lacks the
  capability, so a panel that tries to read ypuf's local data has no path to it.
- **AE5. Covers R11.** Re-open the new tab within the TTL → the panel shows cached
  data with no new request; past the TTL → a quiet background refresh updates it in
  place.
- **AE6. Covers R10.** Each network panel discloses its source host and what the
  third party learns; the crypto panel discloses CoinGecko as ypuf-chosen infra; the
  ypuf panel shows no disclosure (it never fetches).
- **AE7. Covers R7.** In edit mode, reorder / remove / toggle a panel → the board
  persists the new arrangement; exiting edit mode leaves the calm resting board.
- **AE8. Covers R8.** Add a second RSS feed → a second RSS panel appears alongside
  the first, each labelled by its source; removing one leaves the other intact.
- **AE9. Covers R11.** First-ever open of a just-added network panel (cold cache) →
  the panel shows a calm placeholder and the rest of the board renders immediately,
  unblocked.
- **AE10. Covers R12.** Add a feed URL pointing at a private IP (e.g.
  `http://192.168.1.1/feed`) or a `javascript:` URL → rejected at input, never
  fetched.
- **AE11. Covers R13.** A feed whose title contains `<img src=x onerror=…>` →
  rendered as inert text; no script runs.

---

## Success Criteria

- The board feels **calm and glanceable** — a home worth keeping over Chrome's
  default, not a dashboard to tend.
- The ypuf let-go net finally has a **home on the new tab**: recall, the
  recently-let-go shelf, and back-now in one panel.
- Network panels deliver useful glances (A1's newsletters, their token prices) while
  the **privacy promise stays honest and one-sentence-expressible**: ypuf's
  reading/recall data never leaves the device, and network panels reach only sources
  A1 opted into — a scoped, disclosed exception to §7's "nothing leaves your machine,"
  not a hole in it. Isolation (R9) is enforced, so the wedge does not rest on trust.
- All 3 v1 panel types implement **one shared contract with no per-panel board-level
  code**; the contract's extensibility to a future 4th type is validated by a
  planning design-review (a throwaway stub), not asserted as a shipped-slice gate.
- `ce-plan` can decompose slice 5 from this doc without inventing the panel
  interface, the v1 panel set, the network safety/cache posture, or the calm rules.

---

## Scope Boundaries

- **Opening the interface to user-added arbitrary plugin *types* / a plugin
  marketplace** — out. The interface is built but **closed** in v1; opening it is
  later (§12 "Later: user-added panel sources").
- **Other ambient panel types** (weather, calendar, notepad, clock) — out for v1;
  cheap to add later via the interface.
- **The optional jivx vocab/SRS panel** — out (later, never as the new-tab
  experience itself — §8/§9).
- **Board-config sync across devices** — out (later / paid tier).
- **Any runtime AI/LLM** — out (§6, no runtime AI in v1).
- **A backend or fetch-proxy** — out; network panels fetch directly.
- **User-facing TTL / refresh-rate knobs** — out; tuned defaults only (calm).
- **The flashcard/SRS widget and the jivx funnel** — retired (§8); not part of
  this slice.
- **ypuf's sustainability / monetization** — out, but **consciously re-deferred, not
  closed**: §8 retired the jivx funnel and reserved "how does ypuf sustain itself" for
  "if/when slice 5 is built." The panel-source interface this slice builds is the
  future home for an optional jivx (or other) panel; the business decision stays open.

---

## Key Decisions

- **Build the panel-source interface as a first-class deliverable now** (3
  implementations), per §5f's "internal interface designed to open later, closed in
  v1." It makes the board genuinely extensible at low cost and realizes the
  printing-press "one tidy plugin per source" *design* inspiration — without opening
  a user-facing plugin surface.
- **Curated panel TYPES, user-configured INSTANCES.** RSS-feed-URL and crypto-token
  are *configuration* of curated types, not user-added plugin types. This reconciles
  A1's "let me add my own RSS feeds" with §5f's "no add-arbitrary-source surface in
  v1."
- **The board is the new tab, default-on but toggleable.** It ships as A1's new tab,
  but a setting restores Chrome's default while keeping the engine — honoring §9's
  "fastest uninstall" warning without hiding the slice's whole point behind an opt-in.
- **Network panels are a scoped opt-in EXCEPTION to §7, not a quiet redefinition of
  the wedge.** ypuf has no backend, so a network panel fetches its own source
  directly; §7's promise is reworded to "your reading/recall data never leaves your
  machine; opt-in network panels reach only the sources you configured." The price of
  opening this surface in a privacy-load-bearing product is three **enforced** rules:
  structural isolation (R9), source-URL validation (R12), and text-only rendering
  (R13) — closed plugin execution, open user-chosen sources, hard walls.
- **Cache + stale-while-revalidate, per-type TTL.** Keeps the new tab from phoning
  third parties on every open, keeps it instant (when warm), and respects CoinGecko's
  free-tier rate limits. RSS ~30 min, crypto ~60 s, tunable.
- **Crypto is glanceable, not live.** The calm rule applies: a periodic quiet price,
  not a flashing ticker.
- **Crypto provider is swappable; CoinGecko is the v1 provider, not a hard contract.**
  CoinGecko's public no-key API fits no-backend / no-key / no-AI, but the panel must
  **degrade calmly** (last-known + "unavailable") and the provider lives behind the
  panel's fetch so a rate-limit/sunset doesn't strand the panel type.

---

## Dependencies / Assumptions

- **Slices 1–4 are shipped** — the recall / shelf / back-now engine the ypuf panel
  reuses, and the local-only privacy posture the board inherits.
- **`chrome_url_overrides.newtab`** is the board's mount (§10). Chrome's own "an
  extension changed your new tab page" consent covers the override.
- **Network panels need host access** for their configured origins. The grant is the
  opt-in's mechanism; **prefer dynamic per-origin grants** (`chrome.permissions.request`
  per feed) over a broad `<all_urls>` grant, which reads as "access to every site you
  visit" and undercuts the privacy posture — exact model a planning call. (The
  manifest already declares `optional_host_permissions: ["<all_urls>"]` and the popup
  already runs the grant flow, so the mechanism exists.)
- **CoinGecko's free public API** is the v1 crypto provider (rate-limited; caching +
  calm degradation expected). The provider is swappable behind the panel's fetch
  (R6), so its downtime/limits degrade one panel, not the slice.

---

## Outstanding Questions

_No blocking product questions remain. The below are technical/design calls for
planning._

### Deferred to Planning

- [Affects R2/R9] The isolation **mechanism**: a sandboxed iframe per network panel
  vs a message-passing channel to the board host. R9 mandates the property
  (enforced, not conventional); planning picks the mechanism.
- [Affects R2] The panel-source contract's exact shape — the lifecycle/methods each
  panel implements (render, configure, fetch+refresh, disclose), and how the board
  hosts/persists instances.
- [Affects R10/R12] The host-permission model: per-origin (preferred) vs broad
  `<all_urls>`, and how adding a feed triggers/handles the grant within the opt-in
  without an alarming dialog.
- [Affects R5] RSS parsing reality: feeds vary (RSS / Atom / JSON Feed), and whether
  v1 requires the raw feed URL or attempts feed-discovery from a site URL.
- [Affects R6/R11] Exact TTLs and the refresh cadence while a board is left open
  (periodic refresh vs refresh-only-on-open) — dogfood-tunable.
- [Affects R5/R6] Per-panel loading / cold-cache placeholder / error states (feed
  unreachable, provider rate-limited, malformed feed).
- [Affects §7] The exact reworded §7 / marketing-copy promise that carves out
  opt-in network panels (so the landing copy doesn't claim an absolute the product no
  longer honors).
