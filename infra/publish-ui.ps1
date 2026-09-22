# Build the four panes as static files and gather everything the public,
# read-only deployment needs into one folder.
#
#   pwsh infra/publish-ui.ps1 -Network devnet -Tag devnet1
#   -> infra/<network>/public/   index.html, assets/, demo/seat.json,
#                                demo/participants.json
#
# Copy that folder to the proxy host's root (see nginx.conf.example) and
# nothing else: no token, no participants.json with hosts in it, no seat
# arguments. The party map is reduced to party -> participant name and
# marked read-only, which is what makes the page hide the settle button.
#
# The build itself contains no network: the proxy decides which participant
# each /api/<name>/ path reaches.

param(
  [string] $Network = "devnet",
  [string] $Tag = "",
  [string] $Seat = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uiDir = Join-Path $root "ui"
$netDir = Join-Path $PSScriptRoot $Network
$outDir = Join-Path $netDir "public"
if (-not (Test-Path $netDir)) { throw "No network '$Network' under infra/" }

if (-not $Seat) {
  if (-not $Tag) { throw "Give -Tag <tag> (or -Seat <file>)" }
  $Seat = Join-Path $netDir "demo\seat-$Tag.json"
}
if (-not (Test-Path $Seat)) { throw "No seat file at $Seat" }
$mapFile = Join-Path $netDir "participants-with-parties.json"
if (-not (Test-Path $mapFile)) { throw "No party map; run participants-with-parties.ps1 -Network $Network" }

Push-Location $uiDir
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "the UI build failed" }
} finally { Pop-Location }

Remove-Item -Recurse -Force $outDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $outDir "demo") | Out-Null
Copy-Item -Recurse (Join-Path $uiDir "dist\*") $outDir

Copy-Item $Seat (Join-Path $outDir "demo\seat.json")
$map = Get-Content $mapFile -Raw | ConvertFrom-Json
[ordered]@{
  network            = $Network
  readOnly           = $true
  party_participants = $map.party_participants
} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir "demo\participants.json") -Encoding UTF8

# Nothing with a token in it may travel with the page.
$pattern = "access_token|Bearer |" + [char]34 + "token" + [char]34
$leaks = Get-ChildItem -Recurse -File $outDir | Where-Object {
  Select-String -Path $_.FullName -Pattern $pattern -Quiet -ErrorAction SilentlyContinue
}
if ($leaks) { throw "refusing to publish: a token appears in $($leaks.FullName -join ', ')" }

Write-Host ("published to {0}" -f $outDir)
Get-ChildItem -Recurse -File $outDir | ForEach-Object { "  {0,-40} {1,8:N0} B" -f $_.FullName.Substring($outDir.Length + 1), $_.Length }
Write-Host "copy this folder to the proxy host's root; see infra/devnet/nginx.conf.example"
