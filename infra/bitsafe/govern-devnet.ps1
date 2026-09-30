# The governed settlement on DevNet, where BitSafe runs the second node.
#
#   $env:INDIVISA_CLIENT_SECRET = "..."
#   pwsh infra/bitsafe/govern-devnet.ps1 seat      # 5 holders
#   pwsh infra/bitsafe/govern-devnet.ps1 prepare   # allocations, approver named
#   pwsh infra/bitsafe/govern-devnet.ps1 propose   # files the SettleRunProposal
#   pwsh infra/bitsafe/govern-devnet.ps1 disclose  # contracts the execute needs
#   pwsh infra/bitsafe/govern-devnet.ps1 status
#
# Why this exists rather than infra/govern.ps1: that script drives BitSafe's
# LOCAL sandbox. It reads the decentralised party out of the state file
# hackathon/seed.sh writes, and talks to three DecMan instances on
# localhost:8081-8083. On DevNet the party is real, the members are real, and
# BitSafe's DecMan is theirs, so confirm and execute happen in the two web
# UIs rather than here. Everything up to the proposal is a LEDGER operation,
# and that is what this script does.
#
# DevNet specifics baked in, each learned the hard way:
#   - the Keycloak token lives 300 seconds, so the seat stays small
#   - the JVM does not trust this machine's TLS interception, hence -CaCrt
#   - the ledger user is the service account's `sub`, not a person
#   - INDIVISA_GOVERNED=1 stops the seat before it creates a run that can
#     never gain an approver: a DistributionRun is created once per run id,
#     and nothing afterwards can add one

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("seat", "prepare", "propose", "disclose", "status", "evidence")]
  [string] $Command,
  [string] $Tag = "gov1",
  [int] $Holders = 5,
  [string] $Approver = "indivisa-approvers::1220099c55468768a4f5a449ba7e1388967f9f42b1b03d982d9d375f7a2642bb7b3a",
  [string] $User = "d446488e-1170-4211-880e-0e7cd720a5d5"
)

$ErrorActionPreference = "Stop"
$Network = "devnet"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$netDir = Join-Path $root "infra/$Network"
$demoDir = Join-Path $netDir "demo"
$mapFile = Join-Path $netDir "participants-with-parties.json"
$ca = Join-Path $netDir "ca.pem"
$govDar = Join-Path $root "daml/indivisa-governance-test/.daml/dist/indivisa-governance-test-0.1.0.dar"

$seatFile = Join-Path $demoDir "seat-$Tag.json"
$preparedFile = Join-Path $demoDir "prepared-$Tag.json"
$proposalFile = Join-Path $demoDir "proposal-$Tag.json"

if (-not (Test-Path $netDir)) { throw "no infra/$Network; the DevNet config is git-ignored" }
New-Item -ItemType Directory -Force $demoDir | Out-Null

$ui = Get-Content (Join-Path $netDir "ui.json") -Raw | ConvertFrom-Json
$base = ($ui.participants.agent.jsonApi).TrimEnd("/")

# demo.ps1 does the ledger work; this only supplies the DevNet flags.
function Demo([string] $sub, [string[]] $extra) {
  $a = @($sub, "-Network", $Network, "-Tag", $Tag, "-User", $User, "-Tls")
  # -CaCrt only when there is no truststore. Passing --cacrt makes the runner
  # build its own trust manager from that one PEM and ignore
  # javax.net.ssl.trustStore entirely, so the two fight and the PEM wins -
  # which is what kept failing on 29 Sep.
  if (-not (Test-Path (Join-Path $netDir "truststore.jks")) -and (Test-Path $ca)) {
    $a += @("-CaCrt", $ca)
  }
  if ($extra) { $a += $extra }
  Write-Host "demo.ps1 $($a -join ' ')" -ForegroundColor DarkGray
  & pwsh -NoProfile -File (Join-Path $root "infra/demo.ps1") @a
  # demo.ps1 now throws when the runner writes no output file, and a throw
  # in a -File child sets a non-zero exit code. Before that fix a TLS
  # failure exited 0 and printed a success line.
  if ($LASTEXITCODE -ne 0) { throw "demo.ps1 $sub failed - see the log path in the error above" }
}

# Every ledger read mints its own token: 300 seconds is not long enough to
# hold one across a command.
function Token() { & (Join-Path $root "infra/token.ps1") -Network $Network }

function ActiveWithBlobs([string] $party, [string] $templateId) {
  $h = @{ Authorization = "Bearer " + (Token); "Content-Type" = "application/json" }
  $end = Invoke-RestMethod -Uri "$base/v2/state/ledger-end" -Headers $h -TimeoutSec 60
  $body = @{
    eventFormat = @{
      filtersByParty = @{ $party = @{ cumulative = @(@{ identifierFilter = @{ TemplateFilter = @{ value = @{
        templateId = $templateId; includeCreatedEventBlob = $true } } } }) } }
      verbose = $false
    }
    activeAtOffset = $end.offset
  }
  $r = Invoke-RestMethod -Uri "$base/v2/state/active-contracts" -Method Post -Headers $h `
    -Body ($body | ConvertTo-Json -Depth 12) -TimeoutSec 120
  @($r | ForEach-Object { $_.contractEntry.JsActiveContract.createdEvent } | Where-Object { $null -ne $_ })
}

function Seat() {
  if (-not (Test-Path $seatFile)) { throw "no seat '$Tag'; run: govern-devnet.ps1 seat" }
  Get-Content $seatFile -Raw | ConvertFrom-Json
}

switch ($Command) {

  "seat" {
    # Stop after seating. prepare creates the run, with the approver named.
    $env:INDIVISA_GOVERNED = "1"
    try { Demo "seat" @("-Holders", "$Holders") } finally { $env:INDIVISA_GOVERNED = $null }
    Write-Host ""
    Write-Host "seated $Holders holders on DevNet as '$Tag'" -ForegroundColor Green
    Write-Host "next: govern-devnet.ps1 prepare -Tag $Tag"
  }

  "prepare" {
    Demo "prepare" @("-Approver", $Approver)
    $p = Get-Content $preparedFile -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host "prepared: $($p.allocationCids.Count) allocations, $($p.legs) legs, total $($p.total)" -ForegroundColor Green
    Write-Host "approver: $Approver"
    Write-Host "next: govern-devnet.ps1 propose -Tag $Tag"
  }

  "propose" {
    if (-not (Test-Path $preparedFile)) { throw "no prepared run '$Tag'; run prepare first" }
    if (-not (Test-Path $govDar)) { throw "missing $govDar; run: dpm build --all" }
    $argsFile = Join-Path $demoDir "propose-args-$Tag.json"
    $json = '{"prepared":' + (Get-Content $preparedFile -Raw) + ',"approver":"' + $Approver + '"}'
    Set-Content -Path $argsFile -Value $json -NoNewline
    # A token seconds old into the participant map: the Daml Script runner
    # holds one for the whole script and cannot refresh mid-run.
    & pwsh -NoProfile -File (Join-Path $root "infra/participants-with-parties.ps1") -Network $Network -Out $mapFile | Out-Null
    $env:JAVA_TOOL_OPTIONS = "-Xss64m"
    Push-Location (Join-Path $root "daml/indivisa-governance-test")
    try {
      & dpm script --dar $govDar --script-name "Indivisa.Governance.Demo:govern_propose" `
        --input-file $argsFile --output-file $proposalFile --participant-config $mapFile 2>&1 |
        Tee-Object -FilePath (Join-Path $demoDir "propose-$Tag.log") |
        Select-String -Pattern "FailedCmd|Exception|does not name|UNRESOLVED|PERMISSION" |
        ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
    } finally { Pop-Location; $env:JAVA_TOOL_OPTIONS = $null }
    if (-not (Test-Path $proposalFile)) { throw "propose produced no output; see $demoDir/propose-$Tag.log" }
    $p = Get-Content $proposalFile -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host "PROPOSED $($p.runId)" -ForegroundColor Green
    Write-Host "  $($p.legs) legs, $($p.total)"
    Write-Host "  action contract: $($p.actionCid)"
    Write-Host ""
    Write-Host "It should now appear in BOTH Decentralization Managers as a pending"
    Write-Host "domain action. Three confirmations are needed: two ours, one BitSafe's."
    Write-Host "Then: govern-devnet.ps1 disclose -Tag $Tag"
  }

  "disclose" {
    # The executing node runs executeImpl and has never seen these contracts,
    # so they travel with the request.
    $seat = Seat
    $rules = ActiveWithBlobs $seat.registry "#splice-test-token-v2:Splice.Testing.Tokens.TestTokenV2:TokenRules" |
      Where-Object { $_.contractId -eq $seat.rulesCid }
    $locked = ActiveWithBlobs $seat.payingAgent "#splice-test-token-v2:Splice.Testing.Tokens.TestTokenV2.Holding:Token" |
      Where-Object { $null -ne $_.createArgument.holding.lock }
    $disclosed = @(@($rules) + @($locked) | ForEach-Object {
      @{ contract_id = $_.contractId; blob = $_.createdEventBlob } })
    $out = Join-Path $demoDir "disclosed-$Tag.json"
    $disclosed | ConvertTo-Json -Depth 6 | Set-Content $out
    Write-Host "$($disclosed.Count) contract(s): the registry's rules and $(@($locked).Count) locked holding(s)" -ForegroundColor Green
    Write-Host "written to $out"
    Write-Host ""
    Write-Host "Contract ids (blobs are in the file; they are long):"
    $disclosed | ForEach-Object { Write-Host "  $($_.contract_id)" }
  }

  "evidence" {
    # What a judge can check: the receipt the settlement wrote, and the
    # update id of the transaction that wrote it.
    $seat = Seat
    $agent = $seat.payingAgent
    $receipts = ActiveWithBlobs $agent "#indivisa:Indivisa.Model.Distribution:DistributionReceipt"
    if (-not $receipts) { throw "no DistributionReceipt for this agent; did the settlement execute?" }
    # An agent that has settled the same run id more than once - re-running
    # prepare on a settled tag does exactly that - has several receipts. Take
    # the newest by ledger offset, or the evidence describes an older
    # settlement than the one just executed.
    $receipts = @($receipts | Sort-Object -Property @{ Expression = { [int64] $_.offset } } -Descending)
    $ev = $receipts[0]
    if ($receipts.Count -gt 1) {
      Write-Host "$($receipts.Count) receipts for this agent; showing the newest (offset $($ev.offset))" -ForegroundColor DarkGray
      foreach ($r in $receipts | Select-Object -Skip 1) {
        Write-Host ("  earlier: offset {0}  {1}" -f $r.offset, $r.contractId.Substring(0, 24)) -ForegroundColor DarkGray
      }
    }
    $a = $ev.createArgument
    Write-Host ""
    Write-Host "DistributionReceipt on DevNet" -ForegroundColor Green
    "{0,-16} {1}" -f "runId", $a.runId | Write-Host
    "{0,-16} {1}" -f "legsSettled", $a.legsSettled | Write-Host
    "{0,-16} {1} {2}" -f "total", $a.total, $a.instrument.id | Write-Host
    "{0,-16} {1}" -f "contract", $ev.contractId | Write-Host

    $updateId = $null
    "{0,-16} {1}" -f "offset", $(if ($null -ne $ev.offset) { $ev.offset } else { "(absent)" }) | Write-Host
    if ($null -ne $ev.offset) {
      $h = @{ Authorization = "Bearer " + (Token); "Content-Type" = "application/json" }
      # update-by-offset refuses an empty filtersByParty.
      $body = @{
        offset = $ev.offset
        updateFormat = @{ includeTransactions = @{ eventFormat = @{
          filtersByParty = @{ $agent = @{ cumulative = @(@{ identifierFilter = @{ WildcardFilter = @{ value = @{ includeCreatedEventBlob = $false } } } }) } }
          verbose = $false }; transactionShape = "TRANSACTION_SHAPE_ACS_DELTA" } }
      }
      try {
        $u = Invoke-RestMethod -Method Post -Uri "$base/v2/updates/update-by-offset" -Headers $h `
          -Body ($body | ConvertTo-Json -Depth 12) -TimeoutSec 120
        # The Update variant is `Transaction` per the participant's own spec,
        # but read it generically rather than trust one path: a wrong guess
        # here fails silently and looks like a missing update id.
        $raw = $u | ConvertTo-Json -Depth 20 -Compress
        $m = [regex]::Match($raw, '"updateId"\s*:\s*"([^"]+)"')
        if ($m.Success) { $updateId = $m.Groups[1].Value }
        if (-not $updateId) {
          Write-Host "no updateId in the response; its top-level shape was:" -ForegroundColor DarkYellow
          Write-Host ("  " + (($u.PSObject.Properties | ForEach-Object { $_.Name }) -join ", ")) -ForegroundColor DarkYellow
          if ($u.update) {
            Write-Host ("  update: " + (($u.update.PSObject.Properties | ForEach-Object { $_.Name }) -join ", ")) -ForegroundColor DarkYellow
          }
          Set-Content (Join-Path $demoDir "update-raw-$Tag.json") ($u | ConvertTo-Json -Depth 20)
          Write-Host "  full response saved to update-raw-$Tag.json" -ForegroundColor DarkYellow
        }
      } catch {
        Write-Host "could not read the update: $($_.Exception.Message)" -ForegroundColor DarkYellow
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-Host "  $($_.ErrorDetails.Message)" -ForegroundColor DarkYellow }
      }
    }
    if ($updateId) { "{0,-16} {1}" -f "update id", $updateId | Write-Host -ForegroundColor Green }
    else { Write-Host "update id not resolved; the receipt above is still the evidence" -ForegroundColor DarkYellow }

    $out = Join-Path $demoDir "evidence-$Tag.json"
    @{
      network = "DevNet"
      runId = $a.runId
      legsSettled = $a.legsSettled
      total = $a.total
      currency = $a.instrument.id
      receiptContractId = $ev.contractId
      updateId = $updateId
      governed = $true
      approver = $Approver
      recordedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 6 | Set-Content $out
    Write-Host ""
    Write-Host "written to $out" -ForegroundColor DarkGray
  }

  "status" {
    Write-Host "network        DevNet"
    Write-Host "approver party $Approver"
    Write-Host ("{0,-14} {1}" -f "seat", $(if (Test-Path $seatFile) { "yes" } else { "-" }))
    Write-Host ("{0,-14} {1}" -f "prepared", $(if (Test-Path $preparedFile) { "yes" } else { "-" }))
    Write-Host ("{0,-14} {1}" -f "proposal", $(if (Test-Path $proposalFile) { "yes" } else { "-" }))
    if (Test-Path $proposalFile) {
      $p = Get-Content $proposalFile -Raw | ConvertFrom-Json
      Write-Host "action cid     $($p.actionCid)"
      Write-Host "description    $($p.description)"
    }
  }
}
