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
- [ ] Opening a new tab shows the **ypuf panel board** (slice 5) — the ypuf recall
      panel is present by default. (See the Slice 5 section for the full board.)

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
- [ ] **Vim-style quick-open:** each recall row shows a hint key (`1`–`9`, then
      `0`); pressing it opens that page. `j`/`k` (or `↓`/`↑`) move a highlight
      cursor, `Enter` opens the highlighted row, `Esc` closes the popup. Typing in
      the snooze **Custom…** datetime field is NOT hijacked by these keys.
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

- [ ] The popup shows a **"Snooze this tab…"** trigger; it starts **collapsed**,
      and clicking it reveals the preset panel (Later today · This evening ·
      Tomorrow morning · This weekend · Next week · When I'm back · Custom…).
      (Regression guard: the panel must NOT start expanded — `[hidden]` must beat
      `.snooze-panel { display:flex }`.)
- [ ] Choosing a preset **closes the tab** and it appears under a **"Snoozed"**
      group as **"snoozed until <time>"**; no Undo notification (calm).
- [ ] The snoozed page is still **found by recall search** (command bar) while
      it's away.
- [ ] **Custom…** reveals a datetime-local input; picking a **future** time snoozes
      to it. A **past** time is rejected (no-op) on BOTH the overlay and the popup.
- [ ] **In-page snooze overlay:** the **snooze hotkey** (default `Ctrl/Cmd+Shift+S`)
      on a normal page opens a centered **"Snooze this tab until…"** overlay (not
      the popup). `1`–`6` jump to a preset, `↑/↓`+`Enter` choose, `0` reveals Custom,
      `Esc` / backdrop / a second hotkey press close it (focus returns to the page).
- [ ] Choosing a time in the overlay closes the tab + schedules the return, same
      as the popup path.
- [ ] **Right tab even after switching:** open the overlay on tab A, switch to tab B,
      switch back to A and pick a time → **tab A** is snoozed (the overlay snoozes its
      OWN tab via `sender.tab`, not whatever tab is active at pick-time).
- [ ] Snooze hotkey on a `chrome://` / restricted page (or the new-tab board) opens
      the **popup fallback** straight to the preset panel instead.
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

---

# Slice 4 — session clustering + context restore

The cluster math (`lib/cluster.js`: `computeSet`, `restorePlan`) and the
cross-record forget scrub (`store.scrubSibling`) are covered by `node --test`.
The behavior below needs real `chrome.tabs` + the popup/overlay DOM.

> Tip: open 3-4 related tabs by **middle-clicking links** from one page (so they
> share an `openerTabId`), then let one go. Inspect a record's set in the SW
> console: `store.getAll().then(rs => console.log(rs.map(r => [r.title, r.siblings])))`.

## Snapshot the working set at let-go (U1–U3 / F1 / AE1, AE4)

- [ ] Open a page, middle-click 2-3 links from it (same window), then **let go**
      the opener → its shelf row shows **"bring back the set? (N)"** with N = the
      other tabs still open.
- [ ] Let go a tab that is **open alone** (no related tabs) → its row has **no**
      set affordance.
- [ ] Open an unrelated tab in **another window**, plus a related cluster in this
      window; let go a cluster member → the other-window tab is **not** in the set
      (same-window only).
- [ ] Include a **banking/blocklisted** tab and an **incognito** window among the
      open tabs; let go a normal cluster member → neither appears in the set
      (`r.siblings` excludes them — AE4).
- [ ] A sibling's stored URL has **no query string** (open a link with `?utm=…`,
      let go its opener, inspect `r.siblings` — the url is `origin+pathname`).

## Auto-let-go snapshots its set too (U3 / AE5)

- [ ] With auto-let-go on, drive a **cluster of related tabs** stale and run
      `runAutoSweep()` in the SW console → each auto-closed member's record has a
      `siblings` set reflecting the **other cluster members** (consistent
      regardless of close order); **nothing reopens** until you ask.

## Bring back the set — popup shelf (U6 / F2 / AE2, AE3)

- [ ] A set-bearing shelf row: clicking the **title** opens just that one page
      (single-page recall is instant); clicking **"bring back the set? (N)"**
      expands a checkable member list (each: title · host), **without** closing
      the popup.
- [ ] A member known **only by URL** (a never-captured sibling) shows a hostname
      fallback label.
- [ ] Uncheck one member, click **Bring back k** → only the checked members
      reopen; a member that is **already open** is focused, not duplicated (AE3).
- [ ] **Uncheck all** → the button relabels to **"Just open this page"**; clicking
      it opens only the anchor (no extra tabs) and closes the popup.
- [ ] A completed restore **closes the popup** (dismiss-on-restore); a second tap
      on Restore can't double-fire (button disables).
- [ ] **Cancel** collapses the expanded set back to the passive offer.

## Bring back the set — command bar (U6 / R9)

- [ ] Recall (overlay) a set-member → the result row shows **"+N — bring back the
      set?"**; clicking it expands the checkable list inline (Enter still recalls
      just the one page); Restore reopens the checked members and closes the
      overlay.

## Cross-record forget consistency (U4 / R12 / AE6)

- [ ] Record A's set lists page B. **Forget B** (What's-indexed → Forget) and wait
      out the ~6s undo → B is gone from A's set (`r.siblings` no longer lists B),
      A's own record intact.
- [ ] Forget B and **Undo within 6s** → B is restored **and** still present in A's
      set (the scrub is deferred past the undo window).
- [ ] **Block site → Forget all** on B's domain → B's URLs are scrubbed from every
      other record's set.
- [ ] **Block, keep titles** on B's domain → B stays recallable and **remains** a
      sibling of A (blocklist downgrades, it doesn't delete — no scrub).

## Disclosure (R2)

- [ ] The **What's indexed** panel names the working-set capture (that letting go
      a tab records its sibling tabs' titles+addresses, query-stripped, sensitive
      excluded, removed on forget).

---

# Slice 5 — new-tab panel board

The pure kernels (URL validation, RSS/crypto parsing, the channel envelope/intent
logic, the text-only shelf render) are covered by `node --test`. The chrome-surface
behavior below — the new-tab override, the sandbox isolation, the live host↔sandbox
boundary, and the host-permission grants — is verified by hand.

## Board shell + isolation proof (U1 / R9 / AE1, AE4)

- [ ] A new tab renders the calm board with **no console errors**; the ypuf recall
      panel is present by default.
- [ ] Open `chrome-extension://<id>/newtab/newtab.html#selftest`. In the sandbox
      panel, the line **renders as text** — the `<img onerror=…>` does **not** fire.
- [ ] In that page's console, select the sandbox iframe context and confirm
      **`chrome` is `undefined`** and **`window.parent !== window`**.
- [ ] In the sandbox context, `fetch('https://example.com')` and
      `new Image().src='https://example.com/x.png'` are **blocked by CSP** (no
      network request leaves — check the Network tab). This is the egress wall.
- [ ] **Forged-intent drop:** from the page console, post a message as if from a
      stray frame — `window.postMessage({ypuf:'panel',v:1,kind:'intent',intent:'open',index:0},'*')`
      — and confirm the host does **not** act on it (the live `event.source` check
      rejects any source that is not the panel's own `contentWindow`).

## Board config + edit mode (U2 / R3, R7)

- [ ] Click **Edit board** → per-panel controls + an **add a panel** affordance
      appear; exiting hides them. The edit affordance is discoverable but quiet.
- [ ] Add a panel → it **persists** across new-tab opens (reopen a new tab).
- [ ] In edit mode, **reorder** a panel with the ◀ ▶ buttons and with the arrow
      keys when the panel is focused; **remove** a panel → focus moves to the next
      panel (or the add affordance if none remain).
- [ ] Open **two** new-tab pages, reorder in one, reload the other → no lost-write
      (the SW is the single writer).

## ypuf recall panel (U3 / R4 / AE1)

- [ ] The ypuf panel shows recent let-go items + the back-now/snoozed groups;
      clicking a row **opens** it (regression: the row click must reopen the page —
      `itemRow` now defaults the click id to the row's own id, covered by
      `tests/shelf-render.test.js`); recall search returns + opens a result.
- [ ] A let-go page whose **title contains markup** renders **inert** in the panel
      (host-rendered, `textContent`) — covered automatically by
      `tests/shelf-render.test.js`, spot-check visually.
- [ ] A set-bearing row shows **"bring back the set? (N)"** → clicking it reopens
      the set (intersected against the record's stored siblings in the SW).
- [ ] **Forget in place:** hovering a recall row reveals a quiet **forget** link;
      clicking it strikes the row + swaps to **undo** for ~6s, then removes it.
      Clicking **undo** within the window restores the page. (Forget also scrubs
      the page from any working-set siblings — same `forget-page` path as the popup.)

## RSS feed panel (U5 / R5, R8, R10, R12, R13 / AE2, AE6, AE10, AE11)

- [ ] **Edit → add a panel → RSS feed**, paste a real feed URL → the grant prompt
      fires **in the same click** (or is skipped if `<all_urls>` is already held);
      headlines appear, labelled by **source host**.
- [ ] Click a headline → it **opens** in a new tab (the host resolves the index
      against its own parsed links).
- [ ] Add a **second** feed → a second labelled panel; remove one, the other stays.
- [ ] The panel footer always shows the **disclosure** ("fetches `<host>` · the
      host sees your IP & timing").
- [ ] Adding a feed URL of `http://…`, `https://192.168.1.1/feed`,
      `https://localhost/x`, or `javascript:…` is **rejected** by the add form
      (validation is automated in `tests/sourceurl.test.js`).
- [ ] A feed whose item title contains `<img onerror=…>` renders as **inert text**
      (automated in `tests/rss.test.js`; spot-check visually).
- [ ] A feed whose item **link** is `javascript:…` or `chrome://settings/` renders the
      headline **non-clickable** and never opens it — the host resolves only http(s)
      links (automated in `tests/broker-channel.test.js` `resolveOpen` scheme test).
- [ ] **Deny** the grant when adding → the panel shows a calm **"needs access"**
      state with a **Grant access** button (no silent-empty); granting re-loads it.
- [ ] An **unreachable** feed shows a quiet "couldn't load `<host>`" and **never
      blocks the board**.

## Crypto price panel (U6 / R6, R10, R11 / AE3, AE6)

- [ ] **Add → Crypto price**, enter `bitcoin, ethereum` → a glanceable price + 24h
      change appears with an **"as of HH:MM"** stamp; footer names **CoinGecko
      (ypuf-chosen)**.
- [ ] **Swap-on-refocus:** leave the board open, switch to another tab for >60s,
      switch back → the price **updates on refocus** (not while you were staring at
      it). It does **not** flicker/update in place while continuously viewed.
- [ ] Provider down / rate-limited (e.g. add a bogus token id) → the panel keeps
      **last-known** + "price unavailable", **no error badge**.

## Cache, cold-start, calm (U4, U7 / R11)

- [ ] First add of a panel shows a calm **"Loading…"** placeholder, never a blank
      or a blocked board.
- [ ] Reopen a new tab **within the TTL** (RSS ~30 min, crypto ~60s) → the panel
      serves from cache with **no new network request** (check the Network tab).
- [ ] No animation / auto-play anywhere; the board is quiet at rest.

## Minimal mode + grant lifecycle (U2 / R1)

- [ ] Toggle **minimal mode** → a near-blank calm page with a **Show board** exit
      and a link to **chrome://extensions** for restoring Chrome's native new tab.
- [ ] With **auto-let-go on** (holds `<all_urls>`), adding a network panel needs
      **no new grant** (short-circuit).
- [ ] Revoke a **feed's** per-origin permission in chrome://extensions →
      auto-let-go **stays on** (only revoking `<all_urls>` disables it).

---

# Board calm settings & soul — Phase A (calm chrome & control)

## Icons (U1 / R1)

- [ ] The masthead **Edit board** is a pencil icon; the recall-row **forget** is a
      trash icon (still hover/focus-revealed, swaps to **undo** text in the 6s window).
      Each has a tooltip + an aria-label; nothing is cryptic.

## Settings overlay (U2 / R2)

- [ ] A **gear** icon in the masthead opens a calm right-side **settings** slide-over;
      `Esc`, the backdrop, the ✕, and a second gear click all close it; focus returns
      to the gear; with reduced-motion set, no slide animation.
- [ ] **Focus trap:** initial focus lands on the first control (the auto switch); Tab
      cycles only within the overlay (never reaches the board behind it).

## Auto-let-go control (U3 / R3 / AE1)

- [ ] The overlay's **Auto-let-go** group: a pill switch (on/off) + a segmented
      **Timid · Balanced · Bold** with a subline ("Lets go after ~3 quiet days").
- [ ] Enabling from **off** requests the `<all_urls>` grant **in the same click**; once
      on, picking **Bold** says ~1 day, **Timid** ~7 days; the SW honors it (a tab idle
      past the chosen window becomes an auto-close candidate). *(Covers AE1)*
- [ ] Toggling **off** mutes the segmented control (still visible, non-interactive).
- [ ] **Untouched default** stays **Balanced** (~3 days) — existing behavior unchanged.

## Never-touch + one-tap protect (U4 / R4, R6 / AE2)

- [ ] Hovering a recall row reveals **protect** (shield) + **forget** (trash) as a pair.
- [ ] Click **protect** → the shield stays lit; the site appears in the overlay's
      **Never-touch** group and is **never auto-closed**; **remove** there clears it; an
      empty list shows "protect a site from a recall row." *(Covers AE2)*

## One-line relocation (U5 / R5 / AE6)

- [ ] The masthead no longer has a one-line button (just gear + edit). The **Board**
      group in the overlay has a **Daily one-line** switch; enabling it requests the
      `raw.githubusercontent.com` grant **in the same click**, then the footer shows a
      quiet aphorism (disclosed as `um.fz.ax`); the switch reflects the new state.
- [ ] The overlay stays calm — **three small groups** (Auto-let-go · Never-touch ·
      Board), no knobs wall. *(Covers AE6)*

# Board calm settings & soul — Phase B (soul: puff + digest)

## The puff on open (U6 / R7)

- [ ] Let a page auto-let-go (or use a Bold window so it happens fast), then open a
      **fresh** new-tab. In the ypuf recall panel, the newly-let-go row(s) **settle in
      from a soft haze** once — a calm exhale, not a flashy bounce.
- [ ] Toggling edit / re-rendering the board does **not** re-trigger the puff (one-shot
      per open). Re-opening a new tab puffs only rows let go *since the last open*.
- [ ] The **first board open ever** (fresh profile, no stored `boardLastOpen`) stays
      quiet — the whole backlog does **not** puff at once.
- [ ] With **Reduce motion** on (System Settings → Accessibility), the rows just appear
      — no animation. Manual let-go and snooze-wake rows never puff (auto-closed only).

## "Your week, unburdened" digest (U7 / R8)

- [ ] After some auto-let-go activity, the ypuf panel shows a quiet line below the relief
      moment: **"N let go this week · 0 lost · M recalled"** — muted, no box, no badge.
- [ ] On a **fresh profile** with no auto-let-go yet, the line is **absent entirely**
      (no cold "0 let go this week"). It reappears once there's something to count.
- [ ] The tally counts only the **last 7 days** and only **auto-closed** records;
      recalling a page later still counts it under *recalled*, but a page you let go and
      **never reopened is not** counted as recalled. **lost is always 0.**

# Board calm settings & soul — Phase C (keyboard layer)

## Board normal-mode — cursor + actions (U8 / R9, R12 / AE5)

- [ ] On the board (not focused in a field), `j` / `k` move a calm **amber left-bar**
      cursor over the recall rows; `g g` jumps to the top, `G` to the bottom. The
      cursored row reveals its protect/forget icons.
- [ ] `o` or `Enter` opens the cursored page; `x` forgets it (row strikes + **`u`**
      undoes within the grace window); `p` protects its site (shield lights).
- [ ] `/` jumps focus to the recall search; `e` toggles edit mode; `Esc` clears the
      cursor (and blurs the search if it was focused).
- [ ] **Typing is never hijacked:** with the search focused, `j`/`x`/`p`/`?` type
      literally; only `Esc` leaves the field. Arrow keys still reorder panels in edit
      mode (the board layer is `j`/`k`, so it never collides).
- [ ] **Invisible at rest:** before any key is pressed, the board shows no cursor and
      no keyboard chrome.

## `f` link-hints (U9 / R10 / AE5)

- [ ] Press `f` → an **amber letter badge** appears over every host-rendered clickable
      (recall row titles + top-sites). Type a label → that page opens.
- [ ] Badges appear **only** on host-rendered clickables — **not inside** the RSS or
      crypto panels (those are sandboxed iframes the host can't badge; pattern 16).
- [ ] With many targets, labels escalate to **two letters**; after the first letter,
      non-matching badges dim and the second letter resolves it.
- [ ] `Esc` (or a key that matches no label) clears all badges. Nothing is drawn before
      `f` is pressed, and nothing lingers after select/cancel (invisible at rest).

## `?` cheatsheet + calm guarantees (U10 / R11, R12 / AE5, AE6)

- [ ] Press `?` (not in a field) → a calm centered **Keyboard shortcuts** card lists all
      bindings; it notes that `f`-hints don't reach inside the RSS/crypto panels.
- [ ] `Esc`, the backdrop, or the close button dismisses it; focus returns to where it
      was; Tab cycles within the card (focus-trapped). Reduced-motion → no animation.
- [ ] The **settings overlay footer** reads "Keyboard shortcuts: press ? on the board."
- [ ] **In a field, `?` types a literal `?`** (the layer never hijacks typing).
- [ ] **Invisible at rest:** with no key pressed, the board carries no cursor, no badges,
      and no keyboard chrome — the whole layer is summoned, never ambient. *(AE6)*

## Keyboard-layer state hygiene (Phase C review)

- [ ] **Re-render clears the layer:** press `f` (badges show), then trigger a re-render
      (toggle edit with the pencil, or edit the board in another tab) → all badges vanish
      and typing no longer hijacks keys. A set cursor is also cleared by a re-render.
- [ ] **Esc out of an overlay keeps your place:** move the cursor with `j`, open the
      `?` cheatsheet, press `Esc` → the cheatsheet closes and the recall cursor is *still*
      where it was (the Esc doesn't leak through to clear it).
- [ ] **Held keys are safe:** holding `j`/`k` scrolls the cursor smoothly, but holding
      `x` forgets the row only **once** (no double-forget); a stray `g` long ago never
      triggers a later jump-to-top.
