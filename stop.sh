#!/bin/bash

# Stop every dev.sh process tree (backend + frontend + any orphans),
# then anything still bound to the dev ports. Leaves PostgreSQL running.
#
# We kill by process group rather than by port because orphaned dev.sh
# trees may not own a port (lost the bind race to an earlier instance).
#
# Usage:
#   ./stop.sh            stop the dev servers (fast; keeps the build cache)
#   ./stop.sh --clean    also delete frontend/.next (Turbopack build cache)
#
# --clean (alias --reset-cache) is opt-in: the persistent Turbopack dev
# cache can bloat over a long session (hundreds of MB, thousands of cache
# commits) and wedge next-server into a file-watcher CPU spin that keeps
# burning cores at idle. Clearing frontend/.next resets it. It's off by
# default because the cache is what makes warm restarts fast — clearing it
# forces a cold recompile of every route on the next ./dev.sh.

set -u

# Resolve paths relative to the repo root (this script's dir) so frontend/.next
# is found no matter where stop.sh is invoked from.
cd "$(dirname "$0")" || exit 1

CLEAN_CACHE=0
for arg in "$@"; do
  case "$arg" in
    --clean | --reset-cache) CLEAN_CACHE=1 ;;
    *) echo "Unknown option: $arg (supported: --clean)" >&2 ;;
  esac
done

# Collect unique process group IDs of every running dev.sh
# shellcheck disable=SC2009
DEV_PGIDS=$(ps -ax -o pgid=,command= | awk '/[d]ev\.sh/ { print $1 }' | sort -u)

if [ -n "$DEV_PGIDS" ]; then
  COUNT=$(echo "$DEV_PGIDS" | wc -l | tr -d ' ')
  echo "Found $COUNT dev.sh process group(s): $(echo "$DEV_PGIDS" | tr '\n' ' ')"

  for pgid in $DEV_PGIDS; do
    kill -TERM -- -"$pgid" 2>/dev/null || true
  done

  # Give the trees a moment to shut down gracefully
  sleep 2

  # Force-kill any survivors
  REMAINING=$(ps -ax -o pgid=,command= | awk '/[d]ev\.sh/ { print $1 }' | sort -u)
  if [ -n "$REMAINING" ]; then
    for pgid in $REMAINING; do
      kill -KILL -- -"$pgid" 2>/dev/null || true
    done
  fi
  echo "dev.sh process groups stopped."
else
  echo "No dev.sh processes found."
fi

# Belt-and-suspenders: anything still listening on the dev ports
echo "Checking port 3001 (backend)..."
if PIDS=$(lsof -ti :3001 2>/dev/null) && [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill 2>/dev/null || true
  echo "Backend port cleared."
else
  echo "Backend port already free."
fi

echo "Checking port 3000 (frontend)..."
if PIDS=$(lsof -ti :3000 2>/dev/null) && [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill 2>/dev/null || true
  echo "Frontend port cleared."
else
  echo "Frontend port already free."
fi

if [ "$CLEAN_CACHE" -eq 1 ]; then
  if [ -d frontend/.next ]; then
    echo "Clearing frontend/.next build cache ($(du -sh frontend/.next 2>/dev/null | cut -f1))..."
    rm -rf frontend/.next
    echo "Build cache cleared (next ./dev.sh will be a cold start)."
  else
    echo "No frontend/.next build cache to clear."
  fi
fi

echo "Done. (PostgreSQL container left running)"
