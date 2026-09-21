# Run the six proofs against LocalNet, one after another, and print one
# line per proof. Regression check after a model or fixture change.
#
#   pwsh infra/localnet/proofs.ps1 [-Network localnet]

param(
  [string] $Network = "localnet",
  [switch] $Tls,
  [string] $CaCrt = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$testDir = Join-Path $root "daml\indivisa-test"
$dar = Join-Path $testDir ".daml\dist\indivisa-test-0.1.0.dar"
$netDir = Join-Path $root "infra\$Network"
$participants = Join-Path $netDir "participants.json"
$logDir = Join-Path $netDir "log"
$topology = Join-Path $logDir "topology.json"
New-Item -ItemType Directory -Force $logDir | Out-Null
Set-Content -Path $topology -Value '"LocalNet"' -NoNewline

if (-not (Test-Path $dar)) { throw "Build first: dpm build --all" }

$proofs = @(
  "Indivisa.Test.Distribution:proof1With",
  "Indivisa.Test.Distribution:proof2With",
  "Indivisa.Test.Distribution:proof3With",
  "Indivisa.Test.Distribution:proof3bWith",
  "Indivisa.Test.Distribution:proof4With",
  "Indivisa.Test.Distribution:proof4bWith",
  "Indivisa.Test.Coupon:couponWith"
)

$tlsArgs = @()
if ($Tls) { $tlsArgs += "--tls" }
if ($CaCrt) { $tlsArgs += "--cacrt"; $tlsArgs += (Resolve-Path $CaCrt).Path }
$env:JAVA_TOOL_OPTIONS = "-Xss64m"
Set-Location $testDir
$failed = 0
try {
  foreach ($p in $proofs) {
    $name = $p.Split(":")[1]
    $log = Join-Path $logDir "proof-$name.log"
    $t = Measure-Command {
      & dpm script --dar $dar --script-name $p --input-file $topology --participant-config $participants @tlsArgs *> $log
      $script:exit = $LASTEXITCODE
    }
    $status = if ($exit -eq 0) { "pass" } else { $failed++; "FAIL" }
    Write-Host ("{0,-12} {1,4}  {2,6:N1}s  {3}" -f $name, $status, $t.TotalSeconds, $log)
  }
} finally {
  $env:JAVA_TOOL_OPTIONS = $null
}
if ($failed -gt 0) { throw "$failed proof(s) failed" }
