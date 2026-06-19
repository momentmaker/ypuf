# Changelog

All notable changes to ypuf are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); ypuf adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The `version` field in
`extension/manifest.json` is the source of truth, and each release is tagged `vX.Y.Z`.

## [Unreleased]

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

[Unreleased]: https://github.com/momentmaker/ypuf/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/momentmaker/ypuf/releases/tag/v1.0.0
