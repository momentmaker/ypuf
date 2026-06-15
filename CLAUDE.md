# ypuf — project memory

ypuf is an early-stage Chrome (Manifest V3) extension. **Read
[`docs/CONTEXT.md`](docs/CONTEXT.md) before doing anything** — it captures every
product and technical decision from the ideation session and is the starting
point for speccing, brainstorming, or building.

Past learnings live in `docs/solutions/` — documented solutions (bugs, architecture
patterns, conventions) organized by category with YAML frontmatter (`module`,
`tags`, `problem_type`). Relevant when implementing or debugging in a documented area.

## Fast facts

- **Name:** ypuf = "Your Pages, Unburdened & Findable" (domain ypuf.com). The
  "puff" is the sound of a tab being let go; "Ebb" is the in-app verb for it.
- **Hero feature:** *auto-let-go* tab management — the tool clears tabs you've
  stopped caring about, with guaranteed recall so nothing is ever lost.
- **Secondary:** a new-tab *flashcard widget* (spaced repetition) that doubles
  as a marketing funnel for **jivx** (sibling Japanese-learning app at
  `../jivx`).
- **Stack:** vanilla-JS MV3 extension, 100% local, **no LLM in v1**.
- **Reference skeleton:** `reference/tab-out/` (gitignored, MIT © Zara Zhang).
  Lift files deliberately and preserve attribution — see `NOTICE.md`.

## Working principles for this repo

- **Protect the v1 line.** A lot of features are deliberately parked — read the
  "Rejected / parked (and why)" section of `docs/CONTEXT.md` before adding any
  scope, so old debates aren't re-litigated.
- **Privacy is load-bearing.** Everything stays on-device; page content is never
  transmitted. See the privacy section of the context doc.
- **The product's promise is calm.** Don't let the tool accrete into the
  cluttered thing it's meant to cure.
