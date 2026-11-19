#!/bin/bash
# Tests for docker-compose.yml interpolation. Renders the compose config from a
# temp env file in a clean environment, so neither the caller's shell nor the
# repo's .env leaks in. Needs docker compose but no daemon. Run from anywhere:
#   bash scripts/compose-config.test.sh

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

# Renders the config for an env file, with any extra compose arguments.
# --env-file replaces the project .env, so the repo's .env is never read.
render() {
  local env_file="$1"
  shift
  env -i PATH="$PATH" HOME="$HOME" docker compose \
    --env-file "$env_file" -f "$ROOT_DIR/docker-compose.yml" "$@" config --format json
}

# Prints one line per published port as service:published:target.
published_ports() {
  node -e '
    const config = JSON.parse(require("fs").readFileSync(0, "utf8"));
    for (const [name, service] of Object.entries(config.services)) {
      for (const port of service.ports ?? []) {
        if (port.published) console.log(`${name}:${port.published}:${port.target}`);
      }
    }
  '
}

# Prints the host address each port of one service binds, one per line, or
# "all" for a port with no host_ip.
host_ips() {
  node -e '
    const config = JSON.parse(require("fs").readFileSync(0, "utf8"));
    for (const port of config.services[process.argv[1]].ports ?? []) {
      console.log(port.host_ip || "all");
    }
  ' "$1"
}

# Prints the value of one environment variable of one service.
service_env() {
  node -e '
    const config = JSON.parse(require("fs").readFileSync(0, "utf8"));
    console.log(config.services[process.argv[1]].environment?.[process.argv[2]] ?? "");
  ' "$1" "$2"
}

MINIMAL="$TMP/minimal.env"
cat > "$MINIMAL" <<'ENV'
PUBLIC_URL=https://grimoire.example.com
JWT_SECRET=x
POSTGRES_PASSWORD=pw
ENV

# Output is captured first and fed to grep through here-strings, because a
# grep -q that exits early in a pipe can kill the writer with SIGPIPE, which
# pipefail turns into a false failure.
if ! rendered=$(render "$MINIMAL" 2>&1); then
  fail "minimal env renders" "$rendered"
  echo "compose-config.test.sh: $PASSES passed, $FAILS failed"
  exit 1
fi

# 1. A deployment on another host must not point anything at localhost.
if grep -q localhost <<<"$rendered"; then
  fail "minimal env renders no localhost" "$(grep localhost <<<"$rendered")"
else
  pass "minimal env renders no localhost"
fi

# 2. Only the frontend faces the host. The backend and Postgres stay internal.
ports=$(published_ports <<<"$rendered")
if [ "$ports" = "frontend:3000:3000" ]; then
  pass "only the frontend publishes a host port, 3000"
else
  fail "only the frontend publishes a host port, 3000" "got: ${ports:-none}"
fi

# 3. The frontend port listens on loopback by default, so only a reverse proxy
# on the same host reaches it, and FRONTEND_BIND opens it to the network.
bind=$(host_ips frontend <<<"$rendered")
if [ "$bind" = "127.0.0.1" ]; then
  pass "frontend port binds 127.0.0.1 by default"
else
  fail "frontend port binds 127.0.0.1 by default" "got: ${bind:-none}"
fi

OPEN_BIND="$TMP/open-bind.env"
cat "$MINIMAL" > "$OPEN_BIND"
echo 'FRONTEND_BIND=0.0.0.0' >> "$OPEN_BIND"
if open_rendered=$(render "$OPEN_BIND" 2>&1); then
  open_bind=$(host_ips frontend <<<"$open_rendered")
  if [ "$open_bind" = "0.0.0.0" ]; then
    pass "FRONTEND_BIND=0.0.0.0 binds the frontend port on every interface"
  else
    fail "FRONTEND_BIND=0.0.0.0 binds the frontend port on every interface" "got: ${open_bind:-none}"
  fi
else
  fail "FRONTEND_BIND=0.0.0.0 binds the frontend port on every interface" "$open_rendered"
fi

# 4. CORS follows PUBLIC_URL, and the backend reaches Postgres by service name
# with the password from the env file.
frontend_url=$(service_env backend FRONTEND_URL <<<"$rendered")
if [ "$frontend_url" = "https://grimoire.example.com" ]; then
  pass "backend FRONTEND_URL equals PUBLIC_URL"
else
  fail "backend FRONTEND_URL equals PUBLIC_URL" "got: $frontend_url"
fi

database_url=$(service_env backend DATABASE_URL <<<"$rendered")
if [ "$database_url" = "postgresql://grimoire:pw@postgres:5432/grimoire_os" ]; then
  pass "backend DATABASE_URL carries the password and host postgres"
else
  fail "backend DATABASE_URL carries the password and host postgres" "got: $database_url"
fi

# 5. The backend trusts the frontend proxy by default, so the rate limiter keys
# on the client address. Under compose every request reaches the backend from
# the frontend container, so 0 puts every client in one bucket.
trust_proxy=$(service_env backend TRUST_PROXY <<<"$rendered")
if [ "$trust_proxy" = "1" ]; then
  pass "backend TRUST_PROXY defaults to 1"
else
  fail "backend TRUST_PROXY defaults to 1" "got: ${trust_proxy:-empty}"
fi

NO_TRUST="$TMP/no-trust.env"
cat "$MINIMAL" > "$NO_TRUST"
echo 'TRUST_PROXY=0' >> "$NO_TRUST"
if no_trust_rendered=$(render "$NO_TRUST" 2>&1); then
  no_trust=$(service_env backend TRUST_PROXY <<<"$no_trust_rendered")
  if [ "$no_trust" = "0" ]; then
    pass "TRUST_PROXY=0 in the env file reaches the backend"
  else
    fail "TRUST_PROXY=0 in the env file reaches the backend" "got: ${no_trust:-empty}"
  fi
else
  fail "TRUST_PROXY=0 in the env file reaches the backend" "$no_trust_rendered"
fi

# 6. A missing password stops compose before anything starts. The repo's .env
# sets POSTGRES_PASSWORD, so this check also proves that file is not read.
NO_PASSWORD="$TMP/no-password.env"
grep -v '^POSTGRES_PASSWORD=' "$MINIMAL" > "$NO_PASSWORD"
out=$(render "$NO_PASSWORD" 2>&1) && rc=0 || rc=$?
if [ "$rc" -ne 0 ] && grep -q 'POSTGRES_PASSWORD is required' <<<"$out"; then
  pass "missing POSTGRES_PASSWORD fails with the required-variable message"
else
  fail "missing POSTGRES_PASSWORD fails with the required-variable message" "exit $rc: $(head -n 5 <<<"$out")"
fi

# 7. The dev override publishes Postgres for dev.sh and the e2e stack.
if dev_rendered=$(render "$MINIMAL" -f "$ROOT_DIR/docker-compose.dev.yml" 2>&1); then
  dev_ports=$(published_ports <<<"$dev_rendered")
  if grep -qx 'postgres:5432:5432' <<<"$dev_ports"; then
    pass "docker-compose.dev.yml publishes 5432 on postgres"
  else
    fail "docker-compose.dev.yml publishes 5432 on postgres" "got: ${dev_ports:-none}"
  fi
else
  fail "docker-compose.dev.yml publishes 5432 on postgres" "$dev_rendered"
fi

echo "compose-config.test.sh: $PASSES passed, $FAILS failed"
[ "$FAILS" -eq 0 ]
