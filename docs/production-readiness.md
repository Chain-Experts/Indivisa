# What stands between this and production

Indivisa settles a corporate action on Canton: hundreds of holders paid in one
transaction, atomically, with no holder seeing another's payment. That part is
built, measured and has run on a live network.

This document is about everything else. It exists because the interesting
question about a hackathon project is not what it does, it is **what would have
to be true before a paying agent could use it with real money** - and that
question deserves a straight answer rather than a roadmap slide.

The short version: **the part that could have failed has not failed.** Nobody
had published whether a private, atomic, multi-hundred-leg corporate action was
possible under Token Standard V2, and now there is a measured answer and a live
settlement. What remains is ordinary product engineering and a regulatory path.
Neither is research, and the second is longer than the first.

Sizes below are our estimates, written to be argued with.

---

## 1. What is finished

Stated first, so the gaps are read against something real.

| | |
|---|---|
| **The settlement** | One `SettlementFactory_SettleBatch`, every leg or none. Holders see only their own leg; the paying agent, as executor, sees all of them |
| **The consent model** | Holders authorise **once**, at onboarding, through a standing agreement. The Token Standard requires the receiver's authority on every leg; this is how a coupon then lands with no holder action |
| **Scale** | 13,000 legs settled in one transaction in 10.4 s. 14,000 were refused - not by the settlement, by the Ledger API's 10 MB gRPC message limit, at 13,869 legs. A realistic one-leg-per-holder run reaches that budget near **6,400 holders**. Caveat: one machine, five nodes in one JVM. See `benchmark.md` |
| **Privacy across nodes** | Demonstrated with five participants: a holder's own node answers with zeros where the executor's schedule has everything |
| **A live network** | The packages are vetted and a real batch has committed on DevNet. See `devnet-run.md` |
| **Shared control** | A settlement that one company cannot release alone: the run is proposed, approved by an independent operator on their own node, and only then executed. See `decentralization.md` |
| **The asset is not hardcoded** | The model never names a cash asset. See `canton-coin.md` |

About 620 lines of Daml in the model and 150 in the governance packages. It is
small because the Token Standard does the heavy lifting; that is the point.

---

## 2. The ledger and the model

**Smallest of the four gaps.** This is the part most people assume is hardest,
and it is not.

### Real cash instead of the reference asset

The demo settles `splice-test-token-v2`, the Token Standard's own reference
asset. It was chosen deliberately rather than for convenience: its `Token` is
signed by owner **and** admin, which forces the same receiver-authorisation
problem as Canton Coin instead of sidestepping it.

Because settlement goes through the standard's interfaces and the model never
names an asset, moving to Canton Coin or a regulated stablecoin is a
configuration change and a registry adapter, not a redesign. `canton-coin.md`
sets out exactly what changes.

**Size: small.** Days, not weeks. The honest caveat is that a production
registry's off-ledger API has to be integrated for choice context and disclosed
contracts, and that is real work against a real counterparty.

### One instrument administrator per batch

The standard settles a batch against one asset administrator. A coupon paid in
one currency is exactly that, so it does not bite today - but a payout
splitting across two cash issuers needs two batches, and the atomicity
guarantee does not span them.

**Size: small today, structural if the product grows.**

### Registers larger than about 6,400 holders

This is the one real technical limit, and it is worth being blunt about it.

Past roughly 6,400 holders a run exceeds the Ledger API's 10 MB message budget
and must be split into several batches. Splitting is easy. **Splitting breaks
the single promise the product makes:** across two batches, "everyone or
nobody" is no longer true, and a half-paid coupon is precisely the failure
Indivisa exists to prevent.

So this is not a coding task. It needs a product answer - a compensating
mechanism, a staged commit, or an explicit statement that above N holders the
guarantee is per-batch and the operator reconciles. We have not chosen one.

**Size: medium, and it is a design decision before it is an engineering one.**

---

## 3. The application a paying agent would operate

**This is the bulk of the remaining work.** The settlement engine is built;
almost nothing an operator touches is.

Today the register, the instrument and the event all arrive from a script, and
the console reads them. That is right for a demo and wrong for a product.

| Missing | Why it matters | Size |
|---|---|---|
| **Getting the register in** | Holders and positions are generated. Real life means ingesting from the registrar - a file, ISO 20022, or an API - and reconciling it against what is on the ledger | Medium |
| **Setting up the event** | Rate, denomination, record date, payment date, rounding policy: all script arguments, no screen. A paying agent configures these, and the rounding policy in particular is a commercial decision | Medium |
| **Firing it automatically** | A payment date should trigger the run without a person. The product today is a button. The scheduled agent was deliberately cut from scope | Small |
| **Roles, not just sign-in** | An operator now signs in, so "who asked for this settlement" has an answer. There are **no roles**: no maker-checker, where one person prepares a run and a different person releases it. For a payout, that is the first control an auditor asks about | Medium |
| **Handling the holder who is not ready** | If one holder has not signed the standing agreement, the batch refuses - correctly, for everyone. An operator needs to be told which holder, and to be able to proceed without them or onboard them | Medium |
| **Reconciliation and reporting** | What was paid, to whom, against what entitlement, in a form an auditor and a regulator accept | Medium |
| **Onboarding at scale** | Collecting the standing agreement from hundreds of holders is an operational programme, not a screen. It is also the thing that makes every later coupon zero-touch, so it is worth it - but it is front-loaded | Large, and mostly not software |

**Size overall: medium-to-large.** Our estimate is one to two quarters of
ordinary product engineering for a credible first version.

---

## 4. Running it

| Missing | Size |
|---|---|
| **Key management.** The paying agent's party signs payouts. On MainNet that key belongs in an HSM with a documented ceremony, not in a configuration file | Medium |
| **One credential per party.** The demo console deliberately holds every party's credential - it is a harness, it says so, and it then shows the nodes still refusing to answer for one another. In production each party sits on its own node with its own credential. The model already supports this; the harness does not | Small, but it changes the demo |
| **Availability, backup, disaster recovery, monitoring.** Standard validator operations. Chain-Experts already runs Canton nodes, so this is "not yet done for this application" rather than "unknown" | Medium |
| **Deployment.** The console runs from a developer's machine today. Production means a served application with the proxy that holds the ledger credential run as a service | Small |

---

## 5. Regulation and assurance

**The largest gap, and the one no amount of code closes.** If a bank does not
adopt Indivisa, this is why - not the ledger.

- **A paying agent is a regulated role.** Settling real money on behalf of an
  issuer needs permissions that a technology provider does not have. The
  realistic path is to sell this to an institution that already holds them,
  not to become one.
- **Who owns the authoritative register.** Indivisa reads a register; it does
  not become the golden source by being used. In a real deployment the
  registrar remains authoritative and Indivisa must reconcile against it,
  including when they disagree.
- **Sanctions and AML screening** before a payout leaves, with an auditable
  record of the check.
- **Privacy law against ledger immutability.** Canton keeps holder data from
  other participants, which is most of the problem - but a right-to-erasure
  request against a committed contract is a question that needs a lawyer's
  answer before it needs an engineer's.
- **No independent security audit** of the Daml model. For money, that is not
  optional, and it should be done by somebody who did not write it.
- **Testing beyond the proofs.** There is a proof suite and a benchmark. There
  is no adversarial testing, no fuzzing of the entitlement arithmetic, and no
  sustained soak against a real network.

**Size: large, and measured in regulatory timelines rather than sprints.**

---

## 6. Two destinations, and they are not the same distance

Collapsing "production" into one word hides the useful distinction.

### A pilot, with a willing counterparty, on a real network

A registrar or paying agent runs one real coupon with a small holder base,
alongside their existing process rather than replacing it.

Needs: the real cash instrument, a register import, an event-setup screen,
maker-checker, and key management. Everything in sections 2, 3 and 4, at the
smaller end.

**Our estimate: one quarter of focused engineering**, assuming a counterparty
who wants it. This is genuinely close.

### Production, replacing the existing process, with real money at scale

Needs all of the above, plus everything in section 5, plus an answer to the
batch-splitting question in section 2 if the register is large.

**Our estimate: engineering is the smaller half.** The regulatory and
operational path dominates, and it is not ours alone to walk.

---

## 7. What we are not claiming

- Not that this is production software. It is a working proof with a live
  settlement behind it.
- Not that the numbers are MainNet numbers. They are one machine, five nodes in
  one JVM, and a real network adds hops and validators.
- Not that holders are zero-touch. They are one-touch: they authorise once, at
  onboarding, and never again.
- Not that we solve corporate-action announcement data. Chainlink, with DTCC,
  Swift and Euroclear, is attacking that layer. Indivisa is the payment layer.
- Not that shared control makes a settlement safe by itself. It makes a
  single-company release impossible, which is a different and smaller claim.

---

## 8. Where the evidence is

| | |
|---|---|
| `benchmark.md` | The scale numbers, the method, and what they do not show |
| `devnet-run.md` | The live settlement: update id, what it proves and what it does not |
| `decentralization.md` | Shared control, the risk before and after, how to reproduce it |
| `canton-coin.md` | Exactly what settling real cash would change |
| `architecture.md` | Components, boundaries, and the questions still open |
| `modules.md` | Every file, and what was deliberately not built |
