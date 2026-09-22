# Modules

Every file, and what is in it.
For the order of work see `TASKS.md`; for the reasoning see `architecture.md`.

```
Indivisa/
├── README.md                      public front door
├── TASKS.md                       order of work
├── LICENSE                        Apache-2.0, verbatim
├── NOTICE                         our copyright; attribution for the vendored Splice DARs
├── multi-package.yaml
├── .gitignore
│
├── daml/
│   ├── dars/                      prebuilt Token Standard V2 DARs, Splice 0.8.1
│   │                              (ten files; listed in NOTICE)
│   ├── indivisa/                  package `indivisa` — uploaded to participants
│   │   ├── daml.yaml
│   │   └── Indivisa/
│   │       ├── Types.daml                 vocabulary, no V2
│   │       ├── Utils.daml                 our vocabulary in V2 terms
│   │       ├── Model/
│   │       │   ├── Payment.daml           the once-only consent (V2)
│   │       │   ├── Distribution.daml      the run and its settle (V2)
│   │       │   ├── Register.daml          instrument, positions, snapshot
│   │       │   ├── Event.daml             the corporate action
│   │       │   └── Entitlement.daml       rate x position, rounding
│   │
│   ├── indivisa-test/             package `indivisa-test` — never uploaded (LF 2.2; the model is 2.1)
│   │   ├── daml.yaml
│   │   └── Indivisa/Test/
│   │       ├── Fixtures.daml              cast, cash, funding, onboarding, waits
│   │       ├── Agent.daml                 the paying agent's client moves
│   │       ├── Distribution.daml          proofs 1 to 4
│   │       ├── Register.daml              positions, transfer, snapshot
│   │       ├── Entitlement.daml           the rounding arithmetic
│   │       ├── Coupon.daml                the whole chain, end to end
│   │       ├── Scale.daml                 proof 5 harness
│   │       └── Demo.daml                  seat a realistic holder base, run the day, arm the failure
│   │
│   ├── governance-settlement/     package `governance-settlement-v0`: a V2 batch settlement as a
│   │   └── daml/Governance/Settlement/BatchSettlement.daml     governed action; no Indivisa in it (for BitSafe's repo)
│   ├── indivisa-governance/       package `indivisa-governance-v0`: SettleRunProposal over Run_Settle
│   │   └── daml/Indivisa/Governance/SettleRunProposal.daml
│   └── indivisa-governance-test/  the governance proofs (IDE ledger) and the propose script
│       ├── Indivisa/Test/Governance.daml          1 of 3 refused, agent alone refused, 2 of 3 settles
│       ├── Indivisa/Governance/Demo.daml         govern_propose, driven by infra/govern.ps1
│       └── Governance/Settlement/Test/BatchSettlementTest.daml   the generic module on its own
│
├── ui/                            the four panes (Vite + React, no backend)
│   ├── README.md
│   ├── package.json
│   ├── vite.config.ts             proxy per participant (ui.json), serves the seat and the map
│   ├── index.html
│   ├── scripts/settle.ts          the button's settle, from Node, for the benchmark
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── config.ts
│       ├── ledger/
│       │   ├── client.ts
│       │   └── queries.ts
│       ├── panes/
│       │   ├── PayingAgent.tsx    every leg, the button, the outcome
│       │   └── Holder.tsx         one component, three holders
│       └── components/
│           ├── Money.tsx
│           ├── LegTable.tsx
│           └── StatusPill.tsx
│
├── infra/
│   ├── README.md                  what any network needs; LocalNet; DevNet handover
│   ├── demo.ps1                   seat / prepare / attempt, the demo from a shell (-Network)
│   ├── participants-with-parties.ps1   adds every existing party to the runner's map
│   ├── settle.ps1                 prepare N legs by script, settle over the JSON API from Node, time it
│   ├── govern.ps1                 the governed settlement against BitSafe's DecMan: admit, propose, confirm, execute, audit
│   ├── localnet/
│   │   ├── localnet.conf          1 synchronizer, 5 participants, in memory
│   │   ├── bootstrap.canton       connect, upload DARs, ping
│   │   ├── participants.json      participants for Daml Script (host, port)
│   │   ├── ui.json                the same five, as JSON Ledger API URLs for the UI
│   │   ├── up.ps1                 start / -Down / -Heap
│   │   └── proofs.ps1             the six proofs and the coupon, one line each
│   ├── devnet/
│   │   ├── participants.example.json   same shape plus access_token, user_id per participant
│   │   └── ui.example.json        same shape plus token; the real files are git-ignored
│   └── bitsafe/                   BitSafe's sandbox as a network: config with its public dev token,
│       └── distribute.ps1         and the DAR distribution through DecMan
│
└── docs/
    ├── modules.md                 this file
    ├── architecture.md
    ├── explainer.html             the story for a beginner, standalone page
    ├── Indivisia Logo.png         the logo
    ├── benchmark.md               proof 5 results: interpreter to 2,000 legs, LocalNet to 1,000
    ├── diagrams.md                the templates and their relations; the workflow, start to finish (Mermaid)
    ├── demo-script.md             the recording, step by step, for someone who has never seen the project
    ├── decentralization.md        the governed settlement: risk, before and after, evidence, how to reproduce
    └── for-a-teenager.md          the whole idea, BitSafe included, from zero: finance words, blockchain, the flow, the vote
```

## `daml/indivisa/` — the model

| Module | Contains | Touches V2 |
|---|---|---|
| `Types.daml` | Vocabulary, no templates: `Isin`, `EventKind` (Coupon / Dividend / Redemption), `RoundingPolicy` (LargestRemainder, RoundHalfUpResidualToIssuer), `PaymentLeg`. | no |
| `Utils.daml` | Our vocabulary in V2 terms: `settlementInfo` (takes the executors), `holderAccount`, `transferLegOf`. Used by the ledger itself (`Run_Settle` derives the transfer legs and the settlement from these), so anything a client builds must agree with them. | **yes** |
| `Model/Payment.daml` | `PaymentProposal` (agent proposes; holder `Accept`s once, or `Decline`s; agent may `Withdraw`) and `PaymentAgreement`. Its one choice, `CreateReceiptAllocation`, lets the paying agent create that holder's receipt allocations, guarded by `ensureIsReceiptAllocation` plus admin and instrument checks; the consent covers settlements the agent executes alone or with an approver (0.4.0). | **yes** |
| `Model/Distribution.daml` | `DistributionRun` (paying agent only; no holder observers) whose `Run_Settle` exercises `SettlementFactory_SettleBatch`, and `DistributionReceipt`, what the agent keeps after a run; both link the `EntitlementSchedule` they pay. `SettlementRejected`, the agent's own record of a refused batch (a refused transaction leaves nothing behind). `runFromSchedule` builds a run leg for leg from a schedule. `approver : Optional Party` (0.4.0): a second executor whose authority the settle needs; `runExecutors` feeds the choice's controllers, the batch's actors and the allocations' executors. Plus `runTotal`, `runSettlementInfo`, `runTransferLegs`. | **yes** |
| `Model/Register.daml` | `Instrument` (registrar signs, issuer observes; ISIN, name, currency, denomination, coupon rate, maturity). `Position` (registrar signs, holder observes: each holder sees only its own; `Position_Transfer`). `RegisterSnapshot`, created by `Instrument_Snapshot`, which verifies every position contract and aggregates per holder. The bond is **not** tokenized. | no |
| `Model/Event.daml` | `CorporateAction` (issuer signs, agent observes): kind, currency, `amountPerUnit`, record and payment dates. `CorporateAction_Entitle` attaches the snapshot and derives the schedule on-ledger; `CorporateAction_Cancel`. | no |
| `Model/Entitlement.daml` | `entitlements`: quantity x amountPerUnit under a `RoundingPolicy`; largest-remainder by default so the legs sum to the announced total exactly; zero entitlements dropped. `EntitlementSchedule` records exact and paid amounts per holder, the policy, and ensures the total. | no |

**Token Standard V2 is touched by `Indivisa.Utils` and `Indivisa.Model.*`, and
nothing else.** `Types`, `Register`, `Event` and `Entitlement` are plain Daml. If V2 changes, `Utils`, `Model/Payment` and
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
| `Scale.daml` | Proof 5 harness: `scale n` runs the whole day for N holders, `scaleAllocateOnly n` stops before the settle, `scalePrepare` does the same and emits what the JSON API settle client needs (`PreparedOut`). Sizes 3, 10, 50 under `dpm test -p scale`; larger through the runner with an input file, settled by `infra/settle.ps1`. Results in `benchmark.md`. |
| `Demo.daml` | `demo_seat` (parties with realistic names and heavy-tailed positions, cash, instrument, onboarding, announcement, snapshot, on-ledger schedule; emits a `DemoSeat` JSON for the run and the panes) and `demo_attempt` (finds or creates the run, creates only the allocations still missing, settles; `withhold = 1` arms the deliberate failure and writes a `SettlementRejected` record; `withhold = 0` completes). `demo_smoke` runs both under `dpm test`. |

## `daml/governance-*`, `daml/indivisa-governance*` — the BitSafe packages

Outside the model package on purpose, so `indivisa` carries no governance
dependency; LF 2.2 because BitSafe's interface package is.

| Package | Holds |
|---|---|
| `governance-settlement-v0` | `Governance.Settlement.BatchSettlement.BatchSettlementProposal`: a `GovernableAction` whose `executeImpl` is one V2 `SettlementFactory_SettleBatch`, executed with the governance party's and the proposer's authority. Depends on `governance-action-v1` and the Splice V2 API only. The reusable contribution, in BitSafe's package layout. |
| `indivisa-governance-v0` | `Indivisa.Governance.SettleRunProposal`: the same pattern over `Run_Settle`, so the run is consumed and the receipt written. Forty lines. |
| `indivisa-governance-test` | `Indivisa.Test.Governance` (three members, threshold two: 1 of 3 refused, agent alone refused, 2 of 3 settles, proposer cancel, no-approver unchanged), `Governance.Settlement.Test.BatchSettlementTest` (the generic module without Indivisa), `Indivisa.Governance.Demo.govern_propose` (the shell-driven proposal). Reuses `indivisa-test`'s cash and agent fixtures. |

## `ui/` — four panes

| File | Does |
|---|---|
| `ledger/client.ts` | JSON Ledger API v2 over fetch: ledger end, active contracts by template or interface, submit-and-wait, update-by-offset. One client per party, pointed at its participant. No Java tier. |
| `ledger/queries.ts` | `agentState` (instrument, schedule, run, allocations, rejections, receipt with update id), `holderState` (mine, and the counts of everything else), `factoryDisclosure`, `settle`, `recordRejection`. |
| `panes/PayingAgent.tsx` | Instrument, holders, total due, allocations ready, the button, the outcome, the schedule table. |
| `panes/Holder.tsx` | **One component rendered three times** with a different party. Not three files. |
| `components/*` | `Money` (tabular figures), `LegTable`, `StatusPill`. |
| `config.ts` | Loads the seat and the party-to-participant map; display names from party ids. |
| `vite.config.ts` | Dev proxy per participant from `infra/<network>/ui.json`, bearer token injected server-side; serves the seat and the party map (stripped to `party_participants`) at `/demo/*`. |
| `scripts/settle.ts` | The same `settle` call as the button, run from Node against `infra/<network>/ui.json` directly (no proxy; adds the bearer header itself). `infra/settle.ps1` bundles it with esbuild and runs it after a script-side prepare; it is how the benchmark times submit to commit without the Daml Script runner. |

## Not built, deliberately

- **No Java.** An optional paying-agent daemon only if ahead of schedule; first to be cut.
- **No bond tokenization.** Cash only.
- **No announcement-data layer.** Chainlink and DTCC own that; Indivisa is the payment layer.
- **No registry adapters.** Demo data is synthetic and labelled as such.

About 600 lines of Daml in the model, 150 in the two governance packages and 2,250 in scripts; 950 of TypeScript; 800 of PowerShell, Canton config and CSS (22 Sep).
