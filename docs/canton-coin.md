# The cash asset: Canton Coin, and anything else

**Status: the asset-agnostic design is real and in the repo. The Canton Coin adapter is planned, not built.** The demo settles `splice-test-token-v2`.

This page answers one question precisely: what does Indivisa have to change to pay a coupon in Canton Coin, or in a registry's own token, instead of the reference asset the demo uses?

The answer is: **nothing in the model.** One field carries different data, and one off-ledger adapter is written per registry.

## What the model knows about the cash

The model package `indivisa` is seven files. Their complete set of third-party imports:

```text
Splice.Api.Token.AllocationV2
Splice.Api.Token.AllocationInstructionV2
Splice.Api.Token.HoldingV2
Splice.Api.Token.MetadataV1
Splice.TokenStandard.Utils
```

Every one of those is an **interface** package from the Token Standard. The model contains no reference to `TestTokenV2`, to Amulet, or to any other concrete asset. That is checkable in one command:

```bash
grep -rin "testtoken\|amulet\|tokenRules" daml/indivisa/Indivisa/
# no matches
```

## The asset is data, not a type

`V2.InstrumentId` is a two-field record: the party that administers the asset, and the asset's identifier at that administrator.

```haskell
data InstrumentId = InstrumentId with
  admin : Party
  id    : Text
```

`DistributionRun` stores one (`Indivisa/Model/Distribution.daml:29`), built from the coupon schedule (`:127`):

```haskell
instrument = V2.InstrumentId with admin = cashRegistry; id = s.currency
```

So the asset is chosen when the run is created, from the schedule's currency and whichever party administers the cash:

| Asset | `admin` | `id` |
| --- | --- | --- |
| `TestTokenV2` (what the demo settles) | the demo registry party | `USD` |
| Canton Coin | the Amulet registry party | `Amulet` |
| A bank's tokenised deposit | that bank's party | the bank's own ticker |
| Any future Canton Network token | its registry party | its ticker |

The register, the entitlement engine, the rounding, the atomicity and the privacy topology are all unaffected. They never learn what the cash is.

## The holder's consent pins the asset

This is a safety property, not an incidental one. `PaymentAgreement`, the once-only consent a holder signs at onboarding, refuses to authorise a receipt for any other asset (`Indivisa/Model/Payment.daml:89`):

```haskell
require "allocation is for this agreement's instrument admin"
  (choiceArg.allocation.admin == instrument.admin)
require ("transferLeg[" <> side.transferLegId <> "] is for this agreement's instrument")
  (side.instrumentId == instrument.id)
```

A holder who agreed to be paid in one asset cannot be paid in another under that agreement. The paying agent cannot substitute the currency, and the ledger, not a policy document, is what stops it.

## What has to be written per asset

One thing, and it is off-ledger.

Exercising a Token Standard factory needs a **choice context**: the registry's own state, passed in `extraArgs`. Where that comes from is the only asset-specific step in the whole flow.

| | `TestTokenV2` (built) | Canton Coin (planned) |
| --- | --- | --- |
| Where the context lives | a `TokenRules` contract on the ledger | the registry's off-ledger API |
| How the client gets it | `queryDisclosure` as the registry, then `disclose` on submit | an HTTP call to the Amulet registry (Scan) |
| Context key | `testTokenV2/tokenRules` | whatever the registry publishes |
| Funding a sender | create a `Token` holding in a script | a funded validator wallet |

The consequence for our code is structural rather than large. Our `seat`/`prepare`/`settle` flow runs inside Daml Script, and **Daml Script cannot make HTTP calls.** So the context has to be fetched by a client and passed into the flow as input, or the flow has to move onto the JSON Ledger API entirely. That restructuring, not the field, is the work.

It also costs the judges' package its best property: `quickstart/` runs offline with no account anywhere, because `TestTokenV2` needs no SV, no Amulet, no Scan and no Keycloak. A Canton Coin run needs a validator on a live network.

## Files that name the asset today

Thirty-four sites across fifteen files, and **none of them in the model package**. All are test fixtures, infrastructure scripts, bootstrap configuration, or the console's holding queries:

```text
daml/indivisa-test/Indivisa/Test/{Demo,Distribution,Fixtures,Scale}.daml
daml/indivisa-governance-test/...
contrib/bitsafe/module/test/BatchSettlementTest.daml
infra/bitsafe/distribute.ps1, infra/govern.ps1
infra/localnet/bootstrap.canton, quickstart/bootstrap.canton, quickstart/govern.sh
ui/src/App.tsx, ui/src/ledger/client.ts, ui/src/ledger/queries.ts
```

## One limitation, stated plainly

Splice's `SettlementFactory_SettleBatch` settles *"allocations for instruments with the same instrument admin"*, and validates that the allocation's admin matches the factory's.

So **one batch settles one registry's assets.** Several currencies administered by the same registry are fine: the batch is keyed by `instrumentId.id`. Paying some holders in Canton Coin and others in a commercial bank's token is two batches, and Indivisa does not give atomicity across them.

For a coupon that is the right shape anyway: an issuer pays one coupon in one currency. It would matter for a multi-currency corporate action, and that is future work, not a solved problem we are hiding.

## Why the demo settles the reference asset

Not convenience. `TestTokenV2.Token` is signed by **owner and admin**, which is the same authorisation case as Canton Coin: the receiver's authority is required for every leg, and no shortcut is available. Choosing a single-signatory toy asset would have let us skip the problem the product exists to solve.

It is the Token Standard's own reference asset, from `examples/` in `canton-network/splice`, and it runs on a plain participant.
