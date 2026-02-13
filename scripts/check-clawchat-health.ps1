param(
  [int]$Port = 8791,
  [string]$ServiceName = 'ClawChat'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path "$root\.." | Select-Object -ExpandProperty Path
$logDir = Join-Path $repo 'tmp\logs'
$watchdogLog = Join-Path $logDir 'watchdog.log'

function Log($txt) {
  $ts = (Get-Date).ToString('s')
  "$ts - $txt" | Out-File -FilePath $watchdogLog -Append -Encoding utf8
}

$healthUrl = "http://127.0.0.1:$Port/"
try {
  $res = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
  if ($res.StatusCode -eq 200 -and $res.Content -match 'ClawChat relay OK') {
    Log "healthy: $healthUrl"
    exit 0
  }
  Log "unhealthy response: status=$($res.StatusCode)"
} catch {
  Log "healthcheck failed: $($_.Exception.Message)"
}

# attempt restart
try {
  Log "attempting restart of service $ServiceName"
  # prefer nssm if available under .tools
  $nssm = Join-Path $repo '.tools\nssm\nssm.exe'
  if (Test-Path $nssm) {
    & $nssm restart $ServiceName 2>&1 | Out-String | ForEach-Object { Log "nssm: $_" }
  } else {
    Restart-Service -Name $ServiceName -Force -ErrorAction Stop
  }
  Start-Sleep -Seconds 2
  try {
    $res2 = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($res2.StatusCode -eq 200) { Log "restart successful"; exit 0 }
  } catch {
    Log "restart did not recover service: $($_.Exception.Message)"
  }
} catch {
  Log "failed to restart service: $($_.Exception.Message)"
}
exit 2
