#!/usr/bin/env bash
# Start minimal demo environment (detached) and run health check
set -euo pipefail
export ACCESS_JWT_SECRET="demo-secret-long-and-secure-0123456789"
export OPENCLAW_EXECUTE="false"

echo "Starting access server..."
npm run start-access-server:detached
sleep 1

echo "Starting openclaw agent..."
npm run start-openclaw-agent:detached
sleep 1

echo "Starting watchtower (optional)..."
npm run start-watchtower:detached || true

echo "Demo startup triggered — run 'node ./scripts/launch-check.js' to verify services."