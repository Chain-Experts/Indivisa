# Diagrams

Two drawings. The first is the model: every template, who signs it, who sees it, and how the contracts point at each other. The second is the workflow: what happens, in order, from a holder's onboarding to the one transaction that pays everyone. Both render on GitHub and in any Markdown viewer with Mermaid; for a slide, open this file on GitHub and screenshot.

Colour key: green is Indivisa's own Daml (`daml/indivisa`); amber is Token Standard V2, the cash, which Indivisa uses but does not own.

## 1. The templates and how they relate

```mermaid
flowchart TB
  classDef ours fill:#ddebe2,stroke:#1e6b48,color:#1b2622
  classDef v2 fill:#f3ead0,stroke:#8a6a1c,color:#1b2622
  classDef record fill:#ffffff,stroke:#5c6964,color:#1b2622,stroke-dasharray:4 3

  subgraph REG["Register  (plain Daml)"]
    Instrument["<b>Instrument</b><br/>signatory: registrar · observer: issuer<br/>isin, name, currency, denomination,<br/>couponRate, maturity"]
    Position["<b>Position</b>  (one per holder)<br/>signatory: registrar · observer: holder<br/>isin, holder, quantity"]
    Snapshot["<b>RegisterSnapshot</b><br/>signatory: registrar<br/>isin, recordDate, positions: [(holder, quantity)]"]
  end

  subgraph EVT["Corporate action  (plain Daml)"]
    Action["<b>CorporateAction</b><br/>signatory: issuer · observer: payingAgent<br/>isin, kind (Coupon/Dividend/Redemption),<br/>currency, amountPerUnit, recordDate, paymentDate"]
    Schedule["<b>EntitlementSchedule</b><br/>signatory: payingAgent<br/>entries: [holder, quantity, exact, amount]<br/>policy, total  (ensure: total = sum of amounts)"]
  end

  subgraph PAY["Payment consent  (V2-aware)"]
    Proposal["<b>PaymentProposal</b><br/>signatory: payingAgent · observer: holder<br/>holder's cash account, instrument"]
    Agreement["<b>PaymentAgreement</b>  (signed once)<br/>signatory: payingAgent AND holder<br/>holder's cash account, instrument"]
  end

  subgraph DIST["Distribution  (V2-aware)"]
    Run["<b>DistributionRun</b><br/>signatory: payingAgent · observer: approver (optional)<br/>runId, instrument, agentAccount,<br/>legs: [legId, recipient, amount],<br/>schedule (optional link), approver (optional, 0.4.0)"]
    Receipt["<b>DistributionReceipt</b><br/>signatory: payingAgent<br/>runId, legsSettled, total, schedule"]
    Rejected["<b>SettlementRejected</b><br/>signatory: payingAgent<br/>runId, attemptedAt, legsRequested, reason"]
  end

  subgraph V2["Token Standard V2 cash  (Splice, TestTokenV2 in the demo)"]
    Rules["<b>TokenRules</b>  = AllocationFactory + SettlementFactory<br/>signatory: cash registry"]
    Holding["<b>Holding</b>  (cash in an account)<br/>signatory: owner and registry"]
    Alloc["<b>Allocation</b><br/>one <i>send</i> allocation by the agent (all legs)<br/>one <i>receipt</i> allocation per holder"]
  end

  Instrument -- "Instrument_Snapshot(recordDate, positionCids)<br/>verifies every Position, aggregates" --> Snapshot
  Position -. "read by the snapshot" .-> Snapshot
  Snapshot -- "CorporateAction_Entitle(snapshotCid, policy)<br/>quantity × amountPerUnit, rounded" --> Schedule
  Action -- "consumed by Entitle" --> Schedule
  Schedule -- "runFromSchedule: one leg per entry" --> Run
  Proposal -- "Accept (holder, once)" --> Agreement
  Agreement -- "CreateReceiptAllocation (agent alone)<br/>guarded by ensureIsReceiptAllocation" --> Alloc
  Rules -. "AllocationFactory_Allocate" .-> Alloc
  Holding -. "locked by the send allocation" .-> Alloc
  Run -- "Run_Settle(factoryCid, allocationCids)<br/>controllers and actors: payingAgent + approver<br/>= SettlementFactory_SettleBatch<br/>ONE transaction, all legs or none" --> Receipt
  Alloc -. "all N+1 consumed by the settle" .-> Receipt
  Receipt -. "new Holding per holder" .-> Holding
  Run -. "if refused: nothing moves,<br/>the agent records why" .-> Rejected

  class Instrument,Position,Snapshot,Action,Schedule,Proposal,Agreement,Run,Receipt,Rejected ours
  class Rules,Holding,Alloc v2
```

Reading it: everything on the left half is ordinary Daml about the bond and the event; only the two boxes at the bottom right touch cash. The register is never copied into the cash layer: the schedule is derived on-ledger from a verified snapshot, the run carries only `(recipient, amount)` legs, and the settle consumes allocations, not positions.

Who sees what:

| Contract | Registrar / paying agent | Issuer | Holder | Cash registry |
|---|---|---|---|---|
| Instrument | yes | yes | no | no |
| Position | yes | no | **own only** | no |
| RegisterSnapshot | yes | via `Entitle` | no | no |
| CorporateAction | yes | yes | no | no |
| EntitlementSchedule | yes | via `Entitle` | no | no |
| PaymentAgreement | yes | no | own only | no |
| DistributionRun | yes | no | **no** | no |
| Allocation | all | no | **own only** | all (its instrument) |
| Holding (cash) | own | no | **own only** | all (its instrument) |
| DistributionReceipt / SettlementRejected | yes | no | no | no |

In the demo the paying agent is also the registrar.

## 2. The workflow, start to finish

```mermaid
sequenceDiagram
  autonumber
  participant I as Issuer<br/>(Northwind Rail)
  participant A as Paying agent<br/>(also registrar)
  participant H as Holder<br/>(each of N)
  participant C as Cash registry<br/>(TestTokenV2)
  participant L as Canton ledger

  rect rgb(246,247,243)
    note over A,H: ONBOARDING · once per holder, ever
    A->>L: create PaymentProposal (holder's cash account)
    L-->>H: proposal visible to that holder only
    H->>L: Accept → PaymentAgreement (signed by both)
  end

  rect rgb(246,247,243)
    note over A,L: THE REGISTER · maintained as usual
    A->>L: create Instrument, one Position per holder
    L-->>H: each holder sees its own Position
  end

  rect rgb(246,247,243)
    note over I,L: THE EVENT
    I->>L: create CorporateAction (coupon, amount per unit, record date, payment date)
    A->>L: Instrument_Snapshot at the record date → RegisterSnapshot (every Position verified)
    A->>L: CorporateAction_Entitle → EntitlementSchedule (rounded on-ledger, total ensured)
    A->>L: create DistributionRun from the schedule (one leg per holder)
  end

  rect rgb(246,247,243)
    note over A,C: PREPARATION · many commands, asynchronous
    C->>A: mint / fund the agent's cash account (simulated in the demo)
    A->>L: AllocationFactory_Allocate: ONE send allocation carrying every leg (locks the agent's cash)
    loop for each holder, fifty per command
      A->>L: PaymentAgreement.CreateReceiptAllocation (no holder action)
      L-->>H: the holder sees its own allocation only
    end
  end

  rect rgb(221,235,226)
    note over A,L: SETTLEMENT · one transaction
    A->>L: Run_Settle → SettlementFactory_SettleBatch (N+1 allocations)
    alt every leg authorised
      L-->>H: new cash Holding, each holder its own
      L-->>A: DistributionReceipt (legsSettled = N), update id
      L-->>C: the registry confirms legs in its instrument
    else one leg missing (a holder not onboarded)
      L-->>A: refused: "missing authorizations" naming the holder
      note over L: nothing moved, 0 of N paid
      A->>L: create SettlementRejected (the audit record)
      A->>L: fix the leg, Run_Settle again
    end
  end
```

Reading it: steps 1–3 happen once in a holder's life, and they are the holder providing their settlement instructions, which is the only thing a holder ever does. Steps 4–9 are the paying agent's ordinary work and produce no payment. Steps 10–13 are the only place cash is touched before the settle, and every one of them is a single-party command. Step 14 is the product: the one transaction. On LocalNet it commits in 1.6 s for 250 holders and 11.1 s for 1,000 (`benchmark.md`).

What the recording shows of this: the state after step 13 (the console: prepared, payments counted, and any holder's card opened showing zeros about everyone else), then step 14 both ways on **one** seat. The first coupon is refused because one holder has given the paying agent no settlement instructions, that holder provides them on their own page, the agent authorises and it settles. The second coupon on the same bond then settles under the approvers instead, which is step 14 as a governed execution.

Since 0.4.0 a run may name an **approver**, a decentralised party managed by BitSafe's Decentralization Manager. It joins the executors, so step 14 can only happen as a governed execution: the agent proposes, two of three members confirm, the engine executes. `decentralization.md` has that flow.
