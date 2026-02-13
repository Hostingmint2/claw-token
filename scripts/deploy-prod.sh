#!/usr/bin/env bash
set -euo pipefail

# Example deploy script (VPS + Docker Compose)
# Ensure you have Docker and docker-compose installed.
# Set env variables (DATABASE_URL, VAULT_URL, VAULT_KEY_ID, ACCESS_JWT_SECRET, DOMAIN, etc.) before running.

docker compose -f docker-compose.prod.yml pull || true
docker compose -f docker-compose.prod.yml up -d

# Run DB migration and import offers if needed
if [ -n "${DATABASE_URL:-}" ]; then
  echo "Running Postgres smoke test..."
  node ./scripts/smoke-postgres.js
  echo "If you're migrating offers from file, run: npm run migrate-offers with DATABASE_URL set"
fi

echo "Services started. Configure DNS for your domain and ensure Caddy has a valid Caddyfile."
