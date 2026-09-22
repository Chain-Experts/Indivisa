# Push one settlement until the ledger refuses it, and record where.
#
#   pwsh infra/localnet/ceiling.ps1 -Holders 250 -Sweep 1000,2000,4000,6000,8000,12000
#
# Each step prepares a run of N legs over the same holder pool (see
# Indivisa.Test.Scale.scaleLegsN: with fewer holders than legs a holder
# receives several legs, so the batch is holders+1 allocations rather than
# legs+1) and settles it over the JSON Ledger API. It records, per step:
# whether it settled, the client's submit-to-commit time, the sequencer's
# request size for the settle, and the ledger's own interpret-to-finalise
# time. The first failure is kept verbatim: that text is the answer to
# "where is the ceiling".
#
# Results land in infra/localnet/log/ceiling.csv and ceiling-<N>.txt.
# Stops at the first failure unless -KeepGoing.

param(
  [int] $Holders = 250,
  [int[]] $Sweep = @(1000, 2000, 4000, 6000, 8000, 12000),
  [switch] $KeepGoing,
  [string] $Network = "localnet"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logDir = Join-Path $PSScriptRoot "log"
$csv = Join-Path $logDir "ceiling.csv"
New-Item -ItemType Directory -Force $logDir | Out-Null
if (-not (Test-Path $csv)) { "legs,holders,allocations,outcome,client_ms,request_bytes,ledger_ms,note" | Set-Content $csv }

$canton = Join-Path $logDir "canton.log"

# The sequencer logs every submission; the settle is the agent's largest by
# far. Take the biggest request logged after a given time, with its phases.
function SettleFromLog([datetime] $since) {
  $from = $since.ToString("yyyy-MM-dd HH:mm:ss")
  $lines = Select-String -Path $canton -Pattern "PAR::agent.*sends request .* of size (\d+) bytes with (\d+) envelopes" -AllMatches |
    Where-Object { $_.Line.Substring(0, 19) -ge $from }
  if (-not $lines) { return $null }
  $best = $lines | Sort-Object { [int]$_.Matches[0].Groups[1].Value } | Select-Object -Last 1
  $size = [int]$best.Matches[0].Groups[1].Value
  $tid = if ($best.Line -match "(tid:[0-9a-f]+)") { $matches[1] } else { $null }
  $ledgerMs = $null
  if ($tid) {
    $phase = Select-String -Path $canton -Pattern ([regex]::Escape($tid)) |
      Where-Object { $_.Line -match "Phase 1 completed|Phase 6: Finalized" }
    $p1 = $phase | Where-Object { $_.Line -match "Phase 1 completed" } | Select-Object -First 1
    $p6 = $phase | Where-Object { $_.Line -match "Phase 6: Finalized" } | Select-Object -First 1
    if ($p1 -and $p6) {
      $t1 = [datetime]::ParseExact($p1.Line.Substring(0, 23), "yyyy-MM-dd HH:mm:ss,fff", $null)
      $t6 = [datetime]::ParseExact($p6.Line.Substring(0, 23), "yyyy-MM-dd HH:mm:ss,fff", $null)
      $ledgerMs = [int]($t6 - $t1).TotalMilliseconds
    }
  }
  [pscustomobject]@{ size = $size; ledgerMs = $ledgerMs }
}

foreach ($n in $Sweep) {
  Write-Host ("=== {0} legs over {1} holders" -f $n, $Holders)
  $started = Get-Date
  $out = Join-Path $logDir "ceiling-$n.txt"
  $ok = $true
  $clientMs = $null
  $note = ""

  try {
    $text = & pwsh -NoProfile -File (Join-Path $root "infra\settle.ps1") -Holders $Holders -Legs $n -Network $Network 2>&1 | Out-String
  } catch {
    $text = $_ | Out-String
  }
  $text | Set-Content $out
  Write-Host ($text -split "`n" | Where-Object { $_ -match "prepared|settled|failed|error|Error|refus|REFUS|Exception" } | Select-Object -First 4)

  if ($text -match "settled \d+ legs in (\d+) ms") { $clientMs = [int]$matches[1] } else { $ok = $false }
  if (-not $ok) {
    # The first line that says why, kept verbatim for the write-up.
    $why = ($text -split "`n" | Where-Object { $_ -match "error|Error|Exception|failed|refus|exceed|too large|LIMIT|RESOURCE" } | Select-Object -First 1)
    $note = ($why -replace '[",]', ' ').Trim()
    if ($note.Length -gt 300) { $note = $note.Substring(0, 300) }
  }

  Start-Sleep -Seconds 3
  $fromLog = SettleFromLog $started
  $row = "{0},{1},{2},{3},{4},{5},{6},{7}" -f $n, $Holders, ($Holders + 1),
    $(if ($ok) { "settled" } else { "FAILED" }),
    $(if ($clientMs) { $clientMs } else { "" }),
    $(if ($fromLog) { $fromLog.size } else { "" }),
    $(if ($fromLog -and $fromLog.ledgerMs) { $fromLog.ledgerMs } else { "" }),
    $note
  $row | Add-Content $csv
  Write-Host $row

  if (-not $ok -and -not $KeepGoing) {
    Write-Host "stopping at the first failure; full output in $out"
    break
  }
}

Write-Host "--- $csv"
Get-Content $csv
