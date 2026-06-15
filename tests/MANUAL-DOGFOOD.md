# Manual dogfood checklist

The pure logic (gate, store, retention, search, capture orchestration, dwell
math) is covered by `node --test`. The behavior below depends on real
`chrome.*` APIs and a live DOM, so it is verified by hand:

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → select
   `extension/`.
2. Reload the extension after edits (no build step).

> Treat any item that fails as a bug to fix before shipping the slice.

## Load (U1)

- [ ] Loads with **no service-worker console errors** (click "service worker"
      under the extension to open its console).
- [ ] The toolbar icon opens the popup.
- [ ] Opening a new tab shows Chrome's **default** new-tab page (ypuf does not
      override it).

## Let-go capture (U5 / F1)

- [ ] On a normal article, press the let-go hotkey (default `Ctrl/Cmd+Shift+L`)
      or the popup's "Let go of this tab" button → the tab **closes** and an
      **Undo** notification appears.
- [ ] Re-open the popup / recall (U6) and confirm the article is findable by a
      phrase from its **body text** (content was extracted, not just the title).
- [ ] **Undo** within ~6s (notification button) → the tab **reopens** and the
      entry disappears from recall. After ~6s, Undo no longer restores it
      (archive is final; recall is the durable net).
- [ ] Let go of a **banking/blocklisted** page → it closes, but searching its
      body text returns nothing (title+URL only). The stored URL has no query
      string.
- [ ] Let go of a **`chrome://`** page or the Web Store → closes, stored
      title+URL only (no injection error in the console).
- [ ] Let go of a tab in an **Incognito** window is impossible (the extension
      is `incognito: "not_allowed"`) — confirm ypuf is absent there.
- [ ] Let go of a tab Chrome has **discarded** (Memory Saver) → closes,
      title+URL only, no error.
- [ ] Press let-go **twice quickly** on the same tab → exactly one entry, one
      close (in-flight guard).

## Popup shelf (U7)

- [ ] After letting go of a few tabs, the popup lists them **most-recent
      first**, each with a friendly domain + relative time.
- [ ] Clicking a row reopens that page (focuses it if still open).
- [ ] First run (nothing let go) shows the invitational empty state, and the
      "Let go of this tab" button is still present.
- [ ] The footer shows the current recall hotkey binding (remapping it at
      `chrome://extensions/shortcuts` is reflected on reopen).
- [ ] A blocklisted/title-only entry shows a "title only" badge in its row.
- [ ] A let-go page whose `<title>` contains markup renders as inert text in
      its row (no script runs).

## Recall command bar (U6 / F2)

- [ ] Press the recall hotkey (default `Ctrl/Cmd+Shift+K`) on a normal page →
      an overlay opens with the search box **focused**.
- [ ] Type a phrase from a let-go page's body → it appears and reopens in well
      under a second when chosen.
- [ ] **↑/↓** move the selection, **Enter** opens it, **Esc** / backdrop-click /
      a second hotkey press all close the overlay; focus returns to the page.
- [ ] With nothing let go yet, the overlay shows the "Nothing let go yet" state;
      with items present but no query match, it shows the distinct "No match".
- [ ] A reopened page that is still open is **focused**, not duplicated.
- [ ] Recall on a `chrome://` / restricted page opens the popup fallback instead
      of failing silently.
- [ ] A result whose title contains `<img src=x onerror=alert(1)>` renders as
      inert text — no script runs (textContent rendering).

## Privacy controls — what's-indexed / forget / block (U8)

- [ ] The popup's "What's indexed" opens a list of everything stored, rendered
      as inert text.
- [ ] **Forget** on a row strikes it through with an **Undo** for ~6s; Undo
      restores it (and its dwell signal); after ~6s it's gone for good.
- [ ] **Block site → Forget all** removes every entry for that domain (AE6).
- [ ] **Block site → Block, keep titles** downgrades existing entries for that
      domain to title-only (search its old body text → no match) and excludes
      future let-gos of that domain (verify: let go of a page there afterwards →
      title+URL only).
- [ ] After a domain forget/block, `chrome.storage.local.get('signal')` shows
      that domain's dwell/revisit keys are gone too (cross-store purge).
- [ ] A confirm uses inline buttons (no blocked `window.confirm` dialog).

## Passive dwell/revisit signal (U9 — invisible)

No UI in slice 1. In the SW console, after browsing a few normal pages:

- [ ] `chrome.storage.local.get('signal')` shows accumulating `dwell` (ms) and
      `revisits` (counts) keyed by URL.
- [ ] After sitting on **`chrome://`** or a **blocklisted** page, no key for it
      appears in `signal`. Visiting in a way that involves incognito leaves no
      trace (extension is `not_allowed` there anyway).
- [ ] Switching away from a tab and back increments its revisit count; dwell
      only grows while the tab is the focused foreground tab.

## Crash-consistency (U3/U4/U5)

- [ ] Let go of a page, then in the SW console run `chrome.runtime.reload()` (or
      let the worker idle out) and recall the page — it is still searchable
      (index reconciled against the store on wake).

---

# Slice 2 — auto-let-go

The eligibility gate, per-tab store, capture threading, and reopen-protection
are covered by `node --test`. The behavior below needs real `chrome.*` (alarms,
permissions, offscreen audio, content-script injection) and is verified by hand.

> Tip: to exercise the sweep without waiting, open the SW console and call
> `runAutoSweep()` directly; force a tab "stale" by editing its per-tab record
> via `chrome.storage.session.get('tabstate')` (push `lastActivatedAt` back).

## Activation grant (U2)

- [ ] Fresh load: the popup header shows **"Auto-let-go: off — turn on"**; the
      sweep does nothing; manual let-go still works.
- [ ] Click **turn on** → Chrome's host-access prompt appears (the gesture).
      Accept → header flips to **"auto-let-go: on · watching for quiet tabs"**.
- [ ] Click **turn on** then **deny** the prompt → header stays off and an inline
      note explains page access is needed.
- [ ] Revoke host access at `chrome://extensions` → the header reads off again on
      next open and the sweep no-ops (`autoEnabled` cleared).

## The sweep (U5 / F1)

- [ ] Below the min-observation bar (few URLs browsed) the sweep closes nothing.
- [ ] With a genuinely stale, never-revisited, low-dwell tab (and grant on), the
      sweep **closes it silently** — no notification — and it appears in the
      shelf marked **"let go for you"**, recallable.
- [ ] A tab that is **audible**, **pinned**, has **unsaved input** (type into a
      form, don't submit), was **recently activated**, or is **engaged**
      (activated ≥ 3×) is **never** auto-closed.
- [ ] A **blocklisted** stale tab is left open (never auto-closed).
- [ ] Reopen-all-tabs at startup (or open-all-bookmarks) → none of the restored
      burst is auto-closed in the following minutes (R3 / AE3).
- [ ] Drive a tab's URL across an SPA / redirect after engaging it → it is not
      auto-closed despite zero signal under the new URL (URL-drift safety).

## The puff (U6)

- [ ] On an auto-close, a soft **"puff"** plays. A burst of several closes plays
      without console errors and creates **one** offscreen document (check
      `chrome://extensions` → service worker → `chrome.runtime.getContexts`).

## Reopen-protection (U7 / F2 / AE5)

- [ ] After ypuf auto-closes a `news.com` tab, **reopen it from the shelf** →
      open the popup's **Protected sites** → `news.com` is listed.
- [ ] A subsequent stale `news.com` tab is **not** auto-closed.
- [ ] **Un-protect** `news.com` → it becomes eligible again.
- [ ] Reopening a **manually** let-go page does **not** protect its domain.
- [ ] **Block site / Forget all** on a domain also clears its protection entry
      and its per-tab state (cross-store purge).

## Discoverability & relief (U8)

- [ ] The extension icon shows a **badge** counting auto-closes since the popup
      was last opened; opening the popup clears it.
- [ ] After at least one auto-close today, the first popup open shows the
      **relief banner** ("N let go today — all in your recall list"); a second
      open the same day does not re-show it; at zero auto-closes it never shows.
- [ ] **Protected sites** with nothing protected shows the invitational empty
      state.

---

# Slice 3 — snooze

The scheduling math (`lib/snooze.js`) is covered by `node --test`. The behavior
below needs real `chrome.alarms`, `chrome.action`, and the popup, so it is
verified by hand.

> Tip: to test a return without waiting, snooze with **Custom…** set ~1 minute
> out, or in the SW console run `flipBackNow([<recordId>])` directly. To test the
> restart path, snooze, then `chrome.runtime.reload()` the extension.

## Snooze a tab (U2 / F1)

- [ ] The popup shows a **"Snooze this tab…"** trigger; clicking it reveals the
      preset panel (Later today · This evening · Tomorrow morning · This weekend
      · Next week · When I'm back · Custom…).
- [ ] Choosing a preset **closes the tab** and it appears under a **"Snoozed"**
      group as **"snoozed until <time>"**; no Undo notification (calm).
- [ ] The snoozed page is still **found by recall search** (command bar) while
      it's away.
- [ ] **Custom…** reveals a datetime-local input; picking a time snoozes to it.
- [ ] The **snooze hotkey** (default `Ctrl/Cmd+Shift+S`) opens the popup straight
      to the preset panel.
- [ ] Snoozing a **blocklisted** page stores title+URL only; it still returns.

## The return (U3 / F2 / R9)

- [ ] At its time, a clock snooze moves to a pinned **"Back now"** group at the
      top of the shelf and the icon shows a **badge**; clicking it **reopens the
      page and clears the snooze** (it leaves both groups).
- [ ] A snooze whose time passed **while Chrome was closed** is **"back now"** on
      next startup (shown as overdue, e.g. "back · due 2h ago") — never lost.
- [ ] **"When I'm back"** does *not* return on a mid-session SW wake; it surfaces
      on the **next browser startup** (snoozed row reads "next time you're back").
- [ ] Returning several snoozes at once shows them all under "Back now"; the
      badge count is correct (no double-count if an alarm and the sweep coincide).

## Controls + forget (U4 / R7 / R11)

- [ ] A **"snoozed until X"** row is **not** opened by a body click; it carries
      **Wake** and **Later** controls.
- [ ] **Wake** moves the item to "Back now" immediately.
- [ ] **Later** reveals the inline preset list; choosing one sets a new return
      time (and re-arms the alarm).
- [ ] **Forget** a snoozed item (single, and via **Block site → Forget all**) →
      it does **not** return later (its `snooze:` alarm is cancelled).
- [ ] With nothing snoozed, the "Back now"/"Snoozed" groups are absent (no empty
      headings); the shelf falls straight to the recently-let-go list.

## Auto-let-go interaction (R10 / AE6)

- [ ] A snoozed item is **never auto-closed** (it's not an open tab) — let
      auto-let-go run with snoozed items present and confirm none are touched.
