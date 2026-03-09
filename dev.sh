#!/bin/bash

# Start MongoDB in Docker, then run backend and frontend with hot reload
trap 'kill 0' EXIT

echo "Starting MongoDB..."
docker compose up -d mongo

echo "Waiting for MongoDB to be healthy..."
until docker compose exec mongo mongosh --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; do
  sleep 1
done
echo "MongoDB is ready."

echo "Starting backend (port 3001)..."
cd backend && npm run start:dev &

echo "Starting frontend (port 3000)..."
cd frontend && npm run dev &

wait
