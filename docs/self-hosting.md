# Self-hosting GrimoireOS

This guide takes a GrimoireOS install from a fresh server to a running stack behind HTTPS, with nightly backups and a tested way back from a lost volume. The [README's Production section](../README.md#production) explains ports, `PUBLIC_URL`, `FRONTEND_BIND` and `TRUST_PROXY` in detail. This guide links to it instead of repeating it.

## Requirements

- Docker Engine with Docker Compose 2.17.0 or later. The newest flag this guide and the scripts use is `up --wait-timeout`, which `scripts/restore.sh` passes and which Compose added in 2.17.0. `pull --ignore-buildable` arrived in 2.15.0, `up --wait` in 2.1.1, and `up --wait` has handled one-shot services such as `migrate` and `seed` since 2.7.0. The stack is tested with Compose 5.5.1, and older releases are untested. Check yours with `docker compose version`.
- Git, to clone the repo and pull upgrades.
- One hostname that points at the server, for example `grimoire.example.com`, and a reverse proxy that serves it over HTTPS. Without one, see [Plain HTTP](#plain-http).
- Three values in a `.env` file in the repo root:

```bash
PUBLIC_URL=https://grimoire.example.com
JWT_SECRET=output-of-openssl-rand-hex-32
POSTGRES_PASSWORD=another-output-of-openssl-rand-hex-32
```

Generate each secret with `openssl rand -hex 32`. Keep `POSTGRES_PASSWORD` URL-safe, for the reason the [README](../README.md#production) gives. Compose refuses every command, `exec` and `down` included, until `POSTGRES_PASSWORD` has a value, so run every command in this guide from the repo root, where compose reads `.env`.

## First run

```bash
git clone https://github.com/ecleveland/grimoire-os.git
cd grimoire-os
# Write .env as shown above
docker compose up -d --build
docker compose ps
```

Compose starts five services in order:

1. `postgres` holds every campaign, character and account.
2. `migrate` applies the database migrations once and exits.
3. `seed` loads the SRD reference data, the spells, monsters, items and classes, once and exits.
4. `backend` starts after both exit 0.
5. `frontend` starts after the backend reports healthy, and publishes port 3000 on 127.0.0.1.

`docker compose ps` shows `migrate` and `seed` as exited and the other three as healthy. When `migrate` or `seed` fails, the backend never starts, and `docker compose logs migrate` or `docker compose logs seed` shows the error.

### The first admin account

The app has no setup screen. Registration creates a `player` account, and the production seed creates no admin. To make yourself admin:

1. Open the site and register an account.
2. Promote it in the database, with your username in place of `yourname`:

   ```bash
   docker compose exec postgres psql -U grimoire -d grimoire_os -c "UPDATE users SET role='admin' WHERE username='yourname'"
   ```

   psql prints `UPDATE 1`. Use your own `POSTGRES_USER` and `POSTGRES_DB` if you changed them from `grimoire` and `grimoire_os`.
3. Reload the page. The backend reads the role from the database on every request, so the admin pages work at once, and the reload makes the app show them.

## Reverse proxy

Point the proxy at the frontend on `http://127.0.0.1:3000` and nothing else. The browser calls the API on the same origin under `/api`, and the frontend container forwards those calls to the backend. The backend publishes no port, so there is nothing else to proxy to.

Forward every path, `/api` included. The app calls `/api` on the origin it was loaded from, and the backend sets the session and CSRF cookies on that origin through the frontend's proxy. Nothing but the frontend answers `/api`, so a proxy that routes it anywhere else breaks login and every API call. Set `PUBLIC_URL` to the HTTPS address, because the backend takes its CORS origin from it.

The proxy must also pass the client's address as the last entry of `X-Forwarded-For`, because the backend keys its login rate limits on that entry. The [README](../README.md#production) explains why the last entry matters.

### Caddy

Caddy gets and renews a certificate by itself. This Caddyfile is the whole config:

```
grimoire.example.com
reverse_proxy 127.0.0.1:3000
```

Caddy trusts no upstream proxy by default, so it replaces any `X-Forwarded-For` a client sends with the client's address. It sets `X-Forwarded-Proto` and passes `Host` through unchanged.

### nginx

```nginx
server {
    listen 443 ssl;
    server_name grimoire.example.com;

    ssl_certificate     /etc/letsencrypt/live/grimoire.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grimoire.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Replace the header with the client address, so its last entry is
        # the address the backend rate-limits on.
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

Get the certificate with certbot or your usual tool, and add a port 80 server block that redirects to HTTPS if you want one.

## Plain HTTP

The backend image runs with `NODE_ENV=production`, so its cookies carry the `Secure` flag, and browsers send them only over HTTPS or to `localhost`. On a trusted home network with no TLS, set these in `.env`:

```bash
PUBLIC_URL=http://192.168.1.20:3000
FRONTEND_BIND=0.0.0.0
COOKIE_SECURE=false
```

Then run `docker compose up -d`. Passwords and session cookies then cross the network unencrypted, so anyone on that network can read them. Never do this on a network you do not control. The [README](../README.md#production) covers `COOKIE_SECURE` and `FRONTEND_BIND` in full.

## Your data

Every campaign, character and account lives in one Docker volume, `postgres_data`. Compose prefixes it with the project name, which defaults to the name of the repo's directory, so a clone in `grimoire-os` stores it in `grimoire-os_postgres_data`. `docker volume ls` lists it.

`docker compose down -v` deletes that volume, and with it every campaign, character and account. Nothing asks first and nothing can bring it back except a backup. `docker compose down` without `-v` removes the containers and keeps the volume, and the next `up` finds your data where it was.

### Backup

```bash
scripts/backup.sh
```

The script runs `pg_dump` inside the `postgres` container and writes `backups/grimoire-os-YYYYMMDD-HHMMSS.dump` in the repo root, readable by your user only, because it holds password hashes. Pass a directory to write somewhere else, for example `scripts/backup.sh /srv/backups`. It writes the file only when the dump succeeds, so a failed run leaves no file that looks like a backup. It exits non-zero when the `postgres` container is not running.

The dump takes every table. Only the user tables matter, the accounts, campaigns, characters and homebrew, because the `seed` service rebuilds the SRD rows on every `up`. Dumping everything is simpler and costs a few hundred kilobytes.

### Restore

```bash
scripts/restore.sh backups/grimoire-os-20261125-030000.dump
```

The script names the database it is about to replace and asks you to type that name. Pass `--yes` to skip the question, which a script or cron job needs, because without a terminal and without `--yes` the script refuses and changes nothing.

It then:

1. Starts `postgres` if it is not running, and checks that `pg_restore` can read the dump.
2. Stops the backend.
3. Restores the dump into a scratch database, `grimoire_os_restore`.
4. Only when that restore succeeds, drops the live database, closing any session still connected to it, and renames the scratch database into its place.
5. Runs `docker compose up -d --wait`, which applies any migration newer than the dump, runs the seed and starts the backend. It waits up to 300 seconds for every service to report healthy, the same limit CI uses for a first boot.

A truncated or corrupt dump fails at step 3. The script then drops the scratch database, starts the stack again and says the live data was not changed. If the rename in step 4 fails, the restored data is in `grimoire_os_restore`, and the script says so.

Restore works on an empty volume too. After `docker compose down -v`, `scripts/restore.sh` creates the volume, restores into it and starts the stack.

### Nightly backups

This crontab line takes a backup at 03:00 every night and deletes dumps older than 14 days. Put it in the crontab of a user who can run `docker`, and change `/srv/grimoire-os` to your clone's path. The `mkdir` comes first because the shell opens the log file before the script runs and would fail on a fresh install with no `backups/` yet:

```cron
0 3 * * * cd /srv/grimoire-os && mkdir -p backups && scripts/backup.sh >> backups/backup.log 2>&1 && find backups -name 'grimoire-os-*.dump' -mtime +14 -delete
```

A dump on the same disk as the volume dies with that disk. Copy the dumps to another machine or to object storage, with `rsync`, `rclone` or your host's backup service.

### The development database

The same scripts work against the Postgres container that `dev.sh` starts, because both use the default compose project in the repo root. `scripts/backup.sh` needs nothing more. A restore ends with `docker compose up -d --wait`, which builds the production images if they are missing and briefly starts the production `migrate`, `seed`, `backend` and `frontend` containers. That frontend takes port 3000, so stop the dev servers first. Keep the dev override in `COMPOSE_FILE` so Postgres keeps port 5432 published and is not recreated, then stop the production containers before you run `dev.sh` again:

```bash
./stop.sh
COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml scripts/restore.sh backups/grimoire-os-20261125-030000.dump
docker compose stop frontend backend
./dev.sh
```

Postgres keeps running through the whole sequence. The production seed updates the SRD rows in place and leaves your dev accounts and content alone.

## Upgrade

```bash
scripts/backup.sh
git pull
docker compose pull --ignore-buildable
docker compose up -d --build
```

`pull --ignore-buildable` fetches the Postgres image the new `docker-compose.yml` pins and skips the images the stack builds itself. `up --build` rebuilds the backend and frontend images, restarts Postgres if its image changed, and runs `migrate`, which applies any new migrations before the backend starts.

When `migrate` fails, the backend does not start:

1. Read the error with `docker compose logs migrate`.
2. Check out the version you ran before, for example `git checkout <previous-commit>`, and rebuild its images with `docker compose build`.
3. Restore the backup you took before the upgrade with `scripts/restore.sh`. Its last step starts the previous version on the restored data.
4. Open an issue with the `migrate` log.

Never restore a dump taken on a newer version than the code that is running. `migrate` cannot undo a migration, and the older backend expects tables and columns that the newer migrations changed.

## Small hosts

The stack runs on a small VPS. Three settings bound its memory and connections:

- `CACHE_LRU_SIZE`, default 1000, caps the number of responses the backend keeps in its in-memory cache. Lower it on a host with little RAM.
- `CACHE_TTL_MS`, default 86400000, which is 24 hours, is how long a cached response lives. A shorter one frees memory sooner.
- The backend opens at most 10 Postgres connections, the default pool size of the `pg` driver, and waits up to 5 seconds for a free one. No setting changes the pool size.

Set the two cache values in `.env`, for example:

```bash
CACHE_LRU_SIZE=250
CACHE_TTL_MS=3600000
```

Then run `docker compose up -d`, which recreates the backend with them.
