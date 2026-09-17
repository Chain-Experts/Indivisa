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
│   │       ├── Types.daml
│   │       ├── Register.daml
│   │       ├── Event.daml
│   │       ├── Entitlement.daml
│   │       └── Distribution.daml
│   │
│   └── indivisa-test/             package `indivisa-test` — never uploaded
│       ├── daml.yaml
│       └── Indivisa/Test/
│           ├── Fixtures.daml
│           ├── Register.daml
│           ├── Entitlement.daml
│           ├── Distribution.daml
│           ├── Scale.daml
│           └── Demo.daml
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
| `Types.daml` | Vocabulary, no templates. `Isin`, `RunId`, `LegId`, `EventKind` (Coupon / Dividend / Redemption), `RoundingPolicy`, `DistributionOutcome`. | no |
| `Register.daml` | `Instrument` — ISIN, name, coupon rate, currency, payment dates. `Position` — instrument, holder, quantity. `RegisterSnapshot` — the record-date freeze. The bond is **not** tokenized. | no |
| `Event.daml` | `CorporateAction` — instrument, kind, rate, record date, payment date, status. Announce, fix record date, cancel. | no |
| `Entitlement.daml` | rate x position x period. `EntitlementSchedule` recording each holder's amount and the rounding policy applied. The residual is resolved here so the legs total the announced distribution exactly. | no |
| `Distribution.daml` | `PaymentAgreement` (signed once per holder; lets the paying agent create that holder's receipt allocations, guarded by `ensureIsReceiptAllocation`). Builds send and receipt `AllocationSpecification`s, drives `AllocationFactory_Allocate` per allocation, exercises `SettlementFactory_SettleBatch`, records the outcome and update id. | **yes** |

**One module knows about Token Standard V2.** If V2 changes, one file changes.

`Distribution.daml` was built first and is verified against the real Splice
0.8.1 DARs; no `VERIFY:` markers remain. It also holds `PaymentAgreementProposal`
(the onboarding step) and `DistributionReceipt` (what the agent keeps after a run).

## `daml/indivisa-test/` — scripts

| Module | Proves |
|---|---|
| `Fixtures.daml` | Party setup, one instrument, N holders. Shared by the rest. |
| `Register.daml` | Positions, transfers before the record date, the snapshot freezing correctly. |
| `Entitlement.daml` | The arithmetic. Rounding, the residual, and that legs sum to the announced total exactly. |
| `Distribution.daml` | The five proofs: batch settles, per-holder visibility, holders authorise once and never per coupon (plus the negative: a missing agreement fails the whole batch), one bad leg settles zero, error shape on failure. |
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
