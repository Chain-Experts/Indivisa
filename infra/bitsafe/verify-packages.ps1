# Ask our DevNet participant which package version every informee can use.
#
#   $env:INDIVISA_CLIENT_SECRET = "..."
#   pwsh infra/bitsafe/verify-packages.ps1
#
# Why this exists: a DecMan distribution can report "completed" - or sit at
# "Uploading DARs" for a day - while the ledger says something else. The
# ledger is the only witness that counts. `preferred-packages` resolves a
# package name to a version vetted by EVERY participant hosting the named
# parties, so asking about the decentralised party, which BitSafe co-hosts,
# tests both nodes in one call.
#
# Shapes are from the participant's own spec (GET /docs/openapi, which needs
# no token):
#   request  { packageVettingRequirements: [ { parties: [...], packageName } ] }
#   response { packageReferences: [ { packageId, packageName, packageVersion } ],
#              synchronizerId }
# An earlier version of this script read `packagePreferences[].packageReference`,
# which does not exist, and reported every package as missing.

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
$base = ($ui.participants.agent.jsonApi).TrimEnd("/")

$token = & (Join-Path $root "infra/token.ps1") -Network $Network
if (-not $token) { throw "no token: set INDIVISA_CLIENT_SECRET, or add clientSecret to infra/$Network/ui.json" }
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$uri = "$base/v2/interactive-submission/preferred-packages"

function ErrorBody($err) {
  try {
    $s = New-Object IO.StreamReader($err.Exception.Response.GetResponseStream())
    return $s.ReadToEnd()
  } catch { return $err.Exception.Message }
}

# One name at a time. The batch form fails as a whole if any single name
# cannot be resolved, which tells us nothing about which one.
$result = [ordered]@{}
foreach ($name in $Packages) {
  $body = @{ packageVettingRequirements = @(@{ parties = @($Party); packageName = $name }) } |
    ConvertTo-Json -Depth 6
  try {
    $r = Invoke-RestMethod -Method Post -Headers $headers -Uri $uri -Body $body
    $ref = $r.packageReferences | Where-Object { $_.packageName -eq $name } | Select-Object -First 1
    if (-not $ref) { $ref = $r.packageReferences | Select-Object -First 1 }
    $result[$name] = if ($ref) { @{ state = "ok"; version = $ref.packageVersion; id = $ref.packageId } }
                     else       { @{ state = "unresolved" } }
  } catch {
    $code = $null
    try { $code = $_.Exception.Response.StatusCode.value__ } catch {}
    # A 400 here is the participant saying it cannot find a commonly vetted
    # version - that is a real answer, not a broken request.
    if ($code -eq 400) { $result[$name] = @{ state = "unresolved"; detail = (ErrorBody $_) } }
    else               { $result[$name] = @{ state = "failed"; detail = "HTTP $code " + (ErrorBody $_) } }
  }
}

$ok = 0; $missing = 0; $failed = 0
foreach ($name in $Packages) {
  $r = $result[$name]
  switch ($r.state) {
    "ok" {
      $ok++
      "{0,-46} OK          {1,-8} {2}" -f $name, $r.version, $r.id.Substring(0, 12) |
        Write-Host -ForegroundColor Green
    }
    "unresolved" {
      $missing++
      "{0,-46} NOT VETTED BY EVERY PARTICIPANT" -f $name | Write-Host -ForegroundColor Red
    }
    default {
      $failed++
      "{0,-46} REQUEST FAILED" -f $name | Write-Host -ForegroundColor Magenta
      "    {0}" -f ($r.detail -replace "\s+", " ").Trim() | Write-Host -ForegroundColor DarkGray
    }
  }
}

Write-Host ""
Write-Host ("party: " + $Party.Split("::")[0]) -ForegroundColor DarkGray
if ($failed -gt 0) {
  Write-Host "$failed request(s) failed - this is a problem with the query, not with vetting" -ForegroundColor Magenta
} elseif ($missing -eq 0) {
  Write-Host "all $ok packages resolve - the governed settlement will not fail on packages" -ForegroundColor Green
} else {
  Write-Host "$ok vetted, $missing missing - the settlement will fail with UNRESOLVED_PACKAGE_NAME" -ForegroundColor Red
}
