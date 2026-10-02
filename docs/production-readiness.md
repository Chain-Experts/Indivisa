# From submission to production: the road after the hackathon

**Read this as forward-looking, because that is what it is.** The HackCanton
submission is complete: the model, the console, the judges one-command Docker
package, the benchmark, a live DevNet settlement and a governed settlement with
an independent second operator all exist and work today. Nothing in this
document is needed for any of that, and nothing here is outstanding work on the
demo.

What follows is the engineering and commercial road **beyond** the submission -
production hardening, and the limits we know about and would rather state
ourselves than have someone find.

We publish it for the same reason we publish the benchmark caveats. A team that
can describe precisely what its product does not yet do is a team that
understands what it built. The alternative - a roadmap slide with five
confident bullets - tells a reader nothing.

**The headline: the part that could have failed has not failed.** Nobody had
published whether a private, atomic, multi-hundred-leg corporate action was
possible under Token Standard V2. There is now a measured answer and a live
settlement. Everything below is ordinary product engineering and a regulatory
path - no open research, no unknowns that could invalidate the approach.

Sizes are our own estimates, written to be argued with.

---

## 1. What exists today

Stated first, because everything after it is measured against this.

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

**The smallest piece of work ahead**, and the part most people assume is the
hardest. It is not.

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

## 3. The surrounding product

**This is the bulk of the work ahead, and it is deliberate.** The project set
out to answer one question - whether this settlement is possible privately and
atomically on Canton - and built exactly what answers it. The operational
software that would wrap it is a product build, and a product build is what
comes after a proof, not before.

The boundary is a design position, not an omission: **the console settles; it
does not keep the register.** Holders, positions and the schedule come from
systems a paying agent already runs, which is why Indivisa works against
registers that exist today rather than requiring the industry to rebuild them.
In the demo a script stands in for those systems, and the film says so on a
card.

What a production build adds:

| What a product build adds | Why it matters | Size |
|---|---|---|
| **A register feed** | The demo generates holders and positions. A deployment ingests them from the registrar - a file, ISO 20022, or an API - and reconciles against the ledger | Medium |
| **An event-setup screen** | Rate, denomination, record date, payment date, rounding policy. The engine takes all of them; the demo passes them as arguments. The rounding policy in particular is a commercial decision an operator should make on a screen | Medium |
| **The scheduled agent** | A payment date should fire the run without a person. Scoped and costed from the start, then deliberately cut: a daemon is invisible in a two-minute film, and a button demonstrates the same settlement | Small |
| **Roles on top of sign-in** | An operator signs in, and the check sits in the proxy that holds the credentials, so "who asked for this settlement" has an answer. The next control is maker-checker: one person prepares a run, another releases it. For a payout that is the control an auditor asks about first | Medium |
| **Scoping a run** | If one holder has not signed the standing agreement the batch refuses, for everyone - which is correct, and is the product working. An operator then wants to settle the rest today and carry that holder into a second run. The model supports it; the workflow and the audit trail that records why are a product build | Medium |
| **Reconciliation and reporting** | What was paid, to whom, against what entitlement, in the formats an auditor and a regulator accept. The ledger holds the facts; the reports are a build | Medium |
| **The rest of the correction paths** | A request can be withdrawn until it executes, and an ungoverned run can be cancelled outright. **Cancelling a *governed* run should itself be a governed action** - the cash is committed, so only the executors may release it, and on a governed run that is the agent and the approver together. The ledger supports it; the console does not, so today the remaining routes are the settlement deadline and the registry admin. Beyond that: amending a schedule after approval, re-running a scoped subset, and reversing a settled payment by issuing its opposite - which is a new payment by definition, not an edit | Medium |
| **Onboarding at scale** | Collecting the standing agreement from hundreds of holders is an operational programme rather than a screen. It is front-loaded, and it is what makes every coupon after it zero-touch | Large, and mostly not software |

**Size overall: medium to large**, and none of it is novel. Our estimate is one
to two quarters of ordinary product engineering for a credible first version.

---

## 4. Running it in production

Standard operational work for anything that moves money. Listed because it is
real, not because any of it is unknown.

| What production adds | Size |
|---|---|
| **Key management.** The paying agent's party signs payouts. On MainNet that key belongs in an HSM with a documented ceremony, not in a configuration file | Medium |
| **One credential per party.** The demo console deliberately holds every party's credential - it is a harness, it says so, and it then shows the nodes still refusing to answer for one another. In production each party sits on its own node with its own credential. The model already supports this; the harness does not | Small, but it changes the demo |
| **Availability, backup, disaster recovery, monitoring.** Standard validator operations. Chain-Experts already runs Canton nodes, so this is "not yet done for this application" rather than "unknown" | Medium |
| **Deployment.** The console runs from a developer's machine today. Production means a served application with the proxy that holds the ledger credential run as a service | Small |

---

## 5. Regulation and assurance

**The longest road, and the one no amount of code shortens.** It is also the
one every entrant to this market walks, and it is a commercial path rather
than a technical risk: nothing here can invalidate the approach, it can only
take time.

- **A paying agent is a regulated role.** Settling real money for an issuer
  needs permissions a technology provider does not hold. That shapes the
  go-to-market rather than blocking it: the buyer is an institution that
  already has them, and Indivisa is software they run - we do not need to
  become a paying agent to sell to one.
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
- **An independent security audit** of the Daml model, by somebody who did not
  write it. Standard before anything moves real money, and something a buyer
  would commission as a matter of course.
- **Testing beyond the proofs.** A proof suite and a benchmark exist and pass.
  A production programme adds adversarial testing, fuzzing of the entitlement
  arithmetic, and a sustained soak against a real network.

**Size: large, and measured in regulatory timelines rather than sprints.** It
runs in parallel with the engineering rather than after it.

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

## 7. What we do not claim

Stated plainly, so nobody has to go looking.

- Not that this is production software. It is a working proof, with a live
  settlement and a measured benchmark behind it, and it is complete as that.
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
