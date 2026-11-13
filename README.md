# GrimoireOS

[![CI](https://github.com/ecleveland/grimoire-os/actions/workflows/ci.yml/badge.svg)](https://github.com/ecleveland/grimoire-os/actions/workflows/ci.yml)

Free, open-source D&D 5e campaign management. Self-hostable alternative to D&D Beyond.

## Features

- Character sheets with full 5e stats
- Campaign management with invite codes
- Session notes with visibility controls (private/party/DM-only)
- Encounter builder and initiative tracker
- SRD reference data (spells, monsters, items, classes, races)
- Role-based access (player, dungeon master, admin)

## Quick Start

### Development

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET
./dev.sh
```

### Production

```bash
JWT_SECRET=your-secret docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- Swagger docs: http://localhost:3001/api/docs

The backend image runs with `NODE_ENV=production`, so its auth cookies carry the `Secure` flag and browsers send them only over HTTPS. To serve over plain HTTP on a trusted network, set `COOKIE_SECURE=false` in `.env` or the environment. The backend logs the cookie mode at startup. An existing install that serves over plain HTTP needs `COOKIE_SECURE=false` after upgrading, or login stops working. Safari has not always accepted Secure cookies on `http://localhost`, so set it there too if login fails.

| Variable | Values | Default |
|----------|--------|---------|
| COOKIE_SECURE | `true`, `false` or unset | unset: Secure when `NODE_ENV=production` |

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend**: NestJS 11, TypeScript, Swagger
- **Database**: PostgreSQL 16 (Dockerized), Prisma 7 with the `pg` driver adapter
- **Auth**: JWT + Passport + bcryptjs
- **Containers**: Docker multi-stage builds (node:22-alpine)

## License

MIT
