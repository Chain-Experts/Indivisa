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
│   │       ├── Types.daml                 exists
│   │       ├── Register.daml              planned
│   │       ├── Event.daml                 planned
│   │       ├── Entitlement.daml           planned
│   │       └── Distribution/              the V2 boundary, exists
│   │           ├── Settlement.daml
│   │           ├── Agreement.daml
│   │           └── Run.daml
│   │
│   └── indivisa-test/             package `indivisa-test` — never uploaded
│       ├── daml.yaml
│       └── Indivisa/Test/
│           ├── Fixtures.daml              exists
│           ├── Agent.daml                 exists
│           ├── Distribution.daml          exists
│           ├── Register.daml              planned
│           ├── Entitlement.daml           planned
│           ├── Scale.daml                 planned
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
│   ├── README.md
│   └── localnet/docker-compose.yml
│
└── docs/
    ├── modules.md                 this file
    ├── architecture.md
    ├── explainer.html             the story for a beginner, standalone page
    ├── benchmark.md               proof 5 results
    └── demo-script.md             shot list for the recording
```

## `daml/indivisa/` — the model

| Module | Contains | Touches V2 |
|---|---|---|
| `Types.daml` | Vocabulary, no templates. `PaymentLeg` today; `Isin`, `RunId`, `EventKind` (Coupon / Dividend / Redemption), `RoundingPolicy` as Phase 2 adds them. | no |
| `Register.daml` | `Instrument` — ISIN, name, coupon rate, currency, payment dates. `Position` — instrument, holder, quantity. `RegisterSnapshot` — the record-date freeze. The bond is **not** tokenized. | no |
| `Event.daml` | `CorporateAction` — instrument, kind, rate, record date, payment date, status. Announce, fix record date, cancel. | no |
| `Entitlement.daml` | rate x position x period. `EntitlementSchedule` recording each holder's amount and the rounding policy applied. The residual is resolved here so the legs total the announced distribution exactly. | no |
| `Distribution/Settlement.daml` | Our vocabulary in V2 terms: `settlementInfo`, `holderAccount`, `transferLegOf`. Used by the ledger itself (`Run_Settle` derives the transfer legs from these), so anything a client builds must agree with them. | **yes** |
| `Distribution/Agreement.daml` | `PaymentAgreementProposal` (agent proposes) and `PaymentAgreement` (holder accepts, once). Its one choice lets the paying agent create that holder's receipt allocations, guarded by `ensureIsReceiptAllocation` plus admin and instrument checks. | **yes** |
| `Distribution/Run.daml` | `DistributionRun` (paying agent only; no holder observers) whose `Run_Settle` exercises `SettlementFactory_SettleBatch`, and `DistributionReceipt`, what the agent keeps after a run. Plus `runTotal`, `runSettlementInfo`, `runTransferLegs`. | **yes** |

**One namespace knows about Token Standard V2: `Indivisa.Distribution.*`.** If
V2 changes, those three files change and nothing else.

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
| `Register.daml` | Positions, transfers before the record date, the snapshot freezing correctly. |
| `Entitlement.daml` | The arithmetic. Rounding, the residual, and that legs sum to the announced total exactly. |
| `Scale.daml` | N = 3 → 1000 harness. Output writes `benchmark.md`. |
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
