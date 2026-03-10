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
