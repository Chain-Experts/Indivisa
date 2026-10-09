# Questions

The questions people actually ask about Indivisa, answered as directly as we can, with a pointer to the evidence for each. Where an answer is uncomfortable, it is here anyway.

---

## The product

### What problem does this solve?

A bond pays its coupon to hundreds of holders. Today that runs on spreadsheets and batch files: a file goes out, payments land at different times, and reconciliation finds the gaps afterwards. Indivisa makes the paying agent fire **one transaction**. Every holder is paid at the same instant or nobody is.

The industry's own numbers, from Canton Network's post-trade eBook: **$3.42m** average annual cost of asset-servicing errors per market participant, and error rates of **3 to 10%** described as routine. Those cover all corporate actions, not coupons alone; coupons are our chosen example.

### Why does this need Canton rather than any other chain?

The organisers' own test is: *if this moved to a globally transparent chain tomorrow, what would stop working?* For Indivisa the answer is everything. Every holder's position size becomes public the moment the coupon pays, and the register is confidential both by law and by commercial sensitivity.

Privacy here is not a feature we added. It is the thing that makes the product possible at all.

### Is the bond itself on the ledger?

No, and that is deliberate. Only the **cash** is a Token Standard V2 asset. The register is ordinary Daml: an `Instrument` contract and a `Position` per holder. This halves the model and makes a better product argument, because Indivisa works against registers that already exist. The industry does not have to tokenize every bond first.

### Would anyone really use this?

Not as it stands, and we are specific about why in [`production-readiness.md`](production-readiness.md). The honest shape is: a pilot with a willing counterparty on a real network is close, and replacing an existing process with real money at scale is not. What is finished is the settlement engine and the evidence that it behaves. What is missing is the surrounding product: onboarding through a real client, a scheduler, reporting, and the operational controls a payout desk expects, including maker-checker, which does not exist yet.

---

## Privacy

### If the paying agent sees every leg, what privacy is there?

The paying agent is the **executor**, and the executor sees the whole batch by design. That is in CIP-0112's own visibility model:

| Party | Sees |
|---|---|
| Each participant | only its own legs |
| Each asset administrator | only legs for instruments it manages |
| The executor | all legs |

So the claim is not "nobody sees anything". It is **no holder sees another**, which is the claim that matters: the register is what must not leak, and a paying agent that could not see the run it is paying could not pay it.

### How is that enforced, rather than just asserted?

By who is a stakeholder on the contract. An allocation in the reference token is:

```daml
signatory accountParties allocation.admin allocation.authorizer, allocation.admin
observer settlement.executors
```

Three kinds of party and no others: the one authorising it, the registry administering the asset, and the executors. An allocation has exactly **one** authorizer, so it can never span two holders. The standard's own implementation adds no further observers, with the comment *"to avoid leaking the settlement of different allocations to the other authorizers"*.

### Does one `SettleBatch` expose everyone to everyone?

No. One batch covers **one instrument administrator**. A cash-against- securities trade is two factory calls inside a single transaction, and neither registry sees the other's legs. The executors are the only parties who span both, which is exactly what the standard means when it says they *"guarantee atomic settlement across asset admins"*.

---

## The mechanism

### What is a leg, and what is an allocation?

**A leg is one payment to one person.** An id, a recipient, an amount. About 85 bytes in the settle request.

**An allocation is a party's authorisation**, a contract on the ledger with cash set aside behind it. It carries a copy of the settlement, the account authorising, the leg sides it covers and the holdings backing it: about 1,554 bytes, roughly eighteen times a leg.

Both sides of every leg must be authorised, so five holders produce five legs and **six** allocations: one from the paying agent covering all five sender sides, and one receipt each. Worked through in [`architecture.md`](architecture.md).

### Do holders have to do anything when a coupon pays?

No, but they do sign once. Token Standard V2 requires the receiver's authority on every leg, so each holder signs one standing agreement with the paying agent at onboarding. After that, every coupon lands with zero holder action.

Say it that way: holders authorise **once, at onboarding**. Not "holders never authorise", which would be false.

### What happens if one holder is not ready?

Nothing moves. Not four out of five, zero. The ledger refuses the whole batch with `missing authorizations` naming the holder, and the refusal is recorded on-ledger as a contract rather than a log line. That is the atomicity guarantee being demonstrated rather than described, and it is the first thing the quickstart shows you.

---

## The numbers

### Why did 13,000 legs settle faster than 1,000?

Because allocations are the cost, not legs, and the two runs had different shapes.

| Run | Legs | Allocations | Size | Submit to commit |
|---|---|---|---|---|
| One payment per holder | 1,000 | **1,001** | 1.67 MB | 11.1 s |
| Holders sharing allocations | 1,000 | **251** | 494 KB | 2.0 s |
| Holders sharing allocations | 13,000 | **251** | 1.52 MB | 10.4 s |

The same thousand legs took 11.1 s or 2.0 s depending only on how many allocations carried them. The 13,000-leg run was the *smaller* transaction. Allocations were pinned deliberately so the cost of a leg could be separated from the cost of an allocation, and that separation is what makes the 6,400-holder figure a calculation rather than a guess. Within the fixed series the times rise monotonically from 2.0 s to 10.4 s, and the 13,000 row was measured last.

Method, raw rows and caveats: [`benchmark.md`](benchmark.md).

### So how many holders can it actually pay?

**About 6,400**, derived. The largest realistic-shape run actually settled is 1,000 holders at 1.67 MB in 11.1 s. The binding constraint is Canton's 10 MB transaction budget, not time: time was never close at any size we reached.

Do not read 13,000 as holders. It was 13,000 legs over 250 holders.

### Are these numbers trustworthy?

They are measured on one machine with five participants in one JVM and in-memory storage, which is stated everywhere they appear. Sizes are properties of the serialised transaction and should carry over; **times should not**. An earlier version of these numbers was wrong, and the correction is kept in the document rather than quietly replaced.

---

## Adoption

### What would it take to settle real cash, or a different asset?

**Nothing in the model.** `DistributionRun` carries an `instrument` field and no asset type, so a different asset is different data in that field, not different code.

One thing is asset-specific, and it is off-ledger. Exercising a Token Standard factory needs the registry's **choice context**, and where that comes from differs per asset:

| | `TestTokenV2`, built | Canton Coin, planned |
|---|---|---|
| Where the context lives | a `TokenRules` contract on the ledger | the registry's off-ledger API |
| How the client gets it | `queryDisclosure`, then `disclose` on submit | an HTTP call to the Amulet registry (Scan) |
| Funding the payer | create a holding in a script | a funded validator wallet |

**The restructuring is the work, not the field.** Our seat, prepare and settle flow runs inside Daml Script, and Daml Script cannot make HTTP calls, so the context has to be fetched by a client and passed in, or the flow has to move onto the JSON Ledger API entirely.

It also costs the quickstart its best property. `TestTokenV2` needs no super validator, no Amulet, no Scan and no identity provider, which is why the whole thing runs offline with no account anywhere. A Canton Coin run needs a validator on a live network. Full detail in [`canton-coin.md`](canton-coin.md).

### What about real wallets, rather than a console holding every credential?

The console is a demo harness and says so on the page: it holds every party's credential, and then shows the nodes still refusing to answer for one another. That is a stronger claim than hiding it.

In a deployment, three things change. Each party sits on its own node with its own credential, which the model already supports and the harness does not. Holders sign the standing agreement once through their own wallet or client rather than a script. And the paying agent's cash comes from a funded wallet with its signing key in an HSM rather than a configuration file.

None of that is research. It is the "one credential per party" and "key management" rows in [`production-readiness.md`](production-readiness.md).

### What would we have to do to adopt this?

The honest division, for a pilot running one real coupon alongside your existing process:

| You bring | We bring |
|---|---|
| A register: holders, positions, the instrument. However you hold it today | The import and reconciliation against the ledger |
| The event terms: rate, denomination, record and payment dates, rounding policy | The entitlement engine, including rounding that sums to the total exactly |
| The cash, and a funded wallet to pay from | The settlement: one atomic batch, privately |
| Your holders, for a one-time onboarding programme | The standing-agreement flow they sign once |
| A Canton participant, or somewhere to run one | The model, the console and the deployment |
| A decision on who may release a payout | Operator sign-in today; maker-checker is a build |

**The onboarding programme is the part people underestimate.** Collecting a standing agreement from hundreds of holders is operational work, mostly not software, and it is front-loaded. It is also what makes every coupon after it zero-touch.

Our estimate for that pilot is **one quarter of focused engineering**, assuming a counterparty who wants it. Replacing an existing process at scale is a different distance, and there the regulatory and operational path dominates rather than the engineering. Both are set out, with sizes we wrote to be argued with, in [`production-readiness.md`](production-readiness.md).

---

## Shared control

### Can one company release a payment on its own?

Not if the run names an **approver**. The approver is a decentralised party that no single company controls, and Token Standard V2 requires the authority of every party named among the executors. With an approver named, the paying agent's button stops paying and starts asking: it files a request, and the settlement executes only once the members have confirmed to their threshold.

### Who decides that a payment needs more than one authority?

**The issuer, on the announcement, and this moved in `indivisa` 0.5.0 because the first answer was wrong.** Until then the paying agent ticked it on its own screen, which protects nobody: the approvers exist to stop an agent releasing a payout unchecked, so letting the agent decide whether that applies lets the party being guarded against choose the guard.

The term now lives on `CorporateAction`, the issuer's own contract, as `requiresApprovers`. The cash is the issuer's and the paying agent is a conduit, so the term belongs to the issuer in the same way the rate and the dates do. `CorporateAction_Entitle` copies it onto the payment schedule, because entitling a coupon consumes the announcement and the schedule becomes the only surviving record of what the issuer asked for.

**It is enforced where the money moves, not where the run is made.** `Run_Settle` fetches the schedule and refuses when the term is set and the run names no approver. Guarding run *creation* instead would have been easy to bypass: a client that ignored the term could create the run anyway and nothing on the ledger would object. A run built without the approver it needed can exist. It cannot pay.

**It is a `Bool`, not a party.** An issuer stipulates that one party may not release the money alone; **which** second party satisfies that is the paying agent's own arrangement, and naming a specific decentralised party on a specific ledger would be the wrong kind of thing to write into a term of the event.

### Is the decentralised party real, or three nodes on one laptop?

Both, and we separate them. The local demo runs three approver nodes on one machine: the threshold is real and enforced by the ledger, the independence is not. On Canton DevNet the second approval came from **BitSafe, on their own node**, which is the version that counts.

Two approvers, not three independent operators. Detail and evidence in [`decentralization.md`](decentralization.md).

---

## What is real

### Is the cash real money?

No. The cash is `splice-test-token-v2`, the Token Standard's own reference asset. We chose it deliberately rather than for convenience: its holdings are signed by owner **and** administrator, which forces the same receiver-authorisation problem as Canton Coin instead of letting us skip the problem this product exists to solve. What a switch would take is set out in [`canton-coin.md`](canton-coin.md): the model names no asset, so it is one field and a registry adapter.

### What else is simulated?

The bond, the holders and their positions are generated. The ledger, the settlements, the refusals and the update ids are real. In the quickstart, five participants run in one container on your machine, which is five participants and not five companies.

### Can I check any of this myself?

Yes, and it is one command with nothing to install but Docker:

```bash
cd quickstart && docker compose --profile govern up -d
```

Press **Settle** and watch the ledger refuse it: twenty payments requested, zero executed, because one holder has given the paying agent no settlement instructions. Open that holder on the **Holder** desk and press **Provide settlement instructions** there, because only the holder can say where to pay them. Back on the agent's desk, press **Authorise the 1 remaining payment**, then settle again, and it goes through in one transaction.

Then open the **Privacy** tab, which asks each node as one holder alone and shows what it answers: their own line, and zeros for everybody else.

For the second half, go to the **Issuer** desk and declare the next coupon with the term that it cannot be released by the paying agent alone. The agent's settle button then files a request instead of paying, and the **Approver** desk holds the vote. `--profile govern` is what starts the three approver nodes; without it you get the first coupon only.

### How is the model tested?

**60 Daml Script scripts, no network needed**, in two packages:

```bash
cd daml/indivisa-test && dpm test
cd ../indivisa-governance-test && dpm test
```

`dpm test` reports **60 scripts** across the two test packages, 48 for the model and 12 for the governance layer, because it also runs the shared fixtures. They run against `TestTokenV2`, the Token Standard's own reference asset, the same way Splice's own token tests run. **26 of the 60 assert a refusal rather than a success**, because most of what this engine promises is something it will not do: pay four holders out of five, let a paying agent spend a holder's consent on another holder's account, pay from a register nobody attested, or release a governed run on one approval.

One of those sixty was not reaching what it appeared to test, and the fix is worth stating because it is a general trap. The governed settle test built its run with no entitlement schedule attached. `Run_Settle` only fetches the schedule when there is one, so the issuer's release term and the disclosure it needs were both unreachable from the suite, and a governed execute that could not see the schedule reached a real ledger before anything went red. The test now uses the run shape the console actually creates. **An `Optional` field makes a guard skippable, so a fixture that leaves one empty quietly opts out of everything behind it.**

**Every refusal test is the passing test with exactly one thing changed**, and the change is the property under test. That rule exists because we broke it once: a test in the contributed BitSafe module asserted a refusal, passed, and would have gone on passing with the check it was testing deleted, because the submission was failing for an unrelated reason. The fix is in `CLAUDE.md` as a rule and in the suite as a shape. It is checked by mutation, not by reading: undo the one changed field and the test has to go red.

Where a test asserts a refusal and the reason matters, it matches the error text rather than just the failure, so a guard that stops firing cannot hide behind a different one.

