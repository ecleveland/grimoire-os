#!/bin/bash

# Start PostgreSQL in Docker, then run backend and frontend with hot reload
set -e
trap 'kill 0' EXIT

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Reap any existing dev.sh process trees from prior runs (orphans whose
# parent shell died without delivering a signal). Skip our own group.
OUR_PGID=$(ps -o pgid= -p $$ | tr -d ' ')
EXISTING_PGIDS=$(ps -ax -o pgid=,command= | awk '/[d]ev\.sh/ { print $1 }' | sort -u | grep -v "^${OUR_PGID}$" || true)
if [ -n "$EXISTING_PGIDS" ]; then
  COUNT=$(echo "$EXISTING_PGIDS" | wc -l | tr -d ' ')
  echo "Found $COUNT stale dev.sh tree(s); cleaning up: $(echo "$EXISTING_PGIDS" | tr '\n' ' ')"
  for pgid in $EXISTING_PGIDS; do
    kill -TERM -- -"$pgid" 2>/dev/null || true
  done
  sleep 2
  REMAINING=$(ps -ax -o pgid=,command= | awk '/[d]ev\.sh/ { print $1 }' | sort -u | grep -v "^${OUR_PGID}$" || true)
  for pgid in $REMAINING; do
    kill -KILL -- -"$pgid" 2>/dev/null || true
  done
fi

# Load .env from project root
set -a
source "$ROOT_DIR/.env"
set +a

echo "Starting PostgreSQL..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres

echo "Waiting for PostgreSQL to be healthy..."
until docker compose -f "$ROOT_DIR/docker-compose.yml" exec postgres pg_isready -U grimoire -d grimoire_os > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready."

# Build the shared workspace package before the backend starts. Its compiled
# output (shared/dist) is gitignored, so a branch switch or pull that changes
# shared/src leaves a stale build — the backend then fails to compile against
# @grimoire-os/shared (e.g. a missing newly-added type). Rebuilding here keeps
# dist in sync with src on every dev start.
echo "Building shared package..."
cd "$ROOT_DIR/shared" && npm run build

echo "Running Prisma migrations..."
cd "$ROOT_DIR/backend" && npx prisma migrate dev --skip-generate

echo "Seeding SRD data (idempotent)..."
cd "$ROOT_DIR/backend" && npm run seed

echo "Starting backend (port 3001)..."
cd "$ROOT_DIR/backend" && npm run start:dev &

echo "Starting frontend (port 3000)..."
cd "$ROOT_DIR/frontend" && npm run dev &

wait
