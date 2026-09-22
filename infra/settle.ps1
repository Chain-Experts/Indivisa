# Benchmark the one transaction with a client that is not the Daml Script
# runner: prepare N legs with the script (reusing the Holder-* parties), then
# settle over the JSON Ledger API from Node and time submit to commit.
#
#   pwsh infra/settle.ps1 -Holders 500 [-Network localnet]
#   pwsh infra/settle.ps1 -Prepared infra/localnet/demo/prepared-<tag>.json   # a demo seat instead
#
# Why: the script runner spends minutes digesting a large transaction tree
# after the ledger has committed it (18 Sep, docs/benchmark.md), so its
# in-script timings measure the client, not the ledger.

param(
  [string] $Network = "localnet",
  [int] $Holders = 0,
  [string] $Prepared = "",
  [string] $User = "",
  [switch] $Tls,
  [string] $CaCrt = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$testDir = Join-Path $root "daml\indivisa-test"
$uiDir = Join-Path $root "ui"
$dar = Join-Path $testDir ".daml\dist\indivisa-test-0.1.0.dar"
$netDir = Join-Path $PSScriptRoot $Network
$logDir = Join-Path $netDir "log"
$mapFile = Join-Path $netDir "participants-with-parties.json"
$uiFile = Join-Path $netDir "ui.json"
New-Item -ItemType Directory -Force $logDir | Out-Null

if (-not $Prepared) {
  if ($Holders -le 0) { throw "Give -Holders N or -Prepared <file>" }
  if (-not (Test-Path $dar)) { throw "Build first: dpm build --all" }
  pwsh -NoProfile -File (Join-Path $PSScriptRoot "participants-with-parties.ps1") -Network $Network -Out $mapFile | Out-Null
  $argsFile = Join-Path $logDir "settle-args-$Holders.json"
  $Prepared = Join-Path $logDir "settle-prepared-$Holders.json"
  Set-Content -Path $argsFile -Value ('{"topology":"LocalNet","holders":' + $Holders + ',"user":' + $(if ($User) { '"' + $User + '"' } else { "null" }) + '}') -NoNewline
  $tlsArgs = @()
  if ($Tls) { $tlsArgs += "--tls" }
  if ($CaCrt) { $tlsArgs += "--cacrt"; $tlsArgs += (Resolve-Path $CaCrt).Path }
  $env:JAVA_TOOL_OPTIONS = "-Xss64m -Xmx4g"
  Set-Location $testDir
  try {
    $t = Measure-Command {
      & dpm script --dar $dar --script-name "Indivisa.Test.Scale:scalePrepare" `
        --input-file $argsFile --output-file $Prepared --participant-config $mapFile @tlsArgs *> (Join-Path $logDir "settle-prepare-$Holders.log")
      if ($LASTEXITCODE -ne 0) { throw "prepare failed; see $logDir\settle-prepare-$Holders.log" }
    }
    Write-Host ("prepared {0} legs in {1:N0}s -> {2}" -f $Holders, $t.TotalSeconds, $Prepared)
  } finally {
    $env:JAVA_TOOL_OPTIONS = $null
  }
} else {
  $Prepared = (Resolve-Path $Prepared).Path
}

# The agent and the registry were allocated by the prepare, so the map is
# regenerated before the settle client looks them up.
pwsh -NoProfile -File (Join-Path $PSScriptRoot "participants-with-parties.ps1") -Network $Network -Out $mapFile | Out-Null
Set-Location $uiDir
$bundle = Join-Path $logDir "settle.mjs"
# esbuild.cmd directly: the npx.ps1 shim mangles its arguments under pwsh.
& (Join-Path $uiDir "node_modules/.bin/esbuild.cmd") scripts/settle.ts --bundle --platform=node --format=esm --target=node22 --log-level=warning --outfile=$bundle
if ($LASTEXITCODE -ne 0) { throw "esbuild failed" }
& node $bundle $uiFile $mapFile $Prepared
