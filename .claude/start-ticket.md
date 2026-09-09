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

Run both steps below with Bash `run_in_background: true` — `verify.sh` is eight serial stages (SRD lib tests → shared build → backend lint → backend `test:cov` → backend build → frontend lint → frontend `test:cov` → frontend build) and Playwright is slower still. You get re-invoked on exit; don't block the foreground.

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

| Tier                    | When                                                                                                                                                                 | What Claude runs, unprompted                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **skip**                | Docs/markdown-only, CI/config tweaks, dependency-pin bumps, or ≤30 changed lines across ≤3 files with no risk trigger and no behaviour change beyond a localized fix | Nothing — CI is the gate. Say so in the report.                                                                         |
| **standard**            | Anything between skip and deep: typical bug fixes, small UI tweaks, single-component changes                                                                         | `/code-review medium --comment` + self-review                                                                           |
| **deep**                | Full feature (new page, endpoint, or data model), OR ≥400 changed lines, OR ≥10 files                                                                                | `/code-review xhigh --comment` + both toolkit agents + self-review                                                      |
| **deep + risk trigger** | Any risk trigger above                                                                                                                                               | `/code-review max --comment` + both toolkit agents + self-review. Offer `ultra` as a user-run option; never attempt it. |

Compute the tier, do not judge it. Production files only — test-only and
generated files (lockfiles, `tsconfig.tsbuildinfo`, snapshots) do not count
toward the thresholds:

```bash
git diff --name-only origin/main...HEAD | grep -vE '(spec|test)\.(ts|tsx)$'
git diff --shortstat origin/main...HEAD -- $(…that list…)
git diff --name-only origin/main...HEAD | grep -iE 'prisma/(schema|migrations|seed)|auth|jwt|cookie|content-access|rate-limit'
```

State the tier and the numbers that produced it in the report, so the user can
see the decision and override it. Announce it; do not ask permission for it.

### Running the review

`/code-review` is model-invocable. Claude runs it itself at the computed tier —
no prompt, no handoff. (An earlier version of this file claimed the opposite,
citing a `disable-model-invocation` error. That was verified false on
2026-09-09: `/code-review max` launched, captured the diff, and fanned out its
finder angles. If it ever does refuse, test it rather than trusting this
paragraph either.)

The one genuine exception is **`ultra`**, which runs in the cloud and is billed.
That is user-triggered only. Name it as an option at the deep + risk-trigger
gate; do not attempt it.

**Two passes, at different points:**

1. **Pre-commit**, once the fast tests are green: `/code-review medium` over the
   working tree. Correctness bugs and obvious simplifications only. Fixing here
   keeps the PR history clean instead of accreting review-round commits. Skip
   for trivial diffs.
2. **Post-PR**, after `gh pr create`: the tier-appropriate command with
   `--comment`, so findings anchor to lines. This is the one that gates.

**Acting on findings, without asking:**

- **CONFIRMED** (the reviewer named a triggering input and the wrong output) —
  fix it. TDD where behaviour changes: regression test first, then re-verify,
  commit, push. Reply to the PR comment noting it is resolved.
- **PLAUSIBLE** (real mechanism, uncertain trigger) — report, do not edit.
  Summarize for the user with the file:line and what would have to be true.
- Either way, **verify the finding against the code before acting on it.** On
  VEG-453 a review agent cited a species trait's prose as structured data and
  proposed a guard that would have failed on a field the seeded row carries. On
  VEG-524 the round-2 agent was right that a db-spec test was weak, and the
  first mutation run "proving" it silently no-opped because prettier had
  reformatted the line the replace string matched on. A no-op mutation reads
  exactly like a healthy passing suite — assert the edit applied.

**Iteration cap:** re-run the same tier after fixing. Stop when a round returns
no new actionable findings, or at 1 re-review for standard / 3 for deep. A
finding disputed once and confirmed invalid does not count as new. At the cap,
present what is left rather than churning.

**The toolkit agents stay additive.** At deep tier and above, also run
`pr-review-toolkit:pr-test-analyzer` and `pr-review-toolkit:type-design-analyzer`
— test coverage and type design are not `/code-review` angles. Do not run the
full `/pr-review-toolkit:review-pr`; its `code-reviewer` and
`silent-failure-hunter` passes duplicate what `/code-review` covers at `xhigh`,
without its independent-verifier step. Ask these agents for concrete `file:line`
findings and tell them to say plainly when they find nothing — they will
otherwise manufacture findings to seem useful.

**Do not let agents and Claude edit the same files concurrently.** The toolkit
agents mutate source in place to mutation-test. Commit first, let them run, then
edit.

**Self-review is not a substitute, but it isn't nothing.** On VEG-453 it caught a drift seam and two exports the refactor had orphaned. The toolkit agents then caught what it missed: a docstring claiming a compile-time guarantee the type didn't provide, and a test that was an unfalsifiable identity. Treat all three as complementary and none as sufficient.

Test-only and generated files (lockfiles, `tsconfig.tsbuildinfo`, snapshots) don't count toward the line/file thresholds — size the review on production-code impact. When borderline, state the tier and the numbers and let the user bump it up or down before starting.

### Posting review findings to the PR

`--comment` is `/code-review`'s own flag, so that pass posts its own inline
findings. Claude posts the rest:

- **A round summary** — `gh pr comment <pr> --body-file -` with a heredoc. Record
  which passes ran, what was applied, and anything rejected _with the evidence
  for rejecting it_. A reviewer needs to know a suggestion was considered and
  found wrong, not just that it is absent.
  **Use `--body-file -`, never `--body "…"`.** Backticks inside a double-quoted
  argument are command-substituted by the shell: on VEG-524 that silently
  deleted two agent names from a posted comment, leaving "Ran and .".
- **Findings anchored to a line** — `gh api repos/<owner>/<repo>/pulls/<pr>/comments -f commit_id=… -f path=… -F line=… -f side=RIGHT -f body=…`. The command **must start with `gh api`** to match the project's `Bash(gh api:*)` allow rule — a compound prefix like `SHA=$(git rev-parse HEAD) && gh api …` falls through to the permission classifier and gets denied. Resolve the commit SHA in a separate `git rev-parse HEAD` call first.

Don't take agent findings at face value before posting or acting on them — verify each against the code first. On VEG-453 a review agent cited a species trait's prose description as a structured data listing, and proposed a one-line drift guard that would have failed on a field the seeded row carries and the shared constant doesn't. Both read as authoritative. Verifying is also what tells you whether a finding is latent or already broken, which changes its priority.
