# Cast a governance confirmation as a member party other than the one this
# DecMan node is configured with.
#
#   $env:DECMAN_TOKEN = "<the UI's bearer token>"
#   pwsh infra/bitsafe/confirm-as-member.ps1                  # dry run
#   pwsh infra/bitsafe/confirm-as-member.ps1 -Cast            # do it
#
# Why this is needed. DecMan resolves the confirming member from the node's
# party configuration - `get_member_party_id` takes the FIRST stored
# credential whose dec_party_id matches - so one node casts one
# confirmation, and the UI does not let you edit Member Party ID once saved.
#
# Our DevNet party has three members and a threshold of three:
#
#   chain-experts-admin-1       ours, and what this node confirms as
#   attestor-1                  BitSafe's
#   Meridian-Paying-Agent-dev2  a leftover paying agent from a test seat on
#                               25 September, added to the members by
#                               mistake and with no node of its own
#
# So two confirmations are reachable and three are required: every governance
# action is stuck, including the one that would fix the membership.
#
# `PUT /party-config` accepts member_party_id and treats absent credential
# fields as "keep existing", so the way out is to point the configuration at
# the stray party, confirm, and point it back. This script does that and
# ALWAYS restores the original, including when the confirmation fails.
#
# The point of the exercise is to execute one remove-member action that drops
# the stray party and sets the threshold to two. After that the party is what
# was agreed with BitSafe on 23 September - one member each, neither able to
# settle alone - and this script is never needed again.

param(
  [string] $DecMan = "https://<decman-host>",
  [string] $Party = "indivisa-approvers::1220099c55468768a4f5a449ba7e1388967f9f42b1b03d982d9d375f7a2642bb7b3a",
  # The member to confirm AS: the stray party, which has no node.
  [string] $As = "Meridian-Paying-Agent-dev2-20260925111042638899-4f1df03a::1220d41692257b6921b95b7a4f8e76bb30dd0c6da92718b1758a559f842e8a2ba553",
  # The action to confirm. Defaults to removing the stray party itself.
  [string] $Remove = "Meridian-Paying-Agent-dev2-20260925111042638899-4f1df03a::1220d41692257b6921b95b7a4f8e76bb30dd0c6da92718b1758a559f842e8a2ba553",
  [int] $NewThreshold = 2,
  [switch] $Cast
)

$ErrorActionPreference = "Stop"
$token = $env:DECMAN_TOKEN
if (-not $token) { throw "set DECMAN_TOKEN first: on the DecMan tab, sessionStorage.getItem(`"dec_party_manager_token`")" }
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$base = $DecMan.TrimEnd("/")
$enc = [uri]::EscapeDataString($Party)

function ErrorText($err) {
  if ($err.ErrorDetails -and $err.ErrorDetails.Message) { return $err.ErrorDetails.Message }
  try { return (New-Object IO.StreamReader($err.Exception.Response.GetResponseStream())).ReadToEnd() }
  catch { return $err.Exception.Message }
}
function Show($k, $v) { "{0,-24} {1}" -f $k, $v | Write-Host }

# --- current configuration ---------------------------------------------------
try {
  $cfg = Invoke-RestMethod -Uri "$base/party-config/$enc" -Headers $headers -TimeoutSec 60
} catch { throw "GET /party-config failed - is DECMAN_TOKEN current? " + (ErrorText $_) }

$original = $cfg.member_party_id
if (-not $original) { throw "no member_party_id in the stored configuration" }
Show "configured member" ($original -split "::")[0]
Show "will confirm as" ($As -split "::")[0]
Show "action" "remove $(($Remove -split '::')[0]), threshold -> $NewThreshold"

if ($original -eq $As) {
  Write-Host ""
  Write-Host "the node is already configured as that member; confirm normally instead" -ForegroundColor Yellow
  exit 0
}

$action = @{ type = "governance_remove_member"; member = $Remove; new_threshold = $NewThreshold }

if (-not $Cast) {
  Write-Host ""
  Write-Host "dry run. -Cast would: swap the configured member, confirm, swap back." -ForegroundColor DarkGray
  Write-Host ($action | ConvertTo-Json -Depth 6)
  Write-Host ""
  Write-Host "re-run with -Cast" -ForegroundColor Yellow
  exit 0
}

# Absent credential fields mean "keep existing", so only the member moves.
function SetMember([string] $member) {
  $body = @{
    dec_party_id = $Party
    member_party_id = $member
    user_id = $cfg.user_id
  }
  foreach ($f in "keycloak_url", "keycloak_realm", "keycloak_client_id") {
    if ($cfg.$f) { $body[$f] = $cfg.$f }
  }
  Invoke-RestMethod -Method Put -Uri "$base/party-config" -Headers $headers -TimeoutSec 60 `
    -Body ($body | ConvertTo-Json -Depth 6) | Out-Null
}

$swapped = $false
try {
  Write-Host ""
  Write-Host "pointing the configuration at $(($As -split '::')[0])..." -ForegroundColor DarkGray
  SetMember $As
  $swapped = $true

  $rules = (Invoke-RestMethod -Uri "$base/governance/state?party_id=$enc" -Headers $headers -TimeoutSec 60).state.contract_id
  try {
    $r = Invoke-RestMethod -Method Post -Uri "$base/governance/confirm" -Headers $headers -TimeoutSec 180 `
      -Body (@{ party_id = $Party; rules_contract_id = $rules; action = $action; governance_type = "core_self" } | ConvertTo-Json -Depth 8)
    Write-Host "CONFIRMED as $(($As -split '::')[0])" -ForegroundColor Green
    $r | ConvertTo-Json -Depth 6 | Write-Host
  } catch {
    Write-Host "REFUSED" -ForegroundColor Red
    Write-Host (ErrorText $_)
  }
} finally {
  if ($swapped) {
    Write-Host ""
    Write-Host "restoring the configuration to $(($original -split '::')[0])..." -ForegroundColor DarkGray
    SetMember $original
    $check = (Invoke-RestMethod -Uri "$base/party-config/$enc" -Headers $headers -TimeoutSec 60).member_party_id
    if ($check -eq $original) {
      Write-Host "restored" -ForegroundColor Green
    } else {
      Write-Host "NOT RESTORED - the configured member is now $check. Fix this before anything else." -ForegroundColor Red
    }
  }
}

Write-Host ""
$conf = Invoke-RestMethod -Uri "$base/governance/confirmations?party_id=$enc" -Headers $headers -TimeoutSec 60
foreach ($a in @($conf.actions | Where-Object { $_.action.type -eq "governance_remove_member" })) {
  Show "confirmations" (@($a.confirmations).Count)
  Show "can execute" $a.can_execute
}
