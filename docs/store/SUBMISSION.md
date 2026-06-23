# ypuf — Chrome Web Store submission checklist

Everything needed to publish ypuf, step by step. Specs verified against the
Chrome Web Store developer docs (2026). Companion files: `listing.md` (copy),
`permissions-and-data.md` (dashboard answers), `../../PRIVACY.md` (policy).

---

## 0. One-time setup

- [ ] **Register as a CWS developer** — pay the **$5 one-time fee** at
      <https://chrome.google.com/webstore/devconsole>. Use a **dedicated Google
      account** for publishing (an account-level ban shouldn't touch your
      personal Google services). The registration email can't be changed later.
- [ ] Agree to the Developer Program Policies.

## 1. Manifest review (pre-package)

- [x] **Version** — `manifest.json` bumped to **`1.0.0`** for the public launch
      (increment on every resubmission). Dashboard **release notes** come from the
      `[1.0.0]` section of `../../CHANGELOG.md`.
- [ ] **Name** — manifest `name` is `ypuf` (limit is 75 chars). The store
      listing *title* can be the longer `ypuf — close tabs, find them by content`
      without touching the manifest. Decide if you want the long form in the
      toolbar too (then expand the manifest `name`).
- [x] **Store icon** — `icons/icon128.png` regenerated with the puff mark
      centered in a **96×96** area on a 128px transparent canvas (**16px pad**),
      so it no longer hugs the corner. ✓
- [ ] **No remote code** — confirmed: ypuf is 100% vanilla JS bundled in the
      package, executes no external scripts (MV3 requirement). ✓
- [ ] **MV3** — confirmed `manifest_version: 3`. ✓

## 2. Build the package

```sh
./scripts/pack.sh        # → dist/ypuf-<version>.zip (manifest.json at the root)
```

- [ ] Zip is the **contents** of `extension/` with `manifest.json` at the root
      (the script does this; verify with `unzip -l`). Max upload 2 GB — ypuf is
      ~0.6 MB. ✓

## 3. Assets to produce (exact specs)

| Asset | Spec | Status |
|---|---|---|
| Store icon | 128×128 PNG (artwork in 96×96 + 16px pad) | ✓ in package |
| Screenshots | **1–5**, **1280×800** (preferred) or 640×400, PNG/JPG, full-bleed | ✓ `assets/screenshot-1..5-*.png` |
| Small promo tile | **440×280 PNG — REQUIRED** | ✓ `assets/promo-small-440x280.png` |
| Marquee promo | 1400×560 PNG — optional (homepage feature) | optional |

- [x] **Five 1280×800 screenshots** in `assets/` — (1) recall command bar (star
      theme), (2) the calm board, (3) the let-go popup shelf, (4) the snooze
      chooser, (5) "What's indexed" + forget. Rendered from the shipping CSS via a
      headless harness; reshoot the recall/popup shots from a live populated
      profile if you want true captures (see `listing.md` shot list).
- [x] **Required** 440×280 small promo tile — `assets/promo-small-440x280.png`
      (puff mark on parchment, "close everything; lose nothing").

## 4. Dashboard — the five tabs

**Add new item → upload the zip → fill:**

1. **Package** — uploaded zip; release notes.
2. **Store listing** — name, summary (≤132 chars), detailed description,
   category **Tools** (under Productivity), language, screenshots, promo tile.
   Copy is in `listing.md`. Make the **optional `<all_urls>` "needs access"
   flow** prominent in the description (Limited Use requires the broad-access
   feature be described).
3. **Privacy practices** — single-purpose statement; **a justification per
   permission**; data disclosures + the three certifications. All answers in
   `permissions-and-data.md`. Set **Privacy policy URL** (host `PRIVACY.md` at
   `https://ypuf.com/privacy` or a GitHub Pages URL — must not 404 and must
   match the declared practices).
   - Data types to check: **Web history**, **User activity**, **Website
     content**. Leave PII / health / financial / auth / comms / location
     unchecked.
4. **Distribution** — visibility (Public / Unlisted), regions, pricing (free).
5. **Test instructions (for reviewers)** — paste the block in §5 below so the
   reviewer can trigger the optional `<all_urls>` grant.

- [ ] **Submit for review** → choose auto-publish on approval, or manual (you
      then have 30 days to publish before approval expires).

## 5. Test instructions for reviewers (paste verbatim)

> ypuf works with **no host permissions by default**. To exercise full-content
> recall:
> 1. Open the popup (toolbar icon or Ctrl/Cmd+Shift+Y) and click **"turn on"** —
>    Chrome's host-access prompt appears (this is the optional `<all_urls>`
>    grant, requested only in this gesture).
> 2. On any normal article, press **Ctrl/Cmd+Shift+L** to let the tab go.
> 3. Press **Ctrl/Cmd+Shift+K** and type a phrase from that page's body text —
>    it appears and reopens. All indexing is on-device; nothing is transmitted.
> Snooze: **Ctrl/Cmd+Shift+S**. The new-tab page is ypuf's board.

## 6. Review expectations & gotchas

- **Timing:** clean narrow-permission extensions can auto-approve in hours;
  ypuf's broad permissions (`tabs`, `scripting`, optional `<all_urls>`) will
  likely get **manual review, ~2–5 business days**. Submit Tue–Thu (not Friday).
- **Avoid these rejection triggers** (violation code in parens):
  - Excessive/unjustified permission (**Purple Potassium**) → every permission
    has a justification; `<all_urls>` is **optional** + described in the listing.
  - Missing/mismatched privacy policy (**Purple Lithium**) → `PRIVACY.md` hosted,
    URL live, matches the disclosures.
  - Missing metadata — icon/title/screenshot/description (**Yellow Zinc**) →
    don't leave the description blank; include the required promo tile + ≥1 shot.
  - Single-purpose violation (**Red Magnesium**) → framed as the narrow browser
    function **"tab management / the new tab"**; the board is part of that
    surface, stated explicitly in the single-purpose field.
  - Deceptive listing → description matches actual behavior.
  - Obfuscated code → ypuf isn't minified/obfuscated. ✓

## 7. After publishing

- [x] **Live** on the Chrome Web Store:
      <https://chromewebstore.google.com/detail/ypuf/fpapcjbmlhcclofloedaklhkeneiajid>
- [x] README + landing page updated with the live store link.
- [ ] **No `v1.0.0` git tag** — 1.0.0 shipped via the dashboard; pushing a `v1.0.0`
      tag would make `release.yml` try to re-publish a version the store already has
      (the CWS API rejects a duplicate version). Automated release tags start at
      `v1.0.1` (`./scripts/release.sh 1.0.1 --push`).

---

## 8. Semantic-recall model asset (per model version, not per release)

The optional "Recall by meaning" feature fetches a static-embedding model the user
opts into. The bytes are re-hosted as an **immutable GitHub Release asset**, pinned by
SHA-256 in `extension/lib/modelasset.js`. Until the asset is uploaded, opt-in falls
back to keyword recall (no crash) — so this is a prerequisite for the feature to work
end-to-end, done **once per model version**, not on every store release.

- [ ] Create a GitHub release `semantic-model-v1` and upload `model.safetensors`
      (~30 MB) + `tokenizer.json` (potion-base-8M, MIT — see `NOTICE.md`).
- [ ] Verify the pinned hash matches the uploaded bytes:
      `shasum -a 256 model.safetensors` must equal `SAFETENSORS_SHA256` in
      `extension/lib/modelasset.js`. **Update URL + hash atomically in the same commit**
      on any model bump (a mismatched hash makes every download fail-closed).
- [ ] After a model bump, vectors tagged with the old `modelVersion` self-invalidate
      and re-backfill (U3) — no stale-vector blending.
- [ ] Dashboard *Privacy practices → remote code*: answer **No** (the model is data,
      not code).
