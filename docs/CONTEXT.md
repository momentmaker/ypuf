# ypuf — Project Context

> Captured from the ideation session on 2026-06-14. This is the single source of
> truth for what ypuf is, what we decided, what we deliberately rejected, and how
> it should be built. A fresh session should be able to read this in ~5 minutes
> and start speccing or brainstorming without re-deriving anything.

---

## 1. What ypuf is (one paragraph)

ypuf is a Chrome (Manifest V3) extension that **ends manual tab management**. Its
hero behavior is *auto-let-go*: it quietly archives the tabs you've stopped
caring about, while guaranteeing that **nothing is ever lost** through instant,
full-text recall of everything you've ever had open. The emotional job is *calm
and permission to let go* — "close everything; lose nothing." A secondary
new-tab **flashcard widget** (spaced repetition) rides on the same primitive and
doubles as a marketing funnel for the sibling Japanese-learning app, **jivx**.

The unifying primitive across both halves: **an open loop.** A tab you left
open, a page you meant to read, a flashcard you wrote — all decay unless
resurfaced at the right time. ypuf is one scheduler for those loops.

---

## 2. Name & brand

- **ypuf** — backronym **"Your Pages, Unburdened & Findable."** That sentence is
  almost the whole product: *your pages* (tabs), *unburdened* (auto-let-go),
  *findable* (full-content recall).
- **Domain:** ypuf.com (already owned). Pronounced "yoo-puff."
- **The "puff"** = the soft sound/animation of a tab being let go. This is the
  product's signature delight moment (see §5).
- **"Ebb"** is kept as the in-app verb / vibe ("your tabs ebb away"). The brand
  is ypuf; Ebb is how we *talk about* the behavior. "Ebb and flow" maps cleanly:
  **Ebb** = letting go (archive, snooze, clear); **Flow** = the return (recall,
  resurface, restore).

---

## 3. Core thesis & why this can win

Tab managers are a graveyard (OneTab, Toby, Workona, Session Buddy, tab-out) for
two reasons: they become **junk drawers you save into and never revisit**, and
they make you **do organizing work**. Chrome also keeps absorbing their features
(tab groups, memory saver, reading list, vertical tabs).

The rare tab tools people *love* did the opposite — Arc's auto-archive removed
the burden instead of adding tools for it. ypuf's bet is the same emotional core:

> **Permission to let go — close everything, trust that nothing important is lost.**

What makes that defensible (the moat Chrome won't casually copy) is **not** the
tab management — it's the **cross-source recall + knowledge/memory layer**.
Build the part browsers won't.

---

## 4. The signal model (the brain)

The original idea was "track how long and how often each tab is open." Refined:

- **Revisit frequency = the strong, low-noise signal.** A tab you re-activate
  10× over four days is load-bearing intent.
- **Active dwell** (foreground + scrolling/interacting) reinforces it.
- **Raw open-duration = mostly noise.** A 5-day-old tab never re-activated is a
  *zombie*, not a treasure — but by duration alone it looks identical to your
  most important reference.

The product's intelligence is exactly this disambiguation: **intentional open
loop vs. forgotten zombie.** Weight frequency heavily, duration lightly. This
signal feeds every decision below (what to auto-archive, what to protect, what
to resurface).

There must be a **feedback loop**: if the user re-opens something ypuf archived,
that's the strongest signal there is — that class never gets auto-archived
again. The system visibly gets smarter ("I'll keep GitHub PRs open for you").

---

## 5. Decided v1 features (with the load-bearing design rule for each)

### a. Auto-let-go engine (the hero)
- Conservatively auto-archive **zombie** tabs (default heuristic to tune: ~3+
  days open, zero revisits, no unsaved state).
- **Calm and nearly invisible:** no modal, no "are you sure?" (a confirm dialog
  just rebuilds manual closing). Tabs fade; the bar gets lighter.
- **Instant undo** lingers for a few seconds (Gmail "undo send" style).
- **Learns from re-opens** (see §4 feedback loop).
- **Hard "never-touch" list:** unsaved form input, tabs playing audio, mid-flow
  logins/checkouts, pinned tabs, frequently-revisited tabs.
- Start timid, earn the right to be bolder as trust accrues. **One wrong close
  of something precious loses the user forever** — this is the #1 risk.

### b. Full-content recall — "Flow" (the safety net that makes let-go safe)
- Index page **content**, not just URL/title — H1s, first paragraph, and ideally
  the text the user actually scrolled past / highlighted. People recall pages by
  content ("that article about the guy who…"), not meta tags.
- Extract via **Readability** (Mozilla's reader-mode lib): indexes the article
  body, skips nav/sidebars/forms, and naturally drops a lot of incidental PII.
- **Command-bar recall:** a hotkey (e.g. Cmd+Shift+Space) → fuzzy search →
  restore in <1s. **Recovery must be faster than re-googling** — that is what
  kills loss-anxiety and is the core "won't go back" lock-in.

### c. Snooze a tab
- "Get this out of my face until tomorrow 9am / Friday / I'm back at my desk,"
  with a **guaranteed return**. Auto-let-go's *voluntary* twin; the most-loved
  feature in email (Superhuman/Inbox). Strong v1 candidate.

### d. Restore the context, not just the tab
- When restoring, bring back **scroll position + the sibling tabs** it was open
  with ("resume my Tuesday tax research" as a *set*).
- **How we know sibling tabs (no ML, no user effort):** cluster via
  `openerTabId` (Chrome records which tab spawned each tab — the spawn-tree
  *is* the session) + **temporal burst** (tabs opened in the same time window) +
  **co-activation** (tabs you ping-pong between via `chrome.tabs.onActivated`).
  Orphans (pasted URLs, bookmarks, restored sessions) have no opener → temporal
  + co-activation are the fallback.
- Clustering will sometimes be wrong → restore is **partial and editable** (bring
  back the set, let the user drop the odd one out). Never all-or-nothing.

### e. The "puff" delight moment
- Auto-let-go *removes* tab-out's confetti-on-close (that delight was tied to the
  manual act). Replace it: a tab fades with a soft **"puff"** — the signature
  let-go interaction. Also lean into end-of-session relief ("you closed 38 loops
  today — 6 archived, 0 lost"; Zeigarnik effect). You're selling the feeling of
  a clear desk, not tab management.

### f. New-tab flashcard widget (spaced repetition + jivx funnel)
- A **dismissible widget** on the new-tab page (decided: **widget, not an
  interrupt** — an ambushing new-tab page is the fastest uninstall in the genre).
  Must change every tab and occasionally earn a glance (passive-but-fresh).
- SRS scheduler (SM-2, Anki-style). Imports any `.apkg`.
- Ships with a **jivx N5/N4 Japanese deck** as the flagship hook + a visible
  "Powered by jivx →" link.
- Cards are **pre-generated by jivx**, not by any runtime AI on the user's
  machine (see §6).

---

## 6. LLM / AI stance (decided: NO runtime AI in v1)

"AI = the user brings their own API key" is a **false binary**. There are three
ways to ship AI, and all are wrong for v1:
1. **BYO API key** — dev-tool friction, kills consumer conversion. Reject.
2. **Hosted inference (you pay, fold into subscription)** — needs a backend +
   per-user cost + payment plumbing. Defer.
3. **Local in-browser model (WebLLM/transformers.js)** — no key, but a usable
   model is ~0.5–2GB to download (brutal first run), chews battery/RAM (ironic
   for a tab-bloat tool), and the small models that fit aren't good enough to
   make clean cards. A 2027 bet, not 2026.

**Resolution:** ypuf needs no runtime AI. The Japanese decks are **pre-baked by
jivx's existing content pipeline** (it already has `generate_daily_n4.py`,
sentence + audio generators) and shipped as static decks — the user never
touches a model, key, or download. The only place runtime AI is ever
load-bearing is "turn *this page I'm reading* into a card," and that can be
**manual for v1** (highlight text → save as card, no AI). If automated later,
serve it from jivx's hosted backend to logged-in users — never BYO-key, never a
local download.

---

## 7. Privacy / PII stance (load-bearing — also the marketing wedge)

Reframe from the unachievable "store no PII" (impossible if you index pages the
user reads) to a promise that's true and defensible:

> **Local-only · content-layer · exclusion-by-default · user-purgeable.**

- **Local-only, always.** Everything lives on-device (`chrome.storage.local` /
  IndexedDB). Page content is **never transmitted**. This makes ypuf a *local
  index* (like the browser's own history), not a data processor. "Nothing ever
  leaves your machine" is a real differentiator in this category.
- **Content layer only** via Readability (skips forms/nav, less incidental PII).
- **Never-capture list, on by default:** incognito windows (don't index at all);
  a shipped blocklist of sensitive domains (banking, health, gov, password
  managers) that users can extend; **never capture input/field values.**
- **Legibility = trust:** a visible "what's indexed" view + one-click "forget
  this page / this domain."

---

## 8. jivx funnel strategy

- jivx (`../jivx`, Next.js + Drizzle, JLPT N5/N4/N2 content, v1.5.0) is the
  Japanese-learning app this funnels into. **The free extension is not meant to
  make money** — it's top-of-funnel customer acquisition for jivx, which already
  has payment plumbing. Free is *correct* because it's marketing.
- **Shell vs. deck** resolves the two-audience tension: the *shell* (new-tab SRS
  surface + tab tools) is audience-agnostic; the *deck* is the segmentation. Ship
  the jivx Japanese deck as the hook for learners; the same shell later serves
  tab-drowning knowledge workers with a "cards from your own tabs" deck.
- **Layering, not competing:** tab intelligence = the **retention engine** (why
  people install & keep it); the flashcard widget + "Powered by jivx" = the
  **monetization engine**. Keep the funnel *visibly present*, or a great free
  tab tool will eclipse the thing that pays. **Caveat:** tab-drowning knowledge
  workers ≠ Japanese learners, so the funnel only converts the language-learner
  slice — accept that the widget gets broad impressions but narrower conversion.

---

## 9. Rejected / parked (and WHY) — do not re-litigate without new info

- **Tags / folders / any manual organization system** — that's Toby; it's the
  junk drawer we're explicitly killing. *Measured* importance replaces *declared*
  organization. Hold this line.
- **Interrupt-style new-tab flashcards** — rejected in favor of a dismissible
  widget (uninstall risk).
- **"Import your Anki deck" as the hero of the learning angle** — backwards.
  Anki users already have Anki; its #1 friction is *making* cards. The wedge is
  cards *grown from what you browse*, not deck import. (Import is still supported,
  just not the pitch.)
- **Runtime AI / LLM** in any form for v1 — see §6.
- **Cross-device sync** — desirable but drags in backend + privacy + payment all
  at once. It's the natural **paid tier / jivx-account upsell**, not a v1 freebie.
- **Content-similarity / embedding clustering** for sessions — structural signals
  (`openerTabId` + temporal + co-activation) get ~80% with zero ML. v2 refinement.
- **Auto-generate cards from a page** — manual highlight→card for v1; automation
  later, hosted only.
- **Sharing / collaboration** — different product. Defer hard.
- **Non-Chrome browsers** (Firefox/Safari) — later.
- **A tab-out-style "scan everything and manually prune" dashboard** as the
  product — that's the *opposite* philosophy (manual visibility). Auto-let-go
  makes it largely unnecessary. (See open question on whether a minimal dashboard
  still coexists.)

---

## 10. Technical foundation

**Platform:** Chrome Manifest V3 extension. Recommended for v1: **vanilla JS, no
build step** (tab-out's ethos — fastest path to a working, dogfoodable thing).

**Start from tab-out** (`reference/tab-out/`, MIT © Zara Zhang — preserve
attribution per `NOTICE.md`). It's a clean ~2,900-line vanilla MV3 extension.
What to lift:

| From tab-out | What it gives us |
|---|---|
| `extension/manifest.json` | MV3 baseline, `chrome_url_overrides.newtab`, permissions pattern |
| `extension/background.js` (~93 ln) | service worker + `chrome.tabs` event listeners (onCreated/onRemoved/onUpdated) |
| `extension/app.js` (~1,482 ln) | `fetchOpenTabs` (tab enumeration), `focusTab` (click-to-jump), duplicate detection, save-for-later (a proto archive shelf), `playCloseSound` (Web Audio synth) + `shootConfetti` (adapt into the "puff"), title-cleaning helpers (`smartTitle`/`cleanTitle`/`friendlyDomain`) |
| `extension/style.css` (~1,158 ln) | base aesthetic to adapt |
| `extension/icons/` | placeholder icons |

**What tab-out does NOT have (we build these):** dwell/revisit tracking over
time, the auto-let-go engine, full-content recall (Readability + index +
command bar), snooze, session clustering, the flashcard/SRS widget.

**Key Chrome APIs / libs to reach for:**
- `chrome.tabs` (query, onActivated, onUpdated, openerTabId), `chrome.tabGroups`,
  `chrome.windows` — the signal + clustering.
- `chrome.alarms` — snooze + scheduling resurfacing/SRS.
- `chrome.storage.local` for small state; **IndexedDB** for the full-content
  index (storage.local quota is too small for page text).
- Content capture needs a **content script or `chrome.scripting` +
  `host_permissions`** (heavier, privacy-sensitive — gate it behind the §7
  exclusion list). tab-out only needs `tabs`/`activeTab`/`storage`; ypuf will
  need more.
- **Readability** (Mozilla) for content-layer extraction.
- SM-2 algorithm for SRS; an `.apkg` parser (apkg = zipped SQLite) for import.

---

## 11. Open questions (resolve early when speccing)

1. **Build approach:** vanilla JS (recommended, tab-out ethos) vs. a light
   TS+bundler setup? Affects scaffolding.
2. **Zombie thresholds:** default age / revisit count for auto-archive — needs
   dogfooding to tune. Ship a conservative default, learn from it.
3. **jivx deck format:** export jivx's N5/N4 content as `.apkg` or a simple JSON
   deck? Requires a small jivx-side export step.
4. **Index storage budget:** confirm IndexedDB schema + a retention cap / prune
   policy so the content index doesn't grow unbounded.
5. **Dashboard coexistence:** does a *minimal* tab overview still exist alongside
   auto-let-go, or is auto-let-go the only surface? (Hero is auto-let-go; a
   tab-out-style dashboard may be redundant.)

---

## 12. v1 scope line

**In v1:** MV3 scaffold (from tab-out) · dwell/revisit tracking · auto-let-go
engine (conservative, undo, learns, never-touch list) · archive shelf +
full-content recall command bar (Readability, local, IndexedDB) · snooze ·
session clustering + context restore · new-tab flashcard widget (SRS, `.apkg`
import, jivx deck, "Powered by jivx") · privacy (local-only, exclusion list,
"what's indexed" view, forget) · the "puff" delight · MIT, open-source.

**Later:** cross-device sync (paid tier) · auto card-from-page (hosted) ·
content-similarity clustering · near-duplicate detection · "opened but never
read" surfacing · other browsers · sharing.

---

## 13. Status & next step

- Repo initialized; MIT license (momentmaker) + tab-out attribution in place.
- `reference/tab-out/` cloned locally (gitignored) — lift from it deliberately.
- **No implementation yet, no formal spec yet** (deliberately deferred).
- **Next:** start a fresh session → either `/spec` (PRD from this doc) or
  `/brainstorm` a specific slice (e.g., the auto-let-go engine or the recall
  command bar). Everything needed is in this file.

## 14. Risks (carry forward)

- **Trust:** one wrong auto-close loses the user permanently → conservative
  thresholds, never-touch list, instant undo, learn-from-reopen.
- **Browser absorption:** Chrome/Arc/Dia will natively manage tabs + summarize →
  moat is recall + the knowledge layer, not tab management.
- **Storage bloat** from full-content index → Readability-only + retention cap.
- **Privacy perception** (indexing reading history) → local-only, legible,
  purgeable; make the promise explicit.
- **Scope sprawl** — this idea generated many features fast, and the product's
  whole promise is *calm*. Protect the v1 line (§9, §12).
