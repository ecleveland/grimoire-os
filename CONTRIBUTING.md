# Contributing to GrimoireOS

## Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL)

## Local Development Setup

1. Clone the repo and install dependencies:

```bash
cd backend && npm install
cd ../frontend && npm install
```

2. Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Set at minimum:

| Variable | Required | Default |
|----------|----------|---------|
| JWT_SECRET | Yes | — |
| DATABASE_URL | No | postgresql://grimoire:grimoire@localhost:5432/grimoire_os |
| JWT_EXPIRES_IN | No | 24h |
| FRONTEND_URL | No | http://localhost:3000 |
| NEXT_PUBLIC_API_URL | No | http://localhost:3001/api |

3. Start everything with hot reload:

```bash
./dev.sh
```

This starts PostgreSQL in Docker, runs Prisma migrations, and launches:
- **Backend** at http://localhost:3001
- **Frontend** at http://localhost:3000

Stop servers with `./stop.sh` (leaves PostgreSQL running).

## Running Tests

```bash
cd backend && npm test      # Backend unit tests
cd frontend && npm test     # Frontend unit tests
```

## Database

```bash
cd backend
npx prisma migrate dev      # Run migrations
npx prisma studio           # Visual database browser
npm run seed                # Seed SRD reference data
```

## Coding Standards

- **TypeScript** everywhere — no `any` unless absolutely necessary
- **Prettier** for formatting: `cd backend && npm run format`
- **ESLint** for linting: `cd backend && npm run lint`
- All frontend pages use `'use client'` and [sonner](https://sonner.emilkowal.dev/) for toasts
- Indigo-600 as the primary UI color throughout the frontend
- All DTOs must have `@ApiProperty` / `@ApiPropertyOptional` decorators for Swagger documentation

## API Documentation

Swagger UI is available at http://localhost:3001/api/docs when the backend is running.

When adding or modifying DTOs, always include `@ApiProperty` or `@ApiPropertyOptional` decorators with meaningful examples and enum references where applicable.

## Pull Request Process

1. Create a feature branch from `main` (e.g., `veg-123-short-description`)
2. Make your changes and ensure all tests pass
3. Format your code with Prettier
4. Open a PR against `main` with a clear description of the changes

## Docker (Production)

```bash
JWT_SECRET=your-secret docker compose up --build
```
