---
date: 2026-06-23
topic: ypuf-semantic-recall
---

# ypuf — Semantic Recall (recall by meaning)

## Summary

An opt-in *"recall by meaning"* mode for ypuf's existing recall — find a let-go page by
what it was *about*, not the exact words it used — shipped as a deliberately cheap, fully
reversible experiment: **pure-JS static embeddings** (no build step, no WASM, no battery
cost), off by default, blended into today's keyword recall. It refines the parked R12–R15
("semantic recall" deferred from the Recall v2 slice) and resolves their open build-step
fork in favor of the cheapest path.

---

## Problem Frame

ypuf's recall (live as of v1.1.0) is keyword search over a local content index — strong when
you remember some of the words a page used, blind when you only remember the *gist* ("that
article about the guy who quit Google to farm"). CONTEXT.md §3/§12 names this gist-recall
layer as the product's actual moat — "build the part browsers won't" — and §12 explicitly
sanctions *local semantic recall* (keyword/BM25-first, then an optional small embedding model)
as the intended next altitude, distinct from the §9-parked embedding *clustering* and the
§6-rejected *generative* LLM.

The honest complication, surfaced in this brainstorm: there is **no observed felt demand**.
The owner could not recall a single query that keyword search actually failed, and has said
elsewhere they find their tabs fine. So this is a *moat / delight* bet, not a pain-fix — which
is a legitimate reason to build, but it changes the cost calculus. With demand unvalidated,
the carrying cost of the approach matters more than its ceiling quality, and the whole shape
below follows from that.

---

## Key Flows

- F1. Enabling semantic recall
  - **Trigger:** User flips the "Recall by meaning" toggle in Settings (off by default).
  - **Steps:** (1) ypuf discloses the one-time asset size (~8–30MB) *before* fetching anything.
    (2) On confirm, it fetches the static-embedding asset once and embeds the existing indexed
    pages on-device. (3) While that runs, recall keeps working keyword-only. (4) Once ready,
    recall blends meaning-matches into the same ranked result list.
  - **Outcome:** Typing a description (not the page's words) surfaces the right let-go page;
    everything stayed on-device.
  - **Escape path:** Any failure (download, embed, or the feature off) silently falls back to
    keyword recall — never an error, never a broken-empty result.
  - **Covered by:** R1, R2, R3, R5, R6

---

## Requirements

**Opt-in & privacy (the foundation — refines parked R12–R15)**
- R1. A Settings toggle, "Recall by meaning," enables semantic recall. **Off by default.**
- R2. When the user enables it, ypuf fetches the static-embedding asset once, with the
  download size disclosed *before* the fetch starts. Nothing is fetched unless the user opts in.
- R3. Recall always works without semantic. When the toggle is off, the asset is absent or
  still loading, or anything fails, recall falls back to today's keyword/BM25 ranking with no
  degraded or error behavior.
- R4. Semantic recall runs **100% on-device** — no page content, embedding, or query is ever
  transmitted.

**The cheap experiment (fork C)**
- R5. The first cut uses **pure-JS static embeddings** (precomputed token vectors averaged per
  page) — no build step, no WASM, no `wasm-unsafe-eval` CSP change, no neural inference, no
  battery cost. The reduced retrieval quality versus a neural model is accepted.
- R6. Meaning-matches **blend into the existing recall ranking** alongside keyword relevance
  and the intent signal — one calm ranked list, not a separate search mode.
- R7. Page meaning is derived from the page's **already-indexed readable text** (no new
  capture, no new permission), stored as one small per-page vector alongside the content
  index, staying within the existing index budget / retention policy (§11).

**Reversibility (load-bearing for an experiment)**
- R8. The whole feature is **cleanly removable**: turning the toggle off deletes the per-page
  vectors and the asset and returns recall to keyword-only, leaving no residue.
- R9. The opt-in stays **calm** (§9): the toggle, the one-time download (size, progress, a
  graceful failure), and any "by meaning" indication are quiet and glanceable — no power-search
  cockpit, no nagging, no notification.

---

## Acceptance Examples

- AE1. **Covers R1, R3.** Given the toggle is off, when the user searches recall, results are
  keyword-only and nothing has been downloaded — identical to v1.1.0 behavior.
- AE2. **Covers R2, R5.** Given the user flips the toggle on, ypuf first discloses the
  ~8–30MB asset size; after it loads, searching "the guy who quit his job to go farm" surfaces
  a let-go article titled "Leaving the tech industry for agriculture" that shares no keywords
  with the query.
- AE3. **Covers R3.** Given the toggle is on but the asset is still downloading or failed to
  load, when the user searches, recall still returns keyword results — never an error and never
  an empty-because-broken list.
- AE4. **Covers R4, R8.** Given semantic recall has been used, when the user turns the toggle
  back off, the vectors and asset are removed and recall returns to keyword-only — and at no
  point did any page content or query leave the device.

---

## Success Criteria

- **The experiment answers its question either way.** Success is *learning*, not adoption: the
  owner/dogfooders either find themselves reaching for meaning-recall and catching pages
  keyword search missed, **or** it demonstrably goes unused — both are valid outcomes that
  decide the next move.
- **The keep/kill is decidable, not indefinite.** A clear signal to either **graduate to the
  neural model (fork A)** — used *and* the quality gap is felt — or **remove it cleanly** —
  unused. It must not linger as a half-feature.
- **Calm and privacy are never dented.** Off-by-default users pay nothing (no download, no
  battery, no slower recall); on users never see page content leave the device.
- **Clean handoff:** ce-plan can build this without inventing the opt-in UX, the fallback
  behavior, the storage shape, or the graduation criterion.

---

## Scope Boundaries

- **The neural-model upgrade (fork A)** — `bge-small-en-v1.5` (~32MB) + a scoped build step +
  transformers.js/ONNX-WASM in the offscreen doc + a `wasm-unsafe-eval` CSP. **Deferred, not
  rejected**: the explicit graduation target *if* the experiment earns it. Its model/runtime
  research is already done (prior brainstorm's 2026-06-22 research note).
- **Generative summaries / any generative LLM** (§6) — out. This is retrieval, not generation.
- **"More like this" lateral recall** — parked with the Recall v2 slice; revisit separately.
- **Embedding-based session clustering** (§9) — a different parked feature; not this slice.
- **Multilingual / non-English** — the static models are English-first; out for v1.
- **Chunking long articles into multiple vectors, and cross-device vector sync** — one vector
  per page, local only.

---

## Key Decisions

- **Fork C (static embeddings) over fork A (neural model).** No validated demand → minimize
  carrying cost. Fork C avoids a build step, WASM, a scarier CWS review, and battery draw on a
  tab-*bloat* tool, at the price of retrieval quality. Matches ypuf's "start timid, earn the
  right to be bolder" ethos (§5a); the upgrade path to A stays clean.
- **Build it as a reversible experiment, not a finished feature.** Because demand is unvalidated
  (see Assumptions), the bet is shaped to be cheaply removed or graduated — reversibility (R8)
  and a keep/kill criterion are first-class, not afterthoughts.
- **Blend semantic into the existing ranking, not a separate mode.** Mirrors the established
  intent-blend pattern in recall and keeps recall a single calm box (R6).

---

## Dependencies / Assumptions

- **ASSUMPTION (load-bearing): no observed felt demand.** The owner could not recall a query
  keyword search failed. The entire shape (cheap, reversible, experiment-framed) follows from
  this. If usage validates the feature, graduate; if not, remove.
- Depends on the **existing local content index** (per-page readable text) as the embedding
  input — no new capture, no new host permission.
- **Static-embedding quality is a notch below a neural model** (a Mar-2026 browser test put a
  `potion` static model at retrieval ≈35 vs MiniLM ≈42). Accepted; the gap is itself part of
  what the experiment measures.
- The ~8–30MB asset is **fetched on opt-in, not bundled** — bundling would tax every user who
  never enables the feature, breaking "off-by-default costs nothing."

---

## Outstanding Questions

### Resolve Before Planning

- None. The build-approach fork is resolved (C), and the demand framing is resolved (reversible
  experiment with a keep/kill criterion). Everything below is genuinely better answered during
  planning.

### Deferred to Planning

- [Affects R5][Needs research] Which exact static-embedding model (Model2Vec / `potion-*`
  variant) and its real retrieval quality on a sample of actual ypuf page content — validate
  before committing.
- [Affects R2][Technical / security] Where the static asset is fetched from (trusted origin +
  integrity/hash check) and the fetch mechanism, keeping page content and queries on-device.
- [Affects R6][Technical] The exact blend formula (semantic similarity × keyword relevance ×
  intent signal) as a pure, tested scoring core; tune via dogfood.
- [Affects R7][Technical] Vector storage shape + budget within the §11 index cap; whether
  per-page averaging suffices or long articles need a cheap split.
- [Affects R5][Technical] Confirm fork C truly needs no offscreen-document / WASM runtime (a
  pure-JS path), unlike the neural fork the prior research assumed.
- [Affects R8/R9][Product, low-stakes] Whether "by meaning" matches get a quiet UI marker or
  stay an invisible blend.
