#!/usr/bin/env bash
# Package the unpacked extension in src/ into artifacts/mortality-v<version>.zip.
# No build step and no dependencies — just zips the shippable files.
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(grep -m1 '"version"' src/manifest.json \
  | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')

mkdir -p artifacts
out="artifacts/mortality-v${version}.zip"
rm -f "$out"

(cd src && zip -rqX "../$out" . -x '.DS_Store' '*/.DS_Store')

echo "Created $out"
