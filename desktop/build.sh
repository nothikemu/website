#!/usr/bin/env bash
# Builds the portable Forgebase app (no installer, no admin rights).
#
#   desktop/build.sh [win|linux]      → dist/Forgebase-<target>.zip
#                                       (win also: Forgebase-win-slim.zip, which
#                                        downloads Node.js on first launch)
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
# Source maps and type declarations aren't used at runtime; dropping them keeps
# the slim download under 30 MB.
find "$OUT/app" \( -name "*.map" -o -name "*.d.ts" -o -name "*.d.cts" -o -name "*.d.mts" \) -delete
# Only the pg_trgm extension is loaded.
find "$OUT/app/node_modules/@electric-sql/pglite/dist" -maxdepth 1 -name "*.tar.gz" ! -name "pg_trgm.tar.gz" -delete

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
  NAME="node-v$NODE_VERSION-win-x64"
  URL="https://nodejs.org/dist/v$NODE_VERSION/$NAME.zip"
  ZIP="$CACHE/$NAME.zip"
  [ -f "$ZIP" ] || curl -fsSL -o "$ZIP" "$URL"
  # Pin the official checksum: the slim build's launcher downloads this same file.
  SHA="$(curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" | awk -v f="$NAME.zip" '$2 == f { print $1 }')"
  [ -n "$SHA" ] || { echo "Could not fetch the Node.js checksum" >&2; exit 1; }
  echo "$SHA  $ZIP" | sha256sum -c --quiet -
  unzip -p "$ZIP" "$NAME/node.exe" > "$OUT/runtime/node.exe"
  unzip -p "$ZIP" "$NAME/LICENSE" > "$OUT/runtime/LICENSE-node.txt"
  LD="-s -w -X main.nodeZipURL=$URL -X main.nodeZipSHA256=$SHA -X main.nodeZipEntry=$NAME/node.exe"
  (cd desktop/launcher-go && GOOS=windows GOARCH=amd64 go build -ldflags "$LD" -o "../../$OUT/Forgebase.exe" .)
else
  cp "$(command -v node)" "$OUT/runtime/node"
  (cd desktop/launcher-go && go build -ldflags "-s -w" -o "../../$OUT/Forgebase" .)
fi

cp desktop/README.txt "$OUT/README.txt"

echo "▸ Packaging"
rm -f "dist/Forgebase-$TARGET.zip" "dist/Forgebase-$TARGET-slim.zip"
(cd dist && zip -qr9 "Forgebase-$TARGET.zip" Forgebase)
du -sh "$OUT" "dist/Forgebase-$TARGET.zip"
if [ "$TARGET" = "win" ]; then
  # Without the runtime; Forgebase.exe downloads it on first launch.
  (cd dist && zip -qr9 "Forgebase-$TARGET-slim.zip" Forgebase -x "Forgebase/runtime/*")
  du -sh "dist/Forgebase-$TARGET-slim.zip"
fi
