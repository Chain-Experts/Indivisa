# Admit the paying agent as an additional proposer on the DevNet governance
# rules.
#
#   $env:DECMAN_TOKEN = "<the UI's bearer token>"
#   pwsh infra/bitsafe/admit-proposer.ps1            # show state, confirm nothing
#   pwsh infra/bitsafe/admit-proposer.ps1 -Confirm   # cast our confirmation
#
# Why this is a script and not a click. `SettleRunProposal` is signed by the
# paying agent - that is how the agent's authority reaches `Run_Settle` - and
# the governance rules only accept proposals from a member or an additional
# proposer. Admitting the agent is `SelfAction_AddAdditionalProposer`, which
# exists in BitSafe's Daml (`Governance/Rules.daml`) and in their Rust action
# catalog, and has no path in their web UI at v1.8.0. Confirmed by reading
# their frontend: zero references. BitSafe (BitSafe, 29 Sep) say they will
# add one; until then it is this endpoint.
#
# The token is the one the UI holds. In the browser, on the DecMan tab:
#   sessionStorage.getItem("dec_party_manager_token")
# It is short-lived, so fetch it immediately before running this.
#
# One confirmation per member party, and DecMan takes the member from the
# node's party configuration rather than from the request - there is no
# member field in ConfirmActionRequest. So a node with one party
# configuration casts one confirmation.

param(
  [string] $DecMan = "https://<decman-host>",
  [string] $Party = "indivisa-approvers::1220099c55468768a4f5a449ba7e1388967f9f42b1b03d982d9d375f7a2642bb7b3a",
  [string] $Tag = "gov1",
  [switch] $Confirm
)

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$seatFile = Join-Path $root "infra/devnet/demo/seat-$Tag.json"
if (-not (Test-Path $seatFile)) { throw "no seat '$Tag'; nothing to admit a proposer for" }
$agent = (Get-Content $seatFile -Raw | ConvertFrom-Json).payingAgent

$token = $env:DECMAN_TOKEN
if (-not $token) { throw "set DECMAN_TOKEN first: in the browser on the DecMan tab, sessionStorage.getItem(`"dec_party_manager_token`")" }
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$base = $DecMan.TrimEnd("/")

function Body($obj) { $obj | ConvertTo-Json -Depth 8 }
function Show($label, $value) { "{0,-22} {1}" -f $label, $value | Write-Host }

function ErrorText($err) {
  if ($err.ErrorDetails -and $err.ErrorDetails.Message) { return $err.ErrorDetails.Message }
  try {
    $s = New-Object IO.StreamReader($err.Exception.Response.GetResponseStream())
    return $s.ReadToEnd()
  } catch { return $err.Exception.Message }
}

Show "DecMan" $base
Show "governance party" $Party
Show "paying agent" $agent
Write-Host ""

# The live rules contract. Its id changes with every executed self-action,
# so read it rather than remember it.
try {
  $state = Invoke-RestMethod -Uri "$base/governance/state?party_id=$([uri]::EscapeDataString($Party))" -Headers $headers -TimeoutSec 60
} catch {
  throw "GET /governance/state failed - is DECMAN_TOKEN current? " + (ErrorText $_)
}
$rules = $state.state.contract_id
if (-not $rules) { throw "no rules contract in /governance/state; the party may not be configured on this node" }
Show "rules contract" $rules
Show "threshold" $state.state.threshold
$members = @($state.state.members)
Show "members" $members.Count
# Which member THIS node confirms as matters: DecMan resolves it from the
# node's party configuration (get_member_party_id takes the FIRST credential
# whose dec_party_id matches), so one node casts exactly one confirmation and
# a second configuration would not help.
foreach ($m in $members) {
  $name = ($m -split "::")[0]
  $ours = if ($m -like "*::1220d41692*") { "  <- our namespace" } else { "" }
  Write-Host ("  member{0,-15} {1}{2}" -f "", $name, $ours)
}
$existing = @($state.state.additional_proposers)
Show "additional proposers" $(if ($existing.Count) { $existing -join ", " } else { "(none)" })

if ($existing -contains $agent) {
  Write-Host ""
  Write-Host "the paying agent is ALREADY an additional proposer - re-confirm the settlement instead" -ForegroundColor Green
  exit 0
}

$action = @{ type = "governance_add_additional_proposer"; additional_proposer = $agent }

if (-not $Confirm) {
  Write-Host ""
  Write-Host "dry run. The request that -Confirm would POST to /governance/confirm:" -ForegroundColor DarkGray
  Write-Host (Body @{ party_id = $Party; rules_contract_id = $rules; action = $action; governance_type = "core_self" })
  Write-Host ""
  Write-Host "re-run with -Confirm to cast it" -ForegroundColor Yellow
  exit 0
}

Write-Host ""
try {
  $r = Invoke-RestMethod -Method Post -Uri "$base/governance/confirm" -Headers $headers -TimeoutSec 180 `
    -Body (Body @{ party_id = $Party; rules_contract_id = $rules; action = $action; governance_type = "core_self" })
  Write-Host "CONFIRMED" -ForegroundColor Green
  $r | ConvertTo-Json -Depth 6 | Write-Host
} catch {
  Write-Host "REFUSED" -ForegroundColor Red
  Write-Host (ErrorText $_)
  exit 1
}

Start-Sleep -Seconds 3
$conf = Invoke-RestMethod -Uri "$base/governance/confirmations?party_id=$([uri]::EscapeDataString($Party))" -Headers $headers -TimeoutSec 60
$self = @($conf.actions | Where-Object { $_.action.type -eq "governance_add_additional_proposer" })
Write-Host ""
Show "self-actions pending" $self.Count
foreach ($a in $self) {
  Show "  confirmations" (@($a.confirmations).Count)
  Show "  can execute" $a.can_execute
}
Write-Host ""
Write-Host "Threshold is 3 of 3, so this needs our second member and BitSafe's before it can execute." -ForegroundColor DarkGray
