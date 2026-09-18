# Write a Daml Script participant config that also maps every existing local party
# to the participant hosting it.
#
#   pwsh infra/localnet/participants-with-parties.ps1 [-Out path] [-Prefix Holder-]   (default: all local parties)
#
# Why: the script runner routes a submission to the participant that
# allocated the party in the same run; a party from an earlier run falls
# through to the default participant, which cannot submit for it
# (NO_SYNCHRONIZER_ON_WHICH_ALL_SUBMITTERS_CAN_SUBMIT, hit 17 Sep). The
# scale runs reuse holder parties across runs to skip party allocation, so
# they need the mapping. Read from each participant's JSON Ledger API.

param(
  [string] $Out = (Join-Path $PSScriptRoot "participants-with-parties.json"),
  [string] $Prefix = ""
)

$ErrorActionPreference = "Stop"
$base = Get-Content (Join-Path $PSScriptRoot "participants.json") -Raw | ConvertFrom-Json

# Ledger API port + 2 is the JSON API port in localnet.conf.
$map = [ordered]@{}
foreach ($name in $base.participants.PSObject.Properties.Name) {
  $p = $base.participants.$name
  $json = "http://$($p.host):$($p.port + 2)/v2/parties"
  try {
    $resp = Invoke-RestMethod -Uri $json -Method Get -TimeoutSec 30
  } catch {
    Write-Warning "cannot reach $json ($_); skipping $name"
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
