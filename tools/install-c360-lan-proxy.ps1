param(
    [Parameter(Mandatory = $true)]
    [string]$CaddyExe,
    [string]$ServiceName = "C360LanProxy"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceConfigPath = Join-Path $projectRoot "proxy\windows\Caddyfile"
$caddyPath = (Resolve-Path -LiteralPath $CaddyExe).Path
$configPath = Join-Path (Split-Path -Parent $caddyPath) "Caddyfile"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())

if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run PowerShell as Administrator."
}
if (-not (Test-Path -LiteralPath $sourceConfigPath)) {
    throw "Missing Caddyfile: $sourceConfigPath"
}
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    throw "Service $ServiceName already exists. Check its configuration before changing it."
}
if (-not (Get-NetIPAddress -AddressFamily IPv4 -IPAddress "10.8.0.119" -ErrorAction SilentlyContinue)) {
    throw "This server does not have the expected LAN address 10.8.0.119."
}
if (Test-Path -LiteralPath $configPath) {
    throw "A Caddyfile already exists at $configPath. Review it manually; this script will not overwrite it."
}

try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8080/api/health" -TimeoutSec 10
    if ($health.StatusCode -ne 200) { throw "Unexpected HTTP status $($health.StatusCode)" }
} catch {
    throw "Docker frontend is not ready on 127.0.0.1:8080. Recreate it with the new .env settings first. $($_.Exception.Message)"
}

& $caddyPath validate --config $sourceConfigPath --adapter caddyfile
if ($LASTEXITCODE -ne 0) {
    throw "Caddyfile validation failed."
}

$portOwner = Get-NetTCPConnection -State Listen -LocalPort 80 -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -in @("0.0.0.0", "::", "10.8.0.119", "127.0.0.1") }
if ($portOwner) {
    throw "Port 80 is still occupied. Set FRONTEND_BIND_ADDR=127.0.0.1 and FRONTEND_HOST_PORT=8080 in .env, then recreate the frontend container first."
}

Copy-Item -LiteralPath $sourceConfigPath -Destination $configPath
$binaryPath = '"' + $caddyPath + '" run --config "' + $configPath + '" --adapter caddyfile'
New-Service -Name $ServiceName -BinaryPathName $binaryPath -DisplayName "C360 LAN reverse proxy" -StartupType Automatic -Description "Trusted Windows LAN edge proxy for C360" | Out-Null
& sc.exe config $ServiceName start= delayed-auto | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Could not configure delayed automatic start for $ServiceName."
}
& sc.exe failure $ServiceName reset= 900 actions= restart/60000/restart/120000 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Could not configure restart-on-failure for $ServiceName."
}
Start-Service -Name $ServiceName
Get-Service -Name $ServiceName | Select-Object Name, Status, StartType
