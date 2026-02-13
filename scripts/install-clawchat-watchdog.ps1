param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path "$root\.." | Select-Object -ExpandProperty Path
$checkScript = Join-Path $repo 'scripts\check-clawchat-health.ps1'
$taskName = 'ClawChat-Watchdog'

if (-not (Test-Path $checkScript)) { throw "Missing check script: $checkScript" }

# create scheduled task running every 1 minute
$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$checkScript`""
# schtasks is the simplest cross-compat helper here
schtasks /Create /F /SC MINUTE /MO 1 /TN $taskName /TR $action /RL HIGHEST | Out-Null
Write-Output "Scheduled Task '$taskName' created (runs every minute)."
