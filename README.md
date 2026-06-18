# ypuf

**Your Pages, Unburdened & Findable.**

ypuf is a Chrome extension that lets you stop *managing* tabs. It quietly clears
the tabs you've stopped caring about and gives you instant, full-text recall of
everything you've ever had open — so you can **close everything and lose nothing.**

Tabs are open loops. ypuf treats them like one: let go of what's dead (the
*ebb*), recall what matters the moment you need it (the *flow*). Everything stays
on your device.

---

## What it does

- **Auto-let-go** — ypuf conservatively archives the tabs you've stopped using
  (open for days, never revisited, nothing unsaved). Tabs fade with a soft
  *puff*; the bar gets lighter. There's always an instant undo, it learns from
  what you reopen, and it never touches pinned tabs, audio, logins, forms, or
  sites you've protected.
- **Recall — the safety net** — every let-go page is indexed by its **content**
  (the readable article text, not just the title), on-device. Hit
  **`Ctrl/Cmd+Shift+K`** anywhere and search by what a page *said* — "that
  article about the founder who quit Google to farm." Recall is faster than
  re-googling, with content snippets, recency grouping, and an "often revisited"
  marker.
- **Snooze a tab** — **`Ctrl/Cmd+Shift+S`** to send a tab away until *later
  today*, *this weekend*, *next week*, or *when you're back* — with a guaranteed
  return.
- **Bring back the set** — restore a page together with the working set of tabs
  it was open with ("resume my Tuesday tax research").
- **A calm new-tab board** — a quiet, glanceable panel board: ypuf's own recall
  shelf, plus optional panels (RSS, crypto prices, top sites). A full vim-style
  keyboard layer (`j`/`k`, `f`-hints, `/` search, `?` help).
- **Light · dark · star** theming with a live moon-phase toggle, computed
  on-device.

## Privacy — load-bearing, not a footnote

Everything ypuf records lives on your machine. **Nothing leaves your device** —
no servers, no accounts, no analytics, nothing sold or shared. Page content is
extracted locally (Mozilla Readability) and never transmitted. Incognito is
never indexed; banking/health/gov/password-manager sites are excluded by default
and user-extensible; form inputs are never captured. You get a visible **"what's
indexed"** view and one-click **forget** for any page or domain. See
[`PRIVACY.md`](PRIVACY.md).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd+Shift+Y` | Open the ypuf shelf (popup) |
| `Ctrl/Cmd+Shift+K` | Recall command bar |
| `Ctrl/Cmd+Shift+L` | Let go of the current tab |
| `Ctrl/Cmd+Shift+S` | Snooze the current tab |

Remap any of these at `chrome://extensions/shortcuts`.

## Install

**From source (developer mode):**

1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**.
3. Select the [`extension/`](extension/) folder.

A Chrome Web Store listing is in preparation — see [`docs/store/`](docs/store/).

## Development

ypuf is **vanilla JavaScript with no build step** — load `extension/` directly
and reload after edits. The decidable logic lives in `extension/lib/` as pure,
node-testable modules:

```sh
node --test tests/*.test.js
```

Browser-only surfaces (the new-tab board, popup, and the injected command/snooze
overlays) are verified by hand against [`tests/MANUAL-DOGFOOD.md`](tests/MANUAL-DOGFOOD.md),
and runtime-checked with a stubbed-`chrome` HTML harness (see
`docs/solutions/architecture-patterns/`).

Product and architecture decisions live in [`docs/CONTEXT.md`](docs/CONTEXT.md);
documented learnings in [`docs/solutions/`](docs/solutions/).

## License

MIT © 2026 momentmaker — see [LICENSE](LICENSE).

The extension scaffold is adapted in part from
[tab-out](https://github.com/zarazhangrui/tab-out) (MIT © 2026 Zara Zhang).
See [NOTICE.md](NOTICE.md).
