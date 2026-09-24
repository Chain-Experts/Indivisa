# Indivisa

**Corporate actions, settled in one atomic batch, without exposing the register.**

A bond pays its coupon to hundreds of holders. The paying agent fires one
transaction. Every holder is paid at the same instant or nobody is — and no
holder sees another's payment.

Built by Chain-Experts for HackCanton Season 3.

## Demo

- **Run it yourself** — `cd judge && docker compose up`, then
  http://localhost:8080. A real five-participant Canton network, the real
  contracts, a coupon that is refused until every holder is ready. Nothing to
  install but Docker, about five minutes: [`judge/README.md`](judge/README.md).
- **It runs on the real network.** A coupon settled on Canton DevNet on
  24 September 2026, five holders in one transaction, update id
  `1220652e2e4d32822c39d2ad72088e163eed04718ad1108998001b01aa3483ff466b`
  — [`docs/devnet-run.md`](docs/devnet-run.md) has the whole record.
- **The recording** — *coming soon* (under two minutes: a coupon settled, the same run refused with one holder not ready, then a run that needs two of three approvers before it may move at all).
- **The story, for anyone** — [chain-experts.com/indivisa](https://chain-experts.com/indivisa/), the explainer page (also in this repo as `docs/explainer.html`).
- **The numbers** — [`docs/benchmark.md`](docs/benchmark.md): how many legs fit in one CIP-112 batch settlement, measured on real participants, with the method and the caveats.

---

## The problem

Corporate-action processing is still substantially manual. From Canton Network's
own post-trade research:

| | |
|---|---|
| **3.7m** | event announcements processed in 2023 by holders of American securities |
| **$3.42m** | average annual cost of asset-servicing errors, per market participant |
| **~10%** | of a broker's annual operating costs, lost to those errors |
| **3–10%** | error rates — described as routine, at *"levels considered unacceptable elsewhere in capital markets"* |
| **71% / <40%** | straight-through processing for mandatory and income events / for voluntary events |
| **+23%** | annual growth in investors' asset-servicing costs |

Bond coupons are our chosen example. Dividends and redemptions are the same
engine.

---

## What Indivisa does

A paying agent needs to distribute one coupon across a holder base. Indivisa
turns that into a single atomic settlement:

```
Holder signs one payment agreement      ← once, at onboarding
     │
     ▼
Coupon announced by the issuer
     │
     ▼
Register snapshot at the record date
     │
     ▼
Entitlement schedule derived on-ledger  ← quantity x rate, rounded, sums exactly
     │
     ▼
Paying agent allocates its cash, and
creates each holder's receipt allocation under the agreement
     │
     ▼
SettlementFactory_SettleBatch          ← one transaction
     │
     ▼
Every holder paid, or none
```

**The paying agent is the executor** and sees the whole distribution. Each holder
sees its own leg and nothing else.

### Holders authorise once

Token Standard V2 requires every transfer leg to be authorised by **both**
sender and receiver; the batch refuses otherwise. That is a feature, not an
obstacle: a holder signs one standing agreement with the paying agent, and from
then on the paying agent alone creates the holder's receipt allocation for every
coupon. The delegation is guarded by the standard's own
`ensureIsReceiptAllocation` check, so it can authorise receipts and nothing
else — never a debit.

It is the same pattern the standard's authors use for the venue in their
reference trading app. It is also how the real world works: you give your
paying agent your account details once, not per coupon.

### The bond is not tokenized

Only the **cash** is a Token Standard V2 asset. The register is an ordinary Daml
template.

That is deliberate. Indivisa works against registers that already exist — the
securities industry does not have to tokenize every bond before this is useful.
If the instrument happens to be Canton-native later, the engine consumes that
ownership data directly instead.

---

## Why Canton

The test the HackCanton organisers published: *if this moved to a globally
transparent chain tomorrow, what would stop working?*

**Everything.** Every holder's position size becomes public the moment the coupon
pays, and the register — confidential by law and commercially sensitive — is
published to the world.

### What changed in June

Token Standard V2 (CIP-0112, created 2026-03-31, **approved 2026-06-12**) added
privacy-preserving batch settlement. Its own worked example sets out the
visibility model:

| Party | Sees |
|---|---|
| Each participant | only its own legs |
| Each asset administrator | only legs for instruments it manages |
| The executor | all legs |

Under V1 there was no mechanism for multi-tier accounting where intermediate
parties stay invisible — the CIP notes that in traditional finance *"neither the
`sender` nor the `receiver` see the intermediate steps."*

**CIP-112 did not design this use case. It enabled it.** Its worked example is a
trading and netting scenario; we are taking the primitive somewhere else.

The V2 packages first shipped in Splice 0.6.11, in July. Indivisa builds against
the prebuilt DARs in Splice 0.8.1. Season 2's final was in mid-June; no Season
2 entrant could have used this.

---

## Status

The experiment came first: five proofs, in order, before any product code.
All five are in.

| Proof | Question | Status |
|---|---|---|
| 1 | Does one payer settle to three recipients in one batch? | **passes** (Daml Script, 17 Sep) |
| 2 | Does each recipient see only its own leg? | **passes** on LocalNet, each holder on its own participant (17 Sep) |
| 3 | Do holders authorise **once**, at onboarding, and never per coupon? | **passes** (two coupons, no holder command; misuse refused) |
| 4 | Does one bad leg settle **zero**, not N−1? | **passes** (rejection recorded) |
| 5 | How many legs fit in one transaction? | **13,000 legs settled in one transaction, in 10.4 s** (1.52 MB). The first hard limit is not the settlement but the gRPC size of the command that authorises it, at 13,869 legs. A realistic run of one payment per holder reaches Canton's 10 MB budget near 6,400 holders (derived; 1,000 measured, 1.67 MB, 11.1 s). `docs/benchmark.md` |

Proof 3 was answered on 16 September by reading the V2 settlement logic as
shipped in Splice 0.8.1: the standard requires receiver-side allocations, and
its reference app shows the standing-agreement pattern that collects that
authority once. We could find no published figure for how many legs fit in a
CIP-112 batch settlement; `docs/benchmark.md` has the method and the numbers,
and they go to the Canton forum as well.

On top of the proofs, built and running on LocalNet (18 Sep):

- **The model** (`daml/indivisa`, package `indivisa`): register (`Instrument`,
  `Position`, record-date `RegisterSnapshot`), `CorporateAction`, on-ledger
  `EntitlementSchedule` with largest-remainder rounding, `PaymentAgreement`,
  `DistributionRun.Run_Settle`, `DistributionReceipt`, `SettlementRejected`.
- **The demo driver** (`Indivisa.Test.Demo`, `infra/demo.ps1`): seats a
  realistic holder base, arms a deliberate failure, settles.
- **The settlement console** (`ui/`): the whole distribution and one button;
  a card for every holder, each read live from the participant that hosts
  it over the JSON Ledger API; and, on any card, the same node asked as
  that holder alone — which answers with its own line and six zeros for
  everyone else.
- **A one-command package for anyone who wants to run it** (`judge/`, 23 Sep):
  `docker compose up` gives the whole thing — five participants, the nine
  packages, twenty seated holders with one allocation deliberately withheld,
  and the console — on a machine with nothing installed but Docker. Verified
  end to end: refused, then `docker compose run --rm prepare`, then settled
  in under a second.

And, since 22 September, **governed settlement**: a run may name an
approver, a decentralised party managed by BitSafe's Decentralization
Manager, and then the paying agent alone can no longer settle. It proposes;
two of three approvers confirm; the engine executes `Run_Settle`. Below
threshold the ledger refuses and nothing moves. One optional field on the
run (`indivisa` 0.4.0), a forty-line proposal template, and a generic
module for any Token Standard V2 batch settlement (`governance-settlement-v0`)
that has no Indivisa in it. Proven on the IDE ledger and in BitSafe's
three-node sandbox; see `docs/decentralization.md`.

**The DevNet run is done** (24 Sep): five holders, one transaction, update id
`1220652e2e4d32822c39d2ad72088e163eed04718ad1108998001b01aa3483ff466b`,
with the deliberate failure refused first. See [`docs/devnet-run.md`](docs/devnet-run.md).

Still to come: the recording (`docs/demo-script.md`), the deck, and one clean
`docker compose up` on a machine other than the one it was built on — this one
intercepts TLS, so `judge/`'s two download paths could not be exercised here.

---

## Build and run

```bash
dpm build --all          # model package indivisa-<version> (see daml/indivisa/daml.yaml), scripts indivisa-test
cd daml/indivisa-test
dpm test                 # the proofs, the model tests and a 12-holder demo, on the IDE ledger
cd ../indivisa-governance-test
dpm test                 # the governance proofs: 1 of 3 refused, 2 of 3 settles
```

Daml SDK 3.5.x, `dpm` rather than the `daml` assistant, LF 2.1. The Token
Standard V2 DARs are prebuilt in `canton-network/splice` at tag `0.8.1`, path
`daml/dars/` and vendored in this repo under the same path; `NOTICE` lists them.

On real participants (`infra/README.md` has the detail):

```
pwsh infra/localnet/up.ps1 -Heap 12g              # five participants in one JVM, no Docker
pwsh infra/localnet/proofs.ps1                     # the proofs across participants
pwsh infra/demo.ps1 seat    -Holders 250 -Tag t1   # a holder base, onboarded, with a schedule
pwsh infra/demo.ps1 prepare -Tag t1 -Withhold 1    # allocations, one holder deliberately not ready
cd ui && npm install && INDIVISA_TAG=t1 npm run dev   # http://localhost:5173, press the button
```

Or with Docker, needing none of the above — the same topology, the same
contracts, seated and served:

```bash
cd judge && docker compose up                      # http://localhost:8080
docker compose run --rm prepare                    # after the first refusal
```

---

## Stated limits

Worth saying before anyone else says it.

- **We do not solve corporate-action announcement data.** Chainlink, with DTCC,
  Swift and Euroclear, is attacking that layer. Indivisa is the payment layer.
- **The cash is simulated.** It is `TestTokenV2`, the reference Token Standard
  V2 asset, with our own registry party; no paying agent settles on Canton
  today, and the holders and their positions are generated. Every demo
  component is labelled real, simulated or planned.
- **Scale is measured on one machine, not on DevNet.** We pushed until it
  refused: 13,000 legs settled in 10.4 s, and 14,000 were refused by the
  Ledger API's gRPC message limit on the command that authorises them, not
  by the settlement. A realistic coupon run of one payment per holder
  reaches the 10 MB transaction budget near 6,400 holders, derived from a
  size model that reproduces the measured 1,000-holder run to within 0.6%.
  Five nodes in one JVM is not a network; DevNet adds hops and validators
  and will differ.
- **Holders are not zero-touch; they are one-touch.** The standard requires the
  receiver's authority on every leg. Indivisa collects it once, in a standing
  agreement, and never again. A holder who has not signed cannot be paid — the
  batch refuses, for everyone, until that holder is onboarded or removed from
  the run. That is a real operational constraint and we say so.

---

## Documents

| | |
|---|---|
| `TASKS.md` | The plan to 9 October, proofs first, with results as they came in |
| `docs/architecture.md` | Components, settlement flow, boundaries, settled and open questions |
| `docs/modules.md` | Every file, and what is in it |
| `docs/benchmark.md` | Proof 5: method, numbers, what they mean |
| `docs/devnet-run.md` | The DevNet evidence: update id, what it proves and what it does not |
| `docs/diagrams.md` | The model as a drawing (every template, who signs, who sees, what points at what) and the workflow as a sequence |
| `docs/demo-script.md` | The recording, step by step: commands, screens, cards, recorder, edit |
| `docs/decentralization.md` | Governed settlement on BitSafe's Decentralization Manager: the risk, before and after, the evidence, how to reproduce |
| `docs/for-a-teenager.md` | The whole idea from zero, for someone with no finance or blockchain background: every term explained, the flow and the vote as diagrams |
| `docs/explainer.html` | The story for a beginner, one standalone page |
| `infra/README.md` | LocalNet, the demo from a shell, the DevNet handover |
| `judge/README.md` | Run the whole thing with one Docker command, and what to look for |
| `ui/README.md` | The settlement console: four tabs, and what each one reads |

---

## Context

HackCanton Season 3, submission 9 October 2026. Open source under the
Apache-2.0 licence, copyright Chain-Experts (`LICENSE`, `NOTICE`).

Sources: [CIP-0112](https://github.com/canton-foundation/cips/blob/main/cip-0112/cip-0112.md) ·
[Canton Network, Post-Trade Transformation](https://www.canton.network/hubfs/eBook%2C%20Post-Trade%20Transformation%2C%202025-03-14.pdf) ·
[CIP-0120](https://github.com/canton-foundation/cips/blob/main/cip-0120/cip-0120.md)
