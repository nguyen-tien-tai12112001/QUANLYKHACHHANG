$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Hay mo PowerShell bang Run as administrator roi chay lai script nay."
}

$displayName = "QUANLYKHACHHANG LAN HTTP"
$existing = Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue
if ($existing) {
    Remove-NetFirewallRule -DisplayName $displayName
}

New-NetFirewallRule `
    -DisplayName $displayName `
    -Description "Cho phep may trong mang 10.8.0.0/24 truy cap QUANLYKHACHHANG qua Nginx." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 80 `
    -RemoteAddress "10.8.0.0/24" `
    -Profile Any | Out-Null

foreach ($protocol in @("UDP", "TCP")) {
    $dnsRuleName = "QUANLYKHACHHANG LAN DNS $protocol"
    $dnsExisting = Get-NetFirewallRule -DisplayName $dnsRuleName -ErrorAction SilentlyContinue
    if ($dnsExisting) { Remove-NetFirewallRule -DisplayName $dnsRuleName }
    New-NetFirewallRule `
        -DisplayName $dnsRuleName `
        -Description "Cho phep may trong mang 10.8.0.0/24 truy van DNS noi bo C360." `
        -Direction Inbound `
        -Action Allow `
        -Protocol $protocol `
        -LocalPort 53 `
        -RemoteAddress "10.8.0.0/24" `
        -Profile Any | Out-Null
}

Write-Host "Da mo TCP 80 va TCP/UDP 53 cho mang 10.8.0.0/24." -ForegroundColor Green
Get-NetFirewallRule -DisplayName "QUANLYKHACHHANG LAN*" |
    Select-Object DisplayName, Enabled, Direction, Action |
    Format-Table -AutoSize
