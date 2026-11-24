# GrimoireOS

A free, open-source D&D 5e campaign management tool. Self-hostable alternative to D&D Beyond.

## Quick Start

```bash
# Development (hot reload)
./dev.sh

# Production (Docker)
JWT_SECRET=your-secret POSTGRES_PASSWORD=your-db-password docker compose up --build
```

## Architecture

- **Backend**: NestJS 12 + PostgreSQL 16 (Prisma) — port 3001
- **Frontend**: Next.js 16 + React 19 + Tailwind v4 — port 3000
- **Auth**: JWT + Passport + bcryptjs, roles: player / dungeon_master / admin

### Prisma 7

- The CLI reads `backend/prisma.config.ts` for the schema path, migrations, seed command and `DATABASE_URL`. The schema's datasource has no `url`. The config loads `.env` through `dotenv` because the CLI no longer does.
- `prisma generate` writes the client to `backend/src/generated/prisma/`, which is gitignored and excluded from lint, Prettier and coverage. Import it by relative path (`../generated/prisma/client`), never from `@prisma/client`. `npm install` regenerates it through `postinstall`; after a schema change run `npx prisma generate` yourself, because `migrate dev` no longer does.
- `PrismaService` connects through the `@prisma/adapter-pg` driver adapter. The `pg` pool keeps pg's default size of 10. The service sets a 5 s `connectionTimeoutMillis`, which bounds both opening a connection and waiting for a free one, because pg waits forever by default. `onModuleInit` runs `SELECT 1`, because `$connect` alone succeeds with the database down. PrismaModule loads only `src/config/database.config.ts`, so it boots without `JWT_SECRET`. Constraint errors carry the violated index name under `meta.driverAdapterError.cause`, not `meta.target`; read them with `src/common/helpers/prisma-errors.ts`.
- `DATABASE_URL` parameters: pg ignores Prisma 6's `connection_limit`, `pool_timeout`, `schema`, `sslaccept` and `socket_timeout`. `sslmode=require` (and `prefer`) keeps its Prisma 6 meaning here, encrypted without chain verification, because `src/config/database.config.ts` translates it into pg's `ssl` option and removes it from the URL pg sees. Use `sslmode=verify-full` to ask for chain verification. pg would otherwise read `require` as full verification and reject a managed provider's private CA.
- `npm run test:db` runs Jest under `--experimental-vm-modules` because the generated client loads its query compiler with a dynamic `import()`.
- Every backend Jest script (`test`, `test:watch`, `test:cov`, `test:db`) runs under `node --experimental-vm-modules` because NestJS 12 ships ESM-only packages. Jest needs Node 24.9 or later for this, so run the backend suites on Node 24.
- `nest g` needs `-c ./node_modules/@nestjs/cli/node_modules/@nestjs/schematics` while TypeScript stays on 5.x, because @nestjs/schematics 12 peers on TypeScript 6 and so is installed only under the CLI. The flag goes away when TypeScript moves to 6 or 7.

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

Floors are set a few points below the live actuals (as of 2026-06-23, ~94.9/83.0/91.2/95.4% backend, ~93.3/87.0/91.3/95.1% frontend) — enough margin to avoid flaky failures while still catching regression.

**Ratchet up** as coverage improves: bump the relevant numbers in the corresponding config file once a new floor has been reliably maintained for at least one CI run. Never lower a threshold without a deliberate, documented reason.

**Green ≠ working for UI changes.** Passing unit tests have repeatedly shipped live crashes the suite never modelled — e.g. a null `spellSlots` render crash and layout/width regressions caught only by manual clicking. After the suite is green, manually exercise any UI-affecting change in the running app (`./dev.sh`): walk the real user path and hit the empty/null/error state, not just the happy structural assertion. Backfill a regression test for anything you find so the gap closes for next time.

## CI & pre-merge verification

GitHub Actions (`.github/workflows/ci.yml`, VEG-120) runs on every PR: backend lint + `test:cov` + `nest build`, frontend lint + typecheck + `test:cov` + `next build`, the SRD extraction-lib tests, the `backend-db` real-DB seed tests (VEG-484), and the Playwright E2E suite against a compose-provisioned Postgres. The Docker job builds the images and fails when the backend runtime image is more than 10 percent over `BACKEND_IMAGE_BASELINE_MB`, set in the job's `env`. It prints the migrate image's size without gating on it. The baseline is the size the job prints on the GitHub runner, 101 MB when it was set. Local Docker Desktop reports a larger `docker image inspect` size for the same image, 455 MB here, so update the baseline only from a passing run's printed value. It boots the compose stack with `docker compose up --wait`, checks that the `migrate` container exited 0 before the `seed` container started and that `seed` exited 0 before the backend container started, and prints the first seed's duration. It probes `/api/health` and `/login` on port 3000, so the API probes go through the frontend container's `/api` proxy, then checks that `/api/srd/spells`, `/api/srd/monsters` and `/api/srd/classes` are non-empty, that the `users` table has no `admin` row, and that an `admin` / `admin` login gets 401. Before the build it runs `scripts/compose-config.test.sh`, which renders the compose config from a temp env file and checks that it names no `localhost`, publishes only port 3000, takes CORS from `PUBLIC_URL`, refuses to render without `POSTGRES_PASSWORD`, and makes the backend wait for a `migrate` service that runs `./node_modules/.bin/prisma migrate deploy` once and a `seed` service that runs `node dist/seed/run-seed.js` from the backend image with `NODE_ENV=production` and no `JWT_SECRET`. `verify.sh` runs the same test. It then registers a user and checks that every login `Set-Cookie` carries `Secure` and that the backend log has a request line for the login and none for `/api/health`. It runs the seed a second time with `docker compose run --rm seed` and checks that the SRD row counts and the backend container's start time stay the same. It recreates only the backend with `COOKIE_SECURE=false`, checks that no cookie carries `Secure`, then tears down (VEG-687, VEG-694). It runs on every push to `main` and on PRs that touch the Dockerfiles, `docker-compose.yml`, `docker-compose.dev.yml`, the compose config test, either package's `tsconfig*.json` or `package.json`, `backend/package-lock.json`, anything under `backend/prisma/`, `frontend/next.config.ts`, `frontend/src/middleware.ts`, `frontend/src/lib/api-base.ts`, `backend/prisma.config.ts` (the image ships it and the `migrate` service loads it), the cookie, trust proxy and logging config files, `auth.controller.ts`, the auth DTOs, `backend/src/bootstrap-config.ts`, `backend/src/main.ts`, anything under `backend/src/seed/` or `docs/extracted-srd-json/` (the `seed` service runs them), `.dockerignore` (it decides whether the SRD JSON reaches the image), or the workflow itself (VEG-570).

Run `./verify.sh` from the repo root before pushing — it mirrors the CI jobs locally (lint, unit tests with coverage thresholds, and the same production builds that `docker compose build` runs inside each image), minus E2E and the real-DB seed tests (both need a live Postgres). The production builds catch type errors the dev servers (Next.js dev, `nest start --watch`) silently let through.

In `frontend/`, `npm run typecheck` type-checks the spec files too. Vitest strips types without checking them, and the production build excludes specs through `tsconfig.build.json`, so this is the only step that catches a stale test fixture. It runs against `tsconfig.typecheck.json`, which leaves out the generated `.next/types` files: they go stale between a page rename and the next build, and `next build` checks them anyway.

**Real-DB tests (`backend/test/db/`, VEG-484).** The default backend Jest suite runs without Postgres and can only mock Prisma, so seed/DB-round-trip properties (id stability across re-seed, child FK survival, edit propagation) live in a separate `*.db-spec.ts` suite run by `npm run test:db` against a disposable `grimoire_os_seedtest` database (auto-created + migrated by the jest `globalSetup`). It's isolated from the coverage-gated unit run (outside `src/`, non-matching suffix, own jest config) and runs as the dedicated `backend-db` CI job. `db-harness.ts` (`createSeedContext`/`truncateAll`) is the reusable seam for future real-DB regression tests. A destructive-op guard refuses any database whose name doesn't contain `test`.

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| JWT_SECRET | Yes | — |
| POSTGRES_PASSWORD | Yes, for compose and `dev.sh` | None. `.env.example` sets the dev value `grimoire` |
| POSTGRES_USER | No | grimoire |
| POSTGRES_DB | No | grimoire_os |
| PUBLIC_URL | No | http://localhost:3000. Compose uses it as the backend's `FRONTEND_URL` |
| FRONTEND_BIND | No | 127.0.0.1. The host address compose publishes port 3000 on. `0.0.0.0` opens it to the network |
| TRUST_PROXY | No | Unset means 0. Compose sets 1 |
| DATABASE_URL | No | postgresql://grimoire:grimoire@localhost:5432/grimoire_os |
| JWT_EXPIRES_IN | No | 24h |
| COOKIE_SECURE | No | Unset means Secure when NODE_ENV=production. Set `false` for plain HTTP |
| LOG_LEVEL | No | log. One of error, warn, log, debug, verbose. warn hides the request lines |
| LOG_FORMAT | No | text. `json` prints one JSON object per line |
| FRONTEND_URL | No | http://localhost:3000 |
| NEXT_PUBLIC_API_URL | No | The relative `/api`. `.env.example` sets http://localhost:3001/api for dev |
| INTERNAL_API_URL | No | An absolute NEXT_PUBLIC_API_URL, else http://localhost:3001/api |
| CACHE_TTL_MS | No | 86400000 (24h) |
| CACHE_LRU_SIZE | No | 1000 |

The browser calls the API at `NEXT_PUBLIC_API_URL`, which defaults to the relative `/api`. `frontend/src/middleware.ts` proxies `/api/*` to `INTERNAL_API_URL`, which it reads on every request, so the Docker stack needs one public port and one origin. The proxy lives in middleware because `next build` resolves `rewrites()` in `next.config.ts` once and writes it into the image. `INTERNAL_API_URL` is also the base for SSR data fetches (the SRD reference pages render as server components). In Docker it is `http://backend:3001/api`. Locally it is unset, and `frontend/src/lib/api-base.ts` falls back to an absolute `NEXT_PUBLIC_API_URL`, then to `http://localhost:3001/api`. `dev.sh` keeps `NEXT_PUBLIC_API_URL=http://localhost:3001/api` from `.env`, so in dev the browser calls the backend directly.

Compose never reads `DATABASE_URL`, `FRONTEND_URL` or `NEXT_PUBLIC_API_URL`, because the root `.env` sets them to localhost values for `dev.sh` and compose reads that file too. It builds the backend's database URL from the `POSTGRES_*` values and its CORS origin from `PUBLIC_URL`. The backend honors `TRUST_PROXY` (`backend/src/config/trust-proxy.config.ts`), a hop count for Express's `trust proxy`, so `req.ip` and the rate limiter see the client address behind the frontend proxy. Next sets `X-Forwarded-For` to the connecting address only when the request has none, and its rewrite proxy passes an existing header on unchanged, so a client that reaches port 3000 directly can forge it. A bad value stops the boot.

`CACHE_TTL_MS` / `CACHE_LRU_SIZE` tune the global in-memory response cache (`backend/src/config/cache.config.ts`, VEG-340). The cache is LRU-bounded so high-cardinality anonymous traffic (e.g. `/srd/search?q=<unique>`) can't accrete unbounded 24h entries and OOM a small self-host; raise `CACHE_LRU_SIZE` on instances with more heap, or lower `CACHE_TTL_MS` for a shorter staleness window.

## Dependency overrides

`backend/package.json` overrides two transitive dependencies of the Prisma CLI. They count toward `npm audit --omit=dev` because `prisma` is an optional dependency, which that audit includes, and the overrides keep the CLI's share of it at zero high.

- `deepmerge-ts` to `^8.0.2`. Prisma 7.10 still pins `@prisma/config` to `deepmerge-ts@7.1.5`, which carries a high-severity stack-exhaustion advisory (GHSA-ggr8-5vv4-36mx) in config loading. Remove the override once the installed Prisma depends on deepmerge-ts 8 or later; the advisory's fixed range begins at Prisma 8.1.
- `mysql2` to `^3.24.5`. The Prisma CLI pins `mysql2@3.15.3` for MySQL introspection, this project never opens a MySQL connection, and the override exists only to keep `npm audit --omit=dev` at zero high (GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3). Remove it once the installed `prisma` depends on mysql2 3.24 or later.

Re-check `prisma validate`, `prisma generate` and `prisma migrate status` whenever Prisma moves. Pin `prisma` and `@prisma/client` to exact versions. npm's `latest` tag for `prisma` can point at a release candidate.

Dependabot (`.github/dependabot.yml`) opens monthly grouped minor-and-patch PRs per package directory, separate PRs for majors, and digest refreshes for the Docker base images.

## API Docs

Swagger UI available at http://localhost:3001/api/docs when backend is running.

## Dev Server Management

Before invoking `./dev.sh`:

- No kill step is needed. `dev.sh` reaps leftover `dev.sh` process trees before it starts, and `./stop.sh` stops a running stack.
- Verify Docker is running and the `postgres` container is up (`docker compose ps`)
- Verify `.env` exists in the repo root; copy from `.env.example` if missing. `dev.sh` exports that file. `backend/.env` is optional and is read only by standalone runs from `backend/` (the Prisma CLI, the NPC backfill).

## Docker

Base images are pinned to immutable SHA256 digests in `backend/Dockerfile`, `frontend/Dockerfile`, and `docker-compose.yml`. The combined `tag@sha256:<digest>` form is used so the human-readable tag is preserved alongside the digest.

Production compose publishes only the frontend's port 3000, on `${FRONTEND_BIND:-127.0.0.1}`. The loopback default leaves a reverse proxy on the same host as the only way in, because with `TRUST_PROXY=1` a client that reaches port 3000 directly can forge `X-Forwarded-For` and get a fresh rate-limit key on every request. The docker CI job probes `http://127.0.0.1:3000`, because an IPv6-first resolver could send `localhost` to `::1` and miss the IPv4 binding. `docker-compose.dev.yml` publishes Postgres on 5432 for runs that keep the backend on the host. `dev.sh`, `dev-e2e.sh` and the CI e2e job add it to their `up -d postgres` call. Compose fails fast without `POSTGRES_PASSWORD`, on every subcommand, `exec` and `down` included.

`backend/Dockerfile` builds two images (VEG-694). The last stage, `production`, is the server, and a plain `docker build` or the compose `backend` service produces it. Its `node_modules` comes from `prod-deps`, which runs `npm ci --omit=dev --omit=optional`. `prisma` is the backend's only optional dependency, so that install leaves out the Prisma CLI and everything only the CLI needs, and the server image cannot run migrations. The `migrate` target runs `npm ci --omit=dev`, keeps the CLI, `prisma/` and `prisma.config.ts`, and is what the compose `migrate` service builds. Keep `prisma` in `optionalDependencies`, because moving it to `dependencies` puts the CLI back into the server image. The CI size step catches that. The server image also carries `docs/extracted-srd-json` at `/app/docs/extracted-srd-json`, where the compiled seed's loader looks, about 2 MB. The root `.dockerignore` excludes `docs` and re-includes only that directory.

Compose starts postgres first. The one-shot `migrate` service runs `./node_modules/.bin/prisma migrate deploy` from the migrate image once postgres reports healthy, then exits. The one-shot `seed` service then runs `node dist/seed/run-seed.js` from the backend's server image once `migrate` exits 0, loads the SRD reference data and exits. It runs on every `up` and updates SRD rows in place. It gets `NODE_ENV=production`, so it never creates the dev `admin` user, and no `JWT_SECRET`, because `SeedModule` loads only the database config. The backend starts only after `migrate` and `seed` exit 0 (`service_completed_successfully`), and the frontend only after the backend reports healthy. A failed migration stops the stack with Prisma's error in `docker compose logs migrate`, a failed seed with its error in `docker compose logs seed`, and nothing restarts. The backend image itself no longer migrates on boot. Every long-running service has a healthcheck, and `migrate` and `seed` have none. The backend probe calls `GET /api/health`, which runs `SELECT 1` and answers 503 when the database is unreachable. The probes use `node -e "fetch(...)"` because the alpine images ship no curl. `docker compose ps` shows the health state.

Currently pinned:

| Image | Tag | Digest | Resolved |
|-------|-----|--------|----------|
| node | 24-alpine | sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 | 2026-10-09 |
| postgres | 16-alpine | sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea | 2026-10-02 |

### Updating pinned image digests

Refresh the digests at minimum **quarterly**, or sooner whenever Dependabot / a security advisory flags a base image, or when picking up a CVE fix. Stay within the same major version (e.g. `node:24-alpine`, `postgres:16-alpine`). Do not silently bump majors when refreshing digests.

To resolve the current digest for a tag:

```bash
docker pull node:24-alpine
docker inspect --format='{{index .RepoDigests 0}}' node:24-alpine

docker pull postgres:16-alpine
docker inspect --format='{{index .RepoDigests 0}}' postgres:16-alpine
```

Then update each occurrence:

- `backend/Dockerfile`, six `FROM node:24-alpine@sha256:...` stages
- `frontend/Dockerfile`, four `FROM node:24-alpine@sha256:...` stages
- `docker-compose.yml` — `image: postgres:16-alpine@sha256:...`
- `.github/workflows/ci.yml` — the `backend-db` job's `services.postgres.image`

After updating, verify:

```bash
docker compose config        # parses cleanly
docker compose build         # all services build
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres  # comes up healthy
```

Record the resolution date in the table above for each image you bump.
