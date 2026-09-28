# E2E Tests (Playwright)

End-to-end tests that drive the running app (frontend + backend + Postgres) in a real browser.

## When to write a spec

These tests are the **outer verification gate** in the `/start-ticket` workflow — not the TDD inner loop. Write Vitest/Jest unit tests first; add a Playwright spec only for tickets that change a user-visible flow.

One spec per ticket is usually enough. Cover the golden path; let unit tests cover edge cases.

## Isolated database

E2E never touches the dev database. Each checkout runs its own e2e stack with its own Postgres database and ports:

| Service  | Dev (`./dev.sh`) | E2E, main checkout and CI | E2E, linked git worktree     |
|----------|------------------|---------------------------|------------------------------|
| Backend  | 3001             | 3010                      | even port in 3100-3498       |
| Frontend | 3000             | 3011                      | backend port + 1             |
| Database | `grimoire_os`    | `grimoire_os_e2e`         | `grimoire_os_e2e_<worktree>` |

`stack-env.sh` holds these rules. `dev-e2e.sh`, `playwright.config.ts` and `global-setup.ts` all read the same values from it, so `npm run e2e` in any checkout targets that checkout's stack with no extra setup. Print what a checkout resolves to with `bash e2e/stack-env.sh`.

Because the ports differ, dev and any number of e2e stacks can run at once.

Before every Playwright run, `global-setup.ts` truncates the app-data tables (users, campaigns, characters, encounters, notes, npcs, …) in the stack's database, leaving SRD and reference tables intact. So each run starts from a clean slate without re-running migrations or re-seeding. It refuses any database whose name is not `grimoire_os_e2e` or `grimoire_os_e2e_<stack>`.

If you add a new top-level entity model in `backend/prisma/schema.prisma` whose rows are created at runtime (not by the seed), add its `@@map` table name to `APP_DATA_TABLES` in `global-setup.ts`.

## Run locally

All commands run from this `e2e/` directory.

```bash
cd e2e

# One-time
npm install
npm run e2e:install

# Let Playwright start this checkout's e2e stack (./dev-e2e.sh) itself.
# Provisions the stack's database on first run, then truncates between runs.
npm run e2e

# Run against an already-running ./dev-e2e.sh for this checkout
E2E_NO_WEBSERVER=1 npm run e2e

# Interactive UI mode
npm run e2e:ui
```

## Parallel stacks

Several checkouts can run e2e at the same time. Each one needs only Postgres up; the stacks share the `grimoire-os` compose project's postgres container and nothing else.

Inside a linked worktree the defaults already give a private stack, so plain `npm run e2e` is enough. To pick names and ports by hand, set these before `./dev-e2e.sh` or `npm run e2e`:

| Variable               | Default                                | Effect                                              |
|------------------------|----------------------------------------|-----------------------------------------------------|
| `E2E_STACK`            | worktree directory name, or `default`  | names the stack; picks its database and ports       |
| `E2E_DB_NAME`          | `grimoire_os_e2e_<stack>`              | database for this stack                             |
| `E2E_BACKEND_PORT`     | hashed from the stack name             | backend port                                        |
| `E2E_FRONTEND_PORT`    | backend port + 1                       | frontend port                                       |
| `COMPOSE_PROJECT_NAME` | `grimoire-os`                          | compose project that owns the shared postgres       |
| `E2E_BASE_URL`         | `http://localhost:<frontend port>`     | where specs open pages                              |
| `E2E_API_URL`          | `http://localhost:<backend port>`      | where specs call the API                            |

The stack named `default` keeps the stock values (3010/3011, `grimoire_os_e2e`). A worktree only needs `COMPOSE_PROJECT_NAME` when it runs `docker compose` by hand, because compose otherwise names the project after the worktree directory and cannot find the running container. The scripts set it for you.

Two stacks started by hand, from two worktrees:

```bash
# worktree A
E2E_STACK=a E2E_BACKEND_PORT=3020 E2E_FRONTEND_PORT=3021 ./dev-e2e.sh --drop
cd e2e && E2E_NO_WEBSERVER=1 E2E_STACK=a E2E_BACKEND_PORT=3020 E2E_FRONTEND_PORT=3021 npm run e2e

# worktree B
E2E_STACK=b E2E_BACKEND_PORT=3030 E2E_FRONTEND_PORT=3031 ./dev-e2e.sh --drop
cd e2e && E2E_NO_WEBSERVER=1 E2E_STACK=b E2E_BACKEND_PORT=3030 E2E_FRONTEND_PORT=3031 npm run e2e
```

What `dev-e2e.sh` does to keep stacks apart:

- **It only stops its own leftovers.** Backend and frontend each run in their own process group, recorded in `.e2e/<stack>.pid` in the checkout. On startup the script stops the groups in that file and nothing else. Starting the same stack twice replaces the first run.
- **It refuses a busy port.** If another process holds one of its ports, it exits with an error instead of killing that process.
- **`--drop` removes the database on exit.** Use it for one-off stacks so `grimoire_os_e2e_*` databases do not pile up.

One worktree runs one stack at a time. Next.js locks `frontend/.next/dev` for its dev server, so a second stack from the same checkout cannot start its frontend.

### Nuking the E2E database

The pre-run truncate handles normal pollution. If you ever need a full reset (schema drift, corrupt state, etc.), drop the stack's database:

```bash
docker compose -p grimoire-os exec postgres dropdb -U grimoire grimoire_os_e2e
# Next ./dev-e2e.sh run will re-create, re-migrate, and re-seed.
```

List the e2e databases a machine has collected:

```bash
docker compose -p grimoire-os exec -T postgres psql -U grimoire -d postgres -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'grimoire_os_e2e%'"
```

## Tests for the stack rules

`stack-env.test.sh` checks the naming rules in `stack-env.sh`. `verify.sh` and CI run it:

```bash
bash e2e/stack-env.test.sh
```

## Conventions

- File naming: `<feature>.spec.ts` (e.g. `npc-generator.spec.ts`)
- Auth: log in via the API in `beforeEach`, set the JWT cookie, then navigate. Don't drive the login form unless that's what you're testing.
- Data: create campaign/NPC/etc. fixtures via API. Cleanup between runs is automatic — no need for per-spec `afterEach` teardown.
- Selectors: prefer `getByRole` and `getByTestId` over CSS selectors.
