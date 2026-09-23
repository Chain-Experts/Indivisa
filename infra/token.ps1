# Mint a short-lived ledger token from the network's identity provider.
#
#   $t = & infra/token.ps1 -Network devnet
#   & infra/token.ps1 -Network devnet -PassThru   # token plus expires_in
#
# Why this exists: DevNet's Keycloak issues tokens that live 300 seconds
# (measured 23 Sep 2026). Every config file that used to carry a `token` or
# `access_token` string was therefore stale within five minutes. Rather than
# ask for a longer lifetime, the callers mint one immediately before they
# need it: `participants-with-parties.ps1` writes a fresh one into the map
# the Daml Script runner reads, and the dev server refreshes its own in the
# background (ui/vite.config.ts).
#
# The credentials live in the network's ui.json, which is git-ignored:
#
#   "auth": {
#     "tokenUrl": "https://<keycloak>/realms/<realm>/protocol/openid-connect/token",
#     "clientId": "<client>",
#     "clientSecret": "<secret>",          // or set INDIVISA_CLIENT_SECRET
#     "scope": "daml_ledger_api"
#   }
#
# A network with no `auth` block and no static token is unauthenticated
# (LocalNet, the judge stack), and this prints nothing.

param(
  [string] $Network = "devnet",
  # Read the auth block from this file instead of infra/<network>/ui.json.
  [string] $ConfigFile = "",
  # Emit an object with Token and ExpiresIn rather than the token alone.
  [switch] $PassThru
)

$ErrorActionPreference = "Stop"

if (-not $ConfigFile) {
  $netDir = Join-Path $PSScriptRoot $Network
  if (-not (Test-Path $netDir)) { throw "No network '$Network' under infra/" }
  $ConfigFile = Join-Path $netDir "ui.json"
}
if (-not (Test-Path $ConfigFile)) { throw "No $ConfigFile" }

$cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
$auth = $cfg.auth
if (-not $auth) { return }   # unauthenticated network; callers treat this as "no header"

# The secret is better supplied by the environment than written to a file,
# even a git-ignored one. Environment wins when both are present.
$secret = if ($env:INDIVISA_CLIENT_SECRET) { $env:INDIVISA_CLIENT_SECRET } else { $auth.clientSecret }
if (-not $auth.tokenUrl) { throw "auth block in $ConfigFile has no tokenUrl" }
if (-not $auth.clientId) { throw "auth block in $ConfigFile has no clientId" }
if (-not $secret) { throw "no client secret: set INDIVISA_CLIENT_SECRET or auth.clientSecret in $ConfigFile" }

$body = @{
  client_id     = $auth.clientId
  client_secret = $secret
  grant_type    = "client_credentials"
  scope         = if ($auth.scope) { $auth.scope } else { "daml_ledger_api" }
}

try {
  $resp = Invoke-RestMethod -Method Post -Uri $auth.tokenUrl `
    -ContentType "application/x-www-form-urlencoded" -Body $body -TimeoutSec 30
} catch {
  throw "could not mint a token from $($auth.tokenUrl): $_"
}
if (-not $resp.access_token) { throw "identity provider returned no access_token" }

if ($PassThru) {
  [pscustomobject]@{ Token = $resp.access_token; ExpiresIn = [int]$resp.expires_in }
} else {
  $resp.access_token
}
