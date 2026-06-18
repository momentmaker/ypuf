#!/usr/bin/env bash
# Build the Chrome Web Store upload package: a .zip whose ROOT is the extension
# directory (manifest.json at the top level), which is what the dashboard expects.
#
#   ./scripts/pack.sh          → dist/ypuf-<version>.zip
#
# No build step — ypuf is shipped as-is. This only zips extension/, excluding junk.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
ext_dir="$repo_root/extension"
dist_dir="$repo_root/dist"

version="$(grep -m1 '"version"' "$ext_dir/manifest.json" | sed -E 's/.*"version" *: *"([^"]+)".*/\1/')"
out="$dist_dir/ypuf-${version}.zip"

mkdir -p "$dist_dir"
rm -f "$out"

# Zip the CONTENTS of extension/ (so manifest.json is at the archive root).
# Exclude OS/editor cruft and any stray map/log files.
( cd "$ext_dir" && zip -r -X "$out" . \
    -x '*.DS_Store' '__MACOSX/*' '*.map' '*.log' '*/.*' )

echo "Packed v$version → ${out#"$repo_root"/}"
echo "Upload this zip at https://chrome.google.com/webstore/devconsole"
unzip -l "$out" | tail -1
