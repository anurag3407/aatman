#!/bin/sh
set -e

# Run migrations if DATABASE_URL is standard Postgres
if [ -n "$DATABASE_URL" ] && [ "${DATABASE_URL#pglite:}" = "$DATABASE_URL" ]; then
  echo "[startup] Applying database migrations to Postgres..."
  node scripts/migrate.mjs
  echo "[startup] Migrations complete."
fi

echo "[startup] Starting Aatman server on port ${PORT:-3000}..."
exec node server.js
