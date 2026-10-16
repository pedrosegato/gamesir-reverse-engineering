#!/usr/bin/env bash
# The file:line references in docs/ point to the files generated here.
# Usage: docs/scripts/prepare-analysis.sh [extracted app.asar folder]   (default: decompiled)
set -euo pipefail
cd "$(dirname "$0")/../.."
APP=${1:-decompiled}
SRC="$APP/dist/electron"
OUT=analysis
PRETTIER="npx --yes prettier@3.8.1 --parser babel --print-width 120"

if [[ ! -f "$SRC/main.js" ]]; then
  echo "$SRC/main.js not found; extract app.asar from GameSir Connect 1.16.7 first" >&2
  exit 1
fi

mkdir -p "$OUT/main-modules"
node docs/scripts/split-webpack.cjs "$SRC/main.js" "$OUT/main-modules"
$PRETTIER < "$OUT/main-modules/m251.js" > "$OUT/main.app.js"   # module 251 is the app code
$PRETTIER < "$SRC/renderer.js" > "$OUT/renderer.js"
echo "ok: $OUT/main.app.js, $OUT/renderer.js, $OUT/main-modules/"
