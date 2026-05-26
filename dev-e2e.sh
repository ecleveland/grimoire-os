#!/bin/bash

# Start the GrimoireOS stack against a dedicated E2E database so end-to-end
# tests do not pollute the dev database (grimoire_os).
#
#   Ports:  backend 3010, frontend 3011  (dev uses 3000/3001)
#   DB:     grimoire_os_e2e               (dev uses grimoire_os)
#
# This script mirrors dev.sh but:
#   1. Provisions grimoire_os_e2e (createdb) if it doesn't exist
#   2. Runs migrations + seed against the E2E database
#   3. Starts backend/frontend on the E2E ports with DATABASE_URL overridden
#
# Designed to coexist with a running dev.sh — different ports, different DB.

set -e
trap 'kill 0' EXIT

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

E2E_DB_NAME="grimoire_os_e2e"
E2E_BACKEND_PORT="${E2E_BACKEND_PORT:-3010}"
E2E_FRONTEND_PORT="${E2E_FRONTEND_PORT:-3011}"

# Reap any existing dev-e2e.sh process trees from prior runs (orphans whose
# parent shell died without delivering a signal). Skip our own group.
OUR_PGID=$(ps -o pgid= -p $$ | tr -d ' ')
EXISTING_PGIDS=$(ps -ax -o pgid=,command= | awk '/[d]ev-e2e\.sh/ { print $1 }' | sort -u | grep -v "^${OUR_PGID}$" || true)
if [ -n "$EXISTING_PGIDS" ]; then
  COUNT=$(echo "$EXISTING_PGIDS" | wc -l | tr -d ' ')
  echo "Found $COUNT stale dev-e2e.sh tree(s); cleaning up: $(echo "$EXISTING_PGIDS" | tr '\n' ' ')"
  for pgid in $EXISTING_PGIDS; do
    kill -TERM -- -"$pgid" 2>/dev/null || true
  done
  sleep 2
  REMAINING=$(ps -ax -o pgid=,command= | awk '/[d]ev-e2e\.sh/ { print $1 }' | sort -u | grep -v "^${OUR_PGID}$" || true)
  for pgid in $REMAINING; do
    kill -KILL -- -"$pgid" 2>/dev/null || true
  done
fi

# Load .env from project root, then override anything E2E-specific.
set -a
source "$ROOT_DIR/.env"
set +a

export DATABASE_URL="postgresql://grimoire:grimoire@localhost:5432/${E2E_DB_NAME}"
export FRONTEND_URL="http://localhost:${E2E_FRONTEND_PORT}"
export NEXT_PUBLIC_API_URL="http://localhost:${E2E_BACKEND_PORT}/api"

# Lift the API throttle for E2E. The prod global default (60 req/min) and the
# tighter auth-endpoint defaults (3 register / 5 login per minute) both trip
# when multiple Playwright workers register users / log in in parallel.
export THROTTLE_LIMIT="${THROTTLE_LIMIT:-10000}"
export THROTTLE_AUTH_LIMIT="${THROTTLE_AUTH_LIMIT:-10000}"

echo "Starting PostgreSQL..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres

echo "Waiting for PostgreSQL to be healthy..."
until docker compose -f "$ROOT_DIR/docker-compose.yml" exec postgres pg_isready -U grimoire -d grimoire_os > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready."

# Provision the E2E database if it doesn't exist yet. The postgres role owns
# all databases in the dev container, so createdb is sufficient.
echo "Ensuring database '${E2E_DB_NAME}' exists..."
DB_EXISTS=$(docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  psql -U grimoire -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${E2E_DB_NAME}'")
if [ "$DB_EXISTS" != "1" ]; then
  echo "Creating database '${E2E_DB_NAME}'..."
  docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
    createdb -U grimoire "${E2E_DB_NAME}"
fi

echo "Running Prisma migrations against ${E2E_DB_NAME}..."
cd "$ROOT_DIR/backend" && npx prisma migrate deploy

echo "Seeding SRD data into ${E2E_DB_NAME} (idempotent)..."
cd "$ROOT_DIR/backend" && npm run seed

echo "Starting backend (port ${E2E_BACKEND_PORT})..."
cd "$ROOT_DIR/backend" && PORT="$E2E_BACKEND_PORT" npm run start:dev &

# Block until the backend has bound its port. Playwright probes the frontend
# URL to decide the stack is ready, but the frontend boots faster than Nest;
# starting the frontend before the backend is up creates an apparent
# "stack is ready" window during which API calls ECONNREFUSED.
echo "Waiting for backend to bind port ${E2E_BACKEND_PORT}..."
TIMEOUT=120
ELAPSED=0
until nc -z localhost "$E2E_BACKEND_PORT" >/dev/null 2>&1; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "ERROR: backend did not bind port ${E2E_BACKEND_PORT} within ${TIMEOUT}s." >&2
    exit 1
  fi
done
echo "Backend is listening."

echo "Starting frontend (port ${E2E_FRONTEND_PORT})..."
cd "$ROOT_DIR/frontend" && PORT="$E2E_FRONTEND_PORT" npm run dev &

wait
