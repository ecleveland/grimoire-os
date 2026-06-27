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

## Key Commands

```bash
# Backend
cd backend && npm run start:dev   # Dev server
cd backend && npm test            # Unit tests
cd backend && npm run test:cov    # Unit tests + coverage (enforces thresholds)
cd backend && npm run seed        # Seed SRD data

# Frontend
cd frontend && npm run dev        # Dev server
cd frontend && npm test           # Unit tests
cd frontend && npm run test:cov   # Unit tests + coverage (enforces thresholds)
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

GitHub Actions (`.github/workflows/ci.yml`, VEG-120) runs on every PR: backend lint + `test:cov` + `nest build`, frontend lint + `test:cov` + `next build`, the SRD extraction-lib tests, and the Playwright E2E suite against a compose-provisioned Postgres. Docker images are built on pushes to `main`.

Run `./verify.sh` from the repo root before pushing — it mirrors the CI jobs locally (lint, unit tests with coverage thresholds, and the same production builds that `docker compose build` runs inside each image), minus E2E. The production builds catch type errors the dev servers (Next.js dev, `nest start --watch`) silently let through.

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

## API Docs

Swagger UI available at http://localhost:3001/api/docs when backend is running.

## Dev Server Management

Before invoking `./dev.sh`:

- Kill stale processes on the dev ports: `lsof -ti:3000,3001 | xargs kill -9 2>/dev/null`
- Verify Docker is running and the `postgres` container is up (`docker compose ps`)
- Verify `.env` exists in the repo root and `backend/.env` is present; copy from `.env.example` if missing

## Docker

Base images are pinned to immutable SHA256 digests in `backend/Dockerfile`, `frontend/Dockerfile`, and `docker-compose.yml`. The combined `tag@sha256:<digest>` form is used so the human-readable tag is preserved alongside the digest.

Currently pinned (resolved 2026-05-08):

| Image | Tag | Digest |
|-------|-----|--------|
| node | 22-alpine | sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f |
| postgres | 16-alpine | sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50 |

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

After updating, verify:

```bash
docker compose config        # parses cleanly
docker compose build         # all services build
docker compose up -d postgres  # comes up healthy
```

Record the resolution date in the table above when you bump the digests.
