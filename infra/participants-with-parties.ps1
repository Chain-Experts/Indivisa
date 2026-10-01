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
  [string] $Prefix = "",
  # Resolve only the parties this seat names, instead of listing every party
  # the synchronizer knows. On DevNet that list is the whole network's -
  # thousands of parties, shared by everyone - and walking it five times, once
  # per participant name, outlives the 300-second token before it finishes.
  # A seat has eight parties on a five-holder run, and each is one cheap
  # lookup. Leave it unset on LocalNet, where the list is this demo's own.
  [string] $Seat = ""
)

$ErrorActionPreference = "Stop"
$netDir = Join-Path $PSScriptRoot $Network
if (-not (Test-Path $netDir)) { throw "No network '$Network' under infra/" }
if (-not $Out) { $Out = Join-Path $netDir "participants-with-parties.json" }
$base = Get-Content (Join-Path $netDir "participants.json") -Raw | ConvertFrom-Json
$ui = Get-Content (Join-Path $netDir "ui.json") -Raw | ConvertFrom-Json

# One fresh token for this run. It is used for the reads below and written
# into every participant of the output, which is the file the Daml Script
# runner reads - so the runner always starts with a token minted seconds
# ago rather than whatever was in participants.json. DevNet's live for 300
# seconds; see infra/token.ps1.
$fresh = & (Join-Path $PSScriptRoot "token.ps1") -Network $Network
if ($fresh) { Write-Host "minted a ledger token for '$Network'" }

# Every name whose node hosts the party is a valid route. When several names
# share one node (a one-validator DevNet, BitSafe's sandbox) the name chosen
# is also the label the console shows, so pick by the party's role: the cash
# registry keeps "registry", the agent and issuer keep "agent", holders get
# the first holder node name. On LocalNet every name is its own node and
# nothing here matters.
# The parties worth resolving, when a seat names them.
$wanted = @()
if ($Seat) {
  if (-not (Test-Path $Seat)) { throw "no seat at $Seat" }
  $s = Get-Content $Seat -Raw | ConvertFrom-Json
  foreach ($p in @($s.payingAgent, $s.registry, $s.issuer)) { if ($p) { $wanted += $p } }
  foreach ($h in @($s.holders)) { if ($h) { $wanted += $h } }
  $wanted = @($wanted | Select-Object -Unique)
  Write-Host "resolving $($wanted.Count) parties from $(Split-Path $Seat -Leaf)"
}

$candidates = [ordered]@{}
foreach ($name in $base.participants.PSObject.Properties.Name) {
  $u = $ui.participants.$name
  if (-not $u) { Write-Warning "ui.json has no JSON API for '$name'; skipping"; continue }
  $url = $u.jsonApi.TrimEnd("/") + "/v2/parties"
  $headers = @{}
  $bearer = if ($fresh) { $fresh } else { $u.token }
  if ($bearer) { $headers["Authorization"] = "Bearer " + $bearer }

  if ($wanted) {
    # One lookup per party we actually care about.
    foreach ($party in $wanted) {
      try {
        $one = Invoke-RestMethod -Uri "$url/$([uri]::EscapeDataString($party))" -Method Get -Headers $headers `
          -TimeoutSec 30 -SkipCertificateCheck:([bool]$ui.insecureTls)
      } catch {
        continue   # not known to this participant, which is an answer
      }
      foreach ($d in $one.partyDetails) {
        if ($d.isLocal -and $d.party.StartsWith($Prefix)) {
          if (-not $candidates.Contains($d.party)) { $candidates[$d.party] = @() }
          $candidates[$d.party] += $name
        }
      }
    }
  } else {
    # No seat given: list them. Fine where the list is this demo's own, and
    # paged because the first page is not the list.
    $page = $null
    $pages = 0
    do {
      $q = if ($page) { "$url`?pageSize=1000&pageToken=$([uri]::EscapeDataString($page))" } else { "$url`?pageSize=1000" }
      try {
        $resp = Invoke-RestMethod -Uri $q -Method Get -Headers $headers -TimeoutSec 60 -SkipCertificateCheck:([bool]$ui.insecureTls)
      } catch {
        Write-Warning "cannot reach $url ($_); skipping $name"
        break
      }
      foreach ($d in $resp.partyDetails) {
        if ($d.isLocal -and $d.party.StartsWith($Prefix)) {
          if (-not $candidates.Contains($d.party)) { $candidates[$d.party] = @() }
          $candidates[$d.party] += $name
        }
      }
      $page = $resp.nextPageToken
      $pages++
    } while ($page -and $pages -lt 50)
    if ($pages -ge 50) { Write-Warning "$name`: stopped after 50 pages. Pass -Seat to resolve only the parties you need." }
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

# Stamp the fresh token onto every participant, and onto the default, so
# the runner never reads a stale access_token out of participants.json.
if ($fresh) {
  foreach ($name in $base.participants.PSObject.Properties.Name) {
    $base.participants.$name | Add-Member -NotePropertyName access_token -NotePropertyValue $fresh -Force
  }
  if ($base.default_participant) {
    $base.default_participant | Add-Member -NotePropertyName access_token -NotePropertyValue $fresh -Force
  }
}

$cfg = [ordered]@{
  default_participant = $base.default_participant
  participants        = $base.participants
  party_participants  = $map
}
$cfg | ConvertTo-Json -Depth 5 | Set-Content -Path $Out -Encoding UTF8
Write-Host "$Out : $($map.Count) parties mapped"
