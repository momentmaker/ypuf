# ypuf — Privacy Policy

**Effective date:** 2026-06-18
**Applies to:** the ypuf Chrome extension ("ypuf", "the extension").

## The one-sentence version

**ypuf is 100% local. Nothing ypuf records about your tabs or pages ever leaves
your device — there are no ypuf servers, no accounts, no analytics, and nothing
is ever sold or shared.**

ypuf is a *local index*, like your browser's own history — not a data processor.

---

## What ypuf stores (all on your device)

To let you close tabs and find them again, ypuf keeps the following in your
browser's own local storage (`chrome.storage.local` and IndexedDB), on your
computer only:

- **A content index of pages you let go** — the page title, its address (with
  the query string stripped off), and the readable article text, extracted
  on-device with Mozilla's Readability (the same engine as Reader Mode, which
  skips navigation, sidebars, ads, and form fields).
- **Dwell / revisit signals** — how long and how often you keep a tab open, so
  ypuf can tell a tab you care about from a forgotten one. Counts and durations,
  keyed by address.
- **Your settings** — the panels on your new-tab board, your theme, your
  protected sites, snooze schedules, and which feeds/sources you added.

All of this lives on your machine. **Uninstalling ypuf deletes it.**

---

## What ypuf never does

- **Never transmits** your browsing history, page content, tab data, or any of
  the above off your device.
- **No analytics, no telemetry, no tracking.** ypuf has no servers and makes no
  "phone home" requests.
- **No accounts, no sign-in.**
- **Never sells, rents, or shares** your data with anyone. There is no third
  party to share it with.

---

## What ypuf deliberately excludes

- **Incognito windows are not indexed at all** (the extension is disabled in
  incognito — `incognito: "not_allowed"`).
- **Sensitive sites are excluded by default** — a built-in blocklist covers
  banking, health, government, and password-manager domains. Pages on those
  sites are closed and recorded as **title + address only** (never their text),
  and you can add your own domains to this list.
- **Form fields and input values are never captured.** ypuf reads the article
  text of a page, not what you type into it.

---

## Network requests

The core of ypuf — letting tabs go and recalling them — makes **zero network
requests**. Page text is extracted locally; recall search runs locally.

The **only** outbound requests come from **optional panels that you choose to
add** to your new-tab board:

- An **RSS panel** fetches the feed URL **you** entered, from the site you chose.
- A **crypto-price panel** fetches public prices from the provider it names.

These panels are opt-in, one per source, and each is disclosed in the panel
footer (e.g. "fetches example.com · sees your IP + timing"). ypuf grants the
host access for these **in the moment you add the panel**, and adds no tracking
of its own — the request is an ordinary web fetch to the source you picked, the
same as if you visited it in a tab. If you add no such panels, ypuf makes no
network requests at all.

ypuf also uses Chrome's built-in, on-device APIs for site icons (`_favicon`) and
your most-visited sites (`topSites`); these do not leave your device.

---

## Your controls

- **"What's indexed"** — a view in the popup listing everything ypuf has stored,
  shown as plain text.
- **Forget** — one click to remove a single page, or every page from a domain,
  from the index (and its dwell/revisit signals with it).
- **Protected sites** — keep any site from ever being auto-closed.
- **Uninstall** — removes ypuf and all of its local data.

---

## Why ypuf asks for the permissions it does

Each permission serves the single purpose of managing and recalling your tabs,
entirely on-device:

| Permission | Why |
|---|---|
| `tabs`, `activeTab` | See and manage your open tabs (the core of a tab manager). |
| `scripting` | Inject the recall/snooze command bar and read a page's readable text **on-device** when you let it go. |
| `storage` | Save the local index + your settings on your device. |
| `alarms` | Wake snoozed tabs at the time you chose. |
| `notifications` | Show the "undo" prompt after a tab is let go. |
| `offscreen` | Play the brief "puff" sound when a tab is let go. |
| `topSites`, `favicon` | Power the optional Top-Sites board panel and show site icons (Chrome's local APIs). |
| `host_permissions` (`<all_urls>`, **optional**) | Requested **only when you ask** — to index a page's text on let-go, or to fetch a panel source you added. Not granted by default. |

---

## Children

ypuf is a general-purpose productivity tool and is not directed at children.

## Changes to this policy

If this policy changes, the updated version will be posted here with a new
effective date. ypuf's local-only design is core to the product; any change that
affected it would be announced prominently.

## Contact

Questions about privacy? Open an issue at
<https://github.com/momentmaker/ypuf> or email **privacy@ypuf.com**.
