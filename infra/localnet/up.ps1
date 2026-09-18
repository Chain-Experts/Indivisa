# Start Indivisa LocalNet in the background and wait until it is up.
#
#   pwsh infra/localnet/up.ps1            # start
#   pwsh infra/localnet/up.ps1 -Down      # stop
#
# Uses the Canton JAR that dpm already installed; no Docker, no Postgres.
# Run from the repository root. Logs go to infra/localnet/log/.

param(
  [switch] $Down,
  [string] $CantonJar = "",
  [string] $Heap = "4g"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logDir = Join-Path $PSScriptRoot "log"
$pidFile = Join-Path $logDir "canton.pid"

if ($Down) {
  if (Test-Path $pidFile) {
    $cantonPid = Get-Content $pidFile
    Stop-Process -Id $cantonPid -Force -ErrorAction SilentlyContinue
    Remove-Item $pidFile -Force
    Write-Host "LocalNet stopped (pid $cantonPid)."
  } else {
    Write-Host "LocalNet is not running (no pid file)."
  }
  exit 0
}

if (-not $CantonJar) {
  $candidates = Get-ChildItem "$env:APPDATA\dpm\cache\components\canton-open-source\*\lib\canton-open-source-*.jar" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending
  if (-not $candidates) { throw "No Canton JAR found in the dpm cache. Run 'dpm install' or pass -CantonJar." }
  $CantonJar = $candidates[0].FullName
}

if (-not (Test-Path (Join-Path $root "daml\indivisa\.daml\dist\indivisa-0.3.0.dar"))) {
  throw "Build first: dpm build --all (the bootstrap uploads daml/indivisa/.daml/dist/indivisa-0.3.0.dar)."
}

New-Item -ItemType Directory -Force $logDir | Out-Null
Write-Host "Canton: $CantonJar"
Write-Host "Starting LocalNet (1 synchronizer, 5 participants, in memory)..."

$proc = Start-Process -FilePath "java" `
  -ArgumentList @("-Xmx$Heap", "-jar", "`"$CantonJar`"", "daemon",
                  "-c", "infra/localnet/localnet.conf",
                  "--bootstrap", "infra/localnet/bootstrap.canton",
                  "--log-file-name", "infra/localnet/log/canton.log",
                  "--log-truncate") `
  -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $logDir "stdout.log") `
  -RedirectStandardError (Join-Path $logDir "stderr.log") `
  -PassThru -WindowStyle Hidden
Set-Content $pidFile $proc.Id

# Wait for the bootstrap's final line.
$deadline = (Get-Date).AddMinutes(5)
$stdout = Join-Path $logDir "stdout.log"
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  if ($proc.HasExited) {
    Write-Host "Canton exited early. Last lines of stderr/stdout:"
    Get-Content (Join-Path $logDir "stderr.log") -Tail 20 -ErrorAction SilentlyContinue
    Get-Content $stdout -Tail 20 -ErrorAction SilentlyContinue
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    exit 1
  }
  if ((Test-Path $stdout) -and (Select-String -Path $stdout -Pattern "Indivisa LocalNet is up" -Quiet)) {
    Write-Host "LocalNet is up (pid $($proc.Id))."
    Write-Host "  Ledger API  registry 5011  agent 5021  alice 5031  bob 5041  charlie 5051"
    Write-Host "  JSON API    registry 5013  agent 5023  alice 5033  bob 5043  charlie 5053"
    Write-Host "  Stop with:  pwsh infra/localnet/up.ps1 -Down"
    exit 0
  }
}
Write-Host "Timed out waiting for LocalNet. See $logDir."
exit 1
