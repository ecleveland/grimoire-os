FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS shared-build
WORKDIR /app/shared
COPY shared/package.json shared/package-lock.json shared/tsconfig.json ./
COPY shared/src ./src
RUN npm ci && npm run build

FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=shared-build /app/shared ./shared
COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /app/frontend
# Skip lifecycle scripts so shared's `prepare` (tsc) doesn't re-run here —
# dist is already built in the shared-build stage.
RUN npm ci --ignore-scripts

FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS build
WORKDIR /app
COPY --from=deps /app/shared ./shared
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY frontend ./frontend
WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS production
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# With outputFileTracingRoot set to the repo root, Next.js emits the standalone
# bundle mirroring that layout: .next/standalone/{frontend,shared,node_modules}.
COPY --from=build --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/public ./frontend/public
COPY --from=build --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
WORKDIR /app/frontend
CMD ["node", "server.js"]
