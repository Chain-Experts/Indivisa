# Two contributions to BitSafe's Decentralization Manager

Prepared for `github.com/DLC-link/decentralization-manager`. Both are finished
work, already used and tested in this repo; nothing here is written for the
occasion.

Their conventions, from `docs/CONTRIBUTING.md`:

| Convention | Shape |
| --- | --- |
| Commit | `<type>(<scope>): <subject>`, past tense |
| Branch | `<type>/<scope>/<subject>` |
| Types | `feat`, `fix`, `docs`, `style`, `refact`, `perf`, `test`, `chore` |
| Staging | `git add <file>`, deliberately — not `git add .` |

**How to submit, from BitSafe of BitSafe, 30 September:** open
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

## PR 1 — `feat(daml): added a governed Token Standard V2 batch settlement`

**Branch:** `feat/daml/batch-settlement`

**What it is.** A `GovernableAction` for a Token Standard V2 batch settlement.
A proposer files one; the members confirm to threshold; `executeImpl`
exercises `SettlementFactory_SettleBatch` with `actors = settlement.executors`.

**Why it belongs in their repo rather than ours.** It has **no dependency on
Indivisa** — only their `governance-action-v1` and three Splice V2 API
packages. Anyone settling a V2 batch can adopt it as-is. We wrote it separately
from our own `indivisa-governance-v0` precisely so it could be given away.

**Files, and where they go:**

| From here | To their repo |
| --- | --- |
| `module/daml.yaml` | `daml/governance-settlement/daml.yaml` |
| `module/daml/Governance/Settlement/BatchSettlement.daml` | `daml/governance-settlement/daml/Governance/Settlement/BatchSettlement.daml` |
| `module/test/BatchSettlementTest.daml` | their test package, as `Governance/Settlement/Test/BatchSettlementTest.daml` |
| `module/README.md` | `daml/governance-settlement/README.md` |

The README is written for someone who has never seen Indivisa: who the
module is for, what was missing that made us write it, how to adopt it, and
what it deliberately does not do. It says nothing about our own use of it,
because a reader of their repository has no reason to care - and the last
section, "does not consume anything application-specific", is the honest
answer to that question anyway, phrased as guidance rather than apology.

The namespace already matches their layout (`daml/<package>/daml/Governance/<Area>/`).

**Ask before opening this one.** Checked against their repo on 30 September:

- Every package of theirs is `sdk-version: 3.4.11`; our copy said 3.5.10 and
  now says 3.4.11. Their SDK supports this module's LF target -
  `governance-action-v1` is itself 3.4.11 with `--target=2.2`.
- `daml/multi-package.yaml` needs a `governance-settlement` entry.
- **They vendor Token Standard V1 only.** `daml/dars/` has
  `splice-api-token-holding-v1` and `splice-api-token-transfer-instruction-v1`
  and no V2 package at all. This module data-depends on
  `splice-api-token-holding-v2` and `splice-api-token-allocation-v2`, so the
  PR would have to add two binaries to their repo.

That last point is why this is a question and not a pull request. Adding
Token Standard V2 to their dependencies is a decision about where their
product goes, not a code review, and it should be theirs to make before we
put it in a diff. BitSafe said "feel free to add as PR" before we knew it, so
ask again with the specifics.

**Two things to say in the PR description, because a reviewer will ask:**

- **LF 2.2**, because `governance-action-v1` is. The Splice V2 DARs are 2.1 and
  a 2.2 package data-depends on them without trouble.
- **The test is three scripts** — below threshold refused, proposer alone
  refused, at threshold settled — and runs on the IDE ledger with no network.

**Draft description:**

> Adds `governance-settlement-v0`: a `GovernableAction` that settles a Token
> Standard V2 batch once the members have confirmed to threshold.
>
> The module depends only on `governance-action-v1` and the Splice V2 API
> packages — nothing application-specific — so any team settling a V2 batch can
> govern it without writing their own proposal template. We built it while
> putting a corporate-actions settlement behind the engine, and deliberately
> kept it free of our own packages so it could be contributed.
>
> `executeImpl` exercises `SettlementFactory_SettleBatch` with `actors` equal to
> `settlement.executors`, which is what the standard requires.
>
> Tests cover the three cases that matter: below threshold refused, the proposer
> acting alone refused, and at threshold settled. They run on the IDE ledger.
>
> Built and tested against `governance-action-v1-0.1.0`. LF 2.2 to match it.

---

## PR 2 — `docs(api): documented integrating with a Canton you already run`

**Branch:** `docs/api/integrating-existing-canton`

**What it is.** [`INTEGRATING.md`](INTEGRATING.md) — seven things that are not
in their documentation and each of which cost hours. Suggested location:
`docs/INTEGRATING.md`, linked from `USER_GUIDE.md` after the Quick Start.

**It started as nine.** Checking against their repo on 30 September, three
were already covered by `docs/CUSTOM_DAML_TEMPLATES.md`, a page we had not
found: `proposal_cid` with its placeholder action, `disclosed_contracts`
with the wire shape, and granting propose-only rights to a non-member. Those
are now dropped and the page **credits that document in its first
paragraph** and picks up where it leaves off. Proposing a page that
duplicates a third of an existing one is worse than proposing nothing.

The seven that stand:

1. Canton must have `auth-services` on, or every vote fails with a message
   that reads like a governance fault rather than a config one
2. `auth-services` goes on `ledger-api` only — on `http-ledger-api` it stops
   Canton booting
3. Tokens need `exp`, and Canton caps the lifetime — `max-token-lifetime = Inf`
4. Use the built-in `participant_admin`; creating a user first is a loop
5. A peer needs every package the action touches, asset packages included;
   the error names the package but not the node, and arrives at settlement
6. **A member with no node of its own can lock the party out of its own
   rules** — it still counts towards the threshold, so the party cannot
   reach the threshold that would remove it. `PUT /party-config` is the only
   way back, because the UI will not edit Member Party ID
7. **The Approvals tab cannot execute an action that needs disclosed
   contracts.** Their docs cover `disclosed_contracts` on the API; nothing
   says the UI has no way to supply them, and the click fails with
   `CONTRACT_NOT_FOUND` naming a contract rather than a missing parameter

Items 1 to 4 are one story: the authentication chain between DecMan and a
Canton you already run. Items 5 to 7 are operational, and each surfaces long
after the step that caused it.

**Draft description:**

> `CUSTOM_DAML_TEMPLATES.md` covers writing a `GovernableAction` and driving
> it, and it covers it well — it answered three of the things we had written
> up before we found it. What we could not find anywhere was how to get
> Decentralization Manager talking to a Canton we already run, and two
> operational traps that surface much later. This adds a page for those.
>
> Items 1 to 4 are the authentication chain. With no `auth-services` on the
> participant, onboarding and DAR distribution both succeed and the first
> confirmation fails with `INVALID_TOKEN ... missing a user-id` — it looks
> like a governance problem and is not. The remaining three are each a
> one-line fix and each cost an evening.
>
> Item 6 is the one we would most like to have been warned about. Adding a
> governance member is a single dialog, and if that member has no
> Decentralization Manager of its own it can never confirm — while still
> counting towards the threshold. We did this by accident and the party
> could no longer reach its own threshold, including for the action that
> would have removed the member. `PUT /party-config` was the only way back.
> A warning line in the add-member dialog would prevent it entirely.
>
> Item 7 is a small one with an easy fix: the Approvals tab's Execute button
> submits with no disclosed contracts, so a custom action whose executeImpl
> reaches a choice context fails on the click with CONTRACT_NOT_FOUND. The
> id in the error is the contract that should have been disclosed, and
> nothing in the message says so. Disabling the button for such actions, or
> a line beside it pointing at the API, would save the guess. (Pasting them
> in would not help — our two blobs are 692 and 1,644 characters.)
>
> Found while pointing DecMan at our own five-participant Canton, then at a
> DevNet party shared with your team, through to a governed Token Standard
> V2 settlement at two of two.
>
> Happy to move it, split it, fold any of it into
> `CUSTOM_DAML_TEMPLATES.md`, or reword anything that does not match how you
> would put it.

---

## Order and tone

Send the docs PR first. It is smaller, it is useful to them regardless, and it
establishes that we have actually used the thing before we propose adding to
it.

Neither PR should mention prizes or tiers.
