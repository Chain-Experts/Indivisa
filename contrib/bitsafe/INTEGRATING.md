# Integrating with your own Canton

`hackathon/README.md` gets you running against the bundled LocalNet. This page
is for the next step: pointing Decentralization Manager at a Canton you already
run, and driving a governed action from a script rather than the UI.

Everything below was found by doing it. Each item cost hours because it is not
written down anywhere, and each has a one-line fix.

## 1. Canton must have authentication enabled — even locally

A node with no `auth-services` at all will fail every vote:

```text
INVALID_TOKEN(8): The submitted request is missing a user-id:
Cannot default user_id field because claims do not specify an user-id.
Is authentication turned on?
```

Onboarding and package distribution still work, because those go through the
Admin API. It is the first `/governance/confirm` that fails, which makes it
look like a governance problem rather than a configuration one.

A command needs a user id, and Canton takes it from the token's `sub` claim.
With no auth service there are no claims and nothing to default from. Add, on
the participant's **`ledger-api`**:

```hocon
ledger-api {
  auth-services = [{
    type = unsafe-jwt-hmac-256
    target-audience = "https://canton.network.global"
    secret = "unsafe"
  }]
}
```

Those are the values `DECPM_CANTON_HMAC_AUDIENCE` and
`DECPM_CANTON_HMAC_SECRET` default to, so DecMan lines up with no further
configuration.

## 2. `auth-services` belongs on `ledger-api`, not `http-ledger-api`

Putting it on the JSON API block too stops Canton booting. Worth saying
explicitly, because a config file usually lists the two blocks next to each
other and it is a natural mistake.

## 3. Tokens need `exp`, and Canton caps how far out it may be

Two different errors, one after the other:

```text
Could not verify JWT token: token has no expiration time
Could not verify JWT token: token lifetime (2099-01-01T00:00:00Z) too long
```

A demo token that never expires is convenient, and Canton refuses both that and
a distant expiry. The fix is on the same block:

```hocon
ledger-api { max-token-lifetime = Inf }
```

which is what the Splice LocalNet bundle sets
(`conf/canton/app.conf`). Then any `exp` is accepted.

## 4. Use `participant_admin`; do not create a ledger user first

With `target-audience` set, Canton reads audience-based tokens and takes the
user id from `sub` — so **the user must already exist**. Creating one from the
bootstrap console needs a token the console does not have, so it is a loop.

Canton creates exactly one user for itself, `participant_admin`, with
`ParticipantAdmin` rights. Name it in the token and the loop disappears:

```text
DECPM_CANTON_HMAC_SUBJECT=participant_admin
```

Any party the governance flow acts as still needs `CanActAs` granted to that
user, as usual.

## 5. A domain action is identified by `proposal_cid`, not by an action type

This is the one that is hardest to guess from the API. To confirm or execute a
`GovernableAction` of your own, `action` carries a **placeholder** — the
request schema requires the field and ignores it for `core_domain` — and the
real target goes in `proposal_cid`:

```http
POST /governance/confirm
{
  "party_id": "...",
  "rules_contract_id": "...",
  "action": { "type": "governance_set_threshold", "new_threshold": 0 },  // ignored
  "governance_type": "core_domain",
  "proposal_cid": "<contract id of your GovernableAction>"
}
```

Sending your own action type instead gives:

```text
Json deserialize error: unknown variant `execute_action`, expected one of
`governance_add_member`, `governance_remove_member`, ...
```

which reads as "that action is not supported" rather than "that is not how this
endpoint works".

Confirmations for it come back under `domain_actions`, matched on
`proposal_cid` — not under `actions`, which is where the core self-governance
confirmations are:

```text
GET /governance/confirmations?party_id=...
  .domain_actions[] | select(.proposal_cid == $cid) | .confirmations[].contract_id
```

## 6. `execute` needs the contracts your action touches, disclosed

The executing node runs your `executeImpl`. Anything it reaches that lives on
another participant has to be disclosed, or the transaction fails on a contract
the node has never seen.

For a Token Standard V2 batch settlement that is the registry's `TokenRules`
and the sender's locked holdings — fetched with `includeCreatedEventBlob: true`
and passed as:

```jsonc
"disclosed_contracts": [ { "contract_id": "...", "blob": "..." } ]
```

A note in the API reference saying "disclose whatever `executeImpl` touches
off-node" would have saved the whole afternoon this took.

## 7. `SelfAction_AddAdditionalProposer` is not in the UI

`Governance.Rules` has it, and the API accepts
`governance_add_additional_proposer`. The governance dialog offers only four
self-actions: add member, remove member, set threshold, set timeout.

So a party that must **propose but never confirm** — an application's own
service party, say — cannot be admitted by clicking. Either call
`/governance/confirm` directly, or work around it.

The workaround, if you take it, has a trap. Adding that party as a **member**
instead does let it propose, but it also lets it confirm, and it changes what
the threshold means. With members `{app, you, peer}` at threshold 2, the app
plus you can act without the peer — which may be exactly the property you
were trying to guarantee. Raise the threshold in the same action: the
add-member dialog takes a new threshold, so it costs one approval round
rather than two.

## 8. Peers need every package your action touches, not just yours

Distributing your own DARs to a peer is not enough. Naming a decentralised
party as an approver makes the peer's participant a stakeholder — and, if the
party is also an executor, it must validate everything the action does.

Ours settles a Token Standard V2 batch, so the peer needed the asset packages
too. Without them:

```text
UNRESOLVED_PACKAGE_NAME(11): Interpretation error: Update failed due to a
failed package name resolution: splice-test-token-v2
```

Package names resolve to a version vetted by **every** informee, so one node
missing one package fails the whole submission. The error names the package
but not the node, and it arrives at the settlement rather than at
distribution — long after the step that caused it.

Worth a line in the DAR-distribution docs: send the transitive set your
`executeImpl` reaches, not only the package your action is defined in.

## A worked example

`judge/govern.sh` in [Indivisa](https://github.com/Chain-Experts/Indivisa)
does all of the above against a five-participant Canton in Docker: peer mesh,
onboarding at threshold 2, member parties, governance rules, admitting an
additional proposer, then propose → confirm → execute. It is a port of
`hackathon/seed.sh` and is deliberately readable as a reference.

It also skips your DAR distribution step, because that Canton vets the packages
at bootstrap — worth knowing that the step is optional when you control the
node.
