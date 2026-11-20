FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS shared-build
WORKDIR /app/shared
COPY shared/package.json shared/package-lock.json shared/tsconfig.json ./
COPY shared/src ./src
RUN npm ci && npm run build

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS deps
WORKDIR /app
COPY --from=shared-build /app/shared ./shared
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
# Skip lifecycle scripts so shared's `prepare` (tsc) doesn't re-run here —
# dist is already built in the shared-build stage.
RUN npm ci --ignore-scripts

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app
COPY --from=deps /app/shared ./shared
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

# The server's dependencies. prisma is an optional dependency, so --omit=optional
# leaves the Prisma CLI and everything only it needs out of the runtime image.
# npm ci reads shared/package.json to link @grimoire-os/shared, and shared has
# no runtime dependencies of its own.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS prod-deps
WORKDIR /app
COPY shared/package.json ./shared/
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev --omit=optional --ignore-scripts

# The image the compose migrate service runs. It keeps the Prisma CLI, which
# the runtime image leaves out, and applies pending migrations when it starts.
# Build it with --target migrate.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS migrate
RUN addgroup -g 1001 -S nestjs && adduser -S nestjs -u 1001 \
  && mkdir -p /app/shared /app/backend && chown -R nestjs:nestjs /app
# The CLI writes under node_modules/@prisma/engines when it runs, so nestjs
# installs the tree and owns it.
USER nestjs
WORKDIR /app
COPY --chown=nestjs:nestjs shared/package.json ./shared/
COPY --chown=nestjs:nestjs backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
# --ignore-scripts keeps the backend's postinstall (prisma generate) and
# shared's prepare from running. npm rebuild then runs only the engines
# package's postinstall, which downloads the schema engine for this platform
# into node_modules, so migrate deploy needs no network at run time. The
# download also leaves a copy in ~/.cache/prisma, which the image does not need.
RUN npm ci --omit=dev --ignore-scripts \
  && npm rebuild @prisma/engines \
  && npm cache clean --force \
  && rm -rf /home/nestjs/.cache/prisma
# prisma is an optional dependency, and npm only warns when an optional
# install fails. Without the local CLI, npx would fetch whatever version the
# registry tags latest and run it against the database, so the build stops
# here instead.
RUN test -x node_modules/.bin/prisma
# The engines postinstall exits 0 even when the download fails, so npm rebuild
# can succeed with no engine, and migrate deploy would then try the network.
# The build stops unless at least one schema engine binary is executable. The
# loop handles zero matches, where the glob stays literal and fails the test,
# and several matches.
RUN found=0; \
  for engine in node_modules/@prisma/engines/schema-engine-*; do \
    if [ -x "$engine" ]; then found=1; fi; \
  done; \
  test "$found" = 1
COPY --chown=nestjs:nestjs backend/prisma ./prisma
COPY --chown=nestjs:nestjs backend/prisma.config.ts ./
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# The server. It stays the last stage, so a plain docker build produces it.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS production
WORKDIR /app
# Production mode for Express. The auth cookies' Secure flag follows this unless
# COOKIE_SECURE overrides it (see .env.example).
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nestjs && adduser -S nestjs -u 1001
# Preserve the shared/ <-> backend/ layout so the @grimoire-os/shared symlink
# (node_modules/@grimoire-os/shared -> ../../shared) resolves at runtime.
COPY --from=shared-build --chown=nestjs:nestjs /app/shared/package.json ./shared/
COPY --from=shared-build --chown=nestjs:nestjs /app/shared/dist ./shared/dist
WORKDIR /app/backend
COPY --from=prod-deps --chown=nestjs:nestjs /app/backend/node_modules ./node_modules
COPY --from=build --chown=nestjs:nestjs /app/backend/dist ./dist
COPY --from=build --chown=nestjs:nestjs /app/backend/package.json ./
USER nestjs
EXPOSE 3001
# This image cannot migrate the database. The migrate target does that, and
# it must run first.
CMD ["node", "dist/main"]
