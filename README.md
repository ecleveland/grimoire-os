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
JWT_SECRET=your-secret POSTGRES_PASSWORD=your-db-password docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3000/api
- Swagger docs: http://localhost:3000/api/docs

These addresses work on the host itself. Port 3000 listens on 127.0.0.1 by default, so reaching the app from another machine needs a reverse proxy on the same host or `FRONTEND_BIND=0.0.0.0`.

The stack publishes only port 3000. The browser calls `/api` on that port, and the frontend container proxies those calls to the backend on the compose network. Postgres and the backend publish no host ports. Put the three required values in `.env` to run the stack on another host, and set `PUBLIC_URL` to the address users open:

```bash
PUBLIC_URL=https://grimoire.example.com
JWT_SECRET=your-secret
POSTGRES_PASSWORD=your-db-password
```

`PUBLIC_URL` sets the backend's CORS origin. `POSTGRES_PASSWORD` has no default, and compose refuses to start without it. Keep it URL-safe, because compose places it inside the backend's database URL. Generate one with `openssl rand -hex 32`. Base64 output can contain `/`, which breaks the database URL and stops the backend from booting. `POSTGRES_USER` and `POSTGRES_DB` default to `grimoire` and `grimoire_os`.

Port 3000 listens on 127.0.0.1 by default, and a reverse proxy on the same host is the way in. Point it at `http://127.0.0.1:3000` and have it add the client address to the end of `X-Forwarded-For` or replace the header with it. The backend trusts one proxy hop (`TRUST_PROXY=1`) and keys its rate limits on the last entry of that header, which the frontend passes on unchanged. When a request arrives without the header, the frontend fills it in with the address its connection came from. That is the client's own address only when Docker passes the source address through to the container.

`FRONTEND_BIND=0.0.0.0` opens port 3000 to the network, which suits a trusted home LAN with no reverse proxy. On an untrusted network, keep the default. A client that reaches port 3000 directly can forge `X-Forwarded-For` and get a fresh rate-limit key on every request.

#### Upgrading an existing install

Postgres applies `POSTGRES_PASSWORD` only when it first creates the `postgres_data` volume. A volume created before this setting existed has the password `grimoire`, and any other value makes the backend fail database auth and never turn healthy. Either set `POSTGRES_PASSWORD=grimoire` to match the existing volume, or change the role's password first, with the stack still running:

```bash
POSTGRES_PASSWORD=grimoire docker compose exec postgres psql -U grimoire -d grimoire_os -c "ALTER USER grimoire PASSWORD 'your-db-password'"
```

Then set `POSTGRES_PASSWORD=your-db-password` in `.env` and run `docker compose up -d`. The `POSTGRES_PASSWORD=grimoire` prefix is there because compose refuses to run any command, `exec` included, until the variable has a value.

The backend image runs with `NODE_ENV=production`, so its auth cookies carry the `Secure` flag and browsers send them only over HTTPS or to `localhost`. To serve over plain HTTP from another address on a trusted network, set `COOKIE_SECURE=false` in `.env` or the environment. The backend logs the cookie mode at startup. An existing install that serves over plain HTTP needs `COOKIE_SECURE=false` after upgrading, or login stops working. Safari has not always accepted Secure cookies on `http://localhost`, so set it there too if login fails.

| Variable | Values | Default |
|----------|--------|---------|
| PUBLIC_URL | The URL users open | http://localhost:3000 |
| FRONTEND_BIND | Host address port 3000 listens on | `127.0.0.1`. `0.0.0.0` opens it to the network |
| POSTGRES_PASSWORD | A URL-safe password | None, required |
| TRUST_PROXY | Proxy hop count. Under compose, `0` puts every client in one rate-limit bucket | `1` in compose, `0` elsewhere |
| COOKIE_SECURE | `true`, `false` or unset | Unset means Secure when `NODE_ENV=production` |

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend**: NestJS 11, TypeScript, Swagger
- **Database**: PostgreSQL 16 (Dockerized), Prisma 7 with the `pg` driver adapter
- **Auth**: JWT + Passport + bcryptjs
- **Containers**: Docker multi-stage builds (node:22-alpine)

## License

MIT
