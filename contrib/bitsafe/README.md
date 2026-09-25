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

The namespace already matches their layout (`daml/<package>/daml/Governance/<Area>/`).

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

## PR 2 — `docs(api): documented integrating with an existing Canton`

**Branch:** `docs/api/integrating-existing-canton`

**What it is.** [`INTEGRATING.md`](INTEGRATING.md) — six things that are not in
their documentation and each of which cost hours. Suggested location:
`docs/INTEGRATING.md`, linked from `USER_GUIDE.md` after the Quick Start.

This is arguably the more valuable of the two. The module helps teams doing
what we did; this helps **every** team pointing DecMan at their own node.

The six:

1. Canton must have `auth-services` on, or every vote fails with a message
   that reads like a governance fault rather than a config one
2. `auth-services` goes on `ledger-api` only — on `http-ledger-api` it stops
   Canton booting
3. Tokens need `exp`, and Canton caps the lifetime — `max-token-lifetime = Inf`
4. Use the built-in `participant_admin`; creating a user first is a loop
5. A domain action is identified by `proposal_cid` with a **placeholder**
   `action`, and its confirmations come back under `domain_actions`
6. `execute` needs `disclosed_contracts` for anything `executeImpl` touches
   off-node

**Draft description:**

> While pointing Decentralization Manager at our own five-participant Canton we
> hit six things that are not in the docs, each of which took a while to work
> out and each of which has a one-line fix. This adds a page covering them.
>
> The one we would most like to have read is number 5: a domain action is
> identified by `proposal_cid`, with the `action` field carrying a placeholder
> that is ignored for `core_domain`. Sending a sensible-looking action type
> instead produces `unknown variant`, which reads as "unsupported" rather than
> "wrong shape".
>
> Number 1 is the one most likely to stop someone entirely: with no
> `auth-services` on the participant, onboarding and DAR distribution succeed
> and the first confirmation fails with `INVALID_TOKEN ... missing a user-id`.
> It looks like a governance problem and is not.
>
> Happy to move it, split it, or reword anything that does not match how you
> would put it.

---

## Order and tone

Send the docs PR first. It is smaller, it is useful to them regardless, and it
establishes that we have actually used the thing before we propose adding to
it.

Neither PR should mention prizes or tiers.
