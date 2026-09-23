# Architecture

What each part holds, what it must never hold, and how a coupon actually travels
from an announcement to hundreds of private payments.

Read `modules.md` for the full file inventory; the decisions this document
assumes are stated where they apply.

---

## The decision everything else follows from

**Only the cash is a Token Standard V2 asset.**

The bond, the register and the entitlement calculation are ordinary Daml. The
V2 machinery — Accounts, Holdings, Allocations, `SettlementFactory_SettleBatch`
— carries the money and nothing else.

Three consequences:

- The model roughly halves. No instrument interface to implement, no transfer
  factory for the bond, no custody tiers for securities.
- Indivisa works against registers that already exist. A paying agent does not
  have to tokenize the bond before this is useful.
- If the security *is* Canton-native later, the register module is replaced by a
  reader over that instrument's holdings. Nothing downstream changes.

---

## Settlement flow

```
  PaymentAgreement per holder            (V2 — signed once by holder and
          │                               paying agent, at onboarding)
          ▼
  CorporateAction                        (Daml — issuer signs, agent observes:
          │                               kind, amount per unit, record and
          │                               payment dates)
          ▼
  RegisterSnapshot at the record date    (Daml — Instrument_Snapshot verifies
          │                               every Position contract, aggregates)
          ▼
  EntitlementSchedule                    (Daml — CorporateAction_Entitle derives
          │                               it on-ledger: quantity x amount per
          │                               unit, rounding policy, total ensured)
          ▼
  DistributionRun                        one PaymentLeg per schedule entry
          │
          ├─▶ Send allocation(s)          (V2 — paying agent authorises,
          │                               committed = True; one allocation
          │                               may carry every leg)
          │
          └─▶ Receipt allocation          (V2 — one per holder, created by the
              per holder                  paying agent under the agreement,
          │                               guarded by ensureIsReceiptAllocation)
          ▼
  AllocationFactory_Allocate             asynchronous, one command each
          │
          ▼
  Run_Settle                             ← ONE transaction, atomic:
          │                               SettlementFactory_SettleBatch, then
          │                               a DistributionReceipt for the agent
   ┌──────┼──────┐
   ▼      ▼      ▼
 Holder Holder  Holder
   A      B       C

  (refused?  nothing moves; the agent records a SettlementRejected)
```

**The allocation phase is asynchronous and per-allocation. Only the final
settlement is atomic.** That distinction matters: a demo that shows allocations
building and then one settlement landing is showing the truth. A demo that
implies five hundred simultaneous allocations is not.

### Authorisation

Token Standard V2's default settlement logic requires, for every transfer leg,
an `Allocation` authorised by the sender's account **and** one authorised by
the receiver's. `SettleBatch` fails with `missing authorizations` otherwise.
This is the standard, not the token: the check is in
`Splice.TokenStandard.Utils`, and `TestTokenV2` and Canton Coin both need it.

Indivisa collects the receiver's authority **once**, in `PaymentAgreement`, a
template signed by the holder and the paying agent. Its single choice lets the
paying agent alone exercise `AllocationFactory_Allocate` on the holder's
behalf, and it passes the call through the standard's own
`ensureIsReceiptAllocation`, which refuses anything that is not purely a
receipt: no sender-side legs, no input holdings, no committed allocation, no
next-iteration funding, no extra metadata. The holder delegates the ability to
be paid and nothing else.

This is the pattern the standard's authors use for the venue in
`Splice.Testing.Apps.TradingAppV2` (`TradeSettlementAgreement_CreateReceiptAllocation`).
We are not inventing an authorisation model; we are reusing theirs in a
different seat.

Consequence for the run: a holder who has not signed cannot be paid, and
because the batch is atomic, that holder blocks everyone until onboarded or
removed from the run. The demo's deliberate-failure path can use exactly this.

### Roles

| Role | Party | Sees |
|---|---|---|
| Paying agent | executor of the batch; in the demo also the registrar that keeps the register (`Entitle` insists the snapshot is the agent's own) | the entire distribution |
| Holder | receiver | its own position and its own leg only |
| Cash registry | administrator of the cash instrument | legs in its instrument |
| Approvers (optional, 0.4.0) | a decentralised party named as the run's approver; its members confirm through BitSafe's Decentralization Manager | the run and every allocation of it, as an executor does; nothing about other runs |
| Issuer | signs the `CorporateAction`; funds the paying agent off-batch (the funding leg is not modelled; see `TASKS.md`, open decisions) | the announcement, the instrument, and the entitlement schedule: `Entitle` runs inside the issuer's own contract, so its consequences are in the issuer's view. An issuer knows its register through its registrar anyway; the privacy claim is holder to holder |

The paying agent as executor is the whole design. CIP-112's own worked example
gives the executor sight of every leg while each participant sees only its own —
which is exactly a paying agent's operational view of a coupon run.

---

## Modules

### Daml — the only authoritative layer

| Module | Holds | Status |
|---|---|---|
| `Indivisa.Types` | Vocabulary only. No templates. `Isin`, `EventKind`, `RoundingPolicy`, `PaymentLeg`. | **built** |
| `Indivisa.Model.Register` | Instrument, positions, record-date snapshot verified on-ledger. Plain Daml, no V2. | **built** |
| `Indivisa.Model.Event` | The corporate action; `Entitle` derives the schedule from the snapshot on-ledger. | **built** |
| `Indivisa.Model.Entitlement` | quantity x amount per unit, rounding policy, exact and paid per holder, total ensured. | **built** |
| `Indivisa.Utils` | Our vocabulary in V2 terms; `Run_Settle` derives its transfer legs and its settlement (executors) from it. | **built** |
| `Indivisa.Model.Payment` | The once-only consent: `PaymentProposal`, `PaymentAgreement` with `CreateReceiptAllocation`, covering settlements the agent executes alone or jointly. Touches V2. | **built** |
| `Indivisa.Model.Distribution` | `DistributionRun.Run_Settle` (the one transaction), `DistributionReceipt`, `SettlementRejected` (the agent's record of a refusal, since a refused transaction leaves nothing behind), `runFromSchedule`. Since 0.4.0 a run may name an `approver` whose authority the settle then needs (`runExecutors`). Touches V2. | **built** |
| `Governance.Settlement` (package `governance-settlement-v0`) | A V2 batch settlement as a governed action for BitSafe's Decentralization Manager; no Indivisa in it. | **built** |
| `Indivisa.Governance` (package `indivisa-governance-v0`) | `SettleRunProposal`: `Run_Settle` as the governed action. | **built** |

Package `indivisa`, version 0.4.0 (0.3.0 on the LocalNet of 18 Sep); every change to a deployed
template is either a version bump that passes `dpm upgrade-check` or a new
package lineage (the `name` in `daml.yaml` is the upgrade identity and
never changes; only `version` moves). Everything else is
off-ledger.

**Rounding is not a detail.** Coupon arithmetic produces fractions of the
smallest unit and the residual has to go somewhere. Decide the policy once, in
`Entitlement`, record it on-ledger, and make the total of the legs equal the
announced distribution exactly. A settlement that is off by one cent does not
settle.

### Off-ledger — deliberately thin

**No Java is required, and none was built.** The JSON Ledger API v2 lets the
console read the ledger directly, which removes the REST tier entirely.

The paying agent's client, the sequence of commands before the one
transaction (fund, propose, create the run, allocate the send, create N
receipt allocations), is Daml Script: `Indivisa.Test.Agent` and
`Indivisa.Test.Demo`, driven from a shell by `infra/demo.ps1`. It is the
reference for whatever replaces it in production.

One Java component would be worth building **if there is time**, and is first
to be cut: a paying-agent daemon that watches for payment dates and fires the
run without a human. It is the honest production component and it is invisible
in a sixty-second video. Say on the slide: *in production this is a scheduled
agent; for the demo it is a button.*

### UI — the settlement console (built)

| Part | Shows |
|---|---|
| **Working header** | instrument, event, holder count, per unit, total due, how many allocations are on the ledger out of how many the batch needs, the run's state, one button; then SETTLED with the update id and the submit-to-commit time, or SETTLEMENT REJECTED with the ledger's reason and the on-ledger record |
| **Holders** | a card per holder — position, entitlement, cash, leg state — filled by one request set per participant, not per holder. Search, filter, sort |
| **Any card, opened** | that holder's own view, read **as that holder alone**: its contracts, then six counts of what its node holds about anyone else, all zero |
| **Schedule** | the entitlement schedule as the executor sees it, sortable |
| **Privacy** | the same per-party check run once per participant, continuously |
| **Activity** | the settlement and every refusal, read back as contracts |

No auth flows, no application backend, nothing cached: each view is a read
of the participant that holds the data.

**The impressive part is not the styling.** It is that a card opened on one
node is conspicuously empty where the executor's schedule has everything —
and that the console holds every party's credential and still cannot make
one node answer for another.

The plumbing: four ledger connections, one per party, each to the participant
that hosts it, through the dev server's proxy because the JSON Ledger API
sets no CORS headers. Participant URLs and bearer tokens live in
`infra/<network>/ui.json`; the proxy injects the token, so the browser never
holds one. In production nginx does the same.

---

## The demo

Sixty to ninety seconds, pre-recorded. Season 2's second and third place were
won with slides and a one-minute screen capture, so the bar is a recording, not
a live run — which also removes stage risk.

**Onboarding, shown once.** N agreements land on the ledger. Caption it: *each
holder signs once; never again.* Five seconds, but it is the answer to the
first question any judge who has read the CIP will ask.

**Run one — success.** Fire the distribution. One transaction. Then open a
holder's card, and another on a different node: each sees only its own
payment.

**Run two — deliberate failure.** Label the screen unambiguously as an atomicity
demonstration before clicking, so nobody thinks the system broke. One leg is
unavailable: one holder's receipt allocation is withheld (`demo.ps1 prepare
-Withhold 1`). Result, as the page renders it:

```
SETTLEMENT REJECTED · 250 payments requested · 0 executed
NO PARTIAL SETTLEMENT
```

Fix the leg (`prepare` again, nothing withheld), retry, 250/250.

Success first, failure second. A failure shown cold reads as a bug. The shot
list is `demo-script.md`.

---

## Boundaries — what must never cross

| Never crosses | Into |
|---|---|
| A holder's position or payment | another holder's view |
| The register | the public |
| Business logic | the UI |
| Entitlement arithmetic | anywhere but `Indivisa.Model.Entitlement` |
| An unlabelled simulated component | the demo |

---

## Settled questions

**Does the recipient have to authorise?** Yes, by design of the standard, and
it is not a problem. See *Authorisation* above.
Settled 16 September 2026 by reading `settlementFactoryV2_settleBatchDefaultImpl`
as released in Splice 0.8.1. Proof 3 confirms it and records the error shape.

**Which V2 cash instrument for the proofs?** `TestTokenV2`, prebuilt in Splice
0.8.1 at `daml/dars/splice-test-token-v2-1.0.1.dar`. It has no Splice runtime
dependency and no contract keys, so it runs in Daml Script and on a plain
Canton participant. Its Holding is signed by owner and admin — the same hard
case as Canton Coin — so nothing proven against it is easier than the real
thing.

**How many legs fit in one transaction?** Measured to refusal, 17–22
September, on LocalNet (`benchmark.md`). A realistic run, one allocation per
holder: 1,000 legs in one transaction, 1.67 MB, 11.1 s submit to commit
(500 in 4.0 s, 250 in 1.6 s). Pushed further, with legs sharing allocations:
**13,000 legs settled in 10.4 s**, and 14,000 were refused — by the Ledger
API's 10 MB gRPC limit on the command that authorises them, not by the
settlement. That command costs 756 bytes per leg, so one send allocation
holds 13,869 legs; past that the standard's own answer is several send
allocations. The settle request costs 85 bytes per leg and 1,554 per
allocation, which puts a realistic run at the 10 MB budget near 6,400
holders (derived; the model reproduces the measured 1,000-holder run to
0.6%). Time never bound: 0.69 ms per leg. CIP-0120's 100 bytes per view was
an arithmetic assumption; per allocation the measured figure is about
fifteen times that. (The first published figures, 104 s and 333 s, were the
Daml Script runner reading the result back, not the ledger; `benchmark.md`
explains.)

**What does a failed batch actually return?** `missing authorizations` from
the standard's own validation, naming the party, leg, side, amount and
instrument; on a participant it arrives wrapped as `DAML_FAILURE` with an
`UNHANDLED_EXCEPTION/DA.Exception.GeneralError`. Proof 4 keeps it as a
regression test, and `SettlementRejected` keeps the text on-ledger.

**Can the paying agent be made unable to settle alone?** Yes, without
touching the settlement path, by naming a second executor. Token Standard
V2 settles a batch only with the authority of every executor, so a run
whose `approver` is a decentralised party can be settled only by a governed
execution that carries that party's authority: the agent proposes, the
members confirm to threshold, the engine executes `Run_Settle`. Built on
BitSafe's Decentralization Manager, 22 September; `decentralization.md`.

## Open questions

**Which V2 cash instrument for the DevNet evidence run?** `TestTokenV2` again,
or Canton Coin. If Canton Coin: whether Amulet's V2 implementation accepts a
receipt allocation created through a third-party agreement the way
`TestTokenV2` does, or only through its own `TransferPreapproval`, has not been
checked. The handover assumes `TestTokenV2`.

**Does the shape hold on DevNet?** Five nodes in one JVM on one machine is
not a network. Separate machines add hops and remove contention; more
validators hosting holders multiply envelopes. The DevNet run should
reproduce 250 and, if traffic allows, 500.
