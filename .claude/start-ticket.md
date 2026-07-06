# start-ticket — GrimoireOS project overrides

Project-specific configuration for the global `start-ticket` skill. The skill reads this file at the start of every run; everything here overrides or fills in the generic workflow.

## Ticket tracker

- Linear team **Vega Apps**, project **GrimoireOS**, ticket prefix `VEG-NNN`.
- Branch from Linear's `gitBranchName` — don't invent branch names.

## Pre-flight

- Kill stale dev processes on ports 3000/3001:
  `lsof -ti:3000,3001 | xargs kill -9 2>/dev/null`
- Confirm Docker is running and the `postgres` container is up: `docker compose ps`
- Confirm `.env` (repo root) and `backend/.env` exist; copy from `.env.example` if missing.

## Fast test runners (TDD inner loop)

- Backend: `cd backend && npm test -- --watch <pattern>` (Jest)
- Frontend: `cd frontend && npm test -- --watch <pattern>` (Vitest)
- Do **not** run Playwright in the inner loop — it's reserved for the final gate.

## Frontend test coverage (required for any UI work)

If the ticket adds or modifies a page, component, hook, or client-side helper, a Vitest spec is **required** in the same PR — do not defer it to a follow-up "coverage" ticket. Co-locate specs in a sibling `__tests__/` directory (e.g. `src/app/foo/__tests__/page.test.tsx`, `src/components/__tests__/Foo.test.tsx`). Mirror the conventions in existing specs — `vi.mock` for `@/lib/api`, `next/navigation`, `sonner`, `@/lib/auth-context`; `userEvent.setup()` for interactions; role-/label-based queries via `@testing-library/react`.

Cover at minimum:

- **Rendering**: loading state, empty state, not-found state, and the populated happy path.
- **Interactions**: every user-triggered action that hits an API or mutates state (create, update, delete, toggle, navigation). Assert both the request shape (URL + method + body) and the resulting UI change.
- **Authorization branches**: any `isOwner`/`isAuthor`/`isDm`/`isController` gating renders should be exercised in both the allowed and denied case.
- **Error paths**: at least one `apiFetch` rejection per write action, asserting the toast message. Cover both `Error` and non-`Error` rejections when the page distinguishes them (`err instanceof Error ? err.message : 'Failed to …'`).
- **Edge cases visible from the UI**: clamping, sorting, wrap-around, optional fields omitted from the request body.

Gotchas:

- `userEvent.type` fires `onChange` per character — when the handler has side effects (e.g. a PATCH per keystroke), use `fireEvent.change(input, { target: { value: '…' } })` to set the value atomically.
- `getByLabelText` only works when `<label htmlFor>` (or wrapping) is wired. Pages that use the shared `FormField` component are fine; ad-hoc inline labels (e.g. the encounter combatant inputs) need role-based queries (`getByRole('textbox')`, `getAllByRole('spinbutton')`).
- Test-data factory helpers must spread the `over` override (`...over,`) into the returned object — easy to miss and silently breaks assertions.
- Run `npx prettier --write` on every new spec file before the verification gate. The backend's `prettier.spec.ts` runs `npm run format:check` on the frontend and will fail the whole backend suite if a new file isn't formatted.

For UI tickets, also draft a Playwright spec under `e2e/<feature>.spec.ts` covering the user-visible golden path. Don't run it during the inner loop — it's queued for the final gate.

## Verification gate

1. `./verify.sh` from the repo root — mirrors CI exactly (backend + frontend lint, unit tests with coverage thresholds, SRD extraction-lib tests, production builds). Do not substitute plain `npm test`/`npm run build`. (Backend's `prettier.spec.ts` runs `format:check` on the frontend — prettier-format new frontend files first.)
2. **E2E (Playwright)** — `cd e2e && npm run e2e -- <specs>`, as the last step (there is no root `package.json`).
   - The suite provisions its own stack via `dev-e2e.sh`: dedicated ports 3010/3011 and a dedicated `grimoire_os_e2e` database. Only Postgres needs to be up beforehand.
   - **`./dev.sh` must be stopped first.** Next 16 takes a `frontend/.next/dev/lock`, so the e2e stack's `next dev` can't start while the dev server runs — the webServer step times out after 120 s. Stop dev (`./stop.sh`), run e2e, restart dev.
   - `E2E_NO_WEBSERVER=1` does **not** point the suite at the 3000/3001 dev servers — it assumes an already-running `dev-e2e.sh` stack on 3010/3011. Using it with only `./dev.sh` up fails every spec, including smoke.
   - Run only the spec(s) relevant to this ticket plus `smoke.spec.ts`. Full suite runs in CI.
   - Skip E2E only when the ticket touches no user-visible behavior (pure refactor, docs, backend-only internals with no API contract change) — state explicitly when skipping and why.

## Commit / PR conventions

- Commit message: `feat: <summary> [VEG-NNN]` (or `fix:`/`test:`/`ci:` as appropriate).
- PR body includes `Fixes VEG-NNN` so Linear auto-links and transitions the issue.

## Review sizing policy

Classify the PR before running any automated review. Measure against main (`git diff --shortstat origin/main...HEAD` + changed-file list); risk triggers win over size.

**Risk triggers** (always at least deep tier, regardless of diff size): auth/JWT/cookies, Prisma schema/migrations or seed data, content-access rules (srd/shared/homebrew tiers), rate limiting.

| Tier | When | Review |
|------|------|--------|
| **skip** | Docs/markdown-only, CI/config tweaks, dependency-pin bumps, or ≤30 changed lines across ≤3 files with no risk trigger and no behavior change beyond a localized fix | None — CI is the gate |
| **standard** | Anything between skip and deep: typical bug fixes, small UI tweaks, single-component changes | `code-review medium --comment`, max 1 re-review |
| **deep** | Risk trigger hit, OR full feature (new page, endpoint, or data model), OR ≥400 changed lines, OR ≥10 files | `/pr-review-toolkit:review-pr` + `code-review high --comment`, max 3 iterations |

Test-only and generated files (lockfiles, `tsconfig.tsbuildinfo`, snapshots) don't count toward the line/file thresholds — size the review on production-code impact. When borderline, state the tier and the numbers and let the user bump it up or down before starting.

### Posting inline review comments (`--comment`)

Post findings with `gh api repos/<owner>/<repo>/pulls/<pr>/comments -f commit_id=… -f path=… -F line=… -f side=RIGHT -f body=…`. The command **must start with `gh api`** to match the project's `Bash(gh api:*)` allow rule — a compound prefix like `SHA=$(git rev-parse HEAD) && gh api …` falls through to the permission classifier and gets denied. Resolve the commit SHA in a separate `git rev-parse HEAD` call first.
