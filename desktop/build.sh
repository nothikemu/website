#!/usr/bin/env bash
# Builds the portable Forgebase app (no installer, no admin rights).
#
#   desktop/build.sh [win|linux]      → dist/Forgebase-<target>.zip
#
# Requires: Node 20+, npm deps installed, Go (for the launcher), curl, zip.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-win}"
NODE_VERSION="${NODE_VERSION:-22.22.0}"
OUT="dist/Forgebase"
rm -rf "$OUT" && mkdir -p "$OUT/app" "$OUT/runtime"

echo "▸ Building Next.js (standalone)"
FORGEBASE_DESKTOP=1 NEXT_TELEMETRY_DISABLED=1 npx next build > /dev/null

echo "▸ Assembling app/"
SA=.next/standalone
cp "$SA/server.js" "$SA/package.json" "$OUT/app/"
cp -r "$SA/.next" "$OUT/app/.next"
cp -r .next/static "$OUT/app/.next/static"
cp -r public "$OUT/app/public"
cp -r drizzle "$OUT/app/drizzle"
cp -r "$SA/node_modules" "$OUT/app/node_modules"
# Platform-specific image libraries are unused (images are unoptimized in this build).
rm -rf "$OUT/app/node_modules/@img" "$OUT/app/node_modules/sharp"
# The embedded database loads WASM/data files from its package directory — ship it whole.
rm -rf "$OUT/app/node_modules/@electric-sql/pglite"
mkdir -p "$OUT/app/node_modules/@electric-sql"
cp -r node_modules/@electric-sql/pglite "$OUT/app/node_modules/@electric-sql/pglite"
cp desktop/launcher.cjs "$OUT/app/launcher.cjs"

echo "▸ Bundling bootstrap (migrations + demo data)"
node -e '
require("esbuild").buildSync({
  entryPoints: ["desktop/bootstrap.ts"],
  outfile: process.argv[1],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  conditions: ["react-server"],
  external: ["@electric-sql/pglite", "@electric-sql/pglite/*"],
  alias: { "server-only": "./tests/stubs/server-only.ts" },
  tsconfig: "tsconfig.json",
  logLevel: "warning",
});' "$OUT/app/bootstrap.cjs"

echo "▸ Runtime ($TARGET, Node $NODE_VERSION)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/forgebase-desktop"
mkdir -p "$CACHE"
if [ "$TARGET" = "win" ]; then
  ZIP="$CACHE/node-v$NODE_VERSION-win-x64.zip"
  [ -f "$ZIP" ] || curl -fsSL -o "$ZIP" "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-win-x64.zip"
  unzip -p "$ZIP" "node-v$NODE_VERSION-win-x64/node.exe" > "$OUT/runtime/node.exe"
  unzip -p "$ZIP" "node-v$NODE_VERSION-win-x64/LICENSE" > "$OUT/runtime/LICENSE-node.txt"
  (cd desktop/launcher-go && GOOS=windows GOARCH=amd64 go build -ldflags "-s -w" -o "../../$OUT/Forgebase.exe" .)
else
  cp "$(command -v node)" "$OUT/runtime/node"
  (cd desktop/launcher-go && go build -ldflags "-s -w" -o "../../$OUT/Forgebase" .)
fi

cp desktop/README.txt "$OUT/README.txt"

echo "▸ Packaging"
rm -f "dist/Forgebase-$TARGET.zip"
(cd dist && zip -qr9 "Forgebase-$TARGET.zip" Forgebase)
du -sh "$OUT" "dist/Forgebase-$TARGET.zip"
