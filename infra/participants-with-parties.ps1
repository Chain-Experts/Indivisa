# Write a Daml Script participant config that also maps every existing party
# to the participant hosting it.
#
#   pwsh infra/participants-with-parties.ps1 [-Network localnet|devnet] [-Out path] [-Prefix Holder-]
#
# Why: the script runner routes a submission to the participant that
# allocated the party in the same run; a party from an earlier run falls
# through to the default participant, which cannot submit for it
# (NO_SYNCHRONIZER_ON_WHICH_ALL_SUBMITTERS_CAN_SUBMIT, hit 17 Sep). The
# scale runs and the demo reuse parties across runs, so they need the
# mapping. Read from each participant's JSON Ledger API, whose address (and
# bearer token, if any) comes from infra/<network>/ui.json.

param(
  [string] $Network = "localnet",
  [string] $Out = "",
  [string] $Prefix = ""
)

$ErrorActionPreference = "Stop"
$netDir = Join-Path $PSScriptRoot $Network
if (-not (Test-Path $netDir)) { throw "No network '$Network' under infra/" }
if (-not $Out) { $Out = Join-Path $netDir "participants-with-parties.json" }
$base = Get-Content (Join-Path $netDir "participants.json") -Raw | ConvertFrom-Json
$ui = Get-Content (Join-Path $netDir "ui.json") -Raw | ConvertFrom-Json

$map = [ordered]@{}
foreach ($name in $base.participants.PSObject.Properties.Name) {
  $u = $ui.participants.$name
  if (-not $u) { Write-Warning "ui.json has no JSON API for '$name'; skipping"; continue }
  $url = $u.jsonApi.TrimEnd("/") + "/v2/parties"
  $headers = @{}
  if ($u.token) { $headers["Authorization"] = "Bearer " + $u.token }
  try {
    $resp = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -TimeoutSec 30 -SkipCertificateCheck:([bool]$ui.insecureTls)
  } catch {
    Write-Warning "cannot reach $url ($_); skipping $name"
    continue
  }
  foreach ($d in $resp.partyDetails) {
    if ($d.isLocal -and $d.party.StartsWith($Prefix)) { $map[$d.party] = $name }
  }
}

$cfg = [ordered]@{
  default_participant = $base.default_participant
  participants        = $base.participants
  party_participants  = $map
}
$cfg | ConvertTo-Json -Depth 5 | Set-Content -Path $Out -Encoding UTF8
Write-Host "$Out : $($map.Count) parties mapped"
