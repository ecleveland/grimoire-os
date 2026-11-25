#!/usr/bin/env bash
# Dumps the compose stack's Postgres database to a timestamped file.
#   scripts/backup.sh [output-dir]
# The output directory defaults to backups/ in the repo root. pg_dump runs
# inside the postgres container with the container's own POSTGRES_USER and
# POSTGRES_DB, so no credential appears on a command line. The dump is written
# to a hidden temp file and renamed to grimoire-os-YYYYMMDD-HHMMSS.dump only
# when pg_dump exits 0 and the file is not empty, so a failed run leaves no
# file that looks like a backup.
#
# The script runs plain `docker compose` from the repo root, so the root .env
# and the standard COMPOSE_PROJECT_NAME and COMPOSE_FILE variables pick the
# stack.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$#" -gt 1 ]; then
  echo "usage: scripts/backup.sh [output-dir]" >&2
  exit 2
fi

# Resolve a relative output directory against the caller's directory before
# moving to the repo root.
out_dir="${1:-$ROOT_DIR/backups}"
case "$out_dir" in
  /*) ;;
  *) out_dir="$PWD/$out_dir" ;;
esac

cd "$ROOT_DIR"

running=$(docker compose ps --status running --services)
if ! grep -qx postgres <<<"$running"; then
  echo "backup.sh: the postgres container is not running. Start it with: docker compose up -d postgres" >&2
  exit 1
fi

mkdir -p "$out_dir"

# The dump holds password hashes, so only the owner can read it.
umask 077
tmp=$(mktemp "$out_dir/.grimoire-os-dump.XXXXXX")
trap 'rm -f "$tmp"' EXIT

if ! docker compose exec -T postgres \
  sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$tmp"; then
  echo "backup.sh: pg_dump failed. No backup was written." >&2
  exit 1
fi

if [ ! -s "$tmp" ]; then
  echo "backup.sh: pg_dump wrote nothing. No backup was written." >&2
  exit 1
fi

final="$out_dir/grimoire-os-$(date +%Y%m%d-%H%M%S).dump"
mv "$tmp" "$final"
trap - EXIT

size=$(wc -c < "$final" | tr -d ' ')
echo "Wrote $final ($size bytes)"
