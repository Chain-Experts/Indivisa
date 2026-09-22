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

# Every name whose node hosts the party is a valid route. When several names
# share one node (a one-validator DevNet, BitSafe's sandbox) the name chosen
# is also the label the panes show, so pick by the party's role: the cash
# registry keeps "registry", the agent and issuer keep "agent", holders get
# the first holder node name. On LocalNet every name is its own node and
# nothing here matters.
$candidates = [ordered]@{}
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
    if ($d.isLocal -and $d.party.StartsWith($Prefix)) {
      if (-not $candidates.Contains($d.party)) { $candidates[$d.party] = @() }
      $candidates[$d.party] += $name
    }
  }
}

$map = [ordered]@{}
foreach ($party in $candidates.Keys) {
  $names = @($candidates[$party])
  $hint = $party.Split("::")[0]
  $pick = $null
  if ($hint -match "Registry" -and $names -contains "registry") { $pick = "registry" }
  elseif ($hint -match "Paying-Agent|PayingAgent|Issuer|Northwind" -and $names -contains "agent") { $pick = "agent" }
  else { $pick = $names | Where-Object { $_ -notin @("registry", "agent") } | Select-Object -First 1 }
  if (-not $pick) { $pick = $names[0] }
  $map[$party] = $pick
}

$cfg = [ordered]@{
  default_participant = $base.default_participant
  participants        = $base.participants
  party_participants  = $map
}
$cfg | ConvertTo-Json -Depth 5 | Set-Content -Path $Out -Encoding UTF8
Write-Host "$Out : $($map.Count) parties mapped"
