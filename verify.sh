#!/bin/bash

# Local verification gate — mirrors what CI (.github/workflows/ci.yml) runs
# on every PR: lint, unit tests with coverage thresholds, and the same
# production builds that `docker compose build` runs inside each image.
#
# Run this before pushing to catch failures without waiting on CI. The
# Playwright E2E suite is not included here (CI runs it); run it separately
# with `npm run e2e` from e2e/ when your change touches user-visible behavior.

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Testing SRD extraction lib (node --test scripts/lib)"
cd "$ROOT_DIR" && node --test scripts/lib/*.test.mjs

echo "==> Building @grimoire-os/shared"
cd "$ROOT_DIR/shared" && npm run build

echo "==> Linting backend"
cd "$ROOT_DIR/backend" && npm run lint:check

echo "==> Backend unit tests + coverage thresholds"
cd "$ROOT_DIR/backend" && npm run test:cov

echo "==> Building backend (nest build)"
cd "$ROOT_DIR/backend" && npm run build

echo "==> Linting frontend"
cd "$ROOT_DIR/frontend" && npm run lint

echo "==> Frontend unit tests + coverage thresholds"
cd "$ROOT_DIR/frontend" && npm run test:cov

echo "==> Building frontend (next build)"
cd "$ROOT_DIR/frontend" && npm run build

echo
echo "All verification steps passed."
