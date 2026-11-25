#!/bin/bash
# Tests for scripts/backup.sh and scripts/restore.sh. Needs no Docker. A fake
# docker on PATH records every call to a log and answers with exit codes and
# output the test sets through FAKE_* variables. Run from anywhere:
#   bash scripts/backup-restore.test.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAILS=0
PASSES=0

pass() {
  PASSES=$((PASSES + 1))
  echo "ok: $1"
}

fail() {
  FAILS=$((FAILS + 1))
  echo "FAIL: $1"
  if [ -n "${2:-}" ]; then
    printf '%s\n' "$2" | sed 's/^/  /'
  fi
}

FAKE_BIN="$TMP/bin"
LOG="$TMP/docker.log"
mkdir -p "$FAKE_BIN"

# The fake docker. It logs its arguments on one line, then answers the calls
# the scripts make. Unknown calls exit 0 with no output.
cat > "$FAKE_BIN/docker" <<'FAKE'
#!/bin/bash
echo "$*" >> "$FAKE_DOCKER_LOG"
args="$*"
case "$args" in
  *"ps --status running --services"*)
    if [ "${FAKE_PG_RUNNING:-1}" = "1" ]; then
      echo backend
      echo postgres
    fi
    exit 0
    ;;
  *"printenv POSTGRES_USER POSTGRES_DB"*)
    echo grimoire
    echo grimoire_os
    exit 0
    ;;
  *pg_dump*)
    printf '%s' "${FAKE_DUMP_OUTPUT-PGDMP fake dump}"
    exit "${FAKE_DUMP_EXIT:-0}"
    ;;
  *"pg_restore --list"*)
    cat > /dev/null
    exit "${FAKE_LIST_EXIT:-0}"
    ;;
  *pg_restore*)
    cat > /dev/null
    exit "${FAKE_RESTORE_EXIT:-0}"
    ;;
esac
exit 0
FAKE
chmod +x "$FAKE_BIN/docker"

# Keep every call away from a real daemon. The test runs on machines that host
# a real dev database in the default compose project, so if the fake ever
# lost the PATH lookup, these point compose at a project and file that do not
# exist instead of at that database.
export PATH="$FAKE_BIN:$PATH"
export COMPOSE_PROJECT_NAME=backup-restore-fake
export COMPOSE_FILE="$TMP/no-such-compose.yml"
export FAKE_DOCKER_LOG="$LOG"
if [ "$(command -v docker)" != "$FAKE_BIN/docker" ]; then
  echo "FAIL: docker resolves to $(command -v docker), not the fake. Stopping before any script runs."
  exit 1
fi

BACKUP="$ROOT_DIR/scripts/backup.sh"
RESTORE="$ROOT_DIR/scripts/restore.sh"

# Clears the call log and the FAKE_* answers, so each case starts clean.
reset_fake() {
  : > "$LOG"
  unset FAKE_PG_RUNNING FAKE_DUMP_OUTPUT FAKE_DUMP_EXIT FAKE_LIST_EXIT FAKE_RESTORE_EXIT
}

# Runs a script with stdin from /dev/null, so no case has a terminal. Sets
# rc and out.
run() {
  out=$(bash "$@" < /dev/null 2>&1) && rc=0 || rc=$?
}

# Prints the 1-based line of the first or last call log entry matching a
# fixed string, or nothing. grep finding nothing is not an error here.
call_line() {
  { grep -nF -- "$1" "$LOG" || true; } | head -n 1 | cut -d: -f1
}

last_call_line() {
  { grep -nF -- "$1" "$LOG" || true; } | tail -n 1 | cut -d: -f1
}

# Prints the entries of a directory, hidden ones included, one per line.
dir_entries() {
  ls -A "$1"
}

LIVE_DROP='DROP DATABASE IF EXISTS "grimoire_os" WITH (FORCE)'
RENAME='ALTER DATABASE "grimoire_os_restore" RENAME TO "grimoire_os"'

# Backup

# 1. A failing pg_dump leaves nothing behind, temp file included.
reset_fake
out_dir="$TMP/backup-fail"
export FAKE_DUMP_EXIT=1
run "$BACKUP" "$out_dir"
left=$(dir_entries "$out_dir" 2>/dev/null || true)
if [ "$rc" -ne 0 ] && [ -z "$left" ] && grep -qF 'backup.sh: pg_dump failed' <<<"$out"; then
  pass "backup: a failing pg_dump exits non-zero and leaves no file"
else
  fail "backup: a failing pg_dump exits non-zero and leaves no file" "exit $rc, left: ${left:-nothing}, output: $out"
fi

# 2. A pg_dump that exits 0 with no output is a failure too.
reset_fake
out_dir="$TMP/backup-empty"
export FAKE_DUMP_OUTPUT=''
run "$BACKUP" "$out_dir"
left=$(dir_entries "$out_dir" 2>/dev/null || true)
if [ "$rc" -ne 0 ] && [ -z "$left" ] && grep -qF 'backup.sh: pg_dump wrote nothing' <<<"$out"; then
  pass "backup: an empty pg_dump output exits non-zero and leaves no file"
else
  fail "backup: an empty pg_dump output exits non-zero and leaves no file" "exit $rc, left: ${left:-nothing}, output: $out"
fi

# 3. Success writes exactly one non-empty file with the timestamped name and
# prints its path.
reset_fake
out_dir="$TMP/backup-ok"
run "$BACKUP" "$out_dir"
left=$(dir_entries "$out_dir" 2>/dev/null || true)
if [ "$rc" -eq 0 ] && [ "$(grep -c . <<<"$left")" = "1" ] &&
  grep -Eq '^grimoire-os-[0-9]{8}-[0-9]{6}\.dump$' <<<"$left" &&
  [ -s "$out_dir/$left" ] && grep -qF "$out_dir/$left" <<<"$out"; then
  pass "backup: success writes one non-empty timestamped dump and prints its path"
else
  fail "backup: success writes one non-empty timestamped dump and prints its path" "exit $rc, files: ${left:-none}, output: $out"
fi

# 4. The dump runs inside the container with the container's own user and
# database, so no credential reaches a command line. The variables stay
# unexpanded on purpose, because the container's shell expands them.
# shellcheck disable=SC2016
if grep -qF 'compose exec -T postgres sh -c pg_dump --format=custom -U "$POSTGRES_USER" -d "$POSTGRES_DB"' "$LOG"; then
  pass "backup: pg_dump runs in the postgres container with its own variables"
else
  fail "backup: pg_dump runs in the postgres container with its own variables" "$(cat "$LOG")"
fi

# 5. A stopped postgres container gives a non-zero exit and no dump attempt.
reset_fake
out_dir="$TMP/backup-down"
export FAKE_PG_RUNNING=0
run "$BACKUP" "$out_dir"
left=$(dir_entries "$out_dir" 2>/dev/null || true)
if [ "$rc" -ne 0 ] && [ -z "$left" ] && ! grep -q pg_dump "$LOG" &&
  grep -qF 'backup.sh: the postgres container is not running' <<<"$out"; then
  pass "backup: postgres not running exits non-zero and writes nothing"
else
  fail "backup: postgres not running exits non-zero and writes nothing" "exit $rc, left: ${left:-nothing}, calls: $(cat "$LOG")"
fi

# 6. With no argument the script still checks the container first. A stopped
# container keeps this case from writing into the repo's backups/.
reset_fake
export FAKE_PG_RUNNING=0
run "$BACKUP"
if [ "$rc" -ne 0 ] && ! grep -q pg_dump "$LOG" &&
  grep -qF 'backup.sh: the postgres container is not running' <<<"$out"; then
  pass "backup: with no argument a stopped postgres still stops the run"
else
  fail "backup: with no argument a stopped postgres still stops the run" "exit $rc, output: $out"
fi

# Restore

DUMP="$TMP/good.dump"
printf 'PGDMP fake dump' > "$DUMP"
EMPTY="$TMP/empty.dump"
: > "$EMPTY"

# 7. Argument errors exit non-zero with the script's own message before any
# docker call.
check_usage() {
  local name="$1" message="$2"
  shift 2
  reset_fake
  run "$RESTORE" "$@"
  if [ "$rc" -ne 0 ] && [ ! -s "$LOG" ] && grep -qF -- "$message" <<<"$out"; then
    pass "restore: $name exits non-zero with no docker call"
  else
    fail "restore: $name exits non-zero with no docker call" "exit $rc, calls: $(cat "$LOG"), output: $out"
  fi
}
check_usage "no argument" "usage: scripts/restore.sh"
check_usage "an unknown flag" "usage: scripts/restore.sh" "$DUMP" --force
check_usage "a missing file" "is not a file" "$TMP/no-such.dump" --yes
check_usage "an empty file" "is empty" "$EMPTY" --yes
check_usage "two dump files" "usage: scripts/restore.sh" "$DUMP" "$DUMP" --yes

# 8. No terminal and no --yes refuses before any docker call.
reset_fake
run "$RESTORE" "$DUMP"
if [ "$rc" -ne 0 ] && [ ! -s "$LOG" ] && grep -qF 'restore.sh: stdin is not a terminal' <<<"$out"; then
  pass "restore: no terminal and no --yes refuses with no docker call"
else
  fail "restore: no terminal and no --yes refuses with no docker call" "exit $rc, calls: $(cat "$LOG"), output: $out"
fi

# 9. A failing scratch restore never drops or renames the live database, drops
# the scratch database, starts the stack again and says the live data is
# unchanged.
reset_fake
export FAKE_RESTORE_EXIT=1
run "$RESTORE" "$DUMP" --yes
calls=$(cat "$LOG")
if [ "$rc" -ne 0 ] &&
  ! grep -qF "$LIVE_DROP" <<<"$calls" &&
  ! grep -qF 'RENAME TO' <<<"$calls" &&
  grep -qF -- '-d grimoire_os_restore' <<<"$calls"; then
  pass "restore: a failing scratch restore never drops or renames the live database"
else
  fail "restore: a failing scratch restore never drops or renames the live database" "exit $rc, calls: $calls"
fi

scratch_restore=$(call_line '-d grimoire_os_restore')
scratch_cleanup=$(last_call_line 'DROP DATABASE IF EXISTS "grimoire_os_restore"')
up_after=$(last_call_line 'compose up -d --wait')
if [ -n "$scratch_restore" ] && [ -n "$scratch_cleanup" ] && [ -n "$up_after" ] &&
  [ "$scratch_cleanup" -gt "$scratch_restore" ] && [ "$up_after" -gt "$scratch_restore" ] &&
  grep -qi 'not changed' <<<"$out"; then
  pass "restore: a failing scratch restore drops the scratch database and starts the stack again"
else
  fail "restore: a failing scratch restore drops the scratch database and starts the stack again" "exit $rc, calls: $calls, output: $out"
fi

# 10. A dump that pg_restore --list cannot read stops before the backend
# stops.
reset_fake
export FAKE_LIST_EXIT=1
run "$RESTORE" "$DUMP" --yes
calls=$(cat "$LOG")
if [ "$rc" -ne 0 ] && ! grep -qF 'stop backend' <<<"$calls" && ! grep -qF 'DROP DATABASE' <<<"$calls" &&
  grep -qF 'restore.sh: pg_restore cannot read' <<<"$out"; then
  pass "restore: an unreadable dump stops before the backend stops"
else
  fail "restore: an unreadable dump stops before the backend stops" "exit $rc, calls: $calls"
fi

# 11. Success: stop the backend, restore into the scratch database, then
# drop the live one, rename, and bring the stack up, in that order.
reset_fake
run "$RESTORE" "$DUMP" --yes
calls=$(cat "$LOG")
stop=$(call_line 'compose stop backend')
create=$(call_line 'CREATE DATABASE "grimoire_os_restore"')
scratch_restore=$(call_line '-d grimoire_os_restore')
drop=$(call_line "$LIVE_DROP")
rename=$(call_line "$RENAME")
last=$(wc -l < "$LOG" | tr -d ' ')
final=$(tail -n 1 "$LOG")
if [ "$rc" -eq 0 ] && [ -n "$stop" ] && [ -n "$create" ] && [ -n "$scratch_restore" ] &&
  [ -n "$drop" ] && [ -n "$rename" ] &&
  [ "$stop" -lt "$create" ] && [ "$create" -lt "$scratch_restore" ] &&
  [ "$scratch_restore" -lt "$drop" ] && [ "$drop" -lt "$rename" ] && [ "$rename" -lt "$last" ] &&
  grep -q '^compose up -d --wait' <<<"$final"; then
  pass "restore: success drops and renames only after the scratch restore, then runs up -d --wait"
else
  fail "restore: success drops and renames only after the scratch restore, then runs up -d --wait" "exit $rc, calls: $calls, output: $out"
fi

# 12. The scratch restore drops no ownership it cannot recreate and stops at
# the first error, and the dump is checked before anything changes.
if grep -qF 'pg_restore -U grimoire --no-owner --exit-on-error -d grimoire_os_restore' <<<"$calls" &&
  [ -n "$(call_line 'pg_restore --list')" ] && [ "$(call_line 'pg_restore --list')" -lt "$stop" ]; then
  pass "restore: the dump is listed first and restored with --no-owner --exit-on-error"
else
  fail "restore: the dump is listed first and restored with --no-owner --exit-on-error" "calls: $calls"
fi

# 13. A stopped postgres is started before anything reads from it.
reset_fake
export FAKE_PG_RUNNING=0
run "$RESTORE" "$DUMP" --yes
start_pg=$(call_line 'compose up -d --wait postgres')
first_exec=$(call_line 'compose exec')
if [ "$rc" -eq 0 ] && [ -n "$start_pg" ] && [ -n "$first_exec" ] && [ "$start_pg" -lt "$first_exec" ]; then
  pass "restore: a stopped postgres is started before the first exec"
else
  fail "restore: a stopped postgres is started before the first exec" "exit $rc, calls: $(cat "$LOG")"
fi

echo "backup-restore.test.sh: $PASSES passed, $FAILS failed"
[ "$FAILS" -eq 0 ]
