# Modules

Every file that will exist when this is finished, and what is in it.
For the order of work see `TASKS.md`; for the reasoning see `architecture.md`.

```
Indivisa/
├── README.md                      public front door
├── CLAUDE.md                      working context for future sessions
├── TASKS.md                       order of work
├── LICENSE
├── multi-package.yaml
├── .gitignore
│
├── daml/
│   ├── dars/                      prebuilt Token Standard V2 DARs, Splice 0.8.1
│   │                              (ten files; list in CLAUDE.md)
│   ├── indivisa/                  package `indivisa` — uploaded to participants
│   │   ├── daml.yaml
│   │   └── Indivisa/
│   │       ├── Types.daml                 exists; vocabulary, no V2
│   │       ├── Utils.daml                 exists; our vocabulary in V2 terms
│   │       ├── Model/
│   │       │   ├── Payment.daml           exists; the once-only consent (V2)
│   │       │   ├── Distribution.daml      exists; the run and its settle (V2)
│   │       │   ├── Register.daml          exists; instrument, positions, snapshot
│   │       │   ├── Event.daml             exists; the corporate action
│   │       │   └── Entitlement.daml       exists; rate x position, rounding
│   │
│   └── indivisa-test/             package `indivisa-test` — never uploaded
│       ├── daml.yaml
│       └── Indivisa/Test/
│           ├── Fixtures.daml              exists
│           ├── Agent.daml                 exists
│           ├── Distribution.daml          exists
│           ├── Register.daml              exists
│           ├── Entitlement.daml           exists
│           ├── Coupon.daml                exists; the whole chain, end to end
│           ├── Scale.daml                 exists
│           └── Demo.daml                  planned
│
├── ui/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── config.ts
│       ├── ledger/
│       │   ├── client.ts
│       │   └── queries.ts
│       ├── panes/
│       │   ├── PayingAgent.tsx
│       │   └── Holder.tsx
│       └── components/
│           ├── Money.tsx
│           ├── LegTable.tsx
│           └── StatusPill.tsx
│
├── infra/
│   ├── README.md                  what any network needs; LocalNet; DevNet handover
│   └── localnet/
│       ├── localnet.conf          1 synchronizer, 5 participants, in memory
│       ├── bootstrap.canton       connect, upload DARs, ping
│       ├── participants.json      party-to-participant map for Daml Script
│       └── up.ps1                 start / -Down
│
└── docs/
    ├── modules.md                 this file
    ├── architecture.md
    ├── explainer.html             the story for a beginner, standalone page
    ├── benchmark.md               proof 5 results (interpreter done; participant pending)
    └── demo-script.md             shot list for the recording
```

## `daml/indivisa/` — the model

| Module | Contains | Touches V2 |
|---|---|---|
| `Types.daml` | Vocabulary, no templates. `PaymentLeg` today; `Isin`, `RunId`, `EventKind` (Coupon / Dividend / Redemption), `RoundingPolicy` as Phase 2 adds them. | no |
| `Utils.daml` | Our vocabulary in V2 terms: `settlementInfo`, `holderAccount`, `transferLegOf`. Used by the ledger itself (`Run_Settle` derives the transfer legs from these), so anything a client builds must agree with them. | **yes** |
| `Model/Payment.daml` | `PaymentProposal` (agent proposes; holder `Accept`s once, or `Decline`s; agent may `Withdraw`) and `PaymentAgreement`. Its one choice, `CreateReceiptAllocation`, lets the paying agent create that holder's receipt allocations, guarded by `ensureIsReceiptAllocation` plus admin and instrument checks. | **yes** |
| `Model/Distribution.daml` | `DistributionRun` (paying agent only; no holder observers) whose `Run_Settle` exercises `SettlementFactory_SettleBatch`, and `DistributionReceipt`, what the agent keeps after a run; both link the `EntitlementSchedule` they pay. `runFromSchedule` builds a run leg for leg from a schedule. Plus `runTotal`, `runSettlementInfo`, `runTransferLegs`. | **yes** |
| `Model/Register.daml` | `Instrument` (registrar signs, issuer observes; ISIN, name, currency, denomination, coupon rate, maturity). `Position` (registrar signs, holder observes: each holder sees only its own; `Position_Transfer`). `RegisterSnapshot`, created by `Instrument_Snapshot`, which verifies every position contract and aggregates per holder. The bond is **not** tokenized. | no |
| `Model/Event.daml` | `CorporateAction` (issuer signs, agent observes): kind, currency, `amountPerUnit`, record and payment dates. `CorporateAction_Entitle` attaches the snapshot and derives the schedule on-ledger; `CorporateAction_Cancel`. | no |
| `Model/Entitlement.daml` | `entitlements`: quantity x amountPerUnit under a `RoundingPolicy`; largest-remainder by default so the legs sum to the announced total exactly; zero entitlements dropped. `EntitlementSchedule` records exact and paid amounts per holder, the policy, and ensures the total. | no |

**Token Standard V2 is touched by `Indivisa.Utils` and `Indivisa.Model.*`, and
nothing else.** `Types` and the future `Register`, `Event` and `Entitlement`
are plain Daml. If V2 changes, `Utils`, `Model/Payment` and
`Model/Distribution` change.

Rule for what lives in the model: only what the ledger executes or what the
ledger's own choices call. Functions used solely by scripts belong in the test
package, however product-like they are. The allocation-spec builders are the
example: they are the paying agent's client logic, so they sit in
`Indivisa.Test.Agent`.

## `daml/indivisa-test/` — scripts

| Module | Holds |
|---|---|
| `Fixtures.daml` | `Cast` (parties), `Cash` (the reference token: rules contract, disclosure, choice context), `setup`, `fund` (simulated cash), balances through the V2 `Holding` interface, `onboard` / `onboardAll`, `threeLegs`, `createRun`, `requestedAt`, `errorText`. Shared by the rest. |
| `Agent.daml` | The paying agent's client moves: `sendAllocationSpec`, `receiptAllocationSpec` and their `run*` forms, `allocateSend`, `allocateReceipt`, `trySettle`, `settle`. A UI or daemon reimplements exactly this sequence. |
| `Distribution.daml` | The proofs, assertions only: batch settles (1), per-holder visibility in single-participant form (2), holders authorise once and the delegation cannot be abused (3), one bad leg settles zero with the rejection recorded (4). |
| `Register.daml` | Positions aggregate and transfer; each holder sees only its own; the snapshot freezes and is verified against real position contracts. |
| `Entitlement.daml` | The arithmetic: largest remainder hands out the residual cent; half-up lets the total follow; sums are exact across rates and sizes; zero entitlements dropped; the schedule template ensures its total. |
| `Coupon.daml` | The whole chain: register, announcement, snapshot, on-ledger schedule (Charlie gets the residual cent), run from schedule, one settlement, balances equal the schedule, receipt links the schedule, holders never see the schedule or the run. IDE and LocalNet. |
| `Scale.daml` | Proof 5 harness: `scale n` runs the whole day for N holders, `scaleAllocateOnly n` stops before the settle so the difference is the one transaction. Sizes 3, 10, 50 under `dpm test -p scale`; larger through the runner with an input file. Results in `benchmark.md`. |
| `Demo.daml` | Seats the demo: realistic holders, announces the coupon, arms the deliberate failure. |

## `ui/` — four panes

| File | Does |
|---|---|
| `ledger/client.ts` | JSON Ledger API v2 over fetch. One client per party, each with its own token. No Java tier. |
| `ledger/queries.ts` | Distribution summary for the agent; own position and own payment for a holder. |
| `panes/PayingAgent.tsx` | Instrument, holder count, total due, one button, result with update id. |
| `panes/Holder.tsx` | **One component rendered three times** with a different party. Not three files. |
| `components/*` | `Money` (tabular figures), `LegTable`, `StatusPill`. |
| `config.ts` | Party ids, tokens, instrument id for the demo. |

## Not built, deliberately

- **No Java.** An optional paying-agent daemon only if ahead of schedule; first to be cut.
- **No bond tokenization.** Cash only.
- **No announcement-data layer.** Chainlink and DTCC own that; Indivisa is the payment layer.
- **No registry adapters.** Demo data is synthetic and labelled as such.

Roughly 800–1000 lines of Daml and 400–600 of TypeScript.
