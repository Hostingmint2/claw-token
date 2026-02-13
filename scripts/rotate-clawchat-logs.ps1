param(
  [int]$KeepDays = 14
)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path "$root\.." | Select-Object -ExpandProperty Path
$logDir = Join-Path $repo 'tmp\logs'
if (-not (Test-Path $logDir)) { Write-Output "no logs dir"; exit 0 }
Get-ChildItem -Path $logDir -File | Where-Object { ($_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays)) } | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Force
  Write-Output "removed old log: $($_.Name)"
}
