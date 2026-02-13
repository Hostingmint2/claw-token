$env:ACCESS_JWT_SECRET = 'demo-secret-long-and-secure-0123456789'
$env:OPENCLAW_EXECUTE = 'false'

Write-Host 'Starting access server (detached)'
npm run start-access-server:detached
Start-Sleep -Seconds 1

Write-Host 'Starting openclaw agent (detached)'
npm run start-openclaw-agent:detached
Start-Sleep -Seconds 1

Write-Host 'Starting watchtower (detached)'
npm run start-watchtower:detached -ErrorAction SilentlyContinue

Write-Host "Demo startup triggered — run 'node ./scripts/launch-check.js' to verify services."