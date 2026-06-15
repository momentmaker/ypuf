---
date: 2026-06-15
topic: ypuf-slice2-auto-let-go
---

# ypuf Slice 2 — Auto-let-go (the hero)

## Summary

Auto-let-go is the hero: ypuf silently clears tabs that have gone stale, with the "puff", catching everything in slice 1's recall net so nothing is lost. v1 runs a **hybrid trust ramp** — it auto-closes only unmistakable zombies from day one and shadow-learns the ambiguous ones, promoting a class to auto-close once its keep-vs-close pattern looks safe. Reversal is calm and passive (the popup's recently-let-go list + an end-of-session relief moment), never a per-close interrupt. Learning is per domain. This is slice 2 of the v1 sequence; it builds directly on slice 1's capture pipeline, recall command bar, popup shelf, and dwell/revisit signal collector.

---

## Problem Frame

The product's whole promise is *permission to let go — close everything, trust nothing important is lost* (CONTEXT §3). Slice 1 delivered the safety net (recall) and started banking the signal (dwell/revisit per URL). But the felt magic — a desk that clears itself — only arrives when ypuf actually lets tabs go *for* you. That is also the product's single largest risk: **one wrong auto-close of something precious loses the user forever** (CONTEXT §14). Slice 1 was built specifically so this slice could ship safely: the recall net already exists, and there is real signal data to calibrate against. The work here is to turn that foundation into automatic, calm, trustworthy clearing — conservative enough to never burn a user, magical enough to feel like a clear desk.

---

## Actors

- A1. **Tab-drowning knowledge worker** — the primary actor. Keeps dozens of tabs open as open loops; wants the dead ones gone without doing organizing work, and cannot tolerate losing a live one.

---

## Key Flows

- F1. **Auto-let-go a zombie**
  - **Trigger:** Background evaluation finds an open tab in the ultra-safe (or a promoted) class.
  - **Actors:** A1 (passive)
  - **Steps:** Confirm the tab passes the never-touch list → capture its content (reuse slice 1's pipeline; discarded tab → title+URL floor) → close it with the "puff" → add it to the recently-let-go list. No interrupt, no confirmation.
  - **Outcome:** The tab is gone, recallable, reversible from the popup; the strip is lighter.
  - **Covered by:** R1, R2, R5, R6, R8, R12

- F2. **Learn from a reopen**
  - **Trigger:** The user reopens (via recall or the popup) a tab ypuf auto-let-go.
  - **Actors:** A1
  - **Steps:** Record the strongest "I wanted that" signal → protect that **domain** from future auto-close.
  - **Outcome:** ypuf visibly gets smarter ("kept: github.com"); that domain stops being auto-closed.
  - **Covered by:** R9, R10

- F3. **Shadow-then-promote a gray-zone class**
  - **Trigger:** A stale tab has some revisit/dwell signal (not an obvious zombie).
  - **Actors:** A1 (passive)
  - **Steps:** Mark it as a candidate, close nothing → observe whether the user keeps or closes that domain's tabs → once the keep-vs-close pattern for the domain looks safe, promote the domain to auto-close.
  - **Outcome:** The gray zone is cleared only after it is calibrated; the wrong-close risk is spent where it is lowest.
  - **Covered by:** R3, R4, R9, R11

---

## Requirements

**Zombie detection**
- R1. Track **per-tab staleness** — open-time and last-activated per tab — since slice 1's signal is keyed by URL, not tab. A tab is *stale* when it has been open and not activated for a (tunable) window.
- R2. The **ultra-safe tier** (auto-closed from day 1): stale + literally never activated since open + passes the never-touch list (and obvious dead duplicates). Conservative defaults, tuned by dogfooding.
- R3. The **gray zone** (stale but with revisit/dwell signal from slice 1, or otherwise ambiguous): marked as a candidate, **never auto-closed until its class is promoted** (R11).
- R4. Importance weighting uses slice 1's per-URL dwell + revisit signal: a URL with meaningful revisits or foreground dwell is load-bearing intent and is not a zombie.

**Never-touch list (load-bearing safety)**
- R5. Never auto-close a tab that: has **unsaved form input**, is **playing audio**, is **pinned**, is in a **mid-flow login/checkout**, was **recently active or frequently revisited**, or is on a **learned-protected domain** (R10) or the privacy blocklist.
- R6. The never-touch list is evaluated **immediately before** every auto-close, not just at candidacy time.

**Auto-close behavior**
- R7. Auto-close is **silent and calm** — no modal, no confirmation dialog, no per-close interrupt (a confirm just rebuilds manual closing — CONTEXT §9). The tab fades; the strip gets lighter.
- R8. Closing reuses slice 1's **capture-then-close** path: capture content first so the tab is recallable; a discarded/restricted tab falls to the title+URL floor.
- R9. **The "puff"** — adapt tab-out's `playCloseSound` + `shootConfetti` (parked in slice 1) into the signature soft let-go moment.

**Reversal & relief**
- R10. Auto-closed tabs feed slice 1's **popup "recently let go" list**, which is the always-available **passive undo surface** (one-tap restore). Recall is the deep net underneath.
- R11. An **end-of-session relief moment** surfaces the count ("you let go of N today, 0 lost"; Zeigarnik effect) — the calm payoff, not a per-close prompt.

**Learning**
- R12. **Learn-from-reopen:** reopening an auto-let-go tab **protects its domain** from future auto-close — the strongest "I wanted that" signal there is.
- R13. **Shadow-then-promote:** ypuf observes keep-vs-close behavior for gray-zone domains and **promotes a domain to auto-close only once its pattern looks safe**. The learning unit is the **domain (hostname)** for both protection and promotion.
- R14. The system **visibly gets smarter** — the user can see what ypuf has learned to keep (e.g., a short "keeping: github.com, figma.com" view).

**Permissions**
- R15. Auto-capture fires **without a user gesture**, so slice 2 takes scoped **`host_permissions`** (slice 1's `activeTab` cannot cover non-gesture injection). Capture stays local-only and incognito/blocklist-gated.

---

## Acceptance Examples

- AE1. **Covers R2, R5, R7, R8.** Given a tab open 5+ days, never activated, with no audio/unsaved-input and not pinned, when the background evaluation runs, then ypuf captures it, closes it with the puff, fires no notification, and it appears in the recently-let-go list.
- AE2. **Covers R5.** Given a stale tab that is playing audio (or has unsaved form input, or is pinned), when evaluation runs, then ypuf never auto-closes it.
- AE3. **Covers R3, R4.** Given a stale tab whose URL has meaningful revisits/dwell, when evaluation runs, then ypuf marks it as a gray-zone candidate and does not close it.
- AE4. **Covers R12, R10.** Given ypuf auto-let-go a `news.com` tab, when the user reopens it, then `news.com` is protected and no further `news.com` tab is auto-closed.
- AE5. **Covers R7, R10, R11.** Given several tabs are auto-closed at once, when they close, then no per-close notification fires; they all appear in the recently-let-go list, and the end-of-session relief shows the total count.
- AE6. **Covers R8.** Given an auto-closed tab that Chrome had discarded (no live DOM), when it is captured, then its recall entry is title+URL only (no full content).

---

## Success Criteria

- A dogfooding user's dead tabs quietly disappear and the strip gets lighter, and they **trust it** — across the dogfooding window, zero precious tabs are lost in a way recall can't immediately recover.
- The first auto-closes feel like magic, not alarm: no interrupts, the puff, and a recently-let-go list that proves nothing was lost.
- ypuf demonstrably gets smarter: at least one gray-zone domain promotes to auto-close, and at least one reopen protects a domain — both visible to the user.
- The never-touch list holds: no audio/unsaved-input/pinned/login-flow tab is ever auto-closed, verifiably.
- `ce-plan` can decompose this without inventing the trust ramp, the reversal model, or the learning unit.

---

## Scope Boundaries

- **Propose-then-confirm prompts** — parked (CONTEXT §9): a confirm dialog rebuilds the manual closing this product exists to kill. Auto-close is silent.
- **URL path-pattern learning** ("keep GitHub PRs, not repo browse") — v2 refinement; v1 learns per domain.
- **Cross-device sync** of learned preferences / protected domains — later paid/jivx-account tier.
- **A manual scan-and-prune dashboard** — the §9 anti-pattern; auto-let-go makes it largely unnecessary.
- **Reload-then-extract for discarded zombies** to get full content — deferred; v1 accepts the title+URL floor for auto-closed zombies (they are low-value by definition).
- **Session clustering / context restore (slice 4)** and the **flashcard widget (slice 5)** — later slices.

---

## Key Decisions

- **Silent close + passive undo surface.** No per-close interrupt; the popup's recently-let-go list is the immediate reversal, recall is the deep net, and an end-of-session relief moment is the payoff. Calmest; matches CONTEXT's invisible lean. Accepts that a precious close may be noticed late (recall recovers it).
- **Hybrid trust ramp.** Auto-close only unmistakable zombies day 1 (immediate felt win); shadow-learn the gray zone and promote per class once calibrated (wrong-close risk spent where it is lowest). Chosen over a single global threshold (risk concentrated in one number) and over observe-first-only (hero does nothing visible at first).
- **Domain-level learning unit.** Reopen-protection and gray-zone promotion both operate on the hostname — legible ("kept: github.com"), generalizes from one reopen, simplest. Path-pattern precision is a v2 refinement.
- **Shadow-learning is the primary calibration signal.** Because closes are silent, the user often won't notice a close to reopen it; watching what they manually keep vs. close carries most of the calibration weight, with reopen-protection as a strong backstop.

---

## Dependencies / Assumptions

- Builds on slice 1 (shipped): the capture-then-close pipeline (with the discarded-tab title+URL floor), the recall command bar, the popup recently-let-go shelf (the reversal surface), and the dwell/revisit signal collector (`chrome.storage.local` `signal`, keyed by URL).
- **New machinery slice 2 adds:** per-tab staleness tracking (R1), the shadow/promotion learning state keyed by domain, the never-touch detectors (audio/unsaved-input/login-flow detection is non-trivial), and the puff.
- **Permission expansion:** scoped `host_permissions` for non-gesture capture (flagged in the slice-1 plan). Capture remains local-only, incognito-excluded, and blocklist-gated.
- **Assumption:** the slice-1 signal has accumulated enough real dwell/revisit data during dogfooding to set conservative thresholds against evidence rather than guesses (the reason slice 1 started the meter early).

---

## Outstanding Questions

### Resolve Before Planning

- None blocking — the trust ramp, reversal model, and learning unit are settled above.

### Deferred to Planning

- [Affects R2][Technical] Concrete ultra-safe-tier thresholds (staleness window, "never activated" definition) and the gray-zone boundary — tune against the accumulated slice-1 signal during planning/dogfooding.
- [Affects R5][Technical] How to detect **unsaved form input** and **mid-flow login/checkout** reliably (the hardest never-touch signals) — and what to do when detection is uncertain (fail safe = never close).
- [Affects R13][Technical] What "its pattern looks safe" means concretely for promoting a domain (how much observation, what keep-vs-close ratio) — a calibration policy for planning.
- [Affects R1][Needs research] Whether per-tab staleness can be tracked from `chrome.tabs` events alone (onCreated/onActivated) across service-worker termination, or needs a periodic reconcile against `chrome.tabs.query`.
- [Affects R11][Technical] What "end of session" means for the relief moment (browser-idle, daily, on next popup open) — a cadence decision for planning.
