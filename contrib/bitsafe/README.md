# Two contributions to BitSafe's Decentralization Manager

Both submitted on 4 October 2026 to `github.com/DLC-link/decentralization-manager`.
Both are finished work, used and tested here first; nothing was written for
the occasion.

Their conventions, from `docs/CONTRIBUTING.md`:

| Convention | Shape |
| --- | --- |
| Commit | `<type>(<scope>): <subject>`, past tense |
| Branch | `<type>/<scope>/<subject>` |
| Types | `feat`, `fix`, `docs`, `style`, `refact`, `perf`, `test`, `chore` |
| Staging | `git add <file>`, deliberately — not `git add .` |

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

Both contributions were submitted on 4 October 2026. The module and its tests
are **packages in this repository**, not copies kept in this folder:

| In this repo | Submitted to theirs as |
| --- | --- |
| `daml/governance-settlement/` | `daml/governance-settlement/` |
| `daml/governance-settlement-test/` | `daml/governance-settlement-test/` |
| `contrib/bitsafe/INTEGRATING.md` | `docs/INTEGRATING.md` |

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
proposer alone is refused, at threshold the batch settles.

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
- **Where `TestUtils.daml` belongs**, if they would rather it were shared.

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

---

---

## Order and tone

The docs PR went first, deliberately: it is smaller, it is useful to them
whatever they decide about the module, and it establishes that we have used
the thing before proposing additions to it.

Neither PR mentions prizes or tiers, and neither asks for a decision by any
date. A proposed contribution does not need to be merged to be a
contribution, and a maintainer reading either one should not be able to tell
there was a deadline.
