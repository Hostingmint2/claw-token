$ErrorActionPreference = 'Stop'
Write-Host 'Running pre-deploy security checks...'
node .\scripts\check-security.js

if (-not $env:DATABASE_URL) { Write-Host 'WARNING: DATABASE_URL not set — production requires Postgres for durability' }

Write-Host 'Bringing up production stack (docker-compose.prod.yml)...'
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

Write-Host 'Deployed. Run node ./scripts/launch-check.js and verify logs.'
Write-Host 'Post-deploy checklist:'
Write-Host ' - Ensure VAULT/KMS is configured and SIGNER_MODE=kms'
Write-Host ' - Rotate ACCESS_JWT_SECRET and provider secrets'
Write-Host ' - Configure firewall (allow only necessary ports)'
Write-Host 'Done.'