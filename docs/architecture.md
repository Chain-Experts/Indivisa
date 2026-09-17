# Architecture

What each part holds, what it must never hold, and how a coupon actually travels
from an announcement to five hundred private payments.

Read `CLAUDE.md` first for the decisions this document assumes, and
`modules.md` for the full file inventory.

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
  Coupon announcement                    (Daml — plain template)
          │
          ▼
  Read register at record date           (Daml — plain template)
          │
          ▼
  Entitlement per holder                 rate x position x period
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
  SettlementFactory_SettleBatch          ← ONE transaction, atomic
          │
   ┌──────┼──────┐
   ▼      ▼      ▼
 Holder Holder  Holder
   A      B       C
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
| Paying agent | executor of the batch | the entire distribution |
| Holder | receiver | its own leg only |
| Cash registry | administrator of the cash instrument | legs in its instrument |
| Issuer | funds the paying agent | its own funding leg |

The paying agent as executor is the whole design. CIP-112's own worked example
gives the executor sight of every leg while each participant sees only its own —
which is exactly a paying agent's operational view of a coupon run.

---

## Modules

### Daml — the only authoritative layer

| Module | Holds | Status |
|---|---|---|
| `Indivisa.Types` | Vocabulary only. No templates. | with the model |
| `Indivisa.Register` | Instrument, positions, record-date snapshot. Plain Daml, no V2. | after the proofs |
| `Indivisa.Event` | Coupon announcement, rate, dates, status. | after the proofs |
| `Indivisa.Entitlement` | rate x position x period, rounding policy, the audit record of how each figure was derived. | after the proofs |
| `Indivisa.Distribution` | **The only module touching V2.** `PaymentAgreement`, the send and receipt allocation specifications, `SettleBatch`, the recorded outcome. | **first** |

Everything else is off-ledger.

**Rounding is not a detail.** Coupon arithmetic produces fractions of the
smallest unit and the residual has to go somewhere. Decide the policy once, in
`Entitlement`, record it on-ledger, and make the total of the legs equal the
announced distribution exactly. A settlement that is off by one cent does not
settle.

### Off-ledger — deliberately thin

**No Java is required.** The JSON Ledger API v2 lets the consoles read the
ledger directly, which removes the REST tier entirely.

One Java component is worth building **if there is time**, and is first to be
cut: a paying-agent daemon that watches for payment dates and fires the run
without a human. It is the honest production component and it is invisible in a
sixty-second video. Say on the slide: *in production this is a scheduled agent;
for the demo it is a button.*

### UI — four panes

Low priority in sequence, high value in the demo. One day, late.

| Pane | Shows |
|---|---|
| **Paying agent** | instrument, holder count, total due, one button, then the settlement result and its update ID |
| **Holder A** | my position, my payment, my transaction |
| **Holder B** | the same, for B |
| **Holder C** | the same, for C |

No forms, no routing, no state library, no auth flows. Lists and numbers.

**The impressive part is not the styling.** It is that Holder B's pane is
conspicuously empty where Holder A's has data. That lands in a plain table.

Four simultaneous ledger connections with four party tokens is the plumbing
detail that always takes longer than expected. Solve it the day the UI starts,
not the day before recording.

---

## The demo

Sixty to ninety seconds, pre-recorded. Season 2's second and third place were
won with slides and a one-minute screen capture, so the bar is a recording, not
a live run — which also removes stage risk.

**Onboarding, shown once.** N agreements land on the ledger. Caption it: *each
holder signs once; never again.* Five seconds, but it is the answer to the
first question any judge who has read the CIP will ask.

**Run one — success.** Fire the distribution. One transaction. Then flip through
three holders, each seeing only its own payment.

**Run two — deliberate failure.** Label the screen unambiguously as an atomicity
demonstration before clicking, so nobody thinks the system broke. One leg is
unavailable — an unsigned holder, or an insufficient allocation. Result:

```
SETTLEMENT REJECTED
500 payments requested
0 payments executed
NO PARTIAL SETTLEMENT
```

Fix the leg, retry, 500/500.

Success first, failure second. A failure shown cold reads as a bug.

---

## Boundaries — what must never cross

| Never crosses | Into |
|---|---|
| A holder's position or payment | another holder's view |
| The register | the public |
| Business logic | the UI |
| Entitlement arithmetic | anywhere but `Indivisa.Entitlement` |
| An unlabelled simulated component | the demo |

---

## Settled questions

**Does the recipient have to authorise?** Yes, by design of the standard, and
it is not a problem. See *Authorisation* above and `CLAUDE.md`, question 1.
Settled 16 September 2026 by reading `settlementFactoryV2_settleBatchDefaultImpl`
as released in Splice 0.8.1. Proof 3 confirms it and records the error shape.

**Which V2 cash instrument for the proofs?** `TestTokenV2`, prebuilt in Splice
0.8.1 at `daml/dars/splice-test-token-v2-1.0.1.dar`. It has no Splice runtime
dependency and no contract keys, so it runs in Daml Script and on a plain
Canton participant. Its Holding is signed by owner and admin — the same hard
case as Canton Coin — so nothing proven against it is easier than the real
thing.

## Open questions

**How many legs fit in one transaction?** CIP-0120 works a one-leg settlement as
three views — Root, Debit, Credit. Root + 2 per leg puts 500 legs near 100 KB on
CIP-120's assumed 100 bytes per view, but that figure is an arithmetic
assumption, not a measurement. With the receipt side counted, the batch
settles N receipt allocations plus the send allocation(s): N+1 sub-views plus
root if one send allocation carries every leg, 2N plus root if not. Proof 5
measures both shapes.

**Which V2 cash instrument for the DevNet evidence run?** `TestTokenV2` again,
or Canton Coin. If Canton Coin: whether Amulet's V2 implementation accepts a
receipt allocation created through a third-party agreement the way
`TestTokenV2` does, or only through its own `TransferPreapproval`, has not been
checked.

**Does the cash registry become a bottleneck?** It sees every leg in its
instrument and must confirm. At 500 legs that is a real question, and it belongs
in the proof 5 measurements rather than in a guess here.

**What does a failed batch actually return?** Empirical, and worth a permanent
regression test — error shapes change between Canton releases. The expected
shape for a missing receipt allocation is `missing authorizations` from
`fetchAndValidateAllocations`.
