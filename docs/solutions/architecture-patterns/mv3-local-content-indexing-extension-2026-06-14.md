---
title: MV3 patterns for a local, privacy-first content-indexing extension
date: 2026-06-14
category: docs/solutions/architecture-patterns
module: extension (service worker, lib, overlay, popup)
problem_type: architecture_pattern
component: background_job
severity: high
applies_when:
  - Building a Chrome Manifest V3 extension that indexes page content locally
  - Injecting a content script that reads or displays the user's private data
  - Persisting state that must survive service-worker termination (~30s idle)
  - Keeping an in-memory search index consistent with an IndexedDB source of truth
  - Shipping a vanilla-JS extension with no build step that also needs node tests
tags: [chrome-mv3, service-worker, indexeddb, content-script, privacy, message-passing, no-build, minisearch]
---

# MV3 patterns for a local, privacy-first content-indexing extension

## Context

ypuf slice 1 is a Chrome MV3 extension that extracts a page's readable content at
"let-go", indexes it locally (IndexedDB + an in-memory MiniSearch index), and
recalls it by content. It is vanilla JS with no build step, and privacy
("nothing leaves the device") is load-bearing. Building it surfaced a cluster of
MV3 patterns that are non-obvious and easy to get subtly wrong — several only
caught by an adversarial/security code review of the *implementation* (the plan
review couldn't see them because the bugs lived in the Chrome-API glue). These
notes capture the reusable shape so the next MV3 content extension starts ahead.

## Guidance

### 1. Service worker as the only trusted broker; injected UI is render-only

Any script on a visited page shares that page's world with your injected content
scripts. So the privileged half — every index read and every `chrome.tabs`
mutation — must run in the service worker, keyed to `sender.tab`, never to an
id/URL taken from the message body. The injected overlay should be a thin
render/keystroke surface that only *asks* the SW.

Two concrete guards that are easy to miss:

- Verify `sender.id === chrome.runtime.id` on every `onMessage`, and never define
  `externally_connectable` / `onMessageExternal`.
- Mount injected UI in a **closed** shadow root (`attachShadow({ mode: 'closed' })`).
  An *open* root is readable by any page script via `host.shadowRoot` — for a
  recall overlay that lists the user's archived titles/URLs and captures their
  keystrokes, an open root is a direct cross-origin exfiltration path that inverts
  the whole privacy promise.

### 2. Service-worker lifecycle: register sync, never memoize a rejection, persist timestamps

- **Classic worker + `importScripts`** loads multiple no-build modules into the
  SW; each module attaches to one global namespace. (`type: module` is the
  alternative but forces ESM builds of vendored libs.)
- **Register `chrome.*` listeners synchronously at top level**, in the first turn
  of evaluation. Listeners added inside an `await`/`.then` won't wake a terminated
  worker — the single most common MV3 footgun.
- **Never memoize a rejected init/`openDB` promise.** A memoized
  `let _p = (async()=>{...})()` that rejects once will re-throw on every later call
  and poison the whole worker lifetime. Attach `p.catch(() => { if (_p===p) _p=null })`
  so the next call retries.
- **Accumulate state from persisted timestamps, not in-memory counters.** The SW
  dies at ~30s idle, so a running dwell counter in a variable is lost. Record a
  focus-start timestamp to storage; compute `now - start` and add to the durable
  total on the next focus change.

### 3. Two-store consistency: reconcile bidirectionally on cold start

IndexedDB is the source of truth; the search index is an in-memory snapshot
persisted to `chrome.storage.local`. Because the snapshot flush is async and the
SW can die between the IDB write and the flush, the snapshot and the store drift.
On cold start, **reconcile in both directions**: an interrupted *add* leaves a
record missing from a stale snapshot, and an interrupted *remove* (undo/forget)
leaves a ghost doc the snapshot still has. An additive-only reconcile heals the
first but not the second. Rebuild from the store when index and store counts
diverge.

### 4. Gate-then-extract, and don't let destructive flows lose their undo

- Run the exclusion gate (incognito / blocklist / restricted scheme) **in the SW
  before injecting** the extractor, so excluded content never enters a capturable
  context. Apply the same gate to passive background collectors — incognito and
  blocklisted pages must write *no key at all*.
- Record undo state **before** the destructive action (closing/removing), so a
  throw from the destructive call can't orphan the record with no way back.
- Sweep expired pending-undo bundles on wake. A forgotten page's full content
  sitting in `storage.session` past its grace window is a privacy regression.

### 5. No-build interop + dependency injection makes vanilla extension code testable

A small UMD-ish wrapper lets one file load via `importScripts` in the SW *and*
`require` in node tests, with zero build step. Inject `chrome.*` into the logic
modules so the orchestration is unit-testable under `node --test` with
`fake-indexeddb` and hand-rolled `chrome` stubs (`node:test` `mock.fn()` — not the
stale `jest-chrome`/`sinon-chrome`). The genuinely visual/injection surfaces stay
on a scripted manual-dogfood checklist.

### 6. Always answer an async `onMessage`

A `.then(sendResponse)` with no `.catch` on a handler that can throw (IDB/storage
error) leaves the message channel open until Chrome times it out — the overlay or
popup hangs with no signal. Wrap every async branch so a rejection still calls
`sendResponse({ error })`, and have the UI tolerate `!resp`.

## Why This Matters

Each of these is a real failure mode that shipped past unit tests and was only
caught by reviewing the integration code: the open shadow root (privacy leak), the
additive-only reconcile (ghost docs after undo), the rejection-memoized init
(worker-wide poison), the close-before-undo ordering (orphan + duplicate), and the
uncaught async handler (hung UI). They are invisible to a plan review and to
DI-stubbed unit tests, because they live in the SW↔page↔storage seams. Knowing the
shape up front turns "found in adversarial review" into "built correctly the first
time."

## When to Apply

- Any Chrome MV3 extension that reads/persists page content or user data locally.
- Whenever an injected content script renders user data or accepts input.
- Whenever an in-memory cache mirrors a durable store across SW restarts.
- When choosing vanilla-JS/no-build but still wanting automated tests.

## Examples

- **SW-as-broker / closed root:** `extension/overlay/overlay.js` (closed shadow
  root, render-only) and `extension/background.js` (`sender.id` check; all index
  reads + `chrome.tabs` mutations in the SW).
- **Lifecycle:** `extension/background.js` (`importScripts`; top-level listeners;
  `initIndex`/`openDB` clear-on-reject) and `extension/lib/signal.js` (timestamp
  dwell math, gate-before-write).
- **Reconcile:** `extension/lib/search.js` `reconcile()` (rebuild on divergence)
  with `extension/lib/store.js` as source of truth.
- **No-build interop:** the wrapper at the bottom of every `extension/lib/*.js`
  (`module.exports` + `self.ypuf`); tests under `tests/*.test.js`.

## Related

- Plan: `docs/plans/2026-06-14-001-feat-ypuf-slice1-recall-shelf-plan.md`
- Origin: `docs/brainstorms/2026-06-14-ypuf-v1-sequence-and-slice1-requirements.md`
- PR: momentmaker/ypuf#1
