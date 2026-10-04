# Execute the governed settlement once both members have confirmed.
#
#   $env:DECMAN_TOKEN = "<the UI's bearer token>"
#   $env:INDIVISA_CLIENT_SECRET = "<the validator client secret>"
#   pwsh infra/bitsafe/settle-execute.ps1            # dry run
#   pwsh infra/bitsafe/settle-execute.ps1 -Execute   # settle
#
# Why not the UI's Execute button. The executing node runs our `executeImpl`,
# which reaches contracts it has never seen: the registry's TokenRules and the
# paying agent's locked holdings. Those have to travel with the request as
# disclosed contracts. DecMan's execute dialog pre-fills them only for its own
# built-in actions; for a custom GovernableAction it expects them by hand, and
# a blob per locked holding is not something to paste.
#
# So this fetches the blobs from the ledger, matches the confirmations to the
# proposal, and posts the whole thing.
#
# A domain action is addressed by `proposal_cid`, and the `action` field
# carries a placeholder the schema demands and the server ignores for
# core_domain. That is finding 5 in contrib/bitsafe/INTEGRATING.md and the
# single least guessable thing about this API.

param(
  [string] $DecMan = "",
  [string] $Party = "indivisa-approvers::1220099c55468768a4f5a449ba7e1388967f9f42b1b03d982d9d375f7a2642bb7b3a",
  [string] $Tag = "gov1",
  [switch] $Execute,
  # Submit below threshold ON PURPOSE, to record the engine refusing it.
  # That refusal is the whole claim of the governed path, so it is worth
  # filming rather than describing - but only ever deliberately.
  [switch] $Force
)

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

# The Decentralization Manager URL lives in the network config, which is
# git-ignored, so no deployment address is committed to this repository.
# Override with -DecMan for a different instance.
if (-not $DecMan) {
  $uiFile = Join-Path $root "infra/devnet/ui.json"
  if (-not (Test-Path $uiFile)) { throw "no infra/devnet/ui.json; copy ui.example.json and fill in decman.url, or pass -DecMan" }
  $DecMan = (Get-Content $uiFile -Raw | ConvertFrom-Json).decman.url
  if (-not $DecMan) { throw "infra/devnet/ui.json has no decman.url; add it, or pass -DecMan" }
}

$demoDir = Join-Path $root "infra/devnet/demo"
$proposalFile = Join-Path $demoDir "proposal-$Tag.json"
$disclosedFile = Join-Path $demoDir "disclosed-$Tag.json"

if (-not (Test-Path $proposalFile)) { throw "no proposal for '$Tag'; run govern-devnet.ps1 propose" }
if (-not (Test-Path $disclosedFile)) { throw "no disclosed contracts; run: govern-devnet.ps1 disclose -Tag $Tag" }

$proposal = Get-Content $proposalFile -Raw | ConvertFrom-Json
$disclosed = @(Get-Content $disclosedFile -Raw | ConvertFrom-Json)

$token = $env:DECMAN_TOKEN
if (-not $token) { throw "set DECMAN_TOKEN: on the DecMan tab, sessionStorage.getItem(`"dec_party_manager_token`")" }
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$base = $DecMan.TrimEnd("/")
$enc = [uri]::EscapeDataString($Party)

function ErrorText($err) {
  if ($err.ErrorDetails -and $err.ErrorDetails.Message) { return $err.ErrorDetails.Message }
  try { return (New-Object IO.StreamReader($err.Exception.Response.GetResponseStream())).ReadToEnd() }
  catch { return $err.Exception.Message }
}
function Show($k, $v) { "{0,-24} {1}" -f $k, $v | Write-Host }

Show "run" $proposal.runId
Show "legs / total" "$($proposal.legs) / $($proposal.total)"
Show "action contract" ($proposal.actionCid.Substring(0, 24) + "...")
Show "disclosed contracts" $disclosed.Count

$state = Invoke-RestMethod -Uri "$base/governance/state?party_id=$enc" -Headers $headers -TimeoutSec 60
$rules = $state.state.contract_id
Show "threshold" $state.state.threshold
Show "members" (@($state.state.members).Count)

# Confirmations for a domain action come back under domain_actions, matched on
# proposal_cid - not under `actions`, which holds the core self-governance ones.
$conf = Invoke-RestMethod -Uri "$base/governance/confirmations?party_id=$enc" -Headers $headers -TimeoutSec 60
$entry = @($conf.domain_actions) | Where-Object { $_.proposal_cid -eq $proposal.actionCid } | Select-Object -First 1
if (-not $entry) { throw "no pending domain action matching $($proposal.actionCid); has it already executed?" }
$cids = @($entry.confirmations | ForEach-Object { $_.contract_id })
Show "confirmations" $cids.Count
Show "can execute" $entry.can_execute

if (-not $Execute) {
  Write-Host ""
  if ($entry.can_execute) {
    Write-Host "ready. Re-run with -Execute to settle." -ForegroundColor Green
  } else {
    Write-Host "not yet at threshold - $($cids.Count) of $($state.state.threshold)." -ForegroundColor Yellow
  }
  exit 0
}

if (-not $entry.can_execute -and -not $Force) {
  Write-Host ""
  Write-Host "refusing to submit below threshold. The ledger would refuse it too, and" -ForegroundColor Yellow
  Write-Host "that refusal is worth demonstrating deliberately rather than by accident." -ForegroundColor Yellow
  Write-Host "To record the refusal on purpose, add -Force." -ForegroundColor Yellow
  exit 1
}
if (-not $entry.can_execute) {
  Write-Host ""
  Write-Host "-Force: submitting with $($cids.Count) of $($state.state.threshold) confirmations." -ForegroundColor Yellow
  Write-Host "The engine is expected to refuse. That is the point." -ForegroundColor Yellow
}

$body = @{
  party_id = $Party
  rules_contract_id = $rules
  # Required by the schema, ignored for core_domain. The real target is proposal_cid.
  action = @{ type = "governance_set_threshold"; new_threshold = 0 }
  confirmation_cids = $cids
  disclosed_contracts = @($disclosed | ForEach-Object { @{ contract_id = $_.contract_id; blob = $_.blob } })
  governance_type = "core_domain"
  proposal_cid = $proposal.actionCid
}

Write-Host ""
try {
  $r = Invoke-RestMethod -Method Post -Uri "$base/governance/execute" -Headers $headers -TimeoutSec 300 `
    -Body ($body | ConvertTo-Json -Depth 10)
  Write-Host "EXECUTED" -ForegroundColor Green
  $r | ConvertTo-Json -Depth 8 | Write-Host
  $out = Join-Path $demoDir "executed-$Tag-$(Get-Date -Format HHmmss).json"
  $r | ConvertTo-Json -Depth 10 | Set-Content $out
  Write-Host ""
  Write-Host "saved to $out" -ForegroundColor DarkGray
  Write-Host "Next: read the DistributionReceipt off the ledger for the evidence record." -ForegroundColor DarkGray
} catch {
  $msg = ErrorText $_
  # The body is JSON, so PowerShell renders quotes as ' and ". The
  # refusal is the point of this command and is read off a screen, so print
  # the engine's sentence plainly and keep the raw body in the file.
  $clean = try { [Regex]::Unescape($msg) } catch { $msg }
  $sentence = [Regex]::Match($clean, "The requirement '[^']+' was not met\.")
  Write-Host "REFUSED by the governance engine" -ForegroundColor Red
  Write-Host ""
  if ($sentence.Success) {
    Write-Host ("  " + $sentence.Value) -ForegroundColor Red
  } else {
    $inner = [Regex]::Match($clean, 'message:\s*"(.+?)"')
    Write-Host ("  " + $(if ($inner.Success) { $inner.Groups[1].Value } else { $clean })) -ForegroundColor Red
  }
  Write-Host ""
  Write-Host "  $($cids.Count) of $($state.state.threshold) confirmations. Nothing moved." -ForegroundColor DarkGray
  Set-Content (Join-Path $demoDir "refused-$Tag-$(Get-Date -Format HHmmss).txt") $msg
  exit 1
}
