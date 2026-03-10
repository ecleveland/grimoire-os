#!/bin/bash

# Start PostgreSQL in Docker, then run backend and frontend with hot reload
set -e
trap 'kill 0' EXIT

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load .env from project root
set -a
source "$ROOT_DIR/.env"
set +a

echo "Starting PostgreSQL..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres

echo "Waiting for PostgreSQL to be healthy..."
until docker compose -f "$ROOT_DIR/docker-compose.yml" exec postgres pg_isready -U grimoire -d grimoire_os > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready."

echo "Running Prisma migrations..."
cd "$ROOT_DIR/backend" && npx prisma migrate dev --skip-generate

echo "Starting backend (port 3001)..."
cd "$ROOT_DIR/backend" && npm run start:dev &

echo "Starting frontend (port 3000)..."
cd "$ROOT_DIR/frontend" && npm run dev &

wait
