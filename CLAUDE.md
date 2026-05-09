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
cd backend && npm run seed        # Seed SRD data

# Frontend
cd frontend && npm run dev        # Dev server
cd frontend && npm test           # Unit tests
```

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| JWT_SECRET | Yes | — |
| DATABASE_URL | No | postgresql://grimoire:grimoire@localhost:5432/grimoire_os |
| JWT_EXPIRES_IN | No | 24h |
| FRONTEND_URL | No | http://localhost:3000 |
| NEXT_PUBLIC_API_URL | No | http://localhost:3001/api |

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
