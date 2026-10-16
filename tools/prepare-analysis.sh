#!/usr/bin/env bash
# Gera analysis/ a partir de decompiled/: bundles formatados e main.js separado
# em módulos webpack. As referências de linha em docs/ apontam para esses arquivos.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=decompiled/dist/electron
OUT=analysis
PRETTIER="npx --yes prettier@3.8.1 --parser babel --print-width 120"

mkdir -p "$OUT/main-modules"
node tools/split-webpack.cjs "$SRC/main.js" "$OUT/main-modules"
$PRETTIER < "$OUT/main-modules/m251.js" > "$OUT/main.app.js"   # módulo 251 = código do app
$PRETTIER < "$SRC/renderer.js" > "$OUT/renderer.js"
echo "ok: $OUT/main.app.js, $OUT/renderer.js, $OUT/main-modules/"
