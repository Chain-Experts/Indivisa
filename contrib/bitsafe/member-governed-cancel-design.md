# Member-governed cancellation of a stranded proposal — Design

**Date:** 2026-10-05
**Status:** Design — questions open, implementation offered
**Author:** Chain-Experts
**Raised as:** an issue on `DLC-link/decentralization-manager` · **Implementation target:** `governance-core` or a small package beside it

## In short

A `GovernableAction` whose proposer the live `GovernanceRules` no longer
authorises can never reach threshold, and cannot be removed by anyone except
that proposer. If the proposer is a party nobody controls any more — a member
who has left, a decommissioned validator, a counterparty who has moved on —
the card sits on every member's Approvals tab permanently.

`Governance.Action` already anticipates the fix: `GovernableAction_Cancel` is
controlled by the governance party, and `Rules.daml` says it is reached
*"typically via the standard vote flow as a `GovernableAction` itself."* What
is missing is that **no action implements it**, so that path has no door.

This page describes the problem from a real incident, sketches the missing
action, and asks the five design questions we think are yours rather than
ours.

## The incident

A domain action sat on a shared DevNet party for days and could not be
confirmed. Every confirmation was refused.

We diagnosed it as a stale card pointing at an archived contract. **We were
wrong on both counts.** The ACS commitments between the two participants
matched for the week and the contract was live on both sides. The cause was
authorisation: the proposal's proposer was a paying agent from an earlier
seat, and the live `GovernanceRules` authorises a different one, so
`GovernanceRules_ConfirmAction` refused every confirmation — correctly, and
for a reason that had nothing to do with staleness.

An error about *who is asking* reads, from the Approvals tab, exactly like an
error about *what is missing*.

It was cleared with `GovernableAction_ProposerCancel`, submitted as the
original proposer.

**That is the whole argument.** It worked only because the proposer was still
ours: the party was hosted on our participant and our ledger user still held
`CanActAs` on it. Had it not been, there would have been no way out.

## What exists today

| Choice | Controller | Purpose |
| --- | --- | --- |
| `GovernableAction_ProposerCancel` | the proposer | retract your own proposal, no vote |
| `GovernableAction_Cancel` | the governance party | *"when governance needs to clean up a stale proposal"* |

The second is the right primitive. The gap is that the only things holding
the governance party's authority are `GovernableAction_Execute`
implementations, and none of them cancels another action — so in practice the
second row is unreachable.

## The shape we would propose

```daml
template CancelActionProposal
  with
    governanceParty : Party
    proposer        : Party
    targetCid       : ContractId GovernableAction
    reason          : Text
  where
    signatory proposer
    observer governanceParty

    interface instance GovernableAction for CancelActionProposal where
      view = GovernableActionView with
        governanceParty
        proposer
        actionLabel = "CancelAction"
        description = reason
      executeImpl = exercise targetCid GovernableAction_Cancel
```

Proposed, confirmed to the same threshold, and executed through the same flow
as any other action. Nothing new for a member to learn or to trust.

## Five questions, which are yours rather than ours

**1. Who may propose a cancellation?** The natural answer is the same set as
any other action — members and additional proposers. But a proposal is often
stranded *because* proposer authorisation has drifted, which argues for
members only. We lean to members only: it is the narrower claim, and it
cannot itself become stranded for the same reason.

**2. What happens to confirmations already cast on the target?** Nothing
mechanically — the note on `ProposerCancel` already observes that outstanding
confirmations against an archived proposal are harmless, because
`ExecuteConfirmedAction` fetches the proposal and fails. Worth stating for
`Cancel` too, so the silence is not read as an oversight.

**3. Can a cancellation itself become stranded?** Yes, if proposed by a party
that later loses authorisation — the same trap one level up. Restricting
proposal to members makes it unlikely, not impossible. We would document that
rather than engineer around it.

**4. Contract id, or action id?** A contract id is precise but opaque on a
board and changes if a proposal is ever recreated. Whatever the Approvals tab
shows a human should be what the proposal carries, so a member confirming can
see they are cancelling the card in front of them.

**5. Is automatic expiry wanted too?** `actionConfirmationTimeout` already
expires confirmations, and an action whose proposer is unauthorised can never
reach threshold, so it could in principle be swept. We would not start there:
automatically removing someone else's proposal is harder to get right than a
vote, and the vote is behaviour members already understand.

## The smaller fix, which is worth more and is already agreed

Independent of all the above: **the Approvals tab offers Confirm on proposals
the rules contract will reject.** You have already said you will mark those
cards as "proposer not authorised" and remove the button.

That alone would have saved us the days we spent assuming the contract was
stale, and it needs no new Daml. **If only one of these happens, it should be
that one.**

## What we are offering

We will write the package and its tests to the shape above — in the same
style as the batch-settlement module in #517: built and tested inside this
repository, at your SDK, with any dependency cost stated up front.

The five questions come first, because the answers change what gets written.
That is why this is a design page and not a diff.

---

*Contributed by Chain-Experts, from
[Indivisa](https://github.com/Chain-Experts/Indivisa). The incident is real,
on a DevNet party shared with the BitSafe team.*
