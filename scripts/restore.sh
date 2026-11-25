#!/usr/bin/env bash
# Replaces the compose stack's Postgres database with a dump from backup.sh.
#   scripts/restore.sh <dump-file> [--yes]
# Without --yes it names the target database and asks the operator to type
# that name. With no terminal on stdin it needs --yes and otherwise refuses
# before touching anything.
#
# The dump goes into a scratch database, <db>_restore, first. Only when that
# restore succeeds does the script drop the live database and rename the
# scratch one into its place, so a truncated or corrupt dump leaves the live
# data as it was. The backend is stopped for the swap, and the final
# `docker compose up -d --wait` runs migrate and seed and starts it again.
#
# The script runs plain `docker compose` from the repo root, so the root .env
# and the standard COMPOSE_PROJECT_NAME and COMPOSE_FILE variables pick the
# stack.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# The final up waits for migrate, seed, the backend's 60 s start_period plus
# its retries, and the frontend's 30 s start_period plus its retries. The CI
# boot uses the same limit.
WAIT_TIMEOUT=300

usage() {
  echo "usage: scripts/restore.sh <dump-file> [--yes]" >&2
  exit 2
}

dump=""
yes=0
for arg in "$@"; do
  case "$arg" in
    --yes) yes=1 ;;
    -*) usage ;;
    *)
      [ -z "$dump" ] || usage
      dump="$arg"
      ;;
  esac
done
[ -n "$dump" ] || usage

if [ ! -f "$dump" ]; then
  echo "restore.sh: $dump is not a file." >&2
  exit 2
fi
if [ ! -s "$dump" ]; then
  echo "restore.sh: $dump is empty." >&2
  exit 2
fi

# Refuse before any docker call, so a cron job or pipe without --yes changes
# nothing.
if [ "$yes" -ne 1 ] && [ ! -t 0 ]; then
  echo "restore.sh: stdin is not a terminal, so there is no one to confirm. Pass --yes to restore without asking." >&2
  exit 1
fi

# Resolve a relative dump path against the caller's directory before moving
# to the repo root.
case "$dump" in
  /*) ;;
  *) dump="$PWD/$dump" ;;
esac

cd "$ROOT_DIR"

running=$(docker compose ps --status running --services)
if ! grep -qx postgres <<<"$running"; then
  echo "Starting postgres"
  docker compose up -d --wait postgres
fi

# Runs psql against the maintenance database, so the live and scratch
# databases can be dropped and renamed. Each statement is its own call,
# because DROP DATABASE and CREATE DATABASE refuse to run in a transaction.
# PGOPTIONS hides the notice DROP DATABASE IF EXISTS prints for a missing
# database.
psql_admin() {
  docker compose exec -T -e PGOPTIONS='-c client_min_messages=warning' postgres \
    psql -U "$user" -d postgres -v ON_ERROR_STOP=1 -q -c "$1" < /dev/null
}

names=$(docker compose exec -T postgres printenv POSTGRES_USER POSTGRES_DB < /dev/null)
user=$(sed -n 1p <<<"$names")
db=$(sed -n 2p <<<"$names")
# The names go into SQL as quoted identifiers, so allow only plain ones.
for name in "$user" "$db"; do
  if ! grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' <<<"$name"; then
    echo "restore.sh: unexpected POSTGRES_USER or POSTGRES_DB '$name' in the postgres container." >&2
    exit 1
  fi
done
scratch="${db}_restore"

if ! docker compose exec -T postgres pg_restore --list < "$dump" > /dev/null; then
  echo "restore.sh: pg_restore cannot read $dump. Nothing was changed." >&2
  exit 1
fi

if [ "$yes" -ne 1 ]; then
  echo "This replaces every row in the database '$db' with the contents of $dump."
  printf 'Type the database name to continue: '
  read -r answer || answer=""
  if [ "$answer" != "$db" ]; then
    echo "restore.sh: the name did not match. Nothing was changed." >&2
    exit 1
  fi
fi

echo "Stopping the backend"
docker compose stop backend

echo "Restoring into the scratch database $scratch"
# Puts the backend back after a failure that left the live database alone.
give_up() {
  echo "restore.sh: $1 The live database $db was not changed. Starting the stack again." >&2
  docker compose up -d --wait --wait-timeout "$WAIT_TIMEOUT" || true
  exit 1
}

if ! psql_admin "DROP DATABASE IF EXISTS \"$scratch\"" || ! psql_admin "CREATE DATABASE \"$scratch\""; then
  give_up "Creating the scratch database $scratch failed."
fi
if ! docker compose exec -T postgres \
  pg_restore -U "$user" --no-owner --exit-on-error -d "$scratch" < "$dump"; then
  psql_admin "DROP DATABASE IF EXISTS \"$scratch\"" || true
  give_up "The restore into $scratch failed."
fi

echo "Replacing $db with $scratch"
# FORCE closes any session still connected to the live database.
psql_admin "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)"
if ! psql_admin "ALTER DATABASE \"$scratch\" RENAME TO \"$db\""; then
  echo "restore.sh: $db was dropped but the rename failed. The restored data is in $scratch. Rename it by hand, then run docker compose up -d." >&2
  exit 1
fi

echo "Starting the stack"
docker compose up -d --wait --wait-timeout "$WAIT_TIMEOUT"
echo "Restored $dump into $db"
