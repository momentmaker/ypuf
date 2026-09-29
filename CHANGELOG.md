# Changelog

All notable changes to ypuf are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); ypuf adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The `version` field in
`extension/manifest.json` is the source of truth, and each release is tagged `vX.Y.Z`.

## [Unreleased]

### Changed
- **Crypto prices now come from DefiLlama instead of CoinGecko.** CoinGecko's free
  price API began blocking some connections outright — for hours, even when asked only
  every 15 minutes — leaving the panel dark. DefiLlama is free, needs no account, and
  understands the same coin ids (`bitcoin`, `ethereum`, …), so your existing panels
  keep working as they are. If you haven't given ypuf access to all sites, the panel
  asks once for access to DefiLlama. Prices refresh about once a minute, and the
  panel's "as of" time now shows when the price was actually observed, not just when
  ypuf last fetched it.

### Fixed
- **The crypto price panel no longer multiplies its requests.** Free price APIs limit
  requests per network address, and every open new tab fetched prices on its own once
  a minute — then kept asking after being refused, which kept it refused. All open
  boards now share a single price check about once a minute.
- **A failing feed or price source now waits before retrying.** Instead of trying
  again on every new tab, ypuf backs off — 1, 2, 4, 8, then 15 minutes (longer if the
  source asks) — and shows the last prices or headlines it has in the meantime.
- **Switching tabs is much lighter.** ypuf kept how long and how often you visit
  pages in one big record that it rewrote — and sent to every open new tab — each
  time you switched tabs, changed pages, or moved between windows; after a few months
  of browsing that was megabytes per switch. It now keeps one small entry per page
  and updates only the pages involved. Your existing history moves over by itself
  the first time the new version runs, and still never leaves your device.

## [1.3.0] — 2026-07-05

### Added
- **Recall panel paging.** The new-tab Recall panel now walks the whole let-go archive in
  calm pages of 7 — page 1 stays the "reaching for these" peek, later pages walk back
  reverse-chronologically under Today / This week / Earlier headers. Flip with the subtle
  `‹ ›` arrows beside "Search all let-go pages…", or `]` / `[` (or `→` / `←`) in the
  keyboard layer (`g g` / `G` jump to the newest / oldest page). A quiet "N let go" count reassures that
  nothing was lost. Still search-first and local-only; the ⌘⇧K overlay is unchanged.

## [1.2.0] — 2026-06-24

### Added
- **Recall by meaning (opt-in).** A new Settings toggle lets recall find a page by what
  it was *about*, not just the words it used — type "the article about quitting tech to
  farm" and it surfaces a page that never said any of those words. It's **off by default**;
  turning it on downloads a small (~30&nbsp;MB) language model **once** and then runs
  **entirely on your device** — your pages and searches never leave your machine, and
  keyword recall keeps working throughout. Turn it off to delete the model and everything
  it built. *(An experiment — see if you reach for it.)*

### Fixed
- **The recall (`⌘⇧K`) and snooze (`⌘⇧S`) command bars now always sit on top.** On some
  pages a high-stacking element could paint over the overlay; it now claims the top layer
  so nothing covers it.

## [1.1.0] — 2026-06-23

### Added
- **One-box recall.** A single search box now finds any page — open, let go, or
  snoozed — and the primary action adapts to what it finds: jump to a tab you
  already have open, or reopen / restore an archived one. Results are intent-ranked,
  so the pages you keep returning to rise to the top.
- **Search by session and time.** Narrow recall with episodic pivots — `with:github`
  to find what you let go alongside a site, or a phrase like "yesterday" or
  "last week" — shown as dismissible chips you can clear with a click.
- **Proactive recall.** Before you type, the panel offers a small *"Reaching for
  these"* set — the pages you're most likely reaching for right now (recently active
  and often revisited), so the best search is often the one you never run.
- **Matched-term highlighting** in the content excerpt, even on fuzzy hits
  (typing `googl` highlights the matched **google**).
- **A "What the icons mean" legend** in Settings, and a quiet ↻ marker on rows you
  revisit often. Press `,` to open Settings from the board.

### Changed
- **Calmer, uniform recall rows.** The "bring back the set" (⊕) chip and the
  frequency marker now sit inline on the meta line, so every row is the same height.
  Snooze items drop the set chip — that timeline is just about when a page returns.

### Fixed
- **No more duplicate recall rows.** A page you let go more than once now appears
  once — fixed both at the source (one stored record per page) and in the proactive
  and pivot lists.

## [1.0.2] — 2026-06-22

### Fixed
- **Keyboard delete now acts on the row you're on.** After letting a recall row go with
  `d`, the cursor advances past it instead of leaving the just-removed row in the count —
  so the next `d` no longer deletes the wrong page. `u` still undoes your most recent let-go.
- **The Recall panel's top heading and footer are no longer dimmed** by the panel's scroll
  fade — "Today" and the "Search all let-go pages…" footer now read fully.

## [1.0.1] — 2026-06-20

### Added
- A calm **empty state for the Recall panel** — when you have no let-go pages yet,
  the puff mark scatters and reforms (let go → recalled) over a teaching line, with a
  soft time-of-day glow. The Snooze empty state gained a matching second line. Both
  collapse to a still mark under reduced motion.

## [1.0.0] — 2026-06-19

First public release — submitted to the Chrome Web Store.

### Added
- **Auto-let-go.** ypuf conservatively archives idle tabs you've stopped using;
  they fade with a soft *puff*. Always an instant undo, learns from what you
  reopen, and never touches pinned, audio, login, or form tabs, or protected sites.
- **Recall by content.** Every let-go page is indexed by its readable text,
  on-device. A command bar (`Ctrl/Cmd+Shift+K`) searches by what a page *said*,
  with content snippets and an "often revisited" signal.
- **Snooze.** Send a tab away until later today, this evening, tomorrow morning,
  the weekend, next week, or when you're back — with a guaranteed return
  (`Ctrl/Cmd+Shift+S`).
- **Bring back the set.** Restore a page together with the working set of tabs it
  was open with.
- **The calm new-tab board.** A quiet, glanceable board: the recall shelf plus
  optional panels (RSS, crypto prices, top sites), a full keyboard layer, and
  light / dark / starlit-night themes.
- **The living-puff favicon.** The tab's favicon and title as an ambient barometer
  of the snooze queue — a barely-there breath, time-of-day tint, and one-shot
  arrival / let-go moments. Reduced-motion-gated to a still mark.

### Privacy & security
- **100% local.** Page content is never transmitted — no servers, no accounts, no
  analytics. Incognito is never indexed; sensitive domains are excluded (recorded
  as title + address only); form inputs are never captured.
- The optional `<all_urls>` host permission is requested **only in-gesture** —
  when you turn on content indexing or add a panel source — never by default.
- No remote code; the extension is unminified vanilla JS bundled in the package.

[Unreleased]: https://github.com/momentmaker/ypuf/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/momentmaker/ypuf/releases/tag/v1.3.0
[1.2.0]: https://github.com/momentmaker/ypuf/releases/tag/v1.2.0
[1.1.0]: https://github.com/momentmaker/ypuf/releases/tag/v1.1.0
[1.0.2]: https://github.com/momentmaker/ypuf/releases/tag/v1.0.2
[1.0.1]: https://github.com/momentmaker/ypuf/releases/tag/v1.0.1
[1.0.0]: https://chromewebstore.google.com/detail/ypuf/fpapcjbmlhcclofloedaklhkeneiajid
