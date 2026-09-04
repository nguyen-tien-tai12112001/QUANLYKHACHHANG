param(
    [Parameter(Mandatory = $false)]
    [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"

$resolvedPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
    $EnvFile
} else {
    Join-Path (Get-Location) $EnvFile
}

if (-not (Test-Path -LiteralPath $resolvedPath)) {
    throw "Không tìm thấy file môi trường: $resolvedPath"
}

$bytes = New-Object byte[] 48
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $generator.GetBytes($bytes)
} finally {
    $generator.Dispose()
}
$secret = [Convert]::ToBase64String($bytes)

$lines = [System.Collections.Generic.List[string]]::new()
foreach ($line in [System.IO.File]::ReadAllLines($resolvedPath)) {
    $lines.Add($line)
}

$secretUpdated = $false
$expiryUpdated = $false
for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match '^AUTH_SECRET=') {
        $lines[$index] = "AUTH_SECRET=$secret"
        $secretUpdated = $true
    }
    if ($lines[$index] -match '^ACCESS_TOKEN_EXPIRE_MINUTES=') {
        $lines[$index] = "ACCESS_TOKEN_EXPIRE_MINUTES=240"
        $expiryUpdated = $true
    }
}
if (-not $secretUpdated) {
    $lines.Add("AUTH_SECRET=$secret")
}
if (-not $expiryUpdated) {
    $lines.Add("ACCESS_TOKEN_EXPIRE_MINUTES=240")
}

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($resolvedPath, $lines, $utf8WithoutBom)

Write-Host "Đã tạo AUTH_SECRET ngẫu nhiên 384-bit và lưu vào $resolvedPath."
Write-Host "Secret không được in ra màn hình. Hãy khởi động lại backend để vô hiệu hóa toàn bộ token cũ."
