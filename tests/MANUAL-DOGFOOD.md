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

## Crash-consistency (U3/U4/U5)

- [ ] Let go of a page, then in the SW console run `chrome.runtime.reload()` (or
      let the worker idle out) and recall the page — it is still searchable
      (index reconciled against the store on wake).
