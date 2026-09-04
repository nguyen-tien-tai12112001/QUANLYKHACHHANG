param(
    [string]$ServerIp = "10.8.0.119",
    [int]$WaitSeconds = 180
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host "[1/5] Kiem tra IP LAN $ServerIp..." -ForegroundColor Cyan
$ipConfig = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -eq $ServerIp } |
    Select-Object -First 1

if (-not $ipConfig) {
    throw "May chua co IP $ServerIp. Hay cau hinh IP tinh tren card Ethernet truoc khi chay."
}

$adapter = Get-NetAdapter -InterfaceIndex $ipConfig.InterfaceIndex -ErrorAction SilentlyContinue
if (-not $adapter -or $adapter.Status -ne "Up") {
    throw "Card mang $($ipConfig.InterfaceAlias) dang $($adapter.Status). Hay cam day LAN/ket noi switch roi chay lai."
}
if ($ipConfig.AddressState -ne "Preferred") {
    throw "IP $ServerIp dang o trang thai $($ipConfig.AddressState), chua san sang. Kiem tra trung IP trong LAN hoac doi vai giay roi chay lai."
}

$firewallRule = Get-NetFirewallRule -DisplayName "QUANLYKHACHHANG LAN HTTP" -ErrorAction SilentlyContinue
if (-not $firewallRule -or $firewallRule.Enabled -ne "True") {
    Write-Warning "Chua co rule Firewall cho TCP 80. Hay mo PowerShell bang Run as administrator va chay .\configure-lan-firewall.ps1"
}

Write-Host "[2/5] Kiem tra Docker va image offline..." -ForegroundColor Cyan
docker info *> $null
$requiredImages = @(
    "quanlykhachhang-backend:latest",
    "quanlykhachhang-frontend:latest",
    "postgres:16",
    "redis:7-alpine",
    "coredns/coredns:latest"
)
foreach ($image in $requiredImages) {
    docker image inspect $image *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Thieu image $image. Can nap image bang docker load truoc khi may bi ngat Internet."
    }
}

Write-Host "[3/5] Khoi dong container, khong build va khong tai Internet..." -ForegroundColor Cyan
docker compose --profile lan-dns up -d --no-build
if ($LASTEXITCODE -ne 0) { throw "Docker Compose khoi dong that bai." }

Write-Host "[4/5] Cho cac dich vu healthy..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
    $status = docker compose ps --format json | ConvertFrom-Json
    $unhealthy = @($status | Where-Object {
        $_.State -ne "running" -or ($_.Health -and $_.Health -ne "healthy")
    })
    if ($status.Count -ge 5 -and $unhealthy.Count -eq 0) { break }
    if ((Get-Date) -ge $deadline) {
        docker compose ps
        throw "Qua thoi gian cho $WaitSeconds giay nhung dich vu chua san sang."
    }
    Start-Sleep -Seconds 3
} while ($true)

Write-Host "[5/5] Kiem tra frontend va API qua IP LAN..." -ForegroundColor Cyan
$frontend = Invoke-WebRequest -UseBasicParsing -Uri "http://$ServerIp/" -TimeoutSec 15
$health = Invoke-RestMethod -Uri "http://$ServerIp/api/health" -TimeoutSec 15
if ($frontend.StatusCode -ne 200) { throw "Frontend tra ve HTTP $($frontend.StatusCode)." }
$dnsResult = Resolve-DnsName -Name "c360.agribank.com.vn" -Server $ServerIp -Type A -DnsOnly -ErrorAction Stop
if ($dnsResult.IPAddress -notcontains $ServerIp) { throw "DNS noi bo khong tra ve dung IP $ServerIp." }

Write-Host ""
Write-Host "QUANLYKHACHHANG da san sang trong mang LAN." -ForegroundColor Green
Write-Host "Dia chi truy cap: http://$ServerIp" -ForegroundColor Green
Write-Host "Ten noi bo:        http://c360.agribank.com.vn" -ForegroundColor Green
Write-Host "API health:       http://$ServerIp/api/health" -ForegroundColor DarkGreen
docker compose ps
