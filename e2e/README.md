# E2E Tests (Playwright)

End-to-end tests that drive the running app (frontend + backend + Postgres) in a real browser.

## When to write a spec

These tests are the **outer verification gate** in the `/start-ticket` workflow — not the TDD inner loop. Write Vitest/Jest unit tests first; add a Playwright spec only for tickets that change a user-visible flow.

One spec per ticket is usually enough. Cover the golden path; let unit tests cover edge cases.

## Run locally

All commands run from this `e2e/` directory.

```bash
cd e2e

# One-time
npm install
npm run e2e:install

# Run against already-running dev servers (./dev.sh)
E2E_NO_WEBSERVER=1 npm run e2e

# Or let Playwright start ./dev.sh itself
npm run e2e

# Interactive UI mode
npm run e2e:ui
```

## Conventions

- File naming: `<feature>.spec.ts` (e.g. `npc-generator.spec.ts`)
- Auth: log in via the API in `beforeEach`, set the JWT cookie, then navigate. Don't drive the login form unless that's what you're testing.
- Data: create campaign/NPC/etc. fixtures via API, not seed files. Clean up after.
- Selectors: prefer `getByRole` and `getByTestId` over CSS selectors.
