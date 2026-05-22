# E2E Tests (Playwright)

End-to-end tests that drive the running app (frontend + backend + Postgres) in a real browser.

## When to write a spec

These tests are the **outer verification gate** in the `/start-ticket` workflow — not the TDD inner loop. Write Vitest/Jest unit tests first; add a Playwright spec only for tickets that change a user-visible flow.

One spec per ticket is usually enough. Cover the golden path; let unit tests cover edge cases.

## Isolated database

E2E never touches the dev database. The suite runs against a dedicated Postgres database (`grimoire_os_e2e`) and dedicated ports:

| Service  | Dev (`./dev.sh`) | E2E (`./dev-e2e.sh`) |
|----------|------------------|----------------------|
| Backend  | 3001             | 3010                 |
| Frontend | 3000             | 3011                 |
| Database | `grimoire_os`    | `grimoire_os_e2e`    |

Because the ports differ, you can run dev and E2E simultaneously without conflict.

Before every Playwright run, `global-setup.ts` truncates the app-data tables (users, campaigns, characters, encounters, notes, npcs, …) in `grimoire_os_e2e`, leaving SRD and reference tables intact. So each run starts from a clean slate without re-running migrations or re-seeding.

If you add a new top-level entity model in `backend/prisma/schema.prisma` whose rows are created at runtime (not by the seed), add its `@@map` table name to `APP_DATA_TABLES` in `global-setup.ts`.

## Run locally

All commands run from this `e2e/` directory.

```bash
cd e2e

# One-time
npm install
npm run e2e:install

# Let Playwright start the E2E stack (./dev-e2e.sh) itself.
# Provisions grimoire_os_e2e on first run, then truncates between runs.
npm run e2e

# Run against an already-running ./dev-e2e.sh
E2E_NO_WEBSERVER=1 npm run e2e

# Interactive UI mode
npm run e2e:ui
```

### Nuking the E2E database

The pre-run truncate handles normal pollution. If you ever need a full reset (schema drift, corrupt state, etc.):

```bash
docker compose exec postgres dropdb -U grimoire grimoire_os_e2e
# Next ./dev-e2e.sh run will re-create, re-migrate, and re-seed.
```

## Conventions

- File naming: `<feature>.spec.ts` (e.g. `npc-generator.spec.ts`)
- Auth: log in via the API in `beforeEach`, set the JWT cookie, then navigate. Don't drive the login form unless that's what you're testing.
- Data: create campaign/NPC/etc. fixtures via API. Cleanup between runs is automatic — no need for per-spec `afterEach` teardown.
- Selectors: prefer `getByRole` and `getByTestId` over CSS selectors.
