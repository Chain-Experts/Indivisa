# Distribute our DARs to the three sandbox participants through DecMan:
# POST /dars/distribute on node 1, accept the invitation on nodes 2 and 3,
# wait for the workflow, verify every node vetted every package.
#
#   pwsh infra/bitsafe/distribute.ps1
#
# The sandbox already carries the Token Standard V2 API packages and
# splice-token-standard-utils with the same package ids as ours (checked
# 21 Sep 2026, /packages/vetted), so only what it lacks goes: the two V2 API
# packages it does not vet, the reference cash, our model and the two
# governance packages.

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$dars = @(
  "daml\dars\splice-api-token-transfer-events-v2-1.0.0.dar",
  "daml\dars\splice-api-token-allocation-request-v2-1.0.0.dar",
  "daml\dars\splice-test-token-v2-1.0.1.dar",
  "daml\indivisa\.daml\dist\indivisa-0.6.0.dar",
  "daml\governance-settlement\.daml\dist\governance-settlement-v0-0.1.0.dar",
  "daml\indivisa-governance\.daml\dist\indivisa-governance-v0-0.1.0.dar"
) | ForEach-Object { Join-Path $root $_ }
foreach ($d in $dars) { if (-not (Test-Path $d)) { throw "missing $d; run dpm build --all" } }

function Dm([int] $port, [string] $path) { Invoke-RestMethod -Uri "http://localhost:$port$path" -TimeoutSec 60 }
function DmPost([int] $port, [string] $path, $body) {
  Invoke-RestMethod -Uri "http://localhost:$port$path" -Method Post -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 600
}
function SelfId([int] $port) { (Dm $port "/participants-status").statuses | Where-Object { $_.status -eq "CurrentNode" } | Select-Object -First 1 -ExpandProperty id }

$peers = @((SelfId 8082), (SelfId 8083))
$files = $dars | ForEach-Object { @{ filename = (Split-Path $_ -Leaf); data = [Convert]::ToBase64String([IO.File]::ReadAllBytes($_)) } }
$r = DmPost 8081 "/dars/distribute" @{ dar_files = $files; peer_ids = $peers }
Write-Host "started: $($r.instance_name)"

foreach ($port in 8082, 8083) {
  $id = $null
  for ($i = 0; $i -lt 30 -and -not $id; $i++) {
    $id = (Dm $port "/invitations").invitations | Where-Object { $_.invitation_type -eq "Dars" } | Select-Object -First 1 -ExpandProperty id
    if (-not $id) { Start-Sleep -Seconds 2 }
  }
  if (-not $id) { throw "no Dars invitation arrived on node $port" }
  DmPost $port "/invitations/accept" @{ id = $id } | Out-Null
  Write-Host "node $port accepted $id"
}

for ($i = 0; $i -lt 60; $i++) {
  $s = (Dm 8081 "/dars/distribute/status").status
  if ($s -ne "inprogress") { break }
  Start-Sleep -Seconds 10
}
Write-Host "distribution: $s"
if ($s -ne "completed") { throw "distribution ended as '$s'" }

foreach ($port in 8081, 8082, 8083) {
  $names = (Dm $port "/packages/vetted") | Where-Object { $_.package_name -match "indivisa|governance-settlement|splice-test-token-v2" } | ForEach-Object { $_.package_name } | Sort-Object -Unique
  Write-Host ("node {0}: {1}" -f $port, ($names -join ", "))
}
