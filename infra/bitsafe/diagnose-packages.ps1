# Diagnostic for verify-packages.ps1. Prints what actually happens at each
# step instead of collapsing every failure into "not vetted".
#
#   $env:INDIVISA_CLIENT_SECRET = "..."
#   pwsh infra/bitsafe/diagnose-packages.ps1

param(
  [string] $Network = "devnet",
  [string] $Party = "indivisa-approvers::1220099c55468768a4f5a449ba7e1388967f9f42b1b03d982d9d375f7a2642bb7b3a",
  [string] $Package = "splice-test-token-v2"
)

$ErrorActionPreference = "Continue"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ui = Get-Content (Join-Path $root "infra/$Network/ui.json") -Raw | ConvertFrom-Json
$base = $ui.participants.agent.jsonApi
Write-Host "base URL: $base" -ForegroundColor Cyan

Write-Host "`n--- 1. token ---" -ForegroundColor Cyan
$token = & (Join-Path $root "infra/token.ps1") -Network $Network
if (-not $token) { Write-Host "NO TOKEN - is INDIVISA_CLIENT_SECRET set?" -ForegroundColor Red; exit 1 }
Write-Host "token length: $($token.Length)"
$payload = $token.Split(".")[1]; $payload += "=" * ((4 - $payload.Length % 4) % 4)
try {
  $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload.Replace("-","+").Replace("_","/"))) | ConvertFrom-Json
  Write-Host "sub: $($claims.sub)"
  Write-Host "aud: $($claims.aud)"
} catch { Write-Host "could not decode claims: $_" -ForegroundColor Yellow }
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

Write-Host "`n--- 2. can we read the ledger at all? ---" -ForegroundColor Cyan
try {
  $v = Invoke-RestMethod -Headers $headers -Uri "$base/v2/version"
  Write-Host "version: $($v.version)" -ForegroundColor Green
} catch { Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "`n--- 3. does this participant know the decentralised party? ---" -ForegroundColor Cyan
try {
  $p = Invoke-RestMethod -Headers $headers -Uri "$base/v2/parties/$([uri]::EscapeDataString($Party))"
  $d = $p.partyDetails | Select-Object -First 1
  Write-Host "found. isLocal=$($d.isLocal)" -ForegroundColor Green
} catch { Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "`n--- 4. preferred-packages, one package, full response ---" -ForegroundColor Cyan
$body = @{ packageVettingRequirements = @(@{ parties = @($Party); packageName = $Package }) } | ConvertTo-Json -Depth 6
Write-Host "request body:"; Write-Host $body
try {
  $r = Invoke-RestMethod -Method Post -Headers $headers -Uri "$base/v2/interactive-submission/preferred-packages" -Body $body
  Write-Host "RAW RESPONSE:" -ForegroundColor Green
  $r | ConvertTo-Json -Depth 8
} catch {
  Write-Host "REQUEST FAILED" -ForegroundColor Red
  Write-Host "status: $($_.Exception.Response.StatusCode.value__) $($_.Exception.Response.StatusCode)"
  try {
    $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host "body: $($sr.ReadToEnd())"
  } catch { Write-Host "message: $($_.Exception.Message)" }
}
