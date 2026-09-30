# Build a truststore for the Daml Script runner: the JDK's own CA set plus
# this machine's TLS-interception root.
#
#   pwsh infra/trust-store.ps1 -Network devnet
#
# Why this exists. This workstation intercepts TLS (Norton), so the server
# presents a certificate signed by Norton's own root and sends no chain.
# Windows, curl and every browser trust that root; the JVM keeps its own
# truststore and does not.
#
# The documented fix was `--cacrt infra/<network>/ca.pem`. It worked until
# 29 September and then stopped taking effect, for reasons never established:
# the same file still verifies the endpoint under curl
# (`--cacert ca.pem` gives ssl_verify_result 0), and the root is present in
# both LocalMachine\Root and CurrentUser\Root, yet the runner kept failing
# PKIX. `-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT` did not help either.
#
# Two things matter about how this file is built:
#
#   1. It MUST be made by keytool. A PKCS12 written by .NET loads as zero
#      trust anchors, because Java only treats a certificate in a PKCS12 as
#      trusted when it carries Oracle's trusted-key-usage attribute, which
#      keytool writes and .NET does not. The symptom is a PKIX failure
#      identical to having no truststore at all - the JVM reports the
#      truststore as loaded, and trusts nothing in it.
#
#   2. It starts from the JDK's cacerts rather than from nothing, so every
#      ordinary CA still works and only the interception root is added.
#
# Re-run this if the interception root is reissued, or on any other machine
# that intercepts TLS. demo.ps1 picks the file up automatically when -Tls is
# set, and then does NOT pass --cacrt: the two mechanisms conflict, and
# --cacrt wins, which is what kept the truststore from being consulted.

param(
  [string] $Network = "devnet",
  [string] $Password = "changeit",
  # The interception root, exported from the Windows store. See CLAUDE.md.
  [string] $Root = ""
)

$ErrorActionPreference = "Stop"
$netDir = Join-Path $PSScriptRoot $Network
if (-not (Test-Path $netDir)) { throw "no infra/$Network" }
if (-not $Root) { $Root = Join-Path $netDir "ca.pem" }
if (-not (Test-Path $Root)) { throw "no $Root; export the interception root from the Windows store first" }

$keytool = (Get-Command keytool -ErrorAction SilentlyContinue).Source
if (-not $keytool) { throw "keytool not on PATH; it ships with the JDK" }
$cacerts = Join-Path (Split-Path (Split-Path $keytool -Parent) -Parent) "lib\security\cacerts"
if (-not (Test-Path $cacerts)) { throw "no cacerts beside keytool at $cacerts" }

$out = Join-Path $netDir "truststore.jks"
if (Test-Path $out) { Remove-Item $out -Force }
Copy-Item $cacerts $out

& $keytool -importcert -noprompt -alias interception-root -file $Root -keystore $out -storepass $Password 2>&1 |
  ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

$listing = (& $keytool -list -keystore $out -storepass $Password 2>&1 | Out-String)
if ($listing -notmatch "interception-root.*trustedCertEntry") {
  throw "the root did not land as a trustedCertEntry; the runner will still fail PKIX"
}
$count = if ($listing -match "contains (\d+) entries") { $matches[1] } else { "?" }
Write-Host "$out : $count entries, interception root present as trustedCertEntry" -ForegroundColor Green
