# The DevNet run

The evidence that Indivisa settles on the real network, not only on a laptop.

Run on **24 September 2026** against Chain-Experts' Canton DevNet validator.

## The transaction

| | |
|---|---|
| **Update id** | `1220652e2e4d32822c39d2ad72088e163eed04718ad1108998001b01aa3483ff466b` |
| Effective at | 2026-09-24T01:44:36.911471Z |
| Ledger offset | 3236815 |
| Holders paid | 5, in one transaction |
| Total | 8,421.88 USD |
| Instrument | XS2999912340, Northwind Rail 4.375% 2031 |
| Run id | `XS2999912340/Coupon/2027-12-01` |
| Receipt contract | `003927440c945124a76132c2f034c777a3ac14d9149d7a364849d5b9f90dddd7d4ca1212208a076bfb83337dd8cc6afe704873a066a65762b5b0042a90d0005de764905cd5` |

## The network

| | |
|---|---|
| Canton | 3.5.17 (`GET /v2/version`) |
| Synchronizer | `global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a` — the global DevNet synchronizer, not a private one |
| Participant | `chain-experts-admin-1::1220d41692257b6921b95b7a4f8e76bb30dd0c6da92718b1758a559f842e8a2ba553` |
| Packages | all thirteen vetted, `indivisa-0.4.0` included |

## Both halves were run

**Refused first.** With one holder's receipt allocation withheld, the batch
was refused and nobody was paid — `missing authorizations`, naming the
holder. The refusal is recorded on-ledger as a `SettlementRejected`.

**Then settled.** With every allocation in place, the same button settled all
five legs in one transaction.

That is the same pair the local demo shows, on a network we do not control.

## What this proves, and what it does not

**Proves:** the real network vets our packages and commits a real Token
Standard V2 `SettlementFactory_SettleBatch`. This is the marker BitSafe's
Season 2 postmortem calls out — everything else in most submissions is
LocalNet.

**Does not prove cross-operator privacy.** Chain-Experts runs one validator
per network (DevNet, TestNet, MainNet are separate networks, each a
different version for a different purpose), so all five participant names
resolve to the same node. On one node the guarantee is that the ledger
declines to hand one party another party's contracts — real, and enforced by
Canton, but weaker than the data never arriving. The console works this out
for itself, by comparing each participant's own id rather than the names in
its config, and says whichever of the two is true.

The stronger claim is demonstrated where it is honest: the local run and
`judge/`, both with five separate participants.

## Reproducing it

`infra/README.md` has the handover checklist. In short, with
`infra/devnet/ui.json` and `participants.json` filled in and
`INDIVISA_CLIENT_SECRET` set:

```powershell
pwsh infra/demo.ps1 seat    -Network devnet -Tag dev1 -Holders 5 -User <ledger user> -Tls -CaCrt .\infra\devnet\ca.pem
pwsh infra/demo.ps1 attempt -Network devnet -Tag dev1 -Withhold 1 -User <ledger user> -Tls -CaCrt .\infra\devnet\ca.pem   # refused
pwsh infra/demo.ps1 attempt -Network devnet -Tag dev1 -Withhold 0 -User <ledger user> -Tls -CaCrt .\infra\devnet\ca.pem   # settles
```

Two notes from doing it:

- **Keep the seat small.** DevNet tokens live 300 seconds and the Daml Script
  runner holds one for a whole script. Five holders took 111 seconds; twenty
  would not have finished.
- **`-CaCrt` is only needed on a machine whose antivirus inspects TLS.** Norton
  on the build machine re-signs every connection, and the JVM does not trust
  it; `infra/devnet/ca.pem` is that certificate, exported.
