param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path "$root\.." | Select-Object -ExpandProperty Path
$toolsDir = Join-Path $repo '.tools\nssm'
$nssmExe = Join-Path $toolsDir 'nssm.exe'
$serviceName = 'ClawChat'

if (-not (Test-Path $nssmExe)) { Write-Output "nssm not found at $nssmExe; trying system PATH"; $nssmExe = (Get-Command nssm -ErrorAction SilentlyContinue)?.Source }
if (-not $nssmExe) { Write-Output "nssm not available; cannot uninstall service"; exit 1 }

& $nssmExe stop $serviceName 2>$null | Out-Null
& $nssmExe remove $serviceName confirm
Write-Output "Service $serviceName removed."