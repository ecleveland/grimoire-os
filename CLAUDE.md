# GrimoireOS

A free, open-source D&D 5e campaign management tool. Self-hostable alternative to D&D Beyond.

## Quick Start

```bash
# Development (hot reload)
./dev.sh

# Production (Docker)
JWT_SECRET=your-secret docker compose up --build
```

## Architecture

- **Backend**: NestJS 11 + PostgreSQL 16 (Prisma) — port 3001
- **Frontend**: Next.js 16 + React 19 + Tailwind v4 — port 3000
- **Auth**: JWT + Passport + bcryptjs, roles: player / dungeon_master / admin

### Prisma 7

- The CLI reads `backend/prisma.config.ts` for the schema path, migrations, seed command and `DATABASE_URL`. The schema's datasource has no `url`. The config loads `.env` through `dotenv` because the CLI no longer does.
- `prisma generate` writes the client to `backend/src/generated/prisma/`, which is gitignored and excluded from lint, Prettier and coverage. Import it by relative path (`../generated/prisma/client`), never from `@prisma/client`. `npm install` regenerates it through `postinstall`; after a schema change run `npx prisma generate` yourself, because `migrate dev` no longer does.
- `PrismaService` connects through the `@prisma/adapter-pg` driver adapter, a `pg` pool of 10 connections with a 5 s connect timeout and 10 s idle timeout, set explicitly to match Prisma 6's engine defaults. PrismaModule loads only `src/config/database.config.ts`, so it boots without `JWT_SECRET`. Constraint errors carry the violated index name under `meta.driverAdapterError.cause`, not `meta.target`; read them with `src/common/helpers/prisma-errors.ts`.
- `npm run test:db` runs Jest under `--experimental-vm-modules` because the generated client loads its query compiler with a dynamic `import()`.

## Key Commands

```bash
# Backend
cd backend && npx prisma generate # Regenerate the Prisma client after a schema change
cd backend && npm run start:dev   # Dev server
cd backend && npm test            # Unit tests
cd backend && npm run test:cov    # Unit tests + coverage (enforces thresholds)
cd backend && npm run test:db     # Real-DB seed-idempotency tests (needs Postgres up)
cd backend && npm run seed        # Seed SRD data

# Frontend
cd frontend && npm run dev        # Dev server
cd frontend && npm test           # Unit tests
cd frontend && npm run test:cov   # Unit tests + coverage (enforces thresholds)
cd frontend && npm run typecheck  # tsc --noEmit over src, spec files included
```

> **Run tests from the right subdirectory.** Every command above is scoped to `backend/` or `frontend/`; the shell cwd does **not** persist between separate tool calls. A sudden Jest/Vitest "cannot find module" or "no test files found" error is almost always cwd drift (e.g. running a frontend spec from the repo root or `backend/`), not a real import bug — check the working directory before investigating the code.

## Testing & Coverage Thresholds

Both projects enforce minimum coverage thresholds via their respective test runners. `test:cov` (backend Jest, frontend Vitest) will exit non-zero if any metric drops below the configured floor.

| Project | Statements | Branches | Functions | Lines | Configured in |
|---------|------------|----------|-----------|-------|---------------|
| Backend (Jest) | 90% | 80% | 88% | 90% | `backend/package.json` (`jest.coverageThreshold.global`) |
| Frontend (Vitest) | 88% | 82% | 86% | 90% | `frontend/vitest.config.ts` (`test.coverage.thresholds`) |

Floors are set a few points below the live actuals (as of 2026-06-23, ~94.9/83.0/91.2/95.4% backend, ~93.3/87.0/91.3/95.1% frontend) — enough margin to avoid flaky failures while still catching regression. The frontend floors were originally ~47–52% against a much smaller suite (VEG-204 era); the suite has since grown to ~150 spec files and the floors were ratcheted up to match.

**Ratchet up** as coverage improves: bump the relevant numbers in the corresponding config file once a new floor has been reliably maintained for at least one CI run. Never lower a threshold without a deliberate, documented reason.

**Green ≠ working for UI changes.** Passing unit tests have repeatedly shipped live crashes the suite never modelled — e.g. a null `spellSlots` render crash and layout/width regressions caught only by manual clicking. After the suite is green, manually exercise any UI-affecting change in the running app (`./dev.sh`): walk the real user path and hit the empty/null/error state, not just the happy structural assertion. Backfill a regression test for anything you find so the gap closes for next time.

## CI & pre-merge verification

GitHub Actions (`.github/workflows/ci.yml`, VEG-120) runs on every PR: backend lint + `test:cov` + `nest build`, frontend lint + typecheck + `test:cov` + `next build`, the SRD extraction-lib tests, the `backend-db` real-DB seed tests (VEG-484), and the Playwright E2E suite against a compose-provisioned Postgres. The Docker job builds both images, boots the compose stack with `docker compose up --wait`, and probes `/api/health` and `/login` before tearing down. It runs on every push to `main` and on PRs that touch the Dockerfiles, `docker-compose.yml`, either package's `tsconfig*.json` or `package.json`, `frontend/next.config.ts`, or the workflow itself (VEG-570).

Run `./verify.sh` from the repo root before pushing — it mirrors the CI jobs locally (lint, unit tests with coverage thresholds, and the same production builds that `docker compose build` runs inside each image), minus E2E and the real-DB seed tests (both need a live Postgres). The production builds catch type errors the dev servers (Next.js dev, `nest start --watch`) silently let through.

In `frontend/`, `npm run typecheck` type-checks the spec files too. Vitest strips types without checking them, and the production build excludes specs through `tsconfig.build.json`, so this is the only step that catches a stale test fixture. It runs against `tsconfig.typecheck.json`, which leaves out the generated `.next/types` files: they go stale between a page rename and the next build, and `next build` checks them anyway.

**Real-DB tests (`backend/test/db/`, VEG-484).** The default backend Jest suite runs without Postgres and can only mock Prisma, so seed/DB-round-trip properties (id stability across re-seed, child FK survival, edit propagation) live in a separate `*.db-spec.ts` suite run by `npm run test:db` against a disposable `grimoire_os_seedtest` database (auto-created + migrated by the jest `globalSetup`). It's isolated from the coverage-gated unit run (outside `src/`, non-matching suffix, own jest config) and runs as the dedicated `backend-db` CI job. `db-harness.ts` (`createSeedContext`/`truncateAll`) is the reusable seam for future real-DB regression tests. A destructive-op guard refuses any database whose name doesn't contain `test`.

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| JWT_SECRET | Yes | — |
| DATABASE_URL | No | postgresql://grimoire:grimoire@localhost:5432/grimoire_os |
| JWT_EXPIRES_IN | No | 24h |
| FRONTEND_URL | No | http://localhost:3000 |
| NEXT_PUBLIC_API_URL | No | http://localhost:3001/api |
| INTERNAL_API_URL | No | falls back to NEXT_PUBLIC_API_URL |
| CACHE_TTL_MS | No | 86400000 (24h) |
| CACHE_LRU_SIZE | No | 1000 |

`INTERNAL_API_URL` is the server-side base URL for SSR data fetches (the SRD reference pages render as server components — VEG-320). In Docker it's `http://backend:3001/api` (the frontend container can't reach the backend via the host-published `localhost` URL); locally it's unset and falls back to `NEXT_PUBLIC_API_URL`.

`CACHE_TTL_MS` / `CACHE_LRU_SIZE` tune the global in-memory response cache (`backend/src/config/cache.config.ts`, VEG-340). The cache is LRU-bounded so high-cardinality anonymous traffic (e.g. `/srd/search?q=<unique>`) can't accrete unbounded 24h entries and OOM a small self-host; raise `CACHE_LRU_SIZE` on instances with more heap, or lower `CACHE_TTL_MS` for a shorter staleness window.

## Dependency overrides

`backend/package.json` overrides two transitive dependencies of the Prisma CLI. They count toward `npm audit --omit=dev` because `@prisma/client` peer-depends on `prisma`, and the overrides keep that audit at zero high on the backend.

- `deepmerge-ts` to `^8.0.2`. Prisma 7.10 still pins `@prisma/config` to `deepmerge-ts@7.1.5`, which carries a high-severity stack-exhaustion advisory (GHSA-ggr8-5vv4-36mx) in config loading. Remove the override once the installed Prisma depends on deepmerge-ts 8 or later; the advisory's fixed range begins at Prisma 8.1.
- `mysql2` to `^3.24.5`. The Prisma CLI pins `mysql2@3.15.3` for MySQL introspection, this project never opens a MySQL connection, and the override exists only to keep `npm audit --omit=dev` at zero high (GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3). Remove it once the installed `prisma` depends on mysql2 3.24 or later.

Re-check `prisma validate`, `prisma generate` and `prisma migrate status` whenever Prisma moves. Pin `prisma` and `@prisma/client` to exact versions: npm's `latest` tag for `prisma` can point at a release candidate.

Dependabot (`.github/dependabot.yml`) opens monthly grouped minor-and-patch PRs per package directory, separate PRs for majors, and digest refreshes for the Docker base images.

## API Docs

Swagger UI available at http://localhost:3001/api/docs when backend is running.

## Dev Server Management

Before invoking `./dev.sh`:

- Kill stale processes on the dev ports: `lsof -ti:3000,3001 | xargs kill -9 2>/dev/null`
- Verify Docker is running and the `postgres` container is up (`docker compose ps`)
- Verify `.env` exists in the repo root and `backend/.env` is present; copy from `.env.example` if missing

## Docker

Base images are pinned to immutable SHA256 digests in `backend/Dockerfile`, `frontend/Dockerfile`, and `docker-compose.yml`. The combined `tag@sha256:<digest>` form is used so the human-readable tag is preserved alongside the digest.

Every compose service has a healthcheck, and each one starts only after its dependency reports healthy (postgres, then backend, then frontend). The backend probe calls `GET /api/health`, which runs `SELECT 1` and answers 503 when the database is unreachable. The probes use `node -e "fetch(...)"` because the alpine images ship no curl. `docker compose ps` shows the health state.

Currently pinned (resolved 2026-10-02):

| Image | Tag | Digest |
|-------|-----|--------|
| node | 22-alpine | sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 |
| postgres | 16-alpine | sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea |

### Updating pinned image digests

Refresh the digests at minimum **quarterly**, or sooner whenever Dependabot / a security advisory flags a base image, or when picking up a CVE fix. Stay within the same major version (e.g. `node:22-alpine`, `postgres:16-alpine`) — do not silently bump majors when refreshing digests.

To resolve the current digest for a tag:

```bash
docker pull node:22-alpine
docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine

docker pull postgres:16-alpine
docker inspect --format='{{index .RepoDigests 0}}' postgres:16-alpine
```

Then update each occurrence:

- `backend/Dockerfile` — three `FROM node:22-alpine@sha256:...` stages
- `frontend/Dockerfile` — three `FROM node:22-alpine@sha256:...` stages
- `docker-compose.yml` — `image: postgres:16-alpine@sha256:...`
- `.github/workflows/ci.yml` — the `backend-db` job's `services.postgres.image`

After updating, verify:

```bash
docker compose config        # parses cleanly
docker compose build         # all services build
docker compose up -d postgres  # comes up healthy
```

Record the resolution date in the table above when you bump the digests.
