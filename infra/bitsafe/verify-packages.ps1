# Ask our DevNet participant which package version every informee can use.
#
#   $env:INDIVISA_CLIENT_SECRET = "..."
#   pwsh infra/bitsafe/verify-packages.ps1
#
# Why this exists: a DecMan distribution can report "completed" while the
# package is not actually vetted on the peer. The ledger is the only witness
# that counts. `preferred-packages` resolves a package name to a version
# vetted by EVERY participant hosting the named parties, so asking it about
# the decentralised party - which BitSafe co-hosts - tests both nodes at once.
#
# A package that does not resolve is the one that will fail the settlement
# with UNRESOLVED_PACKAGE_NAME, long after the step that caused it.

param(
  [string] $Network = "devnet",
  # The decentralised party, co-hosted by us and BitSafe.
  [string] $Party = "indivisa-approvers::1220099c55468768a4f5a449ba7e1388967f9f42b1b03d982d9d375f7a2642bb7b3a",
  [string[]] $Packages = @(
    "splice-api-token-metadata-v1",
    "splice-api-token-holding-v2",
    "splice-api-token-allocation-v2",
    "splice-api-token-allocation-instruction-v2",
    "splice-api-token-transfer-instruction-v2",
    "splice-api-token-transfer-events-v2",
    "splice-token-standard-utils",
    "splice-test-token-v2",
    "indivisa",
    "indivisa-governance-v0",
    "governance-settlement-v0"
  )
)

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ui = Get-Content (Join-Path $root "infra/$Network/ui.json") -Raw | ConvertFrom-Json
$base = $ui.participants.agent.jsonApi

$token = & (Join-Path $root "infra/token.ps1") -Network $Network
if (-not $token) { throw "no token: is INDIVISA_CLIENT_SECRET set?" }
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

$body = @{
  packageVettingRequirements = @($Packages | ForEach-Object {
    @{ parties = @($Party); packageName = $_ }
  })
} | ConvertTo-Json -Depth 6

$resolved = @{}
try {
  $r = Invoke-RestMethod -Method Post -Headers $headers `
    -Uri "$base/v2/interactive-submission/preferred-packages" -Body $body
  foreach ($p in $r.packagePreferences) {
    $resolved[$p.packageReference.packageName] = $p.packageReference.packageId
  }
} catch {
  # The endpoint fails the WHOLE request if any one name cannot be resolved,
  # so fall back to asking one at a time to find out which.
  Write-Host "batch request refused; asking one at a time" -ForegroundColor DarkYellow
  foreach ($name in $Packages) {
    $one = @{ packageVettingRequirements = @(@{ parties = @($Party); packageName = $name }) } |
      ConvertTo-Json -Depth 6
    try {
      $r = Invoke-RestMethod -Method Post -Headers $headers `
        -Uri "$base/v2/interactive-submission/preferred-packages" -Body $one
      $resolved[$name] = $r.packagePreferences[0].packageReference.packageId
    } catch { $resolved[$name] = $null }
  }
}

$missing = 0
foreach ($name in $Packages) {
  $id = $resolved[$name]
  if ($id) {
    "{0,-46} OK   {1}" -f $name, $id.Substring(0, 16) | Write-Host -ForegroundColor Green
  } else {
    $missing++
    "{0,-46} NOT VETTED BY EVERY PARTICIPANT" -f $name | Write-Host -ForegroundColor Red
  }
}

Write-Host ""
if ($missing -eq 0) {
  Write-Host "all $($Packages.Count) packages resolve for $($Party.Split('::')[0]) - the governed settlement will not fail on packages" -ForegroundColor Green
} else {
  Write-Host "$missing package(s) missing - the settlement will fail with UNRESOLVED_PACKAGE_NAME" -ForegroundColor Red
}
