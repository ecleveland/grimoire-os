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

## Testing & Coverage Thresholds

Both projects enforce minimum coverage thresholds via their respective test runners. `test:cov` (backend Jest, frontend Vitest) will exit non-zero if any metric drops below the configured floor.

| Project | Statements | Branches | Functions | Lines | Configured in |
|---------|------------|----------|-----------|-------|---------------|
| Backend (Jest) | 85% | 70% | 75% | 85% | `backend/package.json` (`jest.coverageThreshold.global`) |
| Frontend (Vitest) | 47% | 52% | 41% | 48% | `frontend/vitest.config.ts` (`test.coverage.thresholds`) |

Backend thresholds match the targets agreed in VEG-204; current actual coverage exceeds them comfortably. Frontend thresholds were set ~1-2 points below the actual baseline (current: ~48.6/53.4/42.3/49.5%) to avoid flaky failures while still preventing regression.

**Ratchet up** as coverage improves: bump the relevant numbers in the corresponding config file once a new floor has been reliably maintained for at least one CI run. Never lower a threshold without a deliberate, documented reason.

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
