# GrimoireOS

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

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend**: NestJS 11, TypeScript, Swagger
- **Database**: MongoDB 7 (Dockerized), Mongoose 9
- **Auth**: JWT + Passport + bcryptjs
- **Containers**: Docker multi-stage builds (node:22-alpine)

## License

MIT
