#!/bin/bash

# Start a GrimoireOS stack against a dedicated e2e database so end-to-end
# tests never touch the dev database (grimoire_os).
#
#   ./dev-e2e.sh           start the stack, keep its database on exit
#   ./dev-e2e.sh --drop    start the stack, drop its database on exit
#
# Each checkout runs its own stack, so several can run side by side.
# e2e/stack-env.sh picks the stack's database and ports:
#
#   main checkout or CI    backend 3010, frontend 3011, grimoire_os_e2e
#   linked git worktree    a port pair in 3100-3499, grimoire_os_e2e_<worktree>
#
# E2E_STACK names a stack by hand, and E2E_DB_NAME, E2E_BACKEND_PORT and
# E2E_FRONTEND_PORT override single values. See e2e/README.md.
#
# The script:
#   1. Stops leftovers of an earlier run of this same stack, and only those
#   2. Refuses to start if another process already holds one of its ports
#   3. Creates the stack's database if missing, then migrates and seeds it
#   4. Starts backend and frontend on the stack's ports
#
# Designed to coexist with a running dev.sh (ports 3000/3001, grimoire_os).

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

DROP_ON_EXIT=0
for arg in "$@"; do
  case "$arg" in
    --drop) DROP_ON_EXIT=1 ;;
    *)
      echo "Usage: $0 [--drop]" >&2
      exit 2
      ;;
  esac
done

# shellcheck source=e2e/stack-env.sh
source "$ROOT_DIR/e2e/stack-env.sh"
e2e_stack_env "$ROOT_DIR"

# global-setup.ts wipes every user in this database before each run, so it
# must be an e2e database and a plain identifier (it is interpolated into SQL).
if ! printf '%s' "$E2E_DB_NAME" | grep -Eq '^grimoire_os_e2e(_[a-z0-9_]+)?$'; then
  echo "ERROR: E2E_DB_NAME '${E2E_DB_NAME}' must be grimoire_os_e2e or grimoire_os_e2e_<stack>, using lowercase letters, digits and underscores." >&2
  exit 2
fi

COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.yml")

# Backend and frontend each run as a job in their own process group, so the
# whole tree under each (npm, nest --watch, next dev) can be stopped by group
# id. The pidfile records those group ids for this stack only; a later run of
# the same stack reads it to stop leftovers whose parent died without cleanup.
set -m
PID_DIR="$ROOT_DIR/.e2e"
PID_FILE="$PID_DIR/${E2E_STACK}.pid"
JOB_PGIDS=""
# Set once preflight passes, so a run that bails early never drops a database.
STARTED=0

# Returns success when process group $1 still has a member whose command line
# runs a file inside this checkout, which guards against a recycled group id.
group_is_ours() {
  ps -ax -o pgid=,command= | awk -v g="$1" '$1 == g' | grep -qF "$ROOT_DIR/"
}

stop_groups() {
  local pgid live=""
  for pgid in "$@"; do
    if group_is_ours "$pgid"; then
      kill -TERM -- -"$pgid" 2>/dev/null || true
      live="$live $pgid"
    fi
  done
  [ -z "$live" ] && return 0
  local tries=0
  while [ "$tries" -lt 10 ]; do
    local still=""
    for pgid in $live; do
      if kill -0 -- -"$pgid" 2>/dev/null; then still="$still $pgid"; fi
    done
    [ -z "$still" ] && return 0
    live="$still"
    sleep 0.5
    tries=$((tries + 1))
  done
  for pgid in $live; do
    kill -KILL -- -"$pgid" 2>/dev/null || true
  done
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [ -n "$JOB_PGIDS" ]; then
    echo "Stopping e2e stack '${E2E_STACK}'..."
    # shellcheck disable=SC2086
    stop_groups $JOB_PGIDS
  fi
  rm -f "$PID_FILE"
  if [ "$DROP_ON_EXIT" = "1" ] && [ "$STARTED" = "1" ]; then
    echo "Dropping database '${E2E_DB_NAME}'..."
    "${COMPOSE[@]}" exec -T postgres dropdb -U grimoire --if-exists --force "$E2E_DB_NAME" || true
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Starts "$@" as a background job and records its process group.
start_job() {
  "$@" &
  local pgid=$!
  JOB_PGIDS="$JOB_PGIDS $pgid"
  echo "$JOB_PGIDS" > "$PID_FILE"
}

if [ -f "$PID_FILE" ]; then
  STALE_PGIDS=$(cat "$PID_FILE")
  echo "Stopping leftovers of an earlier '${E2E_STACK}' run:${STALE_PGIDS}"
  # shellcheck disable=SC2086
  stop_groups $STALE_PGIDS
  rm -f "$PID_FILE"
fi

for port in "$E2E_BACKEND_PORT" "$E2E_FRONTEND_PORT"; do
  if nc -z localhost "$port" >/dev/null 2>&1; then
    echo "ERROR: port ${port} is already in use, and not by an earlier run of stack '${E2E_STACK}'." >&2
    echo "Pick another stack with E2E_STACK=<name>, or free the port (lsof -ti:${port})." >&2
    exit 1
  fi
done

mkdir -p "$PID_DIR"
STARTED=1
echo "E2E stack '${E2E_STACK}': backend ${E2E_BACKEND_PORT}, frontend ${E2E_FRONTEND_PORT}, database ${E2E_DB_NAME}"

# Load .env from project root, then override anything E2E-specific.
set -a
source "$ROOT_DIR/.env"
set +a

export DATABASE_URL="postgresql://grimoire:grimoire@localhost:5432/${E2E_DB_NAME}"
export FRONTEND_URL="http://localhost:${E2E_FRONTEND_PORT}"
export NEXT_PUBLIC_API_URL="http://localhost:${E2E_BACKEND_PORT}/api"

# Lift the API throttle for E2E. The prod anon (30/min) and authed (120/min)
# global defaults and the tighter auth-endpoint defaults (3 register / 5 login
# per minute) all trip when multiple Playwright workers register users / log
# in in parallel.
export THROTTLE_ANON_LIMIT="${THROTTLE_ANON_LIMIT:-10000}"
export THROTTLE_AUTHED_LIMIT="${THROTTLE_AUTHED_LIMIT:-10000}"
export THROTTLE_AUTH_LIMIT="${THROTTLE_AUTH_LIMIT:-10000}"

# Other stacks share the postgres container, so leave a running one alone.
if [ -z "$("${COMPOSE[@]}" ps --status running -q postgres 2>/dev/null)" ]; then
  echo "Starting PostgreSQL..."
  "${COMPOSE[@]}" up -d postgres
fi

echo "Waiting for PostgreSQL to be healthy..."
until "${COMPOSE[@]}" exec postgres pg_isready -U grimoire -d grimoire_os > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready."

# Provision the E2E database if it doesn't exist yet. The postgres role owns
# all databases in the dev container, so createdb is sufficient.
echo "Ensuring database '${E2E_DB_NAME}' exists..."
DB_EXISTS=$("${COMPOSE[@]}" exec -T postgres \
  psql -U grimoire -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${E2E_DB_NAME}'")
if [ "$DB_EXISTS" != "1" ]; then
  echo "Creating database '${E2E_DB_NAME}'..."
  "${COMPOSE[@]}" exec -T postgres createdb -U grimoire "${E2E_DB_NAME}"
fi

echo "Running Prisma migrations against ${E2E_DB_NAME}..."
cd "$ROOT_DIR/backend" && npx prisma migrate deploy

echo "Seeding SRD data into ${E2E_DB_NAME} (idempotent)..."
cd "$ROOT_DIR/backend" && npm run seed

echo "Starting backend (port ${E2E_BACKEND_PORT})..."
cd "$ROOT_DIR/backend"
start_job env PORT="$E2E_BACKEND_PORT" npm run start:dev

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
cd "$ROOT_DIR/frontend"
start_job env PORT="$E2E_FRONTEND_PORT" npm run dev

wait
