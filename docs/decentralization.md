# Governed settlement: Indivisa on BitSafe's Decentralization Manager

*We govern the batch payout, not the whole app: the paying agent sees the
full coupon run, but two of three approvers must authorise settlement before
anything moves. Built on BitSafe's Decentralization Manager, governing a
single action, `Run_Settle`, and leaving routine activity alone.*

Everything below ran on 21–22 September 2026 in BitSafe's sandbox (Splice
LocalNet 0.6.12, Canton 3.5.8, three participants, three DecMan v1.8.0
nodes) and on the IDE ledger. What is simulated is stated in section 7.

## 1. The risk

Indivisa's paying agent is the executor of the coupon batch. It sees every
holder and every amount, and until now it could move the whole distribution,
$1,197,240.63 in the recording seat, with one click and no second signature.
That is the shape of the product, not a bug: someone has to see the full
run, and the standard makes the executor that someone. But a real paying
agency does not let one operator release a payout. It has four-eyes
authorisation, and Indivisa had none.

## 2. Before and after

**Before.** `DistributionRun.Run_Settle` was controlled by the paying agent
alone. The Token Standard V2 batch it exercises, `SettlementFactory_SettleBatch`,
requires the authority of every executor named in the settlement, and the
only executor was the agent.

**After.** A run may name an **approver**: a party whose authority the
settlement needs besides the agent's. The approver is one of the run's
executors, so the token standard's own check (`SettleBatch` is controlled by
its actors, which must equal the executors) refuses any settlement that does
not carry the approver's authority. The approver is a **decentralised
party** managed by BitSafe's Decentralization Manager, and a decentralised
party acts only when a threshold of its members has confirmed.

The only way to bring the agent's and the approver's authority together is
a governed action: the agent files a `SettleRunProposal` (it is admitted to
the rules as an *additional proposer*, so it may propose and never
confirm); members confirm through DecMan; any member executes; the engine
exercises the proposal with the governance party's authority, and
`executeImpl`, which runs with that authority plus the proposer's, exercises
`Run_Settle`. Below threshold the engine refuses. Outside the vote the agent
alone is refused by the ledger.

```
before   paying agent ──Run_Settle──▶ SettleBatch (actors: agent)                 ──▶ paid

after    paying agent ──SettleRunProposal──▶ member confirms ─┐
                                                              ├─ threshold ─▶ execute ──▶ Run_Settle
                                              member confirms ─┘   (DP + agent)     (actors: agent, DP) ──▶ paid
         paying agent ──Run_Settle alone──▶ refused: "requires authorizers Approvers, PayingAgent, but only PayingAgent were given"
```

What changed in Indivisa's model (package `indivisa` 0.3.0 → 0.4.0, a
Smart Contract Upgrade): one optional field, `approver`, at the end of
`DistributionRun`; the run's `observer`, its settlement's `executors` and
`Run_Settle`'s controllers and `actors` all derive from `payingAgent ::
approver`; and a holder's standing consent (`PaymentAgreement`) covers
settlements the agent executes jointly, not only alone. With `approver =
None` nothing changes: every earlier proof and the main demo run unchanged.
The batch settlement path itself was not touched.

Everything else stays ungoverned on purpose: the register, the
announcement, the snapshot, the schedule, the allocations. None of them
moves money, and governing routine activity is on BitSafe's own list of
what loses points.

## 3. The module, and the reference application

**`governance-settlement-v0`** (`daml/governance-settlement/`) is the
reusable part: `Governance.Settlement.BatchSettlement.BatchSettlementProposal`,
a `GovernableAction` whose `executeImpl` is one Token Standard V2
`SettleBatch`. It depends only on BitSafe's `governance-action-v1` and the
Splice V2 API packages; nothing from Indivisa. Any application that pays
many parties at once adopts it by naming the governance party among the
executors when it allocates, then proposing, confirming, executing. Its
test (`Governance.Settlement.Test.BatchSettlementTest`) proves the three
properties without Indivisa: below threshold refused, proposer alone
refused, at threshold settled.

**`indivisa-governance-v0`** (`daml/indivisa-governance/`) is Indivisa's
application of the same pattern: `SettleRunProposal`, forty lines, whose
`executeImpl` exercises `Run_Settle` so that the run is consumed and the
`DistributionReceipt` written, which the paying agent's records and the four
panes rely on.

## 4. The members, and which are independent

| | Sandbox (contribution pool) | DevNet (Gold, planned) |
|---|---|---|
| Decentralised party | `demo-party`, seeded by BitSafe's `seed.sh` | onboarded through DecMan across two nodes |
| Members | three, one per participant | two: one ours, one BitSafe's |
| Nodes | three participants **in one Canton container** on one workstation | our validator and BitSafe's validator |
| Threshold | 2 of 3 | 2 of 2 |
| Independent operators | **none**. Three DecMan nodes and three participants on one machine run by one person are not three operators. The hosting threshold is real; the independence is not. | two. Every settlement needs BitSafe's confirmation on BitSafe's node. |

We say this because claiming operator independence from one laptop is on
BitSafe's list of things that lose points, and because it is true.

The threshold in the demo is 2 of 3: one confirmation is refused, two
execute. On DevNet it is 2 of 2, which is stronger, not weaker: with two of
three where we held two nodes, our organisation could settle without
BitSafe and the shared control would be nominal.

## 5. The evidence

Recorded error shapes, from the IDE ledger (`Indivisa.Test.Governance`,
`Governance.Settlement.Test.BatchSettlementTest`) and the sandbox:

| Path | What refuses it | Text |
|---|---|---|
| execute with 1 of 3 confirmations | the governance engine | `The requirement 'Enough confirmations to execute action' was not met.` |
| paying agent calls `Run_Settle` alone | Daml authorisation on the run | `DistributionRun requires authorizers Approvers, PayingAgent, but only PayingAgent were given` |
| proposer calls `SettleBatch` alone (generic module) | the token standard | `'actors' does not have the same elements as one of 'allowed actors'. actors: [proposer] allowed actors: [[proposer, dp]]` |
| execute with 2 of 3 | nothing | settled: every holder paid, run consumed, receipt and `GovernanceExecutionResult` written |

Sandbox run of 21–22 September, seat `bs3`, ten holders, $16,034.38:
propose at offset 524, confirmations at 527 and 537, execute refused between
them with the text above, execute and `execute_result` at 540; holder 1's
own participant shows $109.37 unlocked; the agent holds the receipt
(`legsSettled = 10`) and no open run. The full audit trail is in
`infra/bitsafe/demo/audit-bs3.json` on the machine that ran it; the same
trail is in DecMan's UI under Audit Trail.

## 6. Reproduce it from a clean environment

Prerequisites: Docker with Compose v2 and 12 GB for it, `curl`, `jq`,
`bash`, Daml SDK 3.5.x through `dpm`, PowerShell 7, Node 22. About an hour
the first time, mostly image downloads.

```
# 1. BitSafe's sandbox, next to this repo
git clone -b hackathon --depth 1 https://github.com/DLC-link/decentralization-manager ../decentralization-manager
(cd ../decentralization-manager && bash hackathon/up.sh && bash hackathon/seed.sh)
#    -> three participants (3901/2901/4901), three DecMan nodes (8081-8083),
#       demo-party with GovernanceRules threshold 2, hackathon/.state written

# 2. Build, then distribute our packages to the three participants
dpm build --all
pwsh infra/bitsafe/distribute.ps1          # POST /dars/distribute + accept the two invitations

# 3. Seat ten holders and vote the paying agent in as proposer
pwsh infra/demo.ps1   seat   -Network bitsafe -Holders 10 -Tag bs1 -User ledger-api-user
pwsh infra/govern.ps1 admit  -Network bitsafe -Tag bs1

# 4. The run names the approver; the agent proposes
pwsh infra/demo.ps1   prepare -Network bitsafe -Tag bs1 -Approver <demo-party id from hackathon/.state>
pwsh infra/govern.ps1 propose -Network bitsafe -Tag bs1

# 5. One confirmation: refused. Two: settled.
pwsh infra/govern.ps1 confirm -Network bitsafe -Tag bs1 -Node 1
pwsh infra/govern.ps1 execute -Network bitsafe -Tag bs1 -Node 2      # REFUSED, threshold
pwsh infra/govern.ps1 confirm -Network bitsafe -Tag bs1 -Node 2
pwsh infra/govern.ps1 execute -Network bitsafe -Tag bs1 -Node 3      # EXECUTED
pwsh infra/govern.ps1 audit   -Network bitsafe -Tag bs1
```

The Daml proofs need no network: `cd daml/indivisa-governance-test && dpm test`.

`infra/bitsafe/participants.json` and `ui.json` carry the sandbox's public
LocalNet dev token (it is in BitSafe's repo and authorises nothing
elsewhere); the scripts grant that user act-as rights on every party they
allocate, as the sandbox's own seed script does.

## 7. Real, simulated, unfinished

- **Real:** the governance engine (BitSafe's, unmodified), the threshold
  refusal, the settlement through `Run_Settle`, the audit trail, every
  number on screen.
- **Simulated:** the cash (`TestTokenV2`, the reference Token Standard V2
  asset, with our own registry party); the holders; and, in the sandbox,
  operator independence, as section 4 says.
- **Unfinished:** the DevNet deployment with BitSafe as the second
  operator (the ask is with our DevOps engineer); showing the governed run
  in the console (it shows the settled state today, not the vote);
  a `Governed` variant of the recording.

## 8. What comes next

The same proposal template governs a dividend or a redemption without
change, because they are the same `DistributionRun`. The generic module is
offered to BitSafe's repository as is. A production paying agent would keep
`approver = None` for small runs and set it above a threshold amount; that
policy belongs in the application, not in the module, and the module makes
it a one-field decision.
