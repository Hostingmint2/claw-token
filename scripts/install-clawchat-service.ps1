param()
# Installs ClawChat as a Windows service using NSSM. Non-interactive.
# - Downloads NSSM to .tools/nssm if not present
# - Reads .env (if present) or environment for ACCESS_JWT_SECRET and CHAT_PORT
# - Installs and starts NSSM service named 'ClawChat'

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path "$root\.." | Select-Object -ExpandProperty Path
$toolsDir = Join-Path $repo '.tools\nssm'
$nssmExe = Join-Path $toolsDir 'nssm.exe'

function Read-EnvFile($path) {
    $env = @{}
    if (-Not (Test-Path $path)) { return $env }
    Get-Content $path | ForEach-Object {
        if ($_ -match '^\s*#') { return }
        if ($_ -match '^\s*$') { return }
        $parts = $_ -split '=',2
        if ($parts.Length -eq 2) { $env[$parts[0].Trim()] = $parts[1].Trim() }
    }
    return $env
}

Write-Output "Installing ClawChat service (NSSM)..."

# Ensure node binary
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodeExe) { throw "Node.js not found in PATH. Install Node.js or add to PATH." }

# Ensure NSSM present (download if needed)
if (-not (Test-Path $nssmExe)) {
    Write-Output "NSSM not found in $toolsDir — downloading..."
    $zipUrl = 'https://nssm.cc/release/nssm-2.24.zip'
    $tmpZip = Join-Path $env:TEMP 'nssm.zip'
    Invoke-WebRequest -Uri $zipUrl -OutFile $tmpZip -UseBasicParsing
    Expand-Archive -LiteralPath $tmpZip -DestinationPath $toolsDir -Force
    # zip contains nssm-2.24\win64\nssm.exe or win32; pick win64 if present
    $candidate = Get-ChildItem -Path $toolsDir -Recurse -Filter 'nssm.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $candidate) { throw "Failed to extract nssm.exe" }
    Copy-Item $candidate.FullName $nssmExe -Force
    Remove-Item $tmpZip -Force
    Write-Output "NSSM downloaded to $nssmExe"
}

# Read secrets from .env or environment
$envFile = Join-Path $repo '.env'
$envValues = Read-EnvFile $envFile
$accessSecret = $envValues['ACCESS_JWT_SECRET'] ?? $env:ACCESS_JWT_SECRET
$chatPort = $envValues['CHAT_PORT'] ?? $env:CHAT_PORT ?? '8791'
$privacyMode = $envValues['PRIVACY_MODE'] ?? $env:PRIVACY_MODE ?? 'true'

if (-not $accessSecret) { Write-Output "WARNING: ACCESS_JWT_SECRET not set in .env or environment. Service will be installed but will refuse to start until ACCESS_JWT_SECRET is configured." }

# Prepare log dirs
$logDir = Join-Path $repo 'tmp\logs'
$piddir = Join-Path $repo 'tmp\pids'
New-Item -ItemType Directory -Force -Path $logDir, $piddir | Out-Null

# Install NSSM service
$serviceName = 'ClawChat'
$scriptPath = Join-Path $repo 'server\chat-server.js'
& $nssmExe install $serviceName $nodeExe $scriptPath
& $nssmExe set $serviceName AppDirectory $repo
& $nssmExe set $serviceName AppStdout (Join-Path $logDir 'clawchat.out.log')
& $nssmExe set $serviceName AppStderr (Join-Path $logDir 'clawchat.err.log')

# Set environment variables for the service
$envString = @()
if ($accessSecret) { $envString += "ACCESS_JWT_SECRET=$accessSecret" }
$envString += "CHAT_PORT=$chatPort"
$envString += "PRIVACY_MODE=$privacyMode"
& $nssmExe set $serviceName AppEnvironmentExtra ($envString -join ';')

# Set service to auto-start and start it
& $nssmExe set $serviceName Start SERVICE_AUTO_START
& $nssmExe start $serviceName

Write-Output "NSSM service '$serviceName' installed and started. Health endpoint: http://localhost:$chatPort/"
