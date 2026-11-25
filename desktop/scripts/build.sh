#!/bin/sh
# Construye Comechismes.app y un .zip para enviar. Uso: npm run dist   (dentro de desktop/)
set -e
cd "$(dirname "$0")/.."
ROOT=$(cd .. && pwd)

[ -x engines/bin/whisper-server ] || python3 scripts/bundle-engines.py

echo "→ Compilando la web…"
(cd "$ROOT" && rm -rf .next && BUILD_STANDALONE=1 NEXT_PUBLIC_DESKTOP=1 node_modules/.bin/next build)

echo "→ Empaquetando la app…"
rm -rf dist
node_modules/.bin/electron-builder --mac dir --arm64

APP=dist/mac-arm64/Comechismes.app
RES="$APP/Contents/Resources"
cp -R engines "$RES/engines"
cp -R "$ROOT/.next/standalone" "$RES/web"
cp -R "$ROOT/.next/static" "$RES/web/.next/static"
[ -d "$ROOT/public" ] && cp -R "$ROOT/public" "$RES/web/public"

echo "→ Firmando (firma local, sin cuenta de Apple)…"
codesign --force --deep --sign - "$APP"
codesign --verify --deep "$APP"

ditto -c -k --keepParent "$APP" dist/Comechismes-mac-arm64.zip
ls -lh dist/Comechismes-mac-arm64.zip
