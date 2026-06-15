---
date: 2026-06-14
topic: ypuf-v1-sequence-and-slice1
---

# ypuf v1 Build Sequence & Slice 1 (Recall + Archive Shelf)

## Summary

A dependency-aware build sequence for ypuf v1, and a full requirements spec for **slice 1**: a recall-first foundation on the tab-out MV3 scaffold. The user lets a tab go by hand; ypuf extracts its readable content, indexes it locally, and closes the tab. A hotkey command bar searches everything that's been let go and restores in under a second; a light toolbar popup shows the recent let-go list and hosts archiving + privacy controls. Dwell/revisit tracking runs silently in the background — banking data for the auto-let-go engine in slice 2, consumed by nothing yet.

---

## Problem Frame

Tab managers are a graveyard because they become junk drawers you save into and never revisit, and because they make you do organizing work (see CONTEXT §3). ypuf's bet is the opposite emotional core — *permission to let go: close everything, trust that nothing important is lost.* The defensible part isn't the tab management (Chrome keeps absorbing that); it's **cross-source, full-content recall** — the part browsers won't build.

v1 as scoped in CONTEXT §12 is ~8 features deep, with real dependencies between them: auto-let-go is unsafe until recall exists to catch what it releases, and both sit on a dwell/revisit signal layer that has to be collecting data before it can be trusted. Building the hero (auto-let-go) first inverts that dependency chain and front-loads the product's single largest risk — *one wrong auto-close loses the user permanently* (CONTEXT §14) — onto unproven infrastructure. The work this doc scopes is the inverse: build the safety net and the moat first, start the signal meter running, and earn the right to automate later.

---

## v1 Build Sequence

The spine, ordered by dependency. Slice 1 is the subject of the detailed requirements below; slices 2–5 are captured here as durable sequencing decisions, not yet specced.

```mermaid
graph LR
    S1["Slice 1<br/>Recall + Archive Shelf<br/>(+ passive signal, + privacy)"]
    S2["Slice 2<br/>Auto-let-go<br/>(the hero, + 'puff')"]
    S3["Slice 3<br/>Snooze"]
    S4["Slice 4<br/>Session clustering<br/>+ context restore"]
    S5["Slice 5<br/>Flashcard / jivx widget"]
    S1 -->|recall makes it safe;<br/>signal has real data| S2
    S1 -->|reuses shelf + capture path| S3
    S1 -->|reuses signal + shelf| S4
    S5 -.->|fully decoupled<br/>(parallelizable)| S1
```

- **Slice 1 — Recall + archive shelf.** Manual let-go, archive-time content capture, command-bar recall, light popup shelf. Passive dwell/revisit collection starts here. Privacy woven in. *(This doc.)*
- **Slice 2 — Auto-let-go (the hero).** Conservative zombie heuristics, never-touch list, instant undo, learn-from-reopen, the "puff." Safe by construction because slice 1's net already exists and the signal layer now has weeks of real data to tune thresholds against.
- **Slice 3 — Snooze.** Voluntary twin of auto-let-go; reuses the archive shelf + capture path plus `chrome.alarms` for guaranteed return.
- **Slice 4 — Session clustering + context restore.** Reuses the signal layer (`openerTabId` + temporal burst + co-activation) and the shelf; restores a set with scroll position, partial and editable.
- **Slice 5 — Flashcard / jivx widget.** New-tab SRS surface + jivx deck funnel. Touches none of the tab signal layer — parallelizable, can slot earlier if a funnel is wanted sooner.

---

## Actors

- A1. **Tab-drowning knowledge worker** — the primary actor slice 1 optimizes for. Keeps dozens of tabs open as open loops, fears losing context, currently re-googles or hoards. Wants to close things and still find them.
- A2. **Japanese learner (jivx prospect)** — the funnel audience for the slice 5 widget. Not served by slice 1; named here only to mark that slice 1's surfaces (popup, command bar) must not squat on the new-tab page the widget will own.

---

## Key Flows

- F1. **Let a tab go (manual archive)**
  - **Trigger:** User invokes archive on the active tab (keyboard shortcut, context menu, or popup button).
  - **Actors:** A1
  - **Steps:** Check the tab against the incognito + blocklist exclusions (R14, R15) → extract the page's readable content (or, for a blocklisted page, capture title + URL only) → write to the local index with title, URL, and timestamp → close the tab → show a brief undo affordance.
  - **Outcome:** The tab is gone from the strip; its content is recallable; the user can undo within the grace window.
  - **Covered by:** R4, R5, R6, R7, R15

- F2. **Recall something let go (Flow)**
  - **Trigger:** User presses the recall hotkey from anywhere.
  - **Actors:** A1
  - **Steps:** Command-bar overlay opens → user types → fuzzy search runs over title + URL + content → user selects a result → the page reopens.
  - **Outcome:** The page is back in under a second; the shelf entry persists (recall is non-destructive).
  - **Covered by:** R8, R9, R10

---

## Requirements

**Foundation**
- R1. Build on the tab-out MV3 scaffold (manifest, background service worker, `chrome.tabs` listeners), lifting deliberately and preserving attribution per `NOTICE.md`.
- R2. Vanilla JS, no build step — edit files, reload the extension, done.
- R3. Request only the permissions slice 1 needs; content extraction is injected at archive time, not granted as blanket continuous host access.

**Let-go (manual archive)**
- R4. The user can let go of the active tab via at least one explicit trigger (keyboard shortcut and/or context menu and/or popup button).
- R5. On let-go, extract the page's **readable article content** (reader-mode extraction, Readability-style) — body text only, skipping nav, sidebars, and form fields.
- R6. Capture happens **only at let-go**, never continuously while browsing. Currently-open tabs are never indexed.
- R7. After capture, the tab is closed and a brief **undo** affordance lingers for ~6 seconds; undo reopens the tab and removes the just-created index entry. The toast also dismisses on click, and rapid successive let-gos stack as separate toasts (most-recent on top), each reversing its own archive. Once the window expires the archive is final — recoverable thereafter only through recall.

**Recall (Flow)**
- R8. A global hotkey opens a command-bar overlay from anywhere; the overlay closes on Esc, backdrop-click, or a second press of the hotkey. The recall hotkey and the archive trigger are user-remappable via Chrome's extension-shortcuts settings, and the popup surfaces the current binding so a remapped shortcut stays discoverable.
- R9. Search is fuzzy and spans **title + URL + page content**. The recall surface distinguishes two empty states: *nothing indexed yet* (no archives exist — invite the first let-go) versus *no match* (archives exist but none match the query).
- R10. Selecting a result reopens the page in **under one second** — recall must feel faster than re-googling. Recall is non-destructive; the shelf entry remains after restore.

**Shelf surface (toolbar popup)**
- R11. A toolbar popup shows a **reverse-chronological "recently let go" list** — visible proof the net exists. Its empty state (before any let-go) invites the first archive rather than showing a blank panel, since this surface *is* the trust signal.
- R12. The popup is where the user triggers a manual archive (R4) and reaches the privacy controls (R17, R18).
- R13. The **new-tab page is left untouched** in slice 1 (reserved for the slice 5 widget); no scan-and-prune dashboard is built.

**Privacy (woven in, load-bearing)**
- R14. **Incognito windows are never indexed** — no capture at all, not even title/URL.
- R15. Ship a **blocklist of sensitive domains** (banking, health, government, password managers), **user-extensible**. When a blocklisted page is let go, store **title + URL only — never page content**, with **query strings stripped** from the stored URL by default (paths may still carry IDs — see Outstanding Questions). Exclusion checks (incognito R14 and the blocklist) are evaluated against the tab's URL **before any content is extracted** — gate-then-extract, never extract-then-gate. Adding a domain to the blocklist **retroactively purges** content already indexed from it, downgrading existing entries to title + URL only.
- R16. **Never capture input/field values** under any circumstance.
- R17. A **"what's indexed" view** lets the user see what ypuf has stored.
- R18. **One-click forget** removes a single page or an entire domain from the index. Single-page forget is one click with a brief undo; **domain-level forget requires a confirmation** (it is bulk and irreversible), consistent with the "nothing is ever lost" promise.

**Passive signal collection (no surface)**
- R19. Track **dwell and revisit** per page in the background and persist it, where **dwell means foreground active-time** (window focused + tab active), *not* raw open-duration — raw duration is the noise CONTEXT §4 warns against. The same **incognito + blocklist exclusions** that govern capture (R14, R15) also suppress signal collection. No UI in slice 1; this exists solely to give slice 2's auto-let-go real data to tune against.

**Storage**
- R20. Persist full page content in **IndexedDB** (local-only; `chrome.storage.local` quota is too small for page text). Nothing is ever transmitted off-device.
- R21. Apply a **retention cap / prune policy** so the content index cannot grow unbounded (default proposed in planning — see Outstanding Questions).

---

## Acceptance Examples

- AE1. **Covers R5, R6.** Given a normal article tab the user is reading, when they let it go, then ypuf extracts the article body (not the nav or comment form), stores it, and closes the tab — and a different tab that was merely open the whole time is never indexed.
- AE2. **Covers R14.** Given a page open in an incognito window, when the user lets it go, then nothing is written to the index — no content, no title, no URL.
- AE3. **Covers R15.** Given a banking page on the sensitive-domain blocklist, when the user lets it go, then only its title and URL are stored and its page content is not — and the entry is still findable in recall.
- AE4. **Covers R10.** Given a page let go yesterday, when the user opens the command bar and types a phrase from its body text, then a matching result appears and reopens the page in under a second.
- AE5. **Covers R7.** Given the user just let go of a tab, when they trigger undo within the grace window, then the tab reopens and its index entry is removed as if it never happened.
- AE6. **Covers R18.** Given a page in the "what's indexed" view, when the user clicks forget on its domain, then every entry from that domain is removed from the index.

---

## Success Criteria

- A dogfooding user can let go of tabs all day and reliably retrieve any of them by content in under a second — and *feels* safe doing so because the popup shows the net is real.
- Recall is fast and accurate enough that the user stops re-googling pages they've already read.
- No content from incognito or blocklisted domains is ever indexed: those exclusions behave exactly as specified, verifiably, from day one. (Sensitive content on *non*-blocklisted domains is a known residual — see Outstanding Questions.)
- By the time slice 2 begins, the signal layer has accumulated real dwell/revisit data across the dogfooder's actual browsing — enough to set conservative zombie thresholds against evidence rather than guesses.
- `ce-plan` can take this doc and decompose slice 1 without having to invent any user-facing behavior, scope boundary, or privacy rule.

---

## Scope Boundaries

- **Auto-let-go (slice 2), snooze (slice 3), session clustering/restore (slice 4), and the flashcard/jivx widget (slice 5)** are out of slice 1. Only *passive* signal collection (R19) lands now; nothing acts on it.
- **No continuous content indexing.** Capture is at let-go only (R6). Recall covers what's been released, not the whole reading history.
- **No new-tab dashboard / scan-and-prune surface** (CONTEXT §9 anti-pattern). The new-tab page stays free for the widget.
- **No runtime AI, no BYO-key, no local model** (CONTEXT §6).
- **No cross-device sync** (CONTEXT §9 — a later paid/jivx-account upsell; drags in backend + payment).
- **Not the "puff" delight moment** — it's tied to the auto-let-go act and ships in slice 2. Manual let-go gets a plain undo toast, not the signature animation.

---

## Key Decisions

- **Recall-first sequence.** Build the moat + safety net before the hero, so auto-let-go ships safe-by-construction and the #1 risk (one wrong close loses the user) is mitigated before automation exists.
- **Capture at let-go, not continuously.** Yields full recall of everything released while keeping the privacy and storage surface small and easy to explain — and slice 2's auto-let-go inherits the exact same capture-then-close path, triggered automatically.
- **Passive signal collection starts in slice 1.** Accepts a little not-yet-read code now to bank weeks of real data, so slice 2 can tune zombie thresholds against evidence (resolves the dogfooding dependency in CONTEXT open Q #2).
- **Surfaces: command bar + light popup, new-tab untouched.** Keeps the product calm and avoids the manual-visibility dashboard anti-pattern, while still giving a visible "here's the net" surface for trust. New-tab is reserved for the slice 5 widget.
- **Blocklisted domains: title + URL only.** A middle path between "skip entirely" (loses recallability) and "index everything" (stores sensitive content) — the page stays findable, nothing sensitive is indexed.
- **Vanilla JS, no build step.** tab-out's ethos (CONTEXT §10) — fastest path to a dogfoodable extension; third-party libs (Readability) vendored as scripts. Accepts no static types and manual module wiring as the cost.

---

## Dependencies / Assumptions

- **tab-out** (`reference/tab-out/`, MIT © Zara Zhang, gitignored) is present and lift-able for the MV3 baseline, tab enumeration, focus-tab, and the close-sound/confetti primitives. Attribution preserved per `NOTICE.md`.
- **Readability** (Mozilla) is the content-extraction approach — chosen both for extraction quality and because skipping nav/forms drops a lot of incidental PII, supporting the privacy promise.
- **IndexedDB** is the content store; `chrome.storage.local` for small state.
- Slice 5's deck format and the jivx-side export are **not** dependencies of slice 1.

---

## Outstanding Questions

_No blocking questions remain — the build-approach decision (vanilla JS) is settled above. The rest are technical questions best answered during planning._

### Deferred to Planning

- [Affects R21][Technical] Default **retention cap / prune policy** for the IndexedDB content index — by count, age, byte budget, or a mix (CONTEXT open Q #4). Propose a conservative default in planning.
- [Affects R15][Technical] Query strings are now stripped from blocklisted-domain URLs by default (R15). Open: should the **path** be stripped too (a bank URL can carry an account id in the path), accepting reduced recallability for those entries? Decide in planning.
- [Affects R4][Technical] Which archive trigger(s) to ship first — keyboard shortcut, context menu, popup button, or all three — and the exact default hotkeys for archive (R4) and recall (R8).
- [Affects R10][Needs research] Search/index mechanism that holds the sub-second recall bar over a growing content index (e.g., an inverted index vs. naive scan) — validate during planning.

---

## Deferred / Open Questions

### From 2026-06-14 review

Surfaced by `ce-doc-review` (best-judgment route). These are premise/strategy and open-design calls held for you or for planning, distinct from the spec fixes already applied above.

**Premise — the recall-first safety case**

- [P1] *"Full recall of everything released" overstates capture coverage* (adversarial). A tab Chrome discards via memory-saver, or that dies in a crash, leaves with **no index entry** — capture only fires on a live DOM at let-go. Decide: restate the claim conditionally, and/or add a discarded-tab path (reload-then-extract, or title+URL fallback marked content-less) rather than a silent gap.
- [P1] *Slice 2 can't run Readability on a discarded zombie tab* (adversarial). Auto-let-go targets old, backgrounded tabs — precisely the ones Chrome has most likely already discarded, where the shared capture path has no live DOM. The "safe by construction" claim rests on this untested transfer; validate extraction on a backgrounded/discarded tab **in slice 1** before relying on it.
- [P1] *The manually-populated net may be near-empty* (product-lens, adversarial). The target user (A1) hoards rather than voluntarily archiving, so both the recall-validation and signal-tuning goals can fail quietly during slice-1 dogfooding. Consider a slice-1 index-population metric, or an explicit felt-value / gentle-nudge hypothesis, so the safety case isn't built on unobserved engagement.

**Strategy — what slice 1 actually proves**

- [P2] *Slice 1 standalone ≈ OneTab + full-text search* (product-lens). It validates the **least-differentiated** part of the thesis while the differentiators (auto-let-go, session recall) ship later. State what hypothesis slice 1 validates vs. defers, so its dogfooding feedback isn't over-read as a verdict on the auto-let-go bet.
- [P2] *Signal collected but unverifiable in slice 1* (product-lens). R19 data is consumed by nothing until slice 2, so there's no way to confirm it's correct/complete before slice 2 depends on it. Consider a minimal dev/debug surface to sanity-check the banked data.

**Open design — interaction detail for planning**

- [P2] *"What's indexed" view IA* (design-lens). Entry point, how items are listed (reverse-chron? by domain?), and how per-item vs. per-domain forget (R18) is surfaced are all unspecified.
- [P2] *Large-shelf behavior* (design-lens). For the heavy user this product targets: max items shown in the popup, scroll vs. paginate, and whether a "see all" path routes into the what's-indexed view (R11).
- [P2] *Blocklisted-domain let-go feedback* (design-lens). A title-only archive gives no signal that content was intentionally skipped — it can read as a bug on later recall. Decide whether the undo toast or what's-indexed view distinguishes title-only entries from full-content ones (R15).
