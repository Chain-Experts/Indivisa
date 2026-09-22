# The governed settlement, driven against BitSafe's Decentralization Manager
# (DecMan). The paying agent proposes; the members confirm and execute
# through DecMan's REST API; nothing here talks to the ledger for the vote.
#
#   pwsh infra/govern.ps1 status  -Network bitsafe -Tag bs1
#   pwsh infra/govern.ps1 admit   -Network bitsafe -Tag bs1          # members vote the agent in as proposer, once
#   pwsh infra/demo.ps1   prepare -Network bitsafe -Tag bs1 -Approver <dec party>   # the run names the approver
#   pwsh infra/govern.ps1 propose -Network bitsafe -Tag bs1          # the agent files SettleRunProposal
#   pwsh infra/govern.ps1 confirm -Network bitsafe -Tag bs1 -Node 1  # one member confirms
#   pwsh infra/govern.ps1 execute -Network bitsafe -Tag bs1 -Node 2  # refused: below threshold
#   pwsh infra/govern.ps1 confirm -Network bitsafe -Tag bs1 -Node 2  # second member confirms
#   pwsh infra/govern.ps1 execute -Network bitsafe -Tag bs1 -Node 3  # settled
#   pwsh infra/govern.ps1 audit   -Network bitsafe -Tag bs1
#
# The decentralised party, its members and its rules come from the sandbox's
# hackathon/.state (written by BitSafe's seed.sh); -DecMan points at that
# clone. Three DecMan nodes on localhost:8081-8083, one per participant.

param(
  [Parameter(Mandatory = $true, Position = 0)] [ValidateSet("status", "admit", "propose", "confirm", "execute", "audit")] [string] $Command,
  [string] $Network = "bitsafe",
  [string] $Tag = "bs1",
  [int] $Node = 1,
  [string] $DecMan = (Join-Path $PSScriptRoot "..\..\decentralization-manager")
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$netDir = Join-Path $PSScriptRoot $Network
$demoDir = Join-Path $netDir "demo"
$mapFile = Join-Path $netDir "participants-with-parties.json"
$ui = Get-Content (Join-Path $netDir "ui.json") -Raw | ConvertFrom-Json
$govDar = Join-Path $root "daml\indivisa-governance-test\.daml\dist\indivisa-governance-test-0.1.0.dar"

# --- the sandbox's governance state ------------------------------------------
$stateFile = Join-Path (Resolve-Path $DecMan).Path "hackathon\.state"
if (-not (Test-Path $stateFile)) { throw "No $stateFile; run the sandbox's hackathon/seed.sh first" }
$state = @{}
Get-Content $stateFile | ForEach-Object { if ($_ -match "^([A-Z_0-9]+)=(.*)$") { $state[$matches[1]] = $matches[2] } }
$decParty = $state["DEC_PARTY_ID"]
$members = @($state["MEMBER_1"], $state["MEMBER_2"], $state["MEMBER_3"])
function DmPort([int] $n) { 8080 + $n }
function DmGet([int] $n, [string] $path) { Invoke-RestMethod -Uri ("http://localhost:{0}{1}" -f (DmPort $n), $path) -Method Get -TimeoutSec 60 }
function DmPost([int] $n, [string] $path, $body) {
  Invoke-RestMethod -Uri ("http://localhost:{0}{1}" -f (DmPort $n), $path) -Method Post -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 12) -TimeoutSec 300
}
function RulesCid() {
  $live = (DmGet 1 "/governance/state?party_id=$decParty").state.contract_id
  if ($live) { $live } else { $state["RULES_CID"] }
}
# The action field is required by the request schema and ignored for core_domain.
$placeholderAction = @{ type = "governance_set_threshold"; new_threshold = 0 }

# --- ledger reads over the JSON API (blobs for disclosure) -------------------
function LedgerPost([string] $participant, [string] $path, $body) {
  $u = $ui.participants.$participant
  $headers = @{ Authorization = "Bearer " + $u.token }
  Invoke-RestMethod -Uri ($u.jsonApi.TrimEnd("/") + $path) -Method Post -ContentType "application/json" -Headers $headers -Body ($body | ConvertTo-Json -Depth 12) -TimeoutSec 60
}
function ActiveWithBlobs([string] $participant, [string] $party, [string] $templateId) {
  # The unpaged endpoint: Canton 3.5.8 (the sandbox) has no active-contracts-page,
  # and the few contracts disclosed here are far below the 200-element cap.
  $u = $ui.participants.$participant
  $end = Invoke-RestMethod -Uri ($u.jsonApi.TrimEnd("/") + "/v2/state/ledger-end") -Headers @{ Authorization = "Bearer " + $u.token } -TimeoutSec 60
  $body = @{
    eventFormat = @{
      filtersByParty = @{ $party = @{ cumulative = @(@{ identifierFilter = @{ TemplateFilter = @{ value = @{ templateId = $templateId; includeCreatedEventBlob = $true } } } }) } }
      verbose = $false
    }
    activeAtOffset = $end.offset
  }
  $entries = LedgerPost $participant "/v2/state/active-contracts" $body
  @($entries | ForEach-Object { $_.contractEntry.JsActiveContract.createdEvent } | Where-Object { $null -ne $_ })
}
function ParticipantOf([string] $party) {
  $map = Get-Content $mapFile -Raw | ConvertFrom-Json
  $p = $map.party_participants.$party
  if (-not $p) { throw "no participant known for $party; regenerate the party map" }
  $p
}

# --- files of this tag --------------------------------------------------------
$seatFile = Join-Path $demoDir "seat-$Tag.json"
$preparedFile = Join-Path $demoDir "prepared-$Tag.json"
$proposalFile = Join-Path $demoDir "proposal-$Tag.json"
function Seat() { if (-not (Test-Path $seatFile)) { throw "No seat '$Tag' on $Network" }; Get-Content $seatFile -Raw | ConvertFrom-Json }
function Prepared() { if (-not (Test-Path $preparedFile)) { throw "No prepared run '$Tag'; run demo.ps1 prepare -Network $Network -Tag $Tag -Approver $decParty" }; Get-Content $preparedFile -Raw | ConvertFrom-Json }
function Proposal() { if (-not (Test-Path $proposalFile)) { throw "No proposal for '$Tag'; run govern.ps1 propose first" }; Get-Content $proposalFile -Raw | ConvertFrom-Json }

switch ($Command) {
  "status" {
    $seat = Seat
    Write-Host "decentralised party  $decParty"
    Write-Host "rules contract       $(RulesCid)"
    for ($i = 0; $i -lt 3; $i++) { Write-Host ("member {0} (node {0}) {1}" -f ($i + 1), $members[$i]) }
    Write-Host "paying agent         $($seat.payingAgent)"
    $conf = DmGet 1 "/governance/confirmations?party_id=$decParty"
    Write-Host "pending domain actions: $(@($conf.domain_actions).Count)"
    $conf | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $demoDir "confirmations-$Tag.json")
    Write-Host "confirmations dumped to $demoDir\confirmations-$Tag.json"
  }

  "admit" {
    # A self-management vote: add the paying agent to additionalProposers.
    $seat = Seat
    $action = @{ type = "governance_add_additional_proposer"; additional_proposer = $seat.payingAgent }
    $rules = RulesCid
    foreach ($n in 1, 2) {
      $r = DmPost $n "/governance/confirm" @{ party_id = $decParty; rules_contract_id = $rules; action = $action; governance_type = "core_self" }
      Write-Host "node $n confirmed: $($r | ConvertTo-Json -Compress -Depth 5)"
    }
    Start-Sleep -Seconds 3
    $conf = DmGet 1 "/governance/confirmations?party_id=$decParty"
    $conf | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $demoDir "confirmations-admit-$Tag.json")
    $cids = @($conf.actions | Where-Object { $_.action.type -eq "governance_add_additional_proposer" } | ForEach-Object { $_.confirmations } | ForEach-Object { $_.contract_id })
    if ($cids.Count -lt 2) { throw "expected two self-action confirmations, found $($cids.Count); see confirmations-admit-$Tag.json" }
    $r = DmPost 1 "/governance/execute" @{ party_id = $decParty; rules_contract_id = $rules; action = $action; confirmation_cids = $cids; governance_type = "core_self" }
    Write-Host "executed: $($r | ConvertTo-Json -Compress -Depth 5)"
    Start-Sleep -Seconds 3
    Write-Host "rules contract now   $(RulesCid)"
  }

  "propose" {
    $prepared = Get-Content $preparedFile -Raw
    $argsFile = Join-Path $demoDir "propose-args-$Tag.json"
    Set-Content -Path $argsFile -Value ('{"prepared":' + $prepared + ',"approver":"' + $decParty + '"}') -NoNewline
    pwsh -NoProfile -File (Join-Path $PSScriptRoot "participants-with-parties.ps1") -Network $Network -Out $mapFile | Out-Null
    $env:JAVA_TOOL_OPTIONS = "-Xss64m"
    Push-Location (Join-Path $root "daml\indivisa-governance-test")
    try {
      & dpm script --dar $govDar --script-name "Indivisa.Governance.Demo:govern_propose" `
        --input-file $argsFile --output-file $proposalFile --participant-config $mapFile 2>&1 |
        Tee-Object -FilePath (Join-Path $demoDir "propose-$Tag.log") | Select-String -Pattern "FailedCmd|Exception|does not name" | ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
    } finally { Pop-Location; $env:JAVA_TOOL_OPTIONS = $null }
    $p = Proposal
    Write-Host "proposed $($p.runId): $($p.legs) legs, $($p.total) -> $($p.actionCid)"
  }

  "confirm" {
    $p = Proposal
    $r = DmPost $Node "/governance/confirm" @{ party_id = $decParty; rules_contract_id = (RulesCid); action = $placeholderAction; governance_type = "core_domain"; proposal_cid = $p.actionCid }
    Write-Host "node $Node confirmed: $($r | ConvertTo-Json -Compress -Depth 5)"
  }

  "execute" {
    $p = Proposal
    $seat = Seat
    $prepared = Prepared
    # Whatever confirmations exist for this proposal, threshold or not: the engine decides.
    $conf = DmGet $Node "/governance/confirmations?party_id=$decParty"
    $entry = $conf.domain_actions | Where-Object { $_.proposal_cid -eq $p.actionCid }
    $cids = @($entry.confirmations | ForEach-Object { $_.contract_id })
    Write-Host "node $Node executes with $($cids.Count) confirmation(s); can_execute=$($entry.can_execute)"
    # Disclosed to the executing node: the registry's rules (the factory) and the agent's locked cash.
    $rules = ActiveWithBlobs (ParticipantOf $seat.registry) $seat.registry "#splice-test-token-v2:Splice.Testing.Tokens.TestTokenV2:TokenRules" |
      Where-Object { $_.contractId -eq $seat.rulesCid }
    $locked = ActiveWithBlobs (ParticipantOf $seat.payingAgent) $seat.payingAgent "#splice-test-token-v2:Splice.Testing.Tokens.TestTokenV2.Holding:Token" |
      Where-Object { $null -ne $_.createArgument.holding.lock }
    $disclosed = @(@($rules) + @($locked) | ForEach-Object { @{ contract_id = $_.contractId; blob = $_.createdEventBlob } })
    Write-Host "disclosing $($disclosed.Count) contract(s): the rules and $(@($locked).Count) locked holding(s)"
    $body = @{ party_id = $decParty; rules_contract_id = (RulesCid); action = $placeholderAction; confirmation_cids = $cids; disclosed_contracts = $disclosed; governance_type = "core_domain"; proposal_cid = $p.actionCid }
    try {
      $r = DmPost $Node "/governance/execute" $body
      Write-Host "EXECUTED: $($r | ConvertTo-Json -Compress -Depth 6)"
      $r | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $demoDir "execute-$Tag-node$Node-$(Get-Date -Format HHmmss).json")
    } catch {
      $msg = $_.ErrorDetails.Message
      if (-not $msg) { $msg = $_.Exception.Message }
      Write-Host "REFUSED: $msg"
      Set-Content (Join-Path $demoDir "refused-$Tag-node$Node-$(Get-Date -Format HHmmss).txt") $msg
    }
  }

  "audit" {
    $a = DmGet 1 "/governance/chain-audit?party_id=$decParty&limit=30&refresh=true"
    $a.entries | ForEach-Object { "{0,-16} offset {1,-6} {2}" -f $_.event_type, $_.offset, $_.update_id } | Select-Object -First 30
    $a | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $demoDir "audit-$Tag.json")
  }
}
