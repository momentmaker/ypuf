---
title: MV3 patterns for a local, privacy-first content-indexing extension
date: 2026-06-14
last_updated: 2026-06-17
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
  - Mutating one chrome.storage key from many concurrent SW event listeners
  - Running a periodic background op (alarms) that destructively changes tabs
  - Playing audio or using a DOM API from a service worker (offscreen document)
  - Feeding a per-URL signal into a per-tab decision
  - Scheduling a return/resurfacing at a chosen time that must survive SW termination
  - Snapshotting derived state (a working set) live at an event instead of banking the signal
  - Forgetting a record whose identity is embedded as a reference inside other records
  - Restoring user-selected items by validating the request against SW-owned state
  - Building the extension's first network surface that fetches a remote or user-supplied URL and renders it
  - Rendering page-influenced or remote content without granting it the host's privileges
  - Mounting a UI panel whose real work (timers, listeners, fetch, render) sits behind an async permission gate
  - Extracting pure decision/transformation logic out of untested Chrome/DOM host glue so it can be unit-tested
tags: [chrome-mv3, service-worker, indexeddb, content-script, privacy, message-passing, no-build, minisearch, alarms, offscreen, concurrency, background-mutation, scheduling, session-clustering, snapshot-at-event, context-restore, working-set, sandbox, iframe-isolation, broker, ssrf, csp, network-egress, single-flight, swr-cache, postmessage, text-only-render, lifecycle-guard, teardown, generation-token, host-glue-extraction, drag-and-drop]
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

Slice 2 (auto-let-go: a periodic background sweep that silently closes stale
tabs) added a second cluster — patterns 7-10 — all in the same SW-glue seam and,
again, all surfaced only by reviewing the *implementation*: a data race across
concurrent listeners, an offscreen-audio document, a per-URL-vs-per-tab signal
trap, and termination-safe dedup of a destructive op.

Slice 3 (snooze) added pattern 11, and slice 4 (session clustering + context
restore) added patterns 12-15: snapshotting a tab's working set live at let-go,
scrubbing forgotten pages out of *other* records' embedded sets, a memoized-init
deferred-work hole, and a restore-time authorization check. Every one surfaced in
implementation review, not planning — the same seam, the same lesson.

Slice 5 (the new-tab panel board) added pattern 16 — the extension's first
*network* surface (user-added RSS feeds + a crypto panel) — and widened the seam
from SW↔page↔storage to also host↔sandbox↔network. Its worst finding was again
host-glue: attacker-controlled feed `<link>` bytes reaching `chrome.tabs.create`
past a provenance check that wasn't a safety check.

Slice 5's redesign (the "warm desk" pass — Trello-style drag-placement, a daily
one-line, a top-sites panel) ran its own Tier-2 review and the throughline held a
sixth time: its headline findings were a stale async re-show and a *pre-existing*
panel-teardown leak — both host-glue lifecycle bugs invisible to the (passing)
pure-module tests. It added pattern 17 (guarding async-gated mounts) and — for the
first time — pattern 18: rather than only *noting* that bugs hide in untested glue,
it *extracted* the glue's pure core (the lane math) into a tested module. The
counter-move to the throughline, finally written down as a move.

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

### 7. Serialize writes when many listeners mutate one storage key

This is the highest-severity bug a code review caught in slice 2. Several SW
listeners (`tabs.onCreated`/`onActivated`/`onUpdated`/`onRemoved` plus
content-script reports) each do load → modify → save on **one** shared
`chrome.storage` object. They're async, so two events firing close together
interleave: A loads, B loads the same snapshot, A saves, B saves over A — A's
write is silently lost. Persisting timestamps (pattern 2) does not save you; the
lost update happens between a load and its save. In a safety-critical flow a lost
write is a real bug (a reverted "has unsaved input" flag, a dropped engagement
count) that drives a wrong decision. Funnel every mutation of a shared key
through one in-SW promise chain:

```js
let _chain = Promise.resolve();
function mutate(fn) {
  _chain = _chain.then(async () => { const s = await load(); await fn(s); await save(s); }).catch(logErr);
  return _chain;
}
```

Reads can stay unserialized — they observe a consistent committed state. The
chain lives in memory and resets on SW termination, which is correct: concurrent
writes only race *within* one SW activation; across activations the wakes are
sequential.

### 8. Play sound (or use any DOM API) from a serialized, decoupled offscreen document

A SW has no Web Audio/DOM, so a short sound plays from a single offscreen
document (`chrome.offscreen.createDocument({ reasons: ['AUDIO_PLAYBACK'] })` —
Chrome allows only one). Three things make it safe. Detect-before-create via
`chrome.runtime.getContexts`, but that has a TOCTOU window under bursts — so also
**serialize creation behind one module-level promise** (pattern 7's shape) so
concurrent triggers await a single create instead of the second one throwing.
**Fire the side effect catch-decoupled** from the operation that triggered it
(`ensureOffscreen().then(play).catch(() => {})`): the sound is cosmetic, the
close is not, so an audio failure must never propagate into the real work.
Verify `sender.id === chrome.runtime.id` in the offscreen listener (pattern 1).
`AUDIO_PLAYBACK` auto-reaps the doc ~30s after the last sound — no lifecycle code.

### 9. A per-URL signal can't gate a per-tab decision

Slice 1 banked a dwell/revisit signal keyed by the exact URL. Slice 2 wanted to
decide "is this *tab* abandoned?" — and naively reading the per-URL signal is a
trap: a tab that navigated (SPA route, hash, redirect, post-login rewrite) shows
**zero** signal under its current URL and looks brand-new, even after the user
lived in it for hours. Make the per-tab decision turn on a URL-stable per-tab
fact (an activation count bumped on `tabs.onActivated`), and treat the per-URL
signal as corroborating only. Mind the failure direction: here a false zero would
auto-close a tab the user is actively using.

### 10. Termination-safe dedup, and confirm a destructive effect before counting it

For a destructive background op that can be interrupted mid-flight and re-fired by
the next alarm (auto-close): an in-memory in-flight `Set` doesn't survive SW
termination, so a re-fired sweep re-processes the same item and double-writes.
Dedup on a **persisted claim** (a `chrome.storage` key), released on confirmed
completion *and* on the cleanup event (`tabs.onRemoved`). Separately, because the
reusable close helper swallows `chrome.tabs.remove` errors (so a capture stays
reversible even if the close throws, pattern 4), the caller must **independently
confirm the effect happened** — `chrome.tabs.get` rejects once the tab is gone —
before counting it (badge, sound, metrics). Otherwise a failed remove still fires
all the "it closed" side effects for a tab that's still open.

### 11. Scheduled returns: alarms for timeliness, an overdue sweep for correctness

A feature that brings something back at a chosen time (snooze) needs three
coordinated paths, because no single MV3 mechanism is both timely and durable:

- **Per-item `chrome.alarms` for timeliness.** `chrome.alarms.create('snooze:'+id,
  {when})` fires near the scheduled moment while Chrome runs — but alarms are
  best-effort and `persistAcrossSessions` is unreliable, so they are an
  *optimization*, not the guarantee.
- **An overdue sweep for correctness.** The real guarantee is a sweep on every SW
  wake (alongside the cold-start expire-pending step) and on `onStartup`: flip
  every item whose `returnAt <= now`. Even if every alarm is dropped, the next
  wake catches everything. The schedule is a stored timestamp, never an in-memory
  timer (pattern 2).
- **A startup-only sentinel for "when I'm back."** A context return ("next time I
  open the browser") carries an `untilStartup` flag, **not** a numeric `returnAt`
  of `0` — a `0` is `<= now`, so the every-wake sweep would flip it immediately.
  The flag is resolved only by the `onStartup` path the wake sweep never touches.

Two coordination rules keep it safe:

- **One idempotent serialized flip chain.** The alarm, the sweep, and the manual
  controls (wake, re-snooze, reopen-clear) all mutate the same record's state, so
  every write goes through a single promise chain (pattern 7) guarded on the
  current state — a coincident alarm and sweep flip the record exactly once.
- **The alarm is a wake-and-sweep, not a flip-by-id.** Re-scheduling an item to a
  *later* time can't un-enqueue an alarm that already fired, so the alarm handler
  runs the overdue sweep (which re-checks dueness) instead of flipping its named
  id — a re-snoozed-to-later record (`returnAt > now`) is correctly skipped rather
  than returning early.

This extends pattern 10 from one destructive sweep to per-item *non-destructive*
scheduled state changes: alarms handle timeliness, the wake sweep handles
correctness, and an idempotent state guard coordinates them — no explicit dedup
needed because a flip is reversible.

### 12. Snapshot derived state from live data at the event; don't reconstruct from a signal you never banked

The clustering signals for a tab's working set — its `openerTabId`, same-window
membership, co-activation — were never banked (per-tab state stored only a
`noOpener` boolean). So the set is computed *live* at let-go from a single
`chrome.tabs.query({})`, not reassembled from storage. The load-bearing move:
source the anchor **and** its candidates from the *same* raw snapshot
(`handleLetGo` finds the anchor by id inside the just-queried `openTabs`), so
`openerTabId`/`windowId` are mutually consistent — stamping them onto a
separately-queried tab object would let the anchor's ids drift from the candidate
set. The one signal that *was* banked (`lastActivatedAt`, on the per-tab state
map, not on the `chrome.tabs` `Tab` object) is threaded into the pure cluster
module and read for co-activation. This is the deliberate inverse of slice 1→2's
"bank the dwell signal ahead of time": when a signal genuinely isn't banked,
snapshot-at-event is cheaper and more correct than reconstructing pairwise history
that was never stored — *provided* anchor and candidates come from one atomic read.

### 13. Forget spans all records, not just all stores

Pattern 4 said a forget must reach every *store*. Once a record embeds the
*identities of other pages* (the sibling working set lives inside each let-go
record), forget must also reach every *record*: forgetting page B has to scrub B's
URL out of every other record's embedded set, or B lingers as a sibling and a
restore reopens a page the user erased. With no reverse index, one full-store scan
handles the whole batch (a per-URL loop re-scans N times), normalizing both the
forgotten URL and each stored sibling to origin+pathname so a full-href forget
still matches the query-stripped sibling form. The scrub is *tiered by
reversibility*: page-forget defers it past the undo window so an in-window undo is
a clean reversal; domain-forget (no undo) scrubs immediately; blocklist-add does
**not** scrub, because it downgrades content rather than deleting the record.

### 14. Deferred work behind a memoized init runs once per worker lifetime; drive it from the consuming read path

The deferred cross-record scrub was first wired only into the cold-start path —
`sweepPendingForget` called from `initIndex()`, which memoizes its promise and
re-runs only on rejection (pattern 2). After the first successful init, a forget
during a *warm* session was never scrubbed until the next SW cold start, leaving a
window where a restore could reopen a just-forgotten page. This was slice 4's P1
review finding: a correctness hole that only manifests across the memoized-init
lifecycle boundary, invisible to module tests. The fix: also run the deferred sweep
at the surfaces that *consume* the affected data (the recall search, the shelf
list, and restore each sweep before reading siblings), not only on cold init. The
rule: deferred/cleanup work must be driven by a recurring trigger (alarm/startup)
**or** by the consuming read path — never solely by a once-per-lifetime memoized
init.

### 15. Restore-intersect: validate caller-supplied identifiers against SW-owned state

A `restore-set` message carries user-checked URLs from the popup/overlay —
caller-supplied identifiers from a context the SW shouldn't fully trust, even after
the `sender.id` check. The SW never opens those URLs directly: it intersects the
request against the record's *stored* sibling set (plus a web-scheme gate) and
reopens only the intersection, deduped. So a replaying or compromised popup context
can reopen only URLs the SW itself previously stored for that record, never an
arbitrary one. This extends SW-as-broker (pattern 1) from "trust only our own
contexts" to the finer "even from our own contexts, validate caller-supplied
identifiers against state the SW owns."

### 16. Network egress: a sandboxed render surface + a privileged broker that validates the URL and renders text-only

Slice 5 (the new-tab panel board) is the extension's first surface that reaches the
network — user-added RSS feeds and a crypto-price panel. The privacy wedge that was
conventional everywhere else (the SW is trusted, the page is not) becomes a
*structural* boundary here, built from coordinated guards so no single lapse inverts
it:

- **The render surface has no capability, by construction.** Network panels run in a
  sandboxed iframe (`sandbox` manifest key, `allow-scripts`, **no**
  `allow-same-origin` → a null origin with no `chrome.*`, no storage, no reach into
  the parent). Its CSP **removes network egress** (`default-src 'none'; connect-src
  'none'; img-src 'none'`) — the panel can paint but cannot `fetch`/`XHR`/`<img>`
  home. Isolation means the capability is *absent*, not merely unused.
- **One privileged broker does all the I/O.** The board-host page (extension origin,
  holds the host grant) validates the source URL, fetches, parses to a **text-only**
  struct, caches, and `postMessage`s only `{text, open-index}` to the panel; the SW
  stays off the network path. This is SW-as-broker (pattern 1) re-cast as
  host-as-broker for a context the SW can't serve.
- **Validate the fetched URL at the boundary (SSRF).** A pure validator (`https`
  only; reject `javascript:`/`data:`/`file:`; block private/loopback/link-local IPv4
  and **all** IPv6 literals; `fetch(..., {redirect:'error'})` so a validated public
  host can't 302 to a private IP). Hand-rolled IP allow-listing is where the bypass
  hides — decimal/hex/octal IPv4 are normalized by `new URL`, but IPv6 embedded-v4 /
  6to4 / NAT64 forms are not, so blocking the whole IPv6-literal class is the safe call.
- **Harden the fetch and the channel.** `credentials:'omit'` + `referrerPolicy:
  'no-referrer'` so the host learns neither a cookie nor the `chrome-extension://`
  URL; an `AbortController` timeout so a hung host can't wedge the single-flight lock;
  the host validates `event.source === the panel's own iframe.contentWindow` (a live
  cross-frame check no pure test can make).
- **Render text-only on _both_ surfaces — including the privileged one.** The sandbox
  renders via `textContent`; but the host-rendered ypuf panel does too, because recall
  *titles are page-influenced* (built from `document.title`). The most privileged
  context renders the one byte-class the threat model is tempted to wave through, so
  the text-only guarantee is extracted into a node-testable helper and asserted.

The cache reuses the serialize/single-flight shape (patterns 7/8): a `{fetchingAt}`
lock beside a success-only `{value, fetchedAt}` entry, stale-while-revalidate, the
cold path bypassing a stale lock so a tab that died mid-fetch can't wedge the next open.

**Provenance is not safety** — pattern 16's sharpest edge, and slice 5's P1. Restore-
intersect (pattern 15) generalizes to the panel boundary: a panel→host "open headline
N" carries only an *index*, which the host intersects against its own parsed link set,
so the panel can't name a URL the host didn't parse. But that proves only *where the
URL came from*, not that it's *safe to open*. The code review caught it: a malicious
feed item `<link>` is attacker-controlled bytes, and a feed linking to
`chrome://settings/` or `javascript:…` passed the index-intersect and reached
`chrome.tabs.create` on one click. The fix put a scheme gate **inside the tested
kernel** (`channel.resolveOpen` yields an http(s) URL or null), so the guarantee is
asserted, not merely present. Index-intersection answers "did the host parse this?";
the scheme gate answers "is this openable?" — a boundary needs both.

This extends patterns 1 (broker), 6 (always-answer the channel), 8 (decoupled
serialized side effects), and 15 (validate caller-supplied identifiers against owned
state) into the network-egress dimension — and adds the rule that an identifier's
*provenance* and its *safety* are separate checks.

### 17. Async-gated panel mounts: arm an `alive` flag in teardown so a late resolve can't leak (or write through) what it installs

A board panel's `mount` returns its teardown **synchronously**, but does the real
work behind an async gate — `panelHasAccess(origin).then(() => { install a refresh
setInterval; add visibilitychange/focus listeners; kick a fetch; render })`. If the
board re-renders before that gate resolves — an edit-mode toggle, a drag, a
cross-tab `storage.onChanged`, a `hashchange` — `teardownAll()` runs the teardown
**first**, clearing handles that are still `null`, and *then* the `.then` installs
the timers/listeners with no one left to clear them. In the redesign review this was
a pre-existing P1: the crypto panel leaked a 60s CoinGecko `setInterval` plus two
window/document listeners that outlived the panel (ongoing fetches forever); the RSS
panel fired a wasted post-teardown feed fetch. The fix is a one-line discipline —
`let alive = true;` in the mount, set `alive = false` as the *first* statement of the
teardown, and bail at the top of the async callback (`if (!alive) return;`). Note the
sandbox's own `post()` already guarded late *renders* (`if (!alive ||
!frame.contentWindow) return;`) — but that only covers the render path; the
interval/listener/fetch **installation** needs its own guard.

A sibling case needs a *counter*, not a flag: a **re-runnable** render that can be
superseded mid-flight (the opt-in one-line: enable → async fetch → toggle off, or two
rapid enables racing) must capture a generation token at entry (`const mine =
++seq`) and bail in each `.then` when `mine !== seq`, so a stale fetch can't re-show a
disabled element or stack a duplicate. The rule of thumb: **a teardown that fires once
uses a boolean; a render that can overlap itself uses a monotonic token.** Both are
the lifecycle dimension of the same host-glue seam — and both were invisible to the
pure-module tests, which never mount, tear down, or re-enter.

### 18. Extract the pure core out of untested host glue — the throughline, finally as a move

Patterns 1-16 *observe* that every slice's worst finding lives in host/SW glue no
pure-module test can reach. The redesign **acted** on it. The Trello lane-placement
math — which column a panel is in, the splice arithmetic for reorder-into-lane /
move-across-lanes / move-within-lane, the round-robin migration of pre-lanes configs —
lived inline in `newtab.js`, entangled with `chrome.storage` saves and DOM
re-renders, and was the one genuinely new behavior surface with **zero** coverage:
exactly where the throughline predicts the bug. The move: pull the array math into a
pure `lib/lanes.js` (the no-build UMD/DI shape, pattern 5) whose functions take
`(panels, …args)` and return *whether they changed anything*; leave the orchestration
(the `boardBusy` reentrancy guard, `saveConfig`/`renderBoard`/`focusPanel`) in the
host behind a thin `commitMove(id, () => lanes.move…())` wrapper that runs the
epilogue only when the pure move reports a change. Nine unit tests then pin the splice
indices, the clamp-on-out-of-range-`col` degradation, and the migration — the part
most likely to silently lose a panel — while the host keeps only what genuinely needs
chrome/DOM. Coverage went 161 → 170 with the seam's riskiest math now asserted.

The rule: when host glue contains pure decision or transformation logic, the lesson
isn't "review the glue harder," it's **"move the decidable core out where a test can
hold it, and keep only the truly-coupled orchestration inside."** A boolean
`changed` return is what lets the pure core stay pure (it makes no I/O decision) while
the host still knows whether to persist — the same split that kept the four move
operations from each re-implementing the guard/save/render epilogue.

## Why This Matters

Each of these is a real failure mode that shipped past unit tests and was only
caught by reviewing the integration code: the open shadow root (privacy leak), the
additive-only reconcile (ghost docs after undo), the rejection-memoized init
(worker-wide poison), the close-before-undo ordering (orphan + duplicate), and the
uncaught async handler (hung UI). They are invisible to a plan review and to
DI-stubbed unit tests, because they live in the SW↔page↔storage seams. Knowing the
shape up front turns "found in adversarial review" into "built correctly the first
time."

Slice 2 reinforced the lesson: the pure modules (eligibility, per-tab state) were
correctly fail-safe in isolation and fully unit-tested, yet the code review's
worst finding — a concurrent load-modify-save race that could revert an
unsaved-input flag and auto-close a tab the user was typing into — lived entirely
in the unsynchronized storage glue the tests couldn't reach. Same root truth: in
MV3, the bugs cluster in the stateful glue between the SW, the page, and storage,
and a destructive background op (closing tabs) raises the cost of every one of
them.

Slice 3 (snooze) added scheduled *returns* and hit the same seam from the other
side: the review's findings were a non-serialized state writer (a re-snooze
clobbered by a flip) and an alarm that fired by id without re-checking dueness —
both in the SW glue, both invisible to the (passing) pure-module tests. The fix
generalized the slice-2 patterns (serialize the writes; make the alarm a
wake-and-sweep) rather than inventing new machinery, which is the payoff of
writing these down.

Slice 4 (session clustering) made the throughline impossible to miss. Its modules
— the pure cluster computation and the restore planner — were fully unit-tested,
yet the review's P1 lived exactly where the deferred forget-scrub met the memoized
service-worker init: warm-session forgets never ran the scrub, so a restore could
reopen a page the user had erased. As in slices 2 and 3, the fix generalized an
existing idea (drive deferred work from the consuming read path, not a
once-per-lifetime init) rather than adding machinery.

Slice 5 (the panel board) opened a genuinely new seam — the first network surface —
and the pattern held once more. The pure kernels (the URL/SSRF validator, the
RSS/crypto parsers, the envelope/intent channel) were fully unit-tested, yet the
Tier-2 review's P1 lived in the host glue: a malicious feed `<link>` is
attacker-controlled bytes, and the index-intersect that proved a link's *provenance*
(the host parsed it) was mistaken for proof of its *safety*, so a feed linking to
`chrome://settings/` or `javascript:…` reached `chrome.tabs.create`. The fix again
generalized an existing idea — restore-intersect (pattern 15) extended to the panel
boundary, with a scheme gate moved *into* the tested kernel so the guarantee is
asserted. Five slices, five highest-severity findings, every one in the host/SW glue
and none reachable by a pure-module test — and the seam has only widened, from
SW↔page↔storage to also host↔sandbox↔network (egress, SSRF, cross-frame
postMessage). Review attention belongs disproportionately at that boundary, where
listener registration, promise memoization, alarm timing, shared-storage mutation,
and now URL validation + text-only egress create failure modes no pure-function test
will surface.

Slice 5's redesign closed the loop. The Tier-2 review's strongest signal was four
independent reviewers converging on one stale-async re-show in the one-line footer,
and the deepest finding was a *pre-existing* teardown leak (a torn-down crypto panel
still installing a 60s fetch interval) — both, once again, in the host glue, both
green under the pure-module suite. But this pass did something the first five didn't:
it turned the throughline into prevention. The lane-placement math — the one new
surface the lesson flagged in advance — was extracted into a pure, nine-test
`lib/lanes.js` (pattern 18) *before* it could become the sixth headline bug. The same
review also generalized the teardown guard (pattern 17) across every async panel
mount. The takeaway is no longer only "review attention belongs at the glue"; it is
"when the glue holds decidable logic, **move that logic out** — the seam keeps its
orchestration, the test suite gets the decision, and the predicted bug never lands."

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
- **Serialized writes (7):** `extension/background.js` `mutateTabstate` (one
  `_tabstateChain` behind every per-tab write).
- **Offscreen audio (8):** `extension/background.js` `ensureOffscreen`/`puff` and
  `extension/offscreen/offscreen.js` (`sender.id` check, synthesized puff).
- **Per-URL-vs-per-tab (9):** `extension/lib/eligibility.js` (`isEngaged` on the
  per-tab activation count) over `extension/lib/signal.js` (per-URL).
- **Termination-safe dedup + confirm-effect (10):** `extension/background.js`
  `claimClose`/`releaseClose` and the `chrome.tabs.get` confirm in `autoCloseOne`.
- **Scheduled returns (11):** `extension/lib/snooze.js` (`resolve`→`{returnAt}`|
  `{untilStartup}`, `dueSnoozes` excluding the sentinel) with `extension/background.js`
  `expireSnoozes`/`snoozeStartup`/`mutateSnooze` and the wake-and-sweep `onAlarm`.
- **Snapshot-from-live-state (12):** `extension/lib/cluster.js` `computeSet`/
  `spawnRelated` (pure, gated to extractable) with `extension/background.js`
  `computeSiblings`/`clusterSet` and the anchor-from-snapshot find in
  `handleLetGo`/`runAutoSweep`.
- **Forget spans all records (13):** `extension/lib/store.js` `scrubSiblings`/
  `siblingKey` with `extension/background.js` `sweepPendingForget` (deferred),
  `forgetDomain` (immediate), and the no-scrub-on-`blocklistAdd` policy.
- **Memoized-init deferred-work (14):** `extension/background.js` `sweepPendingForget`
  driven from `restoreSet`/`getRecallResults`/`listRecent`, not only the memoized
  `initIndex`.
- **Restore-intersect (15):** `extension/lib/cluster.js` `restorePlan` (intersect
  requested URLs against stored siblings) with `extension/background.js`
  `restoreSet`/`reopenUrl`.
- **Network-panel isolation (16):** `extension/panels/sandbox.{html,js}` (null-origin
  render surface, egress-blocking CSP) + `extension/newtab/newtab.js` (the board-host
  broker: validate → hardened fetch → text-only parse → SWR + single-flight cache →
  `postMessage`), with `extension/lib/sourceurl.js` (https/SSRF validator),
  `extension/lib/channel.js` `resolveOpen` (index-intersect **+ http(s) scheme gate**),
  and `extension/lib/shelf-render.js` (text-only host render). The
  `permissions.onRemoved` gate on `<all_urls>` keeps a per-origin feed-grant revoke
  from disabling auto-let-go.
- **Async-gated mount guard (17):** `extension/newtab/newtab.js` — the `alive` flag in
  the crypto, RSS, and top-sites panel mounts (set false in teardown, checked at the top
  of the `panelHasAccess(...).then`), and the `oneLineSeq` generation token in
  `renderOneLine` (a re-runnable render guarded against supersession). Mirrors the
  sandbox's own `post()` late-render guard in `mountSandbox`.
- **Host-glue extraction (18):** `extension/lib/lanes.js` (pure `colOf`/`reorderInto`/
  `moveToLane`/`moveAcross`/`moveWithinLane`/`migrateCols`, each returning a `changed`
  boolean) with `tests/lanes.test.js` (9 cases), consumed by `newtab.js` via the
  `commitMove(id, moved)` wrapper that owns the `boardBusy` guard + save/render/focus
  epilogue.

## Related

- Plans: `docs/plans/2026-06-14-001-feat-ypuf-slice1-recall-shelf-plan.md`,
  `docs/plans/2026-06-15-001-feat-ypuf-slice2-auto-let-go-plan.md`,
  `docs/plans/2026-06-15-002-feat-ypuf-slice3-snooze-plan.md`,
  `docs/plans/2026-06-16-001-feat-ypuf-slice4-session-clustering-plan.md`,
  `docs/plans/2026-06-16-002-feat-ypuf-slice5-newtab-panel-board-plan.md`,
  `docs/plans/2026-06-17-001-feat-board-calm-premium-redesign-plan.md`
- Origins: `docs/brainstorms/2026-06-14-ypuf-v1-sequence-and-slice1-requirements.md`,
  `docs/brainstorms/2026-06-15-ypuf-slice2-auto-let-go-requirements.md`,
  `docs/brainstorms/2026-06-15-ypuf-slice3-snooze-requirements.md`,
  `docs/brainstorms/2026-06-15-ypuf-slice4-session-clustering-requirements.md`,
  `docs/brainstorms/2026-06-16-ypuf-slice5-newtab-panel-board-requirements.md`,
  `docs/brainstorms/2026-06-17-ypuf-board-calm-premium-redesign-requirements.md`
- PRs: momentmaker/ypuf#1 (slice 1), momentmaker/ypuf#2 (slice 2),
  momentmaker/ypuf#4 (slice 3), momentmaker/ypuf#6 (slice 4),
  momentmaker/ypuf#8 (slice 5), momentmaker/ypuf#9 (slice 5 redesign)
