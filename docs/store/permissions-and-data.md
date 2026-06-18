# Chrome Web Store — permissions, single purpose & data disclosures

Copy-paste-ready answers for the Developer Dashboard. (Exact field labels /
certification wording are confirmed in `SUBMISSION.md` against the current store
console — the substance here is product-accurate.)

---

## Single purpose

> **ypuf is a tab manager. Its single purpose is to help you close tabs you've
> stopped using and find any page you've had open again by its content — all on
> your own device.** Every feature (auto-archiving idle tabs, full-content
> recall, snooze, the new-tab shelf) serves that one purpose: fewer open tabs,
> nothing lost.

This is a focused, single-purpose extension. There is no unrelated bundled
functionality, no remotely hosted code, and no data collection beyond what runs
locally to serve this purpose.

---

## Per-permission justification

Paste one of these into each permission's justification field.

- **`tabs`** — Core to a tab manager: ypuf reads your open tabs to decide which
  idle ones to archive and to reopen/focus a recalled page without creating a
  duplicate.
- **`activeTab`** — Lets the user act on the current tab (let it go, snooze it,
  open the recall bar) from a keyboard shortcut or the toolbar.
- **`scripting`** — Injects ypuf's recall and snooze command bars into the
  active page on a keyboard shortcut, and extracts a page's readable text
  **on-device** (Mozilla Readability) the moment the user lets it go, so it can
  be searched later. No remotely hosted code is injected.
- **`storage`** — Stores the local content index and the user's settings
  (panels, theme, protected sites, snooze schedules) in the browser's local
  storage on the user's device.
- **`alarms`** — Wakes a snoozed tab at the time the user chose.
- **`notifications`** — Shows the brief "Undo" prompt right after a tab is let
  go, so an archive is never irreversible by surprise.
- **`offscreen`** — Plays the short "puff" confirmation sound when a tab is let
  go (Web Audio in an offscreen document, the MV3-supported way).
- **`topSites`** — Powers an optional "Top sites" panel on the new-tab board
  (Chrome's local most-visited API; nothing leaves the device).
- **`favicon`** — Shows site icons next to recalled pages and board items
  (Chrome's local `_favicon` API).

### Host permission justification (`<all_urls>`, **optional**)

> Requested **only when the user explicitly asks for it**, never on install.
> ypuf needs page access in two on-demand cases: (1) to read a page's readable
> text on the user's device when they let that tab go, so they can find it again
> by content; and (2) to fetch a content source (e.g. an RSS feed) the user
> chose to add to their new-tab board. Access is requested in the moment of that
> action via the optional-permissions flow, and page text is never transmitted —
> it is indexed locally only. Sensitive sites (banking, health, government,
> password managers) and incognito are excluded.

> **No remotely hosted code.** ypuf is 100% vanilla JavaScript bundled in the
> package; it loads and executes no external scripts. (Confirms the MV3 remote-code
> policy.)

---

## Data use & privacy practices

**Privacy policy URL:** `https://ypuf.com/privacy` (also at
[`PRIVACY.md`](../../PRIVACY.md) in this repo until the site is live). A privacy
policy is provided because ypuf handles web history and website content (locally).

### Data the extension handles

| Data type | Handled? | How |
|---|---|---|
| **Web history** (pages let go / recalled) | Yes | Stored **locally only**; never transmitted. Serves the single purpose. |
| **Website content** (readable page text) | Yes | Extracted **on-device** (Readability), stored **locally only**; never transmitted. Sensitive domains excluded; form inputs never captured. |
| Personally identifiable info (name, email, address, ID) | No | Not collected. |
| Authentication info / passwords | No | Excluded by default (password-manager domains blocklisted); form inputs never read. |
| Financial / payment info | No | Banking domains excluded by default. |
| Personal communications | No | Not collected. |
| Location | No | Not collected. |
| Health info | No | Health domains excluded by default. |
| **User activity** | Yes | ypuf records *dwell time* + *revisit counts* per address (which tabs you keep active, to rank what to archive) — stored **locally only**. It does **not** log keystrokes, clicks, mouse movement, or interaction content. |
| Web browsing — general | See web history | As above: local-only index. |

### The three required certifications (all true for ypuf)

- ✅ **I do not sell or transfer user data to third parties**, apart from the
  approved use cases. — ypuf transfers user data to *no one*; everything is
  local.
- ✅ **I do not use or transfer user data for purposes unrelated to my item's
  single purpose.** — The local index exists solely to recall your tabs.
- ✅ **I do not use or transfer user data to determine creditworthiness or for
  lending purposes.**

**Net:** ypuf collects no data *off the device*. Its strongest selling point —
"nothing ever leaves your machine" — is also the cleanest possible answer to
every data-handling question on the form.
