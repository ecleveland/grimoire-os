FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS shared-build
WORKDIR /app/shared
COPY shared/package.json shared/package-lock.json shared/tsconfig.json ./
COPY shared/src ./src
RUN npm ci && npm run build

FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS deps
WORKDIR /app
COPY --from=shared-build /app/shared ./shared
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
# Skip lifecycle scripts so shared's `prepare` (tsc) doesn't re-run here —
# dist is already built in the shared-build stage.
RUN npm ci --ignore-scripts

FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS build
WORKDIR /app
COPY --from=deps /app/shared ./shared
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS production
WORKDIR /app
RUN addgroup -g 1001 -S nestjs && adduser -S nestjs -u 1001
# Preserve the shared/ <-> backend/ layout so the @grimoire-os/shared symlink
# (node_modules/@grimoire-os/shared -> ../../shared) resolves at runtime.
COPY --from=build --chown=nestjs:nestjs /app/shared ./shared
WORKDIR /app/backend
COPY --from=build --chown=nestjs:nestjs /app/backend/dist ./dist
COPY --from=build --chown=nestjs:nestjs /app/backend/node_modules ./node_modules
COPY --from=build --chown=nestjs:nestjs /app/backend/package.json ./
COPY --from=build --chown=nestjs:nestjs /app/backend/prisma ./prisma
USER nestjs
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
