---
date: 2026-06-15
topic: ypuf-slice2-auto-let-go
---

# ypuf Slice 2 — Auto-let-go (the hero)

## Summary

Auto-let-go is the hero: ypuf silently clears tabs that have gone stale, with the "puff", catching everything in slice 1's recall net so nothing is lost. **v1 ships a conservative core** — it auto-closes only unmistakable zombies and learns one signal: when you reopen something it closed, it stops auto-closing that domain. The gray-zone shadow/promotion learning system is **deferred** until dogfooding proves the core is safe and the calibration data is real. Reversal is calm and passive (the popup's recently-let-go list), with an ambient "it's on and working" surface so the feature is never invisible, and an end-of-session relief moment. This is slice 2 of the v1 sequence; it builds on slice 1's capture pipeline, recall command bar, popup shelf, and dwell/revisit signal collector.

---

## Problem Frame

The product's whole promise is *permission to let go — close everything, trust nothing important is lost* (CONTEXT §3). The felt magic — a desk that clears itself — only arrives when ypuf lets tabs go *for* you. That is also the product's single largest risk: **one wrong auto-close of something precious loses the user forever** (CONTEXT §14). Slice 1 was built so this slice could ship safely: the recall net exists and the dwell/revisit signal has been banking. The work here is to turn that into automatic, calm clearing — conservative enough to never burn a user, magical enough to feel like a clear desk. The review of the first draft of this doc made one thing sharp: the safety case has to be *real*, not assumed. Several requirements below exist specifically to close holes that draft left open (capture-failure silent loss, restored-session mass-close, an unfalsifiable "0 lost").

---

## Actors

- A1. **Tab-drowning knowledge worker** — the primary actor. Keeps dozens of tabs open as open loops; wants the dead ones gone without organizing work, and cannot tolerate losing a live one.

---

## Key Flows

- F1. **Auto-let-go a zombie**
  - **Trigger:** Background evaluation finds an open tab in the ultra-safe class.
  - **Actors:** A1 (passive)
  - **Steps:** Confirm the privacy gate (incognito/blocklist/scheme) **and** the never-touch list pass → capture its content (reuse slice 1's pipeline; discarded → title+URL floor) → **only if capture persisted**, close it with the "puff" → add it to the recently-let-go list. No interrupt, no confirmation.
  - **Outcome:** The tab is gone, recallable, reversible from the popup; the strip is lighter; the ambient indicator reflects it.
  - **Covered by:** R1, R2, R3, R5, R6, R7, R8, R9, R10, R12, R17

- F2. **Learn from a reopen**
  - **Trigger:** The user reopens (via recall or the popup) a tab ypuf auto-let-go.
  - **Actors:** A1
  - **Steps:** Record the strongest "I wanted that" signal → protect that **domain** from future auto-close → surface it in the (legible, correctable) protected-domains view.
  - **Outcome:** ypuf visibly gets smarter ("keeping: github.com"); that domain stops being auto-closed; the user can un-protect it later.
  - **Covered by:** R13, R14

---

## Requirements

**Eligibility — what becomes a zombie**
- R1. Track **per-tab staleness** — open-time and last-activated per tab (slice 1's signal is keyed by URL, not tab). A tab is *stale* when open and not activated for a (tunable) window. A tab must also pass a **grace floor**: it has been observed across at least one genuine browsing-active period, so "stale" can never fire on a set the user has not yet had a chance to touch.
- R2. The **ultra-safe tier** (the only tier that auto-closes in v1): stale + **zero revisits and foreground dwell below a floor** (slice 1's signal — the "opened but never engaged" zombie, CONTEXT §4's intentional-loop-vs-forgotten disambiguation) + grace-floor-passed + not part of a restored-session/bulk-open burst (R3) + passes the never-touch list + obvious dead duplicates. Conservative defaults, tuned by dogfooding.
- R3. **Never auto-close restored-session or bulk-open tabs.** Tabs created in a tight burst at session/window start (session restore, "open all bookmarks", a link-dump) are a curated working set, not zombies — exclude them from auto-close regardless of activation state.
- R4. Importance weighting uses slice 1's per-URL dwell + revisit signal: a URL with meaningful revisits or foreground dwell is load-bearing intent and is **protected**, not a zombie. (In v1 this is a protection filter, not a separate learning system — see Scope Boundaries for the deferred gray-zone learning.)

**Never-touch list (load-bearing safety)**
- R5. Never auto-close a tab that: is **playing audio** (`tab.audible`), has **unsaved form input** (live-DOM check), is **pinned**, was **recently active or frequently revisited**, or is on a **learned-protected domain** (R13) or the privacy blocklist. (Mid-flow login/checkout detection is deferred to v2 — see Scope Boundaries; the fail-safe R7 covers the gap meanwhile.)
- R6. The never-touch list and privacy gate are evaluated **immediately before** each auto-close, not just at candidacy time.
- R7. **Fail safe.** When any safety check is uncertain or cannot run (e.g., a discarded tab whose live DOM can't be inspected, ambiguous heuristics), ypuf **does not close and does not capture** — uncertainty always resolves to leaving the tab open.

**Auto-close behavior + safety invariants**
- R8. Auto-close is **silent and calm** — no modal, no confirmation, no per-close interrupt (a confirm rebuilds manual closing — CONTEXT §9).
- R9. Closing reuses slice 1's **capture-then-close** path: capture content first so the tab is recallable; a discarded/restricted tab falls to the title+URL floor. **Auto-closed zombies (usually discarded) recall by title+URL only** — the "nothing lost" promise for auto-closed tabs is *navigability* (get back to it), not full-content recall. Accepted: by R2 these are the low-engagement tabs by definition, and pre-capture would re-open the continuous-capture surface slice 1 rejected.
- R10. **Never close a tab whose capture did not persist.** If capture fails or is gated off (blocklist/incognito/scheme), the tab is **excluded from auto-close** (left open) — never closed-without-a-recall-entry. A blocklisted tab is *never-auto-closed*, not *capture-skipped-then-closed*.
- R11. The **privacy gate** (incognito, blocklist, http(s)-only) is evaluated **before any content-script injection** for auto-capture, not only before close. Capture stays local-only.
- R12. **The "puff"** — re-seated for the background case: the audio cue is produced via an offscreen document (a service worker has no Web Audio), and the visual "puff" lives on a ypuf surface the user is actually viewing (the popup / relief moment), since a tab the user isn't looking at has no surface to fade. tab-out's `playCloseSound`/`shootConfetti` are the material, not a drop-in.

**Reversal, relief, discoverability**
- R13. Auto-closed tabs feed slice 1's **popup "recently let go" list** — the always-available passive undo surface (one-tap restore). There is **no per-close transient toast** (the silent-close decision); the popup is the undo surface. Recall is the deep net underneath.
- R14. **Reopen-protection (the only learning in v1):** reopening an auto-let-go tab **protects its domain** from future auto-close. Protected domains are **visible and removable** (un-protect), reusing slice 1's "forget" legibility pattern. The protected-domain list is sensitive behavioral data and is covered by slice 1's local-only + user-purgeable controls.
- R15. An **end-of-session relief moment** in the popup: a once-per-day-on-next-popup-open panel showing the count and the honest framing **"N let go — all recoverable"** (not "0 lost"; see R16). The calm payoff, not a per-close prompt.
- R16. **Discoverability:** an ambient surface makes clear auto-let-go is on and working — at minimum a popup header state ("auto-let-go: on · N let go this week") and an extension-icon badge that increments — so a user's first awareness of the feature is never a missing tab.

**Permissions**
- R17. Auto-capture fires without a user gesture, so slice 2 takes **scoped `host_permissions`** (slice 1's `activeTab` cannot cover non-gesture injection). The manifest does **not** use `<all_urls>`/`https://*/*` without documented justification; the privacy blocklist gates injection in code as a second, independent gate.

---

## Acceptance Examples

- AE1. **Covers R2, R5, R6, R7, R8, R9, R10, R12.** Given a tab open 5+ days, grace-floor-passed, never meaningfully activated, not playing audio / pinned / with unsaved input, when evaluation runs, then ypuf captures it, and **only because capture persisted** closes it with the puff, fires no notification, and it appears in the recently-let-go list.
- AE2. **Covers R5, R7.** Given a stale tab that is playing audio (or has unsaved form input, or is pinned), when evaluation runs, then ypuf never auto-closes it.
- AE3. **Covers R3.** Given the browser restores 25 tabs on startup and the user clicks into 2, when the staleness window elapses, then ypuf auto-closes **none** of the other 23 (restored-session exclusion).
- AE4. **Covers R10, R11.** Given a stale tab on the privacy blocklist (or where capture is gated), when evaluation runs, then ypuf **leaves it open** — it is never closed without a persisted recall entry.
- AE5. **Covers R14, R13.** Given ypuf auto-let-go a `news.com` tab, when the user reopens it, then `news.com` is protected, no further `news.com` tab is auto-closed, and `news.com` appears in the protected-domains view where the user can un-protect it.
- AE6. **Covers R1.** Given a tab open 6 days but repeatedly revisited, when evaluation runs, then ypuf treats it as load-bearing (not stale) and does not auto-close it.
- AE7. **Covers R8, R13, R15.** Given several tabs are auto-closed at once, when they close, then no per-close notification fires; they all appear in the recently-let-go list, and the relief moment shows the total with "all recoverable".
- AE8. **Covers R9.** Given an auto-closed tab that Chrome had discarded (no live DOM), when it is captured, then its recall entry is title+URL only (navigability, not full-content recall — the accepted v1 fidelity for auto-closed zombies).

---

## Success Criteria

- A dogfooding user's dead tabs quietly disappear, the strip gets lighter, and they **trust it**: zero never-touch violations, and zero auto-closes the dogfooder judges "precious" on an after-the-fact audit of the **closed set** (not just the reopened set — that is how a silent wrong-close is actually measured).
- The first auto-closes are felt, not alarming: no interrupts, the ambient indicator + relief moment make clear ypuf is working, and the recently-let-go list proves every close is recoverable.
- ypuf demonstrably learns: at least one reopen protects a domain, visibly, and the protected-domain view is legible and correctable.
- Every auto-close is recoverable from recall or the recently-let-go list — the system never asserts a "0 lost" claim it cannot verify; it asserts "all recoverable", which it can.
- `ce-plan` can decompose this without inventing the trust model, the safety invariants, or the reversal/discoverability surfaces.

---

## Scope Boundaries

- **Gray-zone shadow/promotion learning** — observing keep-vs-close per domain and promoting a domain to auto-close once "its pattern looks safe." Deferred: its correctness conditions are unknown before dogfooding, it is a second stateful system whose failure mode is the #1 risk, and silent close corrupts its primary signal. v1 ships the ultra-safe tier + reopen-protection; the gray zone is simply *not auto-closed*. Revisit once the core is proven and there is real calibration data.
- **A standalone "getting smarter" / learning dashboard** — v1 surfaces protected domains as a small legible+correctable list (R14), not a dedicated panel (the §9 manual-visibility anti-pattern).
- **Mid-flow login/checkout detection** — the hardest never-touch signal; v2 hardening. v1 relies on the mechanically-detectable guards (R5) + the fail-safe (R7).
- **Propose-then-confirm prompts** — parked (CONTEXT §9).
- **URL path-pattern learning** ("keep GitHub PRs, not repo browse") — v2 refinement; v1 learns per domain.
- **Cross-device sync** of learned preferences / protected domains — later paid/jivx-account tier.
- **Pre-capture-before-discard or reload-then-extract for full-content zombie recall** — rejected for v1. Auto-closed zombies recall by title+URL (navigability, R9); pre-capture re-opens continuous capture (slice 1 rejected it), reload-then-extract is heavy (re-fetch, expired sessions). Revisit only if zombie *content* recall proves valuable in dogfooding.
- **Session clustering / context restore (slice 4)** and the **flashcard widget (slice 5)** — later slices.

---

## Key Decisions

- **Silent close + passive undo surface, made discoverable.** No per-close interrupt and no transient toast; the popup's recently-let-go list is the reversal, recall is the deep net, the relief moment is the payoff — but an ambient on/working indicator (R16) ensures the hero is never invisible to the point of "did it do anything?" or "where did my tab go?".
- **Conservative core; defer the learning system.** v1 = ultra-safe auto-close + reopen-protection only. The gray-zone shadow/promotion machinery is deferred until the core is proven and calibration data is real — this both de-risks the #1 risk and sidesteps that silent close corrupts shadow-learning's signal.
- **Safety invariants over reach.** Uncertainty fails safe (R7); a tab is never closed without a persisted recall entry (R10); the privacy gate runs before injection, not just before close (R11); restored sessions are excluded (R3). Reach is allowed to shrink so trust never does.
- **Honest claims.** The relief moment says "all recoverable" (verifiable), never "0 lost" (unmeasurable under silent close), and the dogfooding success bar audits the closed set, not just the reopened set.
- **Zombie recall = title+URL (navigability), not full content.** Keeps slice 1's archive-time-only capture model intact; pre-capture (continuous) and reload-then-extract (heavy) both rejected for v1.
- **Ultra-safe eligibility is signal-gated** (R2): stale + zero revisits + sub-floor dwell — the intentional-loop-vs-forgotten disambiguation slice 1's signal collector exists to enable, catching "opened but never engaged" while staying conservative.
- **Domain-level learning.** Reopen-protection operates on the hostname — legible and generalizes from one reopen; its coarseness (one reopen exempts a busy hostname) is bounded by making protection visible and un-protectable (R14). Path-pattern precision is v2.

---

## Dependencies / Assumptions

- Builds on slice 1: the capture-then-close pipeline (with the discarded-tab title+URL floor), the recall command bar, the popup recently-let-go shelf (the reversal surface), and the dwell/revisit signal collector (`chrome.storage.local` `signal`, keyed by URL).
- **New machinery slice 2 adds:** per-tab staleness + grace-floor tracking (R1), restored-session detection (R3), the never-touch detectors (R5), an **offscreen document** for the puff audio (R12), the ambient discoverability surface (R16), and the protected-domain list + management (R14).
- **Permission expansion:** scoped `host_permissions` for non-gesture capture (not `<all_urls>`); blocklist gates injection in code independently of the manifest grant.
- **Assumption (now a go/no-go, not background):** the slice-1 signal has accumulated enough real dwell/revisit data to set conservative thresholds against evidence — a minimum-observation bar should gate enabling any auto-close (see Outstanding Questions).
- The slice-1 requirements doc and code live on the slice-1 branch / PR #1; this slice's *code* depends on that being merged (or branched from) before `/ce-work`.

---

## Outstanding Questions

### Resolve Before Planning

- None — both product forks are resolved: zombie recall = title+URL / navigability (R9, Key Decisions), and the ultra-safe tier is signal-gated (R2, Key Decisions).

### Deferred to Planning

- [Affects R1][Needs research] Whether per-tab staleness + grace floor can be tracked from `chrome.tabs`/`windows` events across service-worker termination, or needs a periodic reconcile against `chrome.tabs.query` (persisting last-activated, not just the open set).
- [Affects R3][Technical] How to detect a restored-session / bulk-open burst reliably (tight creation window at session start, no opener).
- [Affects R5][Technical] Unsaved-input detection on live tabs, and the threshold for "recently active / frequently revisited".
- [Affects R15, R16][Technical] Exact relief-moment copy/layout and the badge's increment/clear behavior.
- [Affects R17][Technical] The concrete scoped `host_permissions` match set.
