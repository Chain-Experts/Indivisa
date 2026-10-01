# The demo, from a shell. Run from anywhere; paths are resolved from here.
#
#   pwsh infra/demo.ps1 seat    -Holders 250 -Tag sep18   # once per demo instance
#   pwsh infra/demo.ps1 attempt -Tag sep18 -Withhold 1    # rejected: one holder not ready
#   pwsh infra/demo.ps1 attempt -Tag sep18                # settled: 250/250
#   pwsh infra/demo.ps1 prepare -Tag sep18 [-Withhold 1]  # allocations only; the UI button settles
#
# -Network localnet (default) or devnet picks infra/<network>/participants.json
# and ui.json. Seat output lands in infra/<network>/demo/seat-<tag>.json
# (git-ignored) and is the input of every attempt. Attempt outcomes go next
# to it.
#
# Requires the network's participants to have the current indivisa DAR vetted
# and `dpm build --all` done. The participant map is regenerated before each
# command because the seat's parties already exist when the attempt runs.

param(
  [Parameter(Mandatory = $true, Position = 0)] [ValidateSet("seat", "prepare", "attempt")] [string] $Command,
  [string] $Network = "localnet",
  [string] $Tag = "demo",
  [int] $Holders = 250,
  [int] $Withhold = 0,
  [string] $Approver = "",
  [string] $User = "",
  [switch] $Tls,
  [string] $CaCrt = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$testDir = Join-Path $root "daml\indivisa-test"
$dar = Join-Path $testDir ".daml\dist\indivisa-test-0.1.0.dar"
$netDir = Join-Path $PSScriptRoot $Network
$demoDir = Join-Path $netDir "demo"
$mapFile = Join-Path $netDir "participants-with-parties.json"
if (-not (Test-Path $netDir)) { throw "No network '$Network' under infra/" }
New-Item -ItemType Directory -Force $demoDir | Out-Null

if (-not (Test-Path $dar)) { throw "Build first: dpm build --all" }
# Pass the seat where there is one: on a shared network the party list is the
# whole synchronizer's and walking it outlives the token. There is no seat yet
# on the first `seat` run, and none is needed - the runner allocates those
# parties itself.
$seatForMap = Join-Path $demoDir "seat-$Tag.json"
$mapArgs = @("-Network", $Network, "-Out", $mapFile)
if (Test-Path $seatForMap) { $mapArgs += @("-Seat", $seatForMap) }
pwsh -NoProfile -File (Join-Path $PSScriptRoot "participants-with-parties.ps1") @mapArgs | Out-Null

# The scripts' "LocalNet" topology means "named participants, one party per
# command". On DevNet the same five names are keys in participants.json that
# point at real validators, so the topology name does not change.
# TLS on the gRPC Ledger API is a runner-wide flag, not a per-participant one.
$tlsArgs = @()
if ($Tls) { $tlsArgs += "--tls" }
if ($CaCrt) { $tlsArgs += "--cacrt"; $tlsArgs += (Resolve-Path $CaCrt).Path }

$approverJson = if ($Approver) { '"' + $Approver + '"' } else { "null" }
$userJson = if ($User) { '"' + $User + '"' } else { "null" }

$env:JAVA_TOOL_OPTIONS = "-Xss64m -Xmx4g"
# On a machine that intercepts TLS (Norton here), the JVM has its own
# truststore and does not see the interception root that Windows, curl and
# every browser already trust. `--cacrt` is meant to cover that, and stopped
# taking effect on 29 Sep: the failure stack shows the JDK's DEFAULT
# X509TrustManagerImpl, not one built from the file. WINDOWS-ROOT points the
# default trust manager at the Windows store instead, which needs no exported
# file and survives the interception root being reissued.
if ($Tls) {
  # Build it with infra/trust-store.ps1: the JDK's own cacerts plus this
  # machine's TLS-interception root. It must be made by keytool - a PKCS12
  # written by .NET loads as zero trust anchors, because Java only treats a
  # certificate in a PKCS12 as trusted when it carries Oracle's
  # trusted-key-usage attribute, which keytool writes and .NET does not.
  # The symptom is a PKIX failure that looks exactly like no truststore.
  $ts = Join-Path $netDir "truststore.jks"
  if (Test-Path $ts) {
    $env:JAVA_TOOL_OPTIONS += " -Djavax.net.ssl.trustStore=$ts -Djavax.net.ssl.trustStorePassword=changeit"
  }
  # No truststore: fall back to --cacrt, which demo.ps1's caller passes.
}
Set-Location $testDir
try {
  switch ($Command) {
    "seat" {
      $argsFile = Join-Path $demoDir "seat-args-$Tag.json"
      $seatFile = Join-Path $demoDir "seat-$Tag.json"
      # Same reason as prepare: presence is only evidence if it cannot be
      # left over from a previous run.
      if (Test-Path $seatFile) { Remove-Item $seatFile -Force }
      Set-Content -Path $argsFile -Value ('{"topology":"LocalNet","holders":' + $Holders + ',"tag":"' + $Tag + '","user":' + $userJson + '}') -NoNewline
      $t = Measure-Command {
        & dpm script --dar $dar --script-name "Indivisa.Test.Demo:demo_seat" `
          --input-file $argsFile --output-file $seatFile --participant-config $mapFile @tlsArgs 2>&1 |
          Tee-Object -FilePath (Join-Path $demoDir "seat-$Tag.log") | Select-String -Pattern "seated|FailedCmd|Exception" | ForEach-Object { $_.Line }
      }
      # The runner's exit code is lost to the pipeline (Tee-Object and
      # Select-String run last), so the output file is the only honest
      # signal. Without this check a TLS or auth failure printed a success
      # line naming a file that was never written - 29 Sep.
      if (-not (Test-Path $seatFile)) {
        throw ("seat '{0}' FAILED: no {1}. The runner's error is in {2}" -f
          $Tag, $seatFile, (Join-Path $demoDir "seat-$Tag.log"))
      }
      Write-Host ("seat '{0}' on {1}: {2} holders in {3:N0}s -> {4}" -f $Tag, $Network, $Holders, $t.TotalSeconds, $seatFile)
    }
    "prepare" {
      $seatFile = Join-Path $demoDir "seat-$Tag.json"
      if (-not (Test-Path $seatFile)) { throw "No seat '$Tag' on $Network. Run: demo.ps1 seat -Network $Network -Tag $Tag" }
      $argsFile = Join-Path $demoDir "attempt-args-$Tag.json"
      $outFile = Join-Path $demoDir "prepared-$Tag.json"
      # Remove it first, so "the file is there" means THIS run wrote it. On
      # 1 Oct a prepare died on "Not enough funds" and was reported as a
      # success, because yesterday's output file was still sitting there.
      if (Test-Path $outFile) { Remove-Item $outFile -Force }
      $seat = Get-Content $seatFile -Raw
      Set-Content -Path $argsFile -Value ('{"seat":' + $seat + ',"withhold":' + $Withhold + ',"approver":' + $approverJson + '}') -NoNewline
      $t = Measure-Command {
        & dpm script --dar $dar --script-name "Indivisa.Test.Demo:demo_prepare" `
          --input-file $argsFile --output-file $outFile --participant-config $mapFile @tlsArgs 2>&1 |
          Tee-Object -FilePath (Join-Path $demoDir "prepare-$Tag.log") | Select-String -Pattern "withholding|FailedCmd|Exception" | ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
      }
      if (-not (Test-Path $outFile)) {
        throw ("prepare '{0}' FAILED: no {1}. The runner's error is in {2}" -f
          $Tag, $outFile, (Join-Path $demoDir "prepare-$Tag.log"))
      }
      Write-Host ("prepare '{0}' (withhold {1}): {2:N0}s -> {3}" -f $Tag, $Withhold, $t.TotalSeconds, $outFile)
    }
    "attempt" {
      $seatFile = Join-Path $demoDir "seat-$Tag.json"
      if (-not (Test-Path $seatFile)) { throw "No seat '$Tag' on $Network. Run: demo.ps1 seat -Network $Network -Tag $Tag" }
      $argsFile = Join-Path $demoDir "attempt-args-$Tag.json"
      $stamp = Get-Date -Format "HHmmss"
      $outFile = Join-Path $demoDir "attempt-$Tag-$stamp.json"
      $seat = Get-Content $seatFile -Raw
      Set-Content -Path $argsFile -Value ('{"seat":' + $seat + ',"withhold":' + $Withhold + ',"approver":' + $approverJson + '}') -NoNewline
      $t = Measure-Command {
        & dpm script --dar $dar --script-name "Indivisa.Test.Demo:demo_attempt" `
          --input-file $argsFile --output-file $outFile --participant-config $mapFile @tlsArgs 2>&1 |
          Tee-Object -FilePath (Join-Path $demoDir "attempt-$Tag-$stamp.log") | Select-String -Pattern "SETTLED|REJECTED|withholding|FailedCmd|Exception" | ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
      }
      if (-not (Test-Path $outFile)) {
        throw ("attempt '{0}' FAILED: no {1}. The runner's error is in {2}" -f
          $Tag, $outFile, (Join-Path $demoDir "attempt-$Tag-$stamp.log"))
      }
      Write-Host ("attempt '{0}' (withhold {1}): {2:N0}s -> {3}" -f $Tag, $Withhold, $t.TotalSeconds, $outFile)
    }
  }
} finally {
  $env:JAVA_TOOL_OPTIONS = $null
}
