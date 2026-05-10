#!/bin/bash

# Production-build smoke gate.
#
# Runs the same `npm run build` that `docker compose build` runs inside each
# image, so type errors that only surface in production builds (and not in
# the more-lenient `next dev` / `nest start --watch`) are caught locally.
#
# Until VEG-120 (GitHub Actions CI) lands, run this before merging any PR
# that touches backend/ or frontend/ source.

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Building @grimoire-os/shared"
cd "$ROOT_DIR/shared" && npm run build

echo "==> Building backend (nest build)"
cd "$ROOT_DIR/backend" && npm run build

echo "==> Building frontend (next build)"
cd "$ROOT_DIR/frontend" && npm run build

echo
echo "All production builds passed."
