# Three contributions to BitSafe's Decentralization Manager

Two pull requests on 4 October 2026 and one issue on 5 October, to
`github.com/DLC-link/decentralization-manager`. All three are finished work,
used and tested here first; nothing was written for the occasion.

**Both pull requests were reviewed on 5 October and revised the same day.**
Changes were requested on each and all of them are in. See "What the review
changed" under each PR.

Their conventions, from `docs/CONTRIBUTING.md`:

| Convention | Shape |
| --- | --- |
| Commit | `<type>(<scope>): <subject>`, past tense |
| Branch | `<type>/<scope>/<subject>` |
| Types | `feat`, `fix`, `docs`, `style`, `refact`, `perf`, `test`, `chore` |
| Staging | `git add <file>`, deliberately, not `git add .` |

**How to submit, from BitSafe, 30 September:** open
focused pull requests **against `main`**, one for the documentation and one
for the module. Whether we submit the documentation, the module or both is
our choice. They will not pre-approve the module or commit the repository to
Token Standard V2 ahead of review - the maintainers assess dependencies and
fit through the same process as any other contribution. **A proposed
contribution does not need to be merged before the hackathon submission**,
provided it includes the reproducible setup, the tests and adoption notes.

So the module PR goes in without asking first: the question we were holding
it for is the question the review answers. Name the dependency requirement in
the description rather than leaving it to be discovered.

Submit them as **two separate pull requests**. They touch nothing in common,
and the documentation one is useful to them whether or not they want the
module.

---

## Where the code lives now

All three were submitted on 4 and 5 October 2026. The module and its tests
are **packages in this repository**, not copies kept in this folder:

| In this repo | Submitted as |
| --- | --- |
| `daml/governance-settlement/` | PR [#517](https://github.com/DLC-link/decentralization-manager/pull/517), `daml/governance-settlement/` |
| `daml/governance-settlement-test/` | PR #517, `daml/governance-settlement-test/` |
| `contrib/bitsafe/INTEGRATING.md` | PR [#516](https://github.com/DLC-link/decentralization-manager/pull/516), `docs/INTEGRATING.md` |
| `contrib/bitsafe/member-governed-cancel-design.md` | Issue [#518](https://github.com/DLC-link/decentralization-manager/issues/518) |

**The two copies of the module are no longer identical**, and that is
deliberate. Theirs is `governance-settlement-v1` with tests in their own
harness; ours stays `governance-settlement-v0`. See "Why the version in this
repository is not the version in theirs" below.

An earlier draft kept a second copy of the module under `contrib/bitsafe/module/`.
It was removed once the packages existed, because a duplicate that drifts is
worse than no duplicate at all - and it had already drifted: its test still
imported Indivisa's fixtures after the submitted one had been cut loose.

---

## PR 1 - `feat(daml): added a governed Token Standard V2 batch settlement`

**Branch:** `feat/daml/batch-settlement`

A `GovernableAction` for a Token Standard V2 batch settlement. A proposer
files one; the members confirm to threshold; `executeImpl` exercises
`SettlementFactory_SettleBatch` with `actors = settlement.executors`.

**Why it belongs in their repo rather than ours.** It depends on their
`governance-action-v1` and the Splice V2 API only - nothing from Indivisa.
Anyone settling a V2 batch can adopt it as it stands. We wrote it separately
from `indivisa-governance-v0` precisely so it could be given away.

### The test was the hard part

The test originally used Indivisa's cash fixtures, which would have forced an
`indivisa-test` dependency on a module whose entire claim is that it has no
application dependencies. The fixtures it actually needed - a TestTokenV2
registry, minting, balances, the two allocation shapes - were ported into
`Governance/Settlement/TestUtils.daml` beside the tests, following the shape
of their own `governance-token-custody-test`.

Three scripts, IDE ledger, no network: below threshold nothing executes, the
proposer alone is refused, at threshold the batch settles. **The review
replaced them with eight** - see "What the review changed" below.

### What it costs them, stated in the PR rather than discovered

Their `daml/dars/` vendors Token Standard **V1 only**. The PR adds six
binaries, about 3.9 MB: `holding-v2`, `allocation-v2`,
`allocation-instruction-v2`, `transfer-instruction-v2`,
`splice-token-standard-utils` and `splice-test-token-v2`. They already have
`metadata-v1`.

Adding V2 to their dependency set is a decision about where their product
goes, not a code review. The PR says so in its second paragraph and says that
"no" is a perfectly good answer.

### Built in their tree, not just ours

On a clean checkout of their `main` with the branch applied, their
`governance-action-v1` and `governance-core` compile from source, then the
module, then the tests - all at their **SDK 3.4.11**, LF **2.2**, with
`-Wunused-binds` and `-Wunused-matches` on, no warnings. Verified 4 October.

### Two things left to them rather than assumed

- **The package name.** Ours is `governance-settlement-v0`; their convention
  is `governance-<area>-v1`. The name is the Smart Contract Upgrade identity
  rather than a label, so the PR offers the rename instead of making it.
  **Answered: they asked for `-v1`**, which is why leaving it to them was the
  right call.
- **Where `TestUtils.daml` belongs**, if they would rather it were shared.
  Still open; they accepted it beside the tests without comment.

### What the review changed, 5 October

`schronck` requested changes and gave six items plus six inline comments. All
six are in the revised branch. Three of the findings were worth more than
their fixes.

- **Our negative test passed on anything.** It called
  `SettlementFactory_SettleBatch` directly, so the proposal was never
  involved, and it only `debug`'d the error instead of asserting it. A missing
  disclosure would have passed it too. It was testing TestTokenV2, not this
  module. Its replacement exercises `GovernableAction_Execute` on the proposal
  as the proposer and expects the refusal, which is the one property the module
  adds. **A negative test that does not assert the reason is not a test.**
- **`ensure` checked only one direction.** It required the governance party and
  the proposer to be among the settlement's executors and said nothing about
  any others. `executeImpl` carries exactly those two authorities, so a
  settlement naming a third executor passed creation, passed the vote, and
  failed at execution. Their clause rejects it at creation. They reproduced it
  before reporting it.
- **Their one optional suggestion rested on a wrong fact, and we said so.**
  They proposed binding `factoryCid` to the admin "the legs carry". In V2 as
  released, `TransferLeg.instrumentId` is a `Text`; the admin sits on the
  allocation, not the leg. And the standard's own
  `fetchAndValidateAllocations` already checks every allocation's admin against
  the factory's. We built it, found both facts, reverted it, and put the
  residual gap in the module's README: the refusal lands at execution rather
  than at filing.

Also done: the CI step, SPDX headers, and the comments, `daml.yaml` notes and
README cut to the reasons the code cannot show. Eight tests, rewritten in
their `testlib` given/when/then harness, all passing at their SDK 3.4.11 with
no warnings.

### Why the version in this repository is not the version in theirs

`daml/governance-settlement/` here stays `governance-settlement-v0` with its
original tests, and that is deliberate.

- **The name is load-bearing here.** `governance-settlement-v0` is the package
  vetted on DevNet, the DAR `quickstart/canton.Dockerfile` copies and
  `quickstart/bootstrap.canton` uploads, and the name in
  `infra/bitsafe/distribute.ps1` and `verify-packages.ps1`. Renaming it would
  break the judges' one-command package in order to tidy a label.
- **The rewritten tests cannot build here.** They are written against
  `testlib-0.1.0.dar`, which exists only in BitSafe's repository.
- **The `ensure` fix is real but idle here.** A changed `ensure` is a new
  package lineage rather than a version bump, and the configuration it rejects
  is one Indivisa cannot create: `runExecutors run = payingAgent :: approver`
  is exactly two parties, and the product settles through
  `indivisa-governance-v0`'s `SettleRunProposal`, not through this module. It
  is worth adopting as a properly renamed `governance-settlement-v1` after the
  Grand Final, not before.

A contribution adopting the host repository's conventions is the contribution
working as intended. The divergence is the evidence of that, not drift.

---

## PR 2 - `docs(api): documented integrating with a Canton you already run`

**Branch:** `docs/api/integrating-existing-canton` - submitted as
[#516](https://github.com/DLC-link/decentralization-manager/pull/516).

[`INTEGRATING.md`](INTEGRATING.md): seven things that are not in their
documentation and each of which cost hours. One file, +198 lines, no
deletions.

**It started as nine.** Three were already covered by
`docs/CUSTOM_DAML_TEMPLATES.md`, a page we had not found: `proposal_cid` with
its placeholder action, `disclosed_contracts` with the wire shape, and
granting propose-only rights to a non-member. Those were dropped and the page
**credits that document in its first paragraph** and picks up where it leaves
off. Proposing a page that duplicates a third of an existing one is worse than
proposing nothing.

Re-checked against their `main` on 4 October, 20 commits newer than when the
page was written: `auth-services`, `max-token-lifetime`, `participant_admin`,
`http-ledger-api` and `INVALID_TOKEN` appear in none of their documentation,
including the `DECENTRALIZING_AN_EXISTING_PARTY.md` and `DEPLOYMENT_GUIDE.md`
added since. The plan had said to link the page from `USER_GUIDE.md`; no such
file exists on `main`, so the PR offers placement instead.

The seven that stand:

1. Canton must have `auth-services` on, or every vote fails with a message
   that reads like a governance fault rather than a config one
2. `auth-services` goes on `ledger-api` only - on `http-ledger-api` it stops
   Canton booting
3. Tokens need `exp`, and Canton caps the lifetime - `max-token-lifetime = Inf`
4. Use the built-in `participant_admin`; creating a user first is a loop
5. A peer needs every package the action touches, asset packages included;
   the error names the package but not the node, and arrives at settlement
6. **A member with no node of its own can lock the party out of its own
   rules** - it still counts towards the threshold, so the party cannot
   reach the threshold that would remove it. `PUT /party-config` is the only
   way back, because the UI will not edit Member Party ID
7. **The Approvals tab cannot execute an action that needs disclosed
   contracts.** Their docs cover `disclosed_contracts` on the API; nothing
   says the UI has no way to supply them, and the click fails with
   `CONTRACT_NOT_FOUND` naming a contract rather than a missing parameter

### What the review changed, 5 October

Six items, all addressed. The reviewer's objection was the same one four times
over and it was fair: **items 1 to 4 are only true of a Canton running in
`DECPM_INSECURE` mode**, and the page did not say so. They now sit under one
blockquote that scopes them.

The other three:

- **Item 2 asserted a failure we had not captured.** We reproduced it and the
  page now carries the actual `GENERIC_CONFIG_ERROR` rather than a description
  of it.
- **Item 3 was headed by the symptom**, not the setting. It is now headed
  `max-token-lifetime = Inf`.
- **Item 6's workaround was presented as a procedure.** It writes credentials
  through `PUT /party-config` and is marked as last-resort recovery.
- **Item 7 was too broad.** It is narrowed to custom proposals, which is where
  the Execute button sends no disclosed contracts.

Also: "Two worked examples" removed, and the voice made neutral throughout. A
page about someone else's product should read as notes, not as a verdict.

---

## PR 3 - issue #518, retiring a stranded proposal

Raised at BitSafe's invitation after they traced an action on our shared party
that could not be confirmed.

**An issue rather than a pull request, deliberately.** It asks five design
questions, and a pull request implicitly says "merge this" when the honest
position is "tell us which way and we will build it". Their
`CONTRIBUTING.md` points new proposals at the issue templates, so it follows
`feature_request.yml` section by section and carries the `enhancement` label.

**The gap.** A `GovernableAction` whose proposer the live `GovernanceRules`
no longer authorises can never reach threshold, and only that proposer may
remove it. Ours was clearable only because the proposer was still a party we
controlled. `GovernableAction_Cancel` exists for exactly this and `Rules.daml`
says it is reached *"typically via the standard vote flow as a
`GovernableAction` itself"* - but no action implements it, so that path has
no door.

**Searching first mattered**, and their guidelines ask for it. It turned up
[#92](https://github.com/DLC-link/decentralization-manager/issues/92), a
Quantstamp pre-audit finding - *"Proposers cannot cancel their own
proposals"* - which is why `GovernableAction_ProposerCancel` exists. Ours is
its successor, and says so.

**It also puts their smaller fix above our bigger one.** Removing Confirm from
cards the rules will reject needs no new Daml and would have saved us days.
If only one happens, it should be that one.

---

## Order and tone

The docs PR went first, deliberately: it is smaller, it is useful to them
whatever they decide about the module, and it establishes that we have used
the thing before proposing additions to it.

Neither PR mentions prizes or tiers, and neither asks for a decision by any
date. A proposed contribution does not need to be merged to be a
contribution, and a maintainer reading either one should not be able to tell
there was a deadline.
