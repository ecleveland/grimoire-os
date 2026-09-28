#!/bin/bash
# Names the e2e stack a checkout runs: its database, its two ports, and the
# docker compose project that owns the shared postgres container.
#
# dev-e2e.sh sources this file and calls e2e_stack_env. playwright.config.ts
# runs it as a script and reads the KEY=VALUE lines it prints, so both sides
# agree on the same stack without keeping two copies of the rules.
#
# Rules, first match wins:
#   - Any of E2E_DB_NAME, E2E_BACKEND_PORT, E2E_FRONTEND_PORT or
#     COMPOSE_PROJECT_NAME already set in the environment is kept as is.
#   - COMPOSE_PROJECT_NAME defaults to the main checkout's directory name,
#     the project dev.sh starts postgres under.
#   - E2E_STACK names the stack. "default" is the stock stack.
#   - Otherwise a linked git worktree takes its directory name as the stack.
#   - Otherwise (the main checkout, CI, no git) the stack is "default".
#
# The default stack uses ports 3010/3011 and database grimoire_os_e2e. Any
# other stack uses database grimoire_os_e2e_<stack> and a port pair between
# 3100 and 3499 hashed from its name.

# Prints the name of a linked worktree at $1, or nothing for a main checkout
# or a directory outside git.
_e2e_worktree_name() {
  local root="$1" git_dir common_dir
  git_dir=$(git -C "$root" rev-parse --path-format=absolute --git-dir 2>/dev/null) || return 0
  common_dir=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 0
  if [ "$git_dir" != "$common_dir" ]; then
    basename "$(git -C "$root" rev-parse --show-toplevel)"
  fi
}

# Prints the compose project that dev.sh uses for the postgres container:
# compose names it after the main checkout's directory, lowercased, keeping
# only letters, digits, dashes and underscores. A worktree shares the main
# checkout's container, so it resolves to the main checkout's name too.
_e2e_compose_project() {
  local root="$1" main_dir=""
  if [ -n "$(_e2e_worktree_name "$root")" ]; then
    # A linked worktree: the first worktree listed is the main checkout.
    main_dir=$(git -C "$root" worktree list --porcelain | sed -n '1s/^worktree //p')
  else
    # The top level holds even when .git lives elsewhere (a submodule or
    # --separate-git-dir); empty outside git.
    main_dir=$(git -C "$root" rev-parse --show-toplevel 2>/dev/null) || true
  fi
  main_dir="${main_dir:-$root}"
  basename "$main_dir" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-' | sed 's/^[-_]*//'
}

# Lowercases $1 and turns every run of other characters into one underscore,
# so the name is safe inside a Postgres identifier. Cut to 40 characters so
# grimoire_os_e2e_<stack> stays under the 63-byte identifier limit.
_e2e_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '_' | sed 's/^_*//; s/_*$//' | cut -c1-40
}

# Exports E2E_STACK, E2E_DB_NAME, E2E_BACKEND_PORT, E2E_FRONTEND_PORT and
# COMPOSE_PROJECT_NAME for the checkout at $1.
e2e_stack_env() {
  local root="$1" stack
  stack="${E2E_STACK:-$(_e2e_worktree_name "$root")}"
  stack="$(_e2e_slug "${stack:-default}")"
  stack="${stack:-default}"

  local db backend
  if [ "$stack" = "default" ]; then
    db="grimoire_os_e2e"
    backend=3010
  else
    db="grimoire_os_e2e_${stack}"
    local sum
    sum=$(printf '%s' "$stack" | cksum | cut -d' ' -f1)
    backend=$((3100 + 2 * (sum % 200)))
  fi

  export E2E_STACK="$stack"
  export E2E_DB_NAME="${E2E_DB_NAME:-$db}"
  export E2E_BACKEND_PORT="${E2E_BACKEND_PORT:-$backend}"
  export E2E_FRONTEND_PORT="${E2E_FRONTEND_PORT:-$((E2E_BACKEND_PORT + 1))}"
  # A worktree's compose project would otherwise be named after its own
  # directory and miss the running postgres container.
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(_e2e_compose_project "$root")}"
}

# Run as a script: print the stack for the checkout at $1 (default: the repo
# this file lives in).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  e2e_stack_env "${1:-$(cd "$(dirname "$0")/.." && pwd)}"
  for key in E2E_STACK E2E_DB_NAME E2E_BACKEND_PORT E2E_FRONTEND_PORT COMPOSE_PROJECT_NAME; do
    printf '%s=%s\n' "$key" "${!key}"
  done
fi
