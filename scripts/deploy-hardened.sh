#!/usr/bin/env bash
set -euo pipefail
# Hardened production deploy helper — runs security checks and starts docker stack

echo "Running pre-deploy security checks..."
node ./scripts/check-security.js || { echo "Security check failed — fix issues before deploying"; exit 1; }

# Ensure required envs are present (quick guard)
if [ -z "${DATABASE_URL:-}" ]; then
  echo "WARNING: DATABASE_URL not set — production requires Postgres for durability"
fi

echo "Bringing up production stack (docker-compose.prod.yml)..."
docker compose -f docker-compose.prod.yml pull || true
docker compose -f docker-compose.prod.yml up -d

echo "Deployed. Run 'node ./scripts/launch-check.js' and verify logs."

echo "Post-deploy checklist:"
echo " - Ensure VAULT/KMS is configured and SIGNER_MODE=kms"
echo " - Rotate ACCESS_JWT_SECRET and provider secrets"
echo " - Configure firewall (allow only necessary ports)"

echo "Done."