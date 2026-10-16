#!/usr/bin/env bash
# As referências arquivo:linha de docs/ apontam para os arquivos gerados aqui.
# Uso: tools/prepare-analysis.sh [pasta do app.asar extraído]   (padrão: decompiled)
set -euo pipefail
cd "$(dirname "$0")/.."
APP=${1:-decompiled}
SRC="$APP/dist/electron"
OUT=analysis
PRETTIER="npx --yes prettier@3.8.1 --parser babel --print-width 120"

if [[ ! -f "$SRC/main.js" ]]; then
  echo "não achei $SRC/main.js; extraia o app.asar do GameSir Connect 1.16.7 (ver docs/01-metodologia.md)" >&2
  exit 1
fi

mkdir -p "$OUT/main-modules"
node tools/split-webpack.cjs "$SRC/main.js" "$OUT/main-modules"
$PRETTIER < "$OUT/main-modules/m251.js" > "$OUT/main.app.js"   # módulo 251 = código do app
$PRETTIER < "$SRC/renderer.js" > "$OUT/renderer.js"
echo "ok: $OUT/main.app.js, $OUT/renderer.js, $OUT/main-modules/"
