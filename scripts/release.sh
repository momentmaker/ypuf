#!/usr/bin/env bash
#
# Cut a release: bump the version, promote the changelog, run the gate, commit, and tag.
#
#   ./scripts/release.sh 1.0.1            # prepare locally (commit + tag) — does NOT push
#   ./scripts/release.sh 1.0.1 --push     # also push → triggers the Release workflow (live store publish)
#
# Steps:
#   1. set "version" in extension/manifest.json + package.json
#   2. move CHANGELOG.md [Unreleased] notes into a dated [x.y.z] section + refresh compare links
#   3. run the test suite (the same gate CI enforces) — abort on red
#   4. commit "chore(release): vX.Y.Z" and annotate-tag vX.Y.Z
#
# Pushing the tag is what publishes. Without --push you can review the commit first,
# then: git push origin <branch> --follow-tags
set -euo pipefail

die()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
info() { printf '\033[36m• %s\033[0m\n' "$1"; }

ver="${1:-}"; ver="${ver#v}"
mode="${2:-}"
[ -n "$ver" ] || die "usage: $0 X.Y.Z [--push]"
printf '%s' "$ver" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$' || die "not a semantic version: '$ver'"
tag="v$ver"
em="—"

root="$(cd "$(dirname "$0")/.." && pwd)"; cd "$root"

[ -z "$(git status --porcelain)" ] || die "working tree not clean — commit or stash first"
git rev-parse "$tag" >/dev/null 2>&1 && die "tag $tag already exists"
branch="$(git branch --show-current)"
[ "$branch" = "main" ] || info "heads up: on branch '$branch', not main"

prev="$(grep -m1 -E '^## \[[0-9]' CHANGELOG.md | sed -E 's/^## \[([^]]+)\].*/\1/' || true)"
today="$(date +%Y-%m-%d)"

info "version → $ver  (manifest.json + package.json)"
perl -0777 -i -pe 's/("version"\s*:\s*")[^"]*"/${1}'"$ver"'"/' extension/manifest.json
perl -0777 -i -pe 's/("version"\s*:\s*")[^"]*"/${1}'"$ver"'"/' package.json

info "CHANGELOG: [Unreleased] → [$ver] $em $today"
perl -0777 -i -pe 's/^## \[Unreleased\]\n/## [Unreleased]\n\n## ['"$ver"'] '"$em"' '"$today"'\n/m' CHANGELOG.md
if [ -n "$prev" ]; then
  perl -0777 -i -pe 's{^\[Unreleased\]:.*$}{[Unreleased]: https://github.com/momentmaker/ypuf/compare/'"$tag"'...HEAD\n['"$ver"']: https://github.com/momentmaker/ypuf/compare/v'"$prev"'...'"$tag"'}m' CHANGELOG.md
fi

info "running the test gate"
command -v node >/dev/null || die "node not found"
[ -d node_modules ] || npm ci
node --test tests/*.test.js >/dev/null 2>&1 || die "tests failed — fix before releasing (run: node --test tests/*.test.js)"

info "commit + tag $tag"
git add extension/manifest.json package.json CHANGELOG.md
git commit -q -m "chore(release): $tag"
git tag -a "$tag" -m "ypuf $tag"

if [ "$mode" = "--push" ]; then
  info "pushing $branch + $tag → the Release workflow takes it from here"
  git push origin "$branch" --follow-tags
  printf '\033[32m✓ %s pushed. Watch it: gh run watch --workflow=release.yml\033[0m\n' "$tag"
else
  printf '\033[32m✓ %s prepared locally (committed + tagged, not pushed).\033[0m\n' "$tag"
  printf '  Review, then publish with:\n    git push origin %s --follow-tags\n' "$branch"
  printf '  (pushing the tag triggers the Release workflow → live store publish.)\n'
fi
