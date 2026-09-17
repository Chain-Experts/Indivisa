# Indivisa

**Corporate actions, settled in one atomic batch, without exposing the register.**

A bond pays its coupon to five hundred holders. The paying agent fires one
transaction. Every holder is paid at the same instant or nobody is — and no
holder sees another's payment.

Built by Chain-Experts for HackCanton Season 3.

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
Coupon event
     │
     ▼
Entitlements calculated from the register
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

**Experiment, not product.** We are establishing whether CIP-112 has created a
usable corporate-actions primitive before building anything on top of it.

| Proof | Question | Status |
|---|---|---|
| 1 | Does one payer settle to three recipients in one batch? | **passes** (Daml Script, 17 Sep) |
| 2 | Does each recipient see only its own leg? | single-participant form passes; four-participant run pending |
| 3 | Do holders authorise **once**, at onboarding, and never per coupon? | **passes** (two coupons, no holder command; misuse refused) |
| 4 | Does one bad leg settle **zero**, not N−1? | **passes** (rejection recorded) |
| 5 | How many legs fit in one transaction? | |

Proof 5 is the one that can still kill the idea. Proof 3 was answered on 16
September by reading the V2 settlement logic as shipped in Splice 0.8.1: the
standard requires receiver-side allocations, and its reference app shows the
standing-agreement pattern that collects that authority once. See `TASKS.md`.

Nobody has published how many legs fit in a CIP-112 batch. Whatever the answer
is, the benchmark goes in this repo and to the Canton forum.

---

## Build

```bash
dpm build --all
cd daml/indivisa-test
dpm test
```

Daml SDK 3.5.x, `dpm` rather than the `daml` assistant, LF 2.1. The Token
Standard V2 DARs are prebuilt in `canton-network/splice` at tag `0.8.1`, path
`daml/dars/` and vendored in this repo under the same path; `CLAUDE.md` lists them.

---

## Stated limits

Worth saying before anyone else says it.

- **We do not solve corporate-action announcement data.** Chainlink, with DTCC,
  Swift and Euroclear, is attacking that layer. Indivisa is the payment layer.
- **The cash leg is simulated.** No paying agent settles on Canton today. Every
  demo component is labelled real, simulated or planned.
- **Scale is unproven** until proof 5 says otherwise. "500 holders" is a target,
  not a measurement.
- **Holders are not zero-touch; they are one-touch.** The standard requires the
  receiver's authority on every leg. Indivisa collects it once, in a standing
  agreement, and never again. A holder who has not signed cannot be paid — the
  batch refuses, for everyone, until that holder is onboarded or removed from
  the run. That is a real operational constraint and we say so.

---

## Documents

| | |
|---|---|
| `CLAUDE.md` | Working context, decisions, corrections already made |
| `docs/modules.md` | Every file that will exist, and what is in it |
| `docs/architecture.md` | Components, settlement flow, boundaries, open questions |
| `TASKS.md` | The plan to 9 October, proofs first |

---

## Context

HackCanton Season 3, submission 9 October 2026. Open-sourced under the
Chain-Experts name.

Sources: [CIP-0112](https://github.com/canton-foundation/cips/blob/main/cip-0112/cip-0112.md) ·
[Canton Network, Post-Trade Transformation](https://www.canton.network/hubfs/eBook%2C%20Post-Trade%20Transformation%2C%202025-03-14.pdf) ·
[CIP-0120](https://github.com/canton-foundation/cips/blob/main/cip-0120/cip-0120.md)
