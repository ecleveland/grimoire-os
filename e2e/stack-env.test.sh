#!/bin/bash
# Tests for stack-env.sh, the e2e stack naming used by dev-e2e.sh and
# playwright.config.ts. Plain bash, no framework. Run from anywhere:
#   bash e2e/stack-env.test.sh

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
STACK_ENV="$HERE/stack-env.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAILS=0
PASSES=0

# Runs stack-env.sh for a root dir in a clean environment, with extra
# VAR=value pairs, and prints its KEY=VALUE output.
derive() {
  local root="$1"
  shift
  env -i PATH="$PATH" HOME="$HOME" "$@" bash "$STACK_ENV" "$root"
}

# Prints the value of one key from derive output.
value_of() {
  printf '%s\n' "$1" | sed -n "s/^$2=//p"
}

expect() {
  local name="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    PASSES=$((PASSES + 1))
  else
    FAILS=$((FAILS + 1))
    echo "FAIL: $name"
    echo "  expected: '$expected'"
    echo "  actual:   '$actual'"
  fi
}

# A main checkout and a linked worktree to derive from.
git init -q "$TMP/main"
git -C "$TMP/main" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$TMP/main" worktree add -q "$TMP/Feat-X.1" -b feat
mkdir -p "$TMP/not-a-repo"

# Main checkout keeps the stock defaults, which CI relies on.
out=$(derive "$TMP/main")
expect "main: stack" "$(value_of "$out" E2E_STACK)" "default"
expect "main: db" "$(value_of "$out" E2E_DB_NAME)" "grimoire_os_e2e"
expect "main: backend port" "$(value_of "$out" E2E_BACKEND_PORT)" "3010"
expect "main: frontend port" "$(value_of "$out" E2E_FRONTEND_PORT)" "3011"
# The compose project follows the main checkout's directory, as compose names
# it when dev.sh runs there.
expect "main: compose project" "$(value_of "$out" COMPOSE_PROJECT_NAME)" "main"

# Outside git (a tarball or docker copy) also falls back to the defaults.
out=$(derive "$TMP/not-a-repo")
expect "no git: stack" "$(value_of "$out" E2E_STACK)" "default"
expect "no git: db" "$(value_of "$out" E2E_DB_NAME)" "grimoire_os_e2e"
expect "no git: compose project is the directory" "$(value_of "$out" COMPOSE_PROJECT_NAME)" "not-a-repo"

# Compose lowercases the directory name and drops characters it rejects.
git init -q "$TMP/My.Grimoire_OS"
out=$(derive "$TMP/My.Grimoire_OS")
expect "odd main name: compose project" "$(value_of "$out" COMPOSE_PROJECT_NAME)" "mygrimoire_os"

# A checkout whose .git lives elsewhere still names the project after the
# checkout, as compose does.
git init -q --separate-git-dir "$TMP/elsewhere.git" "$TMP/sepdir"
out=$(derive "$TMP/sepdir")
expect "separate git dir: compose project" "$(value_of "$out" COMPOSE_PROJECT_NAME)" "sepdir"
expect "separate git dir: stack" "$(value_of "$out" E2E_STACK)" "default"

# A linked worktree derives a private stack from its directory name.
out=$(derive "$TMP/Feat-X.1")
expect "worktree: stack" "$(value_of "$out" E2E_STACK)" "feat_x_1"
expect "worktree: db" "$(value_of "$out" E2E_DB_NAME)" "grimoire_os_e2e_feat_x_1"
be=$(value_of "$out" E2E_BACKEND_PORT)
fe=$(value_of "$out" E2E_FRONTEND_PORT)
in_range=no
if [ "$be" -ge 3100 ] && [ "$be" -le 3498 ] && [ $((be % 2)) -eq 0 ]; then in_range=yes; fi
expect "worktree: backend port is even and in 3100-3498 (got $be)" "$in_range" "yes"
expect "worktree: frontend port is backend + 1" "$fe" "$((be + 1))"
expect "worktree: compose project is the main checkout's" "$(value_of "$out" COMPOSE_PROJECT_NAME)" "main"

# The derivation is stable across calls.
again=$(derive "$TMP/Feat-X.1")
expect "worktree: stable" "$again" "$out"

# E2E_STACK wins over the worktree name, and names the default stack too.
out=$(derive "$TMP/Feat-X.1" E2E_STACK=Other-Run)
expect "explicit stack: name" "$(value_of "$out" E2E_STACK)" "other_run"
expect "explicit stack: db" "$(value_of "$out" E2E_DB_NAME)" "grimoire_os_e2e_other_run"
out=$(derive "$TMP/Feat-X.1" E2E_STACK=default)
expect "explicit default: db" "$(value_of "$out" E2E_DB_NAME)" "grimoire_os_e2e"
expect "explicit default: backend port" "$(value_of "$out" E2E_BACKEND_PORT)" "3010"

# Each value stays individually overridable.
out=$(derive "$TMP/Feat-X.1" E2E_DB_NAME=grimoire_os_e2e_mine E2E_BACKEND_PORT=3020 E2E_FRONTEND_PORT=3021 COMPOSE_PROJECT_NAME=other)
expect "override: db" "$(value_of "$out" E2E_DB_NAME)" "grimoire_os_e2e_mine"
expect "override: backend port" "$(value_of "$out" E2E_BACKEND_PORT)" "3020"
expect "override: frontend port" "$(value_of "$out" E2E_FRONTEND_PORT)" "3021"
expect "override: compose project" "$(value_of "$out" COMPOSE_PROJECT_NAME)" "other"

# Very long names are cut so the database name fits Postgres's 63-byte limit.
long=$(printf 'x%.0s' $(seq 1 80))
out=$(derive "$TMP/main" E2E_STACK="$long")
db=$(value_of "$out" E2E_DB_NAME)
fits=no
if [ "${#db}" -le 63 ]; then fits=yes; fi
expect "long stack: db fits in 63 bytes (got ${#db})" "$fits" "yes"

# Sourcing exports the same values into the caller's shell.
sourced=$(env -i PATH="$PATH" HOME="$HOME" E2E_STACK=abc bash -c ". '$STACK_ENV' && e2e_stack_env '$TMP/main' && echo \"\$E2E_DB_NAME \$COMPOSE_PROJECT_NAME\"")
expect "sourced: exports" "$sourced" "grimoire_os_e2e_abc main"

echo "stack-env.test.sh: $PASSES passed, $FAILS failed"
[ "$FAILS" -eq 0 ]
