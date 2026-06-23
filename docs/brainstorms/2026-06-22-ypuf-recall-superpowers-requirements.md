---
title: Recall superpowers — recall that already knows what you mean
status: ready-for-planning
created: 2026-06-22
type: feature
actors: [A1 dogfooder/end-user]
origin: re-route of an external tags suggestion (Jasmin) re-parked in docs/CONTEXT.md §9 on 2026-06-22 — the real job behind "tags for faster search" is findability, which ypuf answers with better recall, not declared organization
---

# Recall superpowers — recall that already knows what you mean

## Summary

Make finding a let-go page feel like magic by pointing the engine's *own* knowledge
at the search box. Three local, buildable-now upgrades — **intent-ranked** results,
a **one-box** search across every page-state ypuf already owns, and recall **UX polish**
— plus two "wow" layers: **proactive** zero-type recall and **"why this"** explainable
hits. A fourth, **semantic recall** ("recall by meaning"), ships opt-in behind a
Settings toggle. No tags, no new permissions for the local core, privacy intact.

---

## Problem frame

A friend (Jasmin) suggested user-added keyword-tags so tabs could be grouped "like
bookmarks" with faster search. Tags as declared organization are explicitly rejected
(`docs/CONTEXT.md` §9 — the Toby junk-drawer ypuf exists to kill; re-examined and
re-parked 2026-06-22). But the *job underneath* the suggestion is real and on-mission:
**findability** — "get me back to that page, fast." Two signals make this worth acting on
now: an outside voice independently reached for findability as the axis that matters, and
the product's whole moat (§3, §12) is recall, not tab management.

Today recall already works — a MiniSearch index over title/url/content with fuzzy +
prefix + a content excerpt (`lib/search.js`), surfaced on the new-tab Recall panel and a
`⌘⇧K` command. It is solid but *literal*: it ranks by text alone, searches only the
let-go archive, and asks the user to type before it can help. Meanwhile the engine already
knows how much the user cared about each page (`lib/signal.js`), what it was open with
(`lib/cluster.js`), and which pages are open / let-go / snoozed right now — and none of
that reaches the search box. The cost is a recall that is merely adequate where the
product needs it to be the thing users won't go back from.

---

## Actors

- **A1 — the dogfooder / end-user.** Reaches for a page they had open earlier via the
  Recall panel or the `⌘⇧K` command bar; wants the right page first, fast, ideally
  without typing.

---

## What we're building

### Requirements

**Intent-ranked recall (the right tab is #1)**
- R1. Recall ranks results by text relevance **combined with the engine's intent signal**
  (revisit frequency, dwell, recency — `lib/signal.js`), not text relevance alone, so the
  page the user most likely wants ranks first.
- R2. The blend is tunable: a strong intent signal can lift a weaker text match above a
  high-text / zero-intent match, while exact-term matches still rank competitively. Default
  conservative, tuned by dogfood.

**One-box recall (open · let-go · snoozed, deduped)**
- R3. The recall search box searches **every page-state ypuf already owns in one query** —
  the let-go/recall archive, currently-open tabs, and snoozed tabs — deduped by URL.
- R4. **When** a result is open-now, its primary action is *jump to that tab/window*;
  **when** let-go, *restore*; **when** snoozed, it reveals *"coming back ⟨when⟩"* and offers
  *wake now*. The action adapts to the page's state.
- R5. **Episodic pivots:** the user can narrow recall by session cluster (`with: ⟨cluster⟩`)
  and by time (`last tuesday`, `this morning`), surfaced as quiet type-ahead chips drawn
  from `lib/cluster.js` + capture timestamps. This is the engine's grouping, surfaced —
  never user-declared tags.

**Recall UX polish (it feels fast)**
- R6. Results stream as the user types (incremental); the top result is restorable/openable
  with a single Enter.
- R7. The matched phrase is highlighted inline within the content excerpt (extends
  `excerptAround`).
- R8. Search stays typo-forgiving (fuzzy) so a near-miss query still surfaces the intended
  page.

**Proactive blank-state recall (the best search is the one you never run)**
- R9. **Before the user types**, the recall surface shows a short *"reaching for these"* set:
  the loops the user most likely wants right now, ranked by the engine's time-of-day +
  frequency rhythm (`lib/signal.js`). The common case needs zero typing.
- R10. The proactive set stays calm — a short, quiet list, no notification — and yields the
  moment the user starts typing (which switches to live search).

**Explainable recall ("why this")**
- R11. Each result carries a quiet, one-line rationale derived from existing signals (e.g.
  `reopened 11× · seen this morning · same session as ⟨X⟩`), in secondary styling — never
  intrusive. Serves §4 "visibly gets smarter" and the #1 trust risk.

**Semantic recall — opt-in (the moat)**
- R12. A Settings toggle enables *recall by meaning*. **Off by default.**
- R13. **When** the user enables it, ypuf downloads a small (~30MB) on-device embedding
  model, with the download cost disclosed *before* it starts. Nothing downloads unless the
  user opts in.
- R14. **Until/unless** the model is present, recall falls back to the existing keyword/BM25
  index with no change to today's behavior.
- R15. Semantic recall runs 100% on-device — no page content or query is ever transmitted
  (§7 holds).

---

## Key flows

- F1 — **Type to find (one box).** User types → results stream, intent-ranked, across
  open/let-go/snoozed, each with its adaptive action, a highlighted excerpt, and a quiet
  "why this". Enter restores/jumps the top hit. *Covered by:* R1–R8, R11.
- F2 — **Zero-type recall.** User opens a new tab → the recall surface already shows
  "reaching for these" (the likely targets for this time/rhythm); Enter restores/jumps
  without a keystroke. *Covered by:* R9, R10.
- F3 — **Pivot on context.** User adds a `with: tax research` or `last tuesday` chip →
  results narrow to that session/time. No tag was ever created. *Covered by:* R5.
- F4 — **Recall by meaning (opt-in).** With the toggle on, a descriptive query surfaces a
  page that shares no keywords with it; with the toggle off, the same query falls back to
  keyword recall. *Covered by:* R12–R15.

---

## Result-type → action (the one-box behavior)

| Page state | Where it lives today | Primary action | Secondary |
|---|---|---|---|
| Open now | live tabs (`chrome.tabs`) | **⏎ Jump** to tab/window | let go · snooze |
| Let go | recall archive (the index) | **⏎ Restore** | protect · forget |
| Snoozed | snooze queue | shows **"coming back ⟨when⟩"** | wake now · re-snooze |

---

## Acceptance examples

- AE1 — **One box, adaptive action.** *Covers R3, R4.* "figma" is open in window 2, was let
  go yesterday (a second figma page), and one figma tab is snoozed. One search shows all
  three: the open one offers ⏎ jump, the let-go one ⏎ restore, the snoozed one "coming back
  Fri". Duplicate URLs collapse to one row.
- AE2 — **Intent lifts the right hit.** *Covers R1, R2.* Two pages match "github"; the PR the
  user reopened 11× this week ranks above a stale page with an equally strong title match.
- AE3 — **Zero-type.** *Covers R9, R10.* Opening a new tab at 9am on a weekday shows the
  PR-review + standup-doc the user reaches for then, with no query typed; the first keystroke
  replaces the set with live search results.
- AE4 — **Semantic is opt-in, with fallback.** *Covers R12, R13, R14.* With the toggle off,
  recall is keyword-only and nothing is downloaded. Turning it on discloses the ~30MB
  download first; after it completes, "the guy who quit Google to farm" surfaces an article
  with no keyword overlap. If the model is absent for any reason, recall still works on
  keywords.
- AE5 — **Pivot, not tag.** *Covers R5.* Typing `with: tax research` narrows results to the
  pages clustered with that session; the user never created or maintained a label.
- AE6 — **Forgiving + legible.** *Covers R7, R8.* "quit goggle farm" (typo) still finds the
  page, and the matched phrase is highlighted in the excerpt.

---

## Success criteria

- A user finds the page they want **as the first result, usually without typing** — and
  recall feels faster than re-googling (§5b).
- "Is it open, did I let it go, or is it snoozing?" is answered by **one search**, and the
  offered action is always the right one for that state.
- The local superpowers (R1–R11) ship with **no new permission** and **no model download**.
- Semantic recall never costs a user anything unless they opt in; with it off, today's
  recall is unchanged.
- Privacy holds: nothing leaves the device; page-derived text is host-rendered (no
  innerHTML); §7 promise intact.
- `ce-plan` can sequence and build from this without inventing recall behavior, scope, or
  the history/tags boundaries.

---

## Scope boundaries

**In scope**
- Intent-ranked recall, the one-box cross-state unify (open · let-go · snoozed) with adaptive
  actions, episodic pivots, the UX polish (streaming, Enter-to-act, highlight, fuzzy),
  proactive blank-state recall, and "why this" rationales.
- Semantic recall as an opt-in Settings toggle with disclosed download + BM25 fallback.

**Deferred for later (parked, not cut)**
- **Restore the *scene*** — bring a page back at its scroll position with its sibling session
  (extends slice-4 clustering; a recall *restore* upgrade, separable from search).
- **Visual recall** — recognize a page by its OG-image / favicon + dominant colour rather
  than by words. Privacy-gated (metadata only, never screenshots); its own decision.
- **"More like this"** — lateral recall to a result's neighbours (structural now; semantic
  once the model is on).
- **"Came back" relief** — Zeigarnik lines surfacing recent returns (needs return logging).

**Outside this product's identity**
- **User-created tags / keywords / folders** — the §9 line. Measured importance + content
  recall replace declared organization; this doc is the alternative, not a step toward them.
- **Chrome browser history as a recall source** — see Key decisions.
- **Cloud / sync of the recall index** — 100% local (the natural paid-tier item, not here).
- **Runtime generative LLM** — §6. Semantic *retrieval* via embeddings is not generative and
  is opt-in; no generation, no BYO-key, no forced download.

---

## Constraints (ypuf identity — load-bearing)

- **Calm by design (§9):** quiet, glanceable, pull-not-push. Proactive recall and "why this"
  are quiet secondary text; episodic chips appear only when relevant. Recall must not become
  a power-search cockpit.
- **Privacy / local-only (§7):** page content never transmitted; semantic recall runs
  on-device; page-derived text host-rendered text-only (`lib/shelf-render.js`, no innerHTML).
- **No runtime generative LLM (§6):** embeddings are retrieval, opt-in, with the download cost
  disclosed honestly.
- **Reuse shipped foundations:** `lib/search.js` (MiniSearch), `lib/signal.js` (intent),
  `lib/cluster.js` (sessions), the recall panel + `recall` command (`⌘⇧K`), the store /
  IndexedDB index; the pure-tested-lib convention for any new ranking/parse cores.
- **Reduced-motion-gated** for any new motion.

---

## Key decisions

- **Tags rejected; recall enhanced instead.** The real job behind the suggestion is
  findability; ypuf serves it with measured importance + content recall, not declared
  organization. Re-park recorded in `docs/CONTEXT.md` §9 (2026-06-22) so it is not
  re-litigated.
- **One-box = ypuf-owned states only (open · let-go · snoozed). Chrome history stays OUT.**
  ypuf holds no `history` permission today (perms: `tabs, activeTab, scripting, storage,
  notifications, alarms, offscreen, topSites, favicon`); adding it means a scarier store
  listing and "ypuf reads your entire browsing history" — straight at the §7 wedge — for
  content-less, noisy URLs. The "is it open or closed?" wow is fully achieved without it.
- **Semantic recall is opt-in (toggle + disclosed ~30MB download + BM25 fallback)** per
  §6/§12 — and is the **natural second slice**. The local superpowers (R1–R11) ship first as
  "recall v2"; semantic (R12–R15) follows as its own slice so the model bet is isolated.

---

## Dependencies / Assumptions

- Builds entirely on shipped foundations (see Constraints). The one-box core assumes
  open-tab enumeration via the **existing `tabs` permission** (held) — **no new permission**.
- Assumes intent and cluster signals are already persisted and queryable at recall time
  (slices 2 + 4 shipped); ranking just needs to read them.
- Semantic slice feasibility is **researched** (2026-06-22) — see the Research note below.
  On-device embedding in an MV3 extension is well-established (transformers.js v3 in an
  offscreen doc, WASM, IndexedDB-cached weights); the one open item is a build-step fork.

---

## Research note — semantic model & runtime (researched 2026-06-22)

Two parallel web-research passes (current 2025–2026 sources) resolved the model + runtime
question for the deferred semantic slice (R12–R15). The remaining decision is a product fork
on the build step.

**Model** (layered above BM25; short query → page content; English-first):
- **Lead: `bge-small-en-v1.5`, int8 ONNX (~32 MB, 384-dim, MIT).** Best confirmed retrieval
  quality in budget (BEIR nDCG@10 ≈ 51.7); query prefix optional.
- **Smaller/safer: `all-MiniLM-L6-v2`, int8 ONNX (~23 MB, Apache-2.0).** The battle-tested
  browser default; no prefixes; ≈10 BEIR points weaker.
- **Calm / no-battery: static embeddings (Model2Vec / `potion-*`, ~8–30 MB, zero inference).**
  Uniquely fits §6's battery worry (≈500× cheaper, no WASM/WebGPU), but a real-world
  March-2026 browser test had `potion` *missing* article recalls MiniLM caught (retrieval
  ≈35 vs ≈42). Reserve as a future **"low-power lite mode,"** not the primary.

**Runtime:** `@huggingface/transformers` v3, **run in ypuf's existing offscreen document** (the
SW is ephemeral and can die mid-encode; the offscreen doc already exists + is permitted), WASM
backend, model weights fetched on opt-in and cached in IndexedDB (`allowRemoteModels = false`
after). Requires adding **`'wasm-unsafe-eval'`** to the extension CSP (CWS-permitted; one
unresolved rejection case on record — low risk). The WASM runtime adds ~10–15 MB to the
*shipped package*, separate from the model download.

**The one genuine fork (product decision — touches the §10 no-build-step ethos):**
- **(A) Minimal, scoped build step** to vendor transformers.js + ONNX-WASM — industry-standard
  (every shipped example uses a bundler), but dents §10 (for one opt-in feature only). *Current
  lean.*
- **(B) Hand-vendor transformers.js + WASM** — preserves no-build, but fragile (ONNX-WASM
  filenames shift between releases; manual upkeep each upgrade).
- **(C) Hand-rolled static Model2Vec in pure JS** — no build, no WASM, no battery, no CSP
  change; accept the retrieval quality gap (validate on real ypuf queries first).

Sources: HF transformers.js Chrome-extension guide; Xenova / onnx-community model cards
(sizes); *Fantastic (small) Retrievers* (BEIR nDCG@10 table); Minish Lab Model2Vec;
allaboutken.com static-embedding browser test (Mar 2026).

---

## Open questions (for planning / low-stakes)

- **[Affects R1/R2][tunable]** Default visibility of intent-ranking vs strict text order — is
  there a case where a user wants pure text-match ordering? Lean: intent-blended default,
  tunable; revisit on dogfood.
- **[Affects R9][product, low-stakes]** Where proactive recall lives — the Recall panel empty
  state, the `⌘⇧K` command-bar blank state, or both. Lean: both, same source.
- **[Affects R1][Technical]** Exact ranking-blend formula and weights — a pure, tested
  scoring core; tune via dogfood.
- **[Affects R5][Technical]** Episodic chip syntax + parser (time phrases, cluster names).
- **[Affects R3][Technical]** URL canonicalization rule for cross-state dedup.
- **[Affects R12][User decision — at the semantic slice]** The build-step fork (A/B/C in the
  Research note). Lean (A) scoped build step + `bge-small-en-v1.5`; not urgent — semantic is
  the deferred second slice.
- **[Affects R12][Technical]** Vector-index storage budget (384-dim int8 ≈ 384 B/page) vs the
  §11 index storage cap; chunking strategy for long article bodies.
