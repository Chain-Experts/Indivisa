# Tasks

**1 October 2026. Submission 9 October. 8 days.**

## Where we stand

**Submitted on the platform, and approved by BitSafe on 5 October** - four
days before the deadline. Repository public and scrubbed, three contributions
open in their repo, the film cut, the deck in sync.

Nothing is outstanding. What remains is the Grand Final on 21 October, if the
project is one of the ten announced on the 19th: a five-minute pitch and two
minutes of questions.

**Done and verifiable by someone else:**

| | |
| --- | --- |
| The experiment | Five proofs, 17-22 Sep. Proof 5 measured to **13,000 legs in one transaction** (10.4 s, 1.52 MB), ceiling derived at 13,869 |
| The product | Model, demo driver, settlement console; `indivisa` 0.4.0 |
| Judges can run it | `cd quickstart && docker compose up` - five participants, 13 DARs, offline, no account anywhere. `--profile govern` adds the full vote: refused at one approval, settled at two |
| Real network | DevNet, 24 Sep. 5 holders, 8,421.88 USD, update id `1220652e...f466b` |
| **Governed, independently** | **DevNet, twice: 29 and 30 Sep, 2 of 2 - ours and BitSafe's, on their node.** The second is the one filmed, update id `1220eb43...c6ac`. Chain-Experts could not have produced either transaction alone |
| The video | **`Indivisa-S3.mp4`, 3 m 00 s**, 1920x1080, cut 5 October and re-cut with narration on 6 October. One film on DevNet throughout: sign-in, a coupon refused because one holder was not ready, each holder seeing only its own line, the fix, the settlement, then a second coupon that needed two companies to agree. Fourteen cards and a voice-over, no music. Every figure checked against the ledger. **Supersedes `Indivisa-HackCanton-S3.mp4`** (2 m 27 s, 30 Sep), kept only as history |
| The deck | 15 slides, uploaded to the submission platform as a PDF. Kept on disk and out of the repository: `docs/deck.html`, `docs/pitch.md` and the two exports are git-ignored |
| The cash-asset question | Asked in the channel and answered: no required asset, and our reason endorsed |

**Missing, in deadline order:**

1. ~~Gold application~~ - **applied 29 September, for both tiers.** BitSafe
   confirmed the mechanism: applying is a message to NODERS in the Telegram
   channel, not a form. Sent for Gold and for the contribution pool.
   **Not exclusive - confirmed by the organisers 30 September.** The
   challenge is now two separate entries on the platform and *"You can enter
   both"*. Participation approved the same day.
   **Platform checked 30 Sep: both challenges are selected on the project.**
   That mattered - teams on the old single BitSafe challenge were moved to
   Contribution Pool automatically, so the Telegram application for Gold
   would not have shown there on its own.
2. ~~The two BitSafe pull requests~~ - **three contributions, all open, 4-5 October.**

   | | What | Size |
   | --- | --- | --- |
   | [#516](https://github.com/DLC-link/decentralization-manager/pull/516) | `docs(api)`: `docs/INTEGRATING.md`, the seven things not in their documentation | 1 file, +198 / -0 |
   | [#517](https://github.com/DLC-link/decentralization-manager/pull/517) | `feat(daml)`: `governance-settlement-v1` and its self-contained tests | 13 files, +623 / -0, revised after review |
   | [#518](https://github.com/DLC-link/decentralization-manager/issues/518) | Design issue: retiring a proposal whose proposer can no longer act | raised at their invitation |

   **#518 is an issue, not a pull request, and that was a decision.** It asks
   five design questions; a pull request implicitly says "merge this", and the
   honest position is "tell us which way and we will build it". Their
   `CONTRIBUTING.md` points new proposals at the issue templates, so it was
   written to `feature_request.yml`'s sections and labelled `enhancement`.

   **Searching first paid for itself.** Their guidelines ask it, and it turned
   up [#92](https://github.com/DLC-link/decentralization-manager/issues/92) -
   a Quantstamp pre-audit finding, *"Proposers cannot cancel their own
   proposals"*, which is why `GovernableAction_ProposerCancel` exists.
   Opening ours without that reference would have read as rediscovering solved
   ground. It now reads as the successor: #92 gave a proposer a way to retract
   its own proposal; it did not cover a proposer that can no longer act.

   Both are **purely additive** - nothing of theirs is touched, which is the
   easiest shape to review and the easiest to decline without awkwardness.

   The documentation went first, deliberately: smaller, useful whatever they
   decide about the module, and it establishes that we used the thing before
   proposing additions to it.

   **The module's test had to be cut loose from Indivisa first.** It used our
   cash fixtures, and a module whose claim is that it has no application
   dependencies cannot be tested by a package that has them. The fixtures it
   needed went into `Governance/Settlement/TestUtils.daml` beside the tests,
   following the shape of their own `governance-token-custody-test`. The
   result is `daml/governance-settlement-test`, which builds and passes
   **inside BitSafe's own repository** - their `governance-action-v1` and
   `governance-core` compiled from source first, at their SDK 3.4.11, LF 2.2,
   no warnings. Verified 4 October, so the PR claims it rather than hoping.

   **#517 adds six Token Standard V2 DARs they do not vendor** (~3.9 MB), and
   says so in its second paragraph with "no" named as a perfectly good answer.
   That dependency is the real question in the PR and should not be something
   a reviewer discovers.

   Two decisions were left to them rather than assumed: the package name
   (`-v0` is ours, `-v1` is their convention, and the name is the Smart
   Contract Upgrade identity rather than a label) and whether `TestUtils.daml`
   belongs beside the tests or somewhere shared.

   **Both were reviewed on 5 October and both revised the same day.**
   `schronck` requested changes on each: six items on #516, six on #517 plus
   six inline comments. Leaving the name to them was the right call, since the
   first thing they asked for was `-v1`.

   Three of the #517 findings were worth more than the fix.

   - **Our negative test passed on anything.** It called
     `SettlementFactory_SettleBatch` directly, so the proposal was never
     involved, and it only `debug`'d the error rather than asserting it. A
     missing disclosure would have passed it too. It was testing TestTokenV2,
     not our module. Its replacement exercises `GovernableAction_Execute` on
     the proposal as the proposer and expects the refusal, which is the one
     property this module adds. **A negative test that does not assert the
     reason is not a test.**
   - **`ensure` checked the wrong direction.** It required the governance
     party and the proposer to be among the executors, and said nothing about
     any others. `executeImpl` holds exactly those two authorities, so a
     settlement with a third executor passed creation, passed the vote, and
     failed at execution. Their suggested clause rejects it at creation. They
     reproduced it before reporting it.
   - **Their one optional suggestion rested on a wrong fact, and we said so.**
     They proposed binding `factoryCid` to the admin "the legs carry". In V2
     as released, `TransferLeg.instrumentId` is a `Text`; the admin is on the
     allocation, not the leg. And the standard's own
     `fetchAndValidateAllocations` already checks every allocation's admin
     against the factory's. We built it, found both facts, reverted it, and
     put the residual gap in the README instead: the refusal happens at
     execution rather than at filing.

   **The rename stops at their repository.** The contributed package is
   `governance-settlement-v1`; ours stays `governance-settlement-v0`, because
   that is the name vetted on DevNet, the DAR the judges' image uploads
   (`quickstart/canton.Dockerfile`, `bootstrap.canton`) and the name in
   `infra/bitsafe/distribute.ps1` and `verify-packages.ps1`. The tests diverge
   too: theirs are written in `testlib`'s given/when/then harness, which exists
   only in their repository. Adopting either change here would have broken the
   judge package to tidy a name.

   The original note, kept because the plan was right and two details were
   not - the test package layout, and how many DARs it would take:
   Prepared in `contrib/bitsafe/` and not opened. BitSafe's instruction
   (30 Sep): focused PRs **against `main`**, one for the documentation and
   one for the module, and **a proposed contribution does not need to be
   merged before submission** provided it carries the reproducible setup,
   the tests and adoption notes. All three are already written. The module
   goes in without asking first: they will not pre-approve the Token
   Standard V2 dependency, because that is what the review is for.
3. **The governed run, driven from the page instead of a terminal** -
   **built 1 October** and settled from the page (run `1220db3477ad...`).
   See "The terminal gap" below.
4. **Operator sign-in** - built 1 October, **working on DevNet 2 October**.
   See "Operator sign-in" below.
5. ~~Re-shoot the governed video~~ - **done 5 October, and it became one
   film rather than two.**

   `Indivisa-S3.mp4`, **3 m 00 s** after the 6 October re-cut, replaces the
   30 September cut entirely.
   Everything in it is DevNet, one coupon size throughout, current UI.

   | Shows | Verified |
   | --- | --- |
   | An operator signing in | Keycloak, OIDC with PKCE |
   | A coupon refused because one holder was not ready | `SettlementRejected` on the ledger, 5 legs requested, **0 executed** |
   | Each holder's own line, and zeros for everyone else | read as that party alone |
   | The fix, then the settlement | update id `12208eca...`, 5 of 5, 8,421.88 |
   | A second coupon needing two companies to agree | 1 of 2, no button; 2 of 2, settled |
   | That settlement | update id `122046e2...`, 5 of 5, 8,421.88 |

   **Why one film and not two.** The governed cut (1 m 44 s) was finished
   first and was good, but it argued only one point. It showed nothing of
   atomicity or privacy - the two claims the project rests on, and the answer
   to the organisers' own test about a transparent chain. Submitting it alone
   would have meant a video that never demonstrated what Indivisa is for.

   **What that cost:** one more shoot, alone, about forty minutes - an
   ungoverned five-holder run on DevNet with one holder withheld. Deliberately
   ungoverned: with no approver the button is a real settlement attempt and
   the ledger's refusal is the atomicity guarantee being shown, rather than an
   operator filing a request that could never succeed.

   **Two things learned in the cutting room.** The privacy shot belongs
   **after** the settlement, not before - "each holder sees only its own line"
   means little until money has moved. And the old privacy card said *"not
   filtered: never delivered"*, which is true of the five-participant local
   run and **false on DevNet**, where every participant name points at one
   validator. A new thirteen-card set was built from scratch rather than
   reusing cards across films, precisely so a wrong one could not be grabbed.

6. ~~The repo goes public~~ - **public on 4 October**, with a ruleset on
   `main` requiring a pull request and blocking force pushes.

   Before publishing: partner names replaced by the organisation throughout,
   the three DevNet hostnames moved into git-ignored config, and the deploy
   workflow removed (it read cluster credentials on a self-hosted runner,
   which is not a thing to carry into a public repository - and it had never
   worked).

   **Then the part that is easy to get wrong.** Scrubbing the files does
   nothing for history, and force-pushing a scrubbed history does nothing for
   GitHub's pull-request refs: PR #1 kept the pre-scrub commits readable at
   their old SHAs even after `main` was rewritten. The fix was to push the
   scrubbed history to a new repository, which has no PR refs, then rename it
   into place - so the URL on deck slide 15 never changed. The old repository
   survives as `Indivisa-Old`, **private, and it must stay private**: PR #1
   there still serves the original commits.

   Verified from an anonymous clone afterwards: 63 commits, 146 files, no
   hostnames and no partner names in files or history, no forks taken during
   the window when either was briefly public.

## The terminal gap, and the plan to close it

**Decided 1 October.** The governed recording drives four steps from
PowerShell, and a judge reasonably asks why a product needs a terminal. The
answer today is honest but weak: because we have not built those steps into
the page. One day is allocated to building them, and the work is committed
separately so it can be abandoned without touching anything that already
works.

**What is a terminal today, and whose gap it is:**

| Step | Whose gap |
| --- | --- |
| `propose` - file the `SettleRunProposal` | **Ours.** The button attempts `Run_Settle` directly and the ledger refuses it |
| the forced execute below threshold | Nobody's - a deliberate demonstration |
| `execute` | **BitSafe's.** Their Approvals tab cannot supply disclosed contracts (our contribution, finding 7) |
| `evidence` | Nobody's - the page already shows the update id |

**What gets built:**

1. **Propose from the button.** When `DistributionRun.approver` is set,
   pressing the button creates a `SettleRunProposal` rather than exercising
   `Run_Settle`. The page already holds everything it needs: the run, the
   allocations, and `rulesCid` from the seat file.
2. **The vote, visible on the page.** Confirmations as they arrive, so the
   operator sees 0 of 2 become 2 of 2 without leaving the page.
3. **Execute from the page**, calling DecMan's `/governance/execute` with the
   disclosed contracts the page fetches itself.

**All three are built and all three worked on DevNet on 1 October.** The
page proposed, showed 0 of 2 become 2 of 2 as BitSafe confirmed, and
executed: **5 of 5 legs, 8,421.88 USD**, run `1220db3477ad...`. Nothing but
the reset (`fund`, `prepare`) is a terminal now, and that is seat
preparation rather than settlement - the registrar's import, which the deck
lists as absent.

Three bugs, all the same bug, and worth remembering: the page announced a
settlement that had not happened, `evidence` showed the previous day's
receipt, and a stale refusal appeared over a fresh run. Every one was
**matching on `runId` alone**, which is not unique because a run id settles
more than once. Receipts and rejections are now filtered on
`createdEvent.offset > run.createdEvent.offset`: the ledger's own ordering,
not ours.

**The constraint that shapes all three:** *tokens never reach the browser*.
The dev server and nginx already inject the ledger bearer token server-side
and serve only `party_participants`; a DecMan route follows the same
pattern. Putting a DecMan token in page JavaScript would break a rule we
have kept since 18 September.

**What this costs, and it is not nothing.** Closing the gap **deletes the
refusal shot**. If the button files a proposal when an approver is named,
the agent never tries and fails, so there is nothing for the ledger to
refuse. A finished product would say "this run needs approval" and never
offer the action. That is a better product and a weaker demonstration, and
the film has to decide which it wants. The threshold refusal survives either
way, because that one is a deliberate forced request.

**Rollback.** The current state is committed before any of this starts. If
the page work is not convincing by the end of 2 October, the new code is not
committed and the submission is the state that exists now: a complete film,
a governed DevNet settlement, and a documented gap.

## The judges path, re-verified 1 October

Checking whether operator sign-in affected the judges Docker package turned up
something unrelated and worse: **the settle button had been broken since
24 September**, when authentication was turned on for the governed demo. Every
run since then went through scripts, so nothing exercised the page.

| Fault | Symptom a judge would see |
| --- | --- |
| The page was not told the ledger user, and guessed `indivisa-ui`, which does not exist on that ledger | First press: *a security-sensitive error has been received* - which reads as a broken product, not as the atomicity demonstration |
| One `curl` in `seed.sh`s prepare branch was missing the auth header | `docker compose run --rm prepare` died with `curl: (22) ... 401` |

Both fixed in `quickstart/seed.sh`. Also `quickstart/nginx.conf` now serves
`index.html` with `Cache-Control: no-store`, so rebuilding the image actually
changes what a returning browser loads.

**Verified by running it as a judge would, 1 Oct:**

1. `docker compose up` - seated 20 holders, one deliberately withheld.
2. Pressed the button: **SETTLEMENT REJECTED - 20 payments requested, 0
   executed, NO PARTIAL SETTLEMENT**, with `missing authorizations` naming
   Sable Asset Management. That is the demonstration, and it is what a judge
   is supposed to see.
3. `docker compose run --rm prepare`.
4. Pressed again: **SETTLED - 20 of 20 legs - 83,321.88 USD**, update id
   `12209a2e71cab527...`, submitted to committed in **1,106 ms**, every holder
   card PAID.

**The lesson, and it is not a small one:** a change to authentication is a
change to every path, including the ones already working. The page path must
be re-run after anything touching auth - a script passing is not evidence that
the product does.

## Two fixes found while filming (5 October)

### The approvers are a release control, not a data check

Avraham's question, and it is the right one: *if a holder's details are
missing, why would we ask the approvers at all? They should be approving a
payment, not checking our data.*

He is right. The approvers decide **whether the payment goes out**. A request
filed with an allocation missing spends their attention on something that
would fail at execute - after they had agreed to it.

The page used to allow it. It showed the problem (`ALLOCATIONS 5 / 6` and
"Waiting for <holder>") but did not stop the ask. Now, on a **governed** run,
the button is disabled while allocations are incomplete, and says why:

> "This run is not ready to ask about: one holder's allocation is not on the
> ledger yet, so the settlement would fail after the approvers had agreed to
> it. Their job is to decide whether the payment goes out, not to check the
> data."

**Deliberately not applied to an ungoverned run.** There the button is a real
settlement attempt, the ledger refuses it, and that refusal is the atomicity
guarantee being demonstrated - not an operator mistake. It is also the shot
the film needs.

### Seating a new tag on DevNet failed on an expired token

`demo.ps1 seat -Tag atom1` died with a bare `UNAUTHENTICATED` from the gRPC
Ledger API.

**Cause.** `participants-with-parties.ps1` mints a token, then resolves the
party map, then writes the file. For an existing tag the seat file narrows the
lookup and it takes seconds. **For a brand-new tag there is no seat file**, so
it pages the whole synchronizer's party list - thousands of parties shared
with every other team - and that outlives the 300-second token. Measured: the
map was written at 12:26 carrying a token that had expired at 12:26:26, and
the runner was dead by 12:26:37.

**Fix.** Mint again immediately before writing the file, so the runner always
opens with a full lifetime. One extra request.

**Why it had never bitten before:** every run since 29 September used `gov1`
or `gov2`, which already had seat files. It only appears on the first seat of
a new tag - which is exactly when someone is least expecting it.

## The ways back out, and the dry run that corrected them (2 October)

The operator asked for a withdraw control, then found the gap it left: **what if the
agent spots the problem before it has asked anybody?** That stage is not idle -
`prepare` has already locked the agent cash - so it looked like the more
important of the two. Building it taught us something better.

### What the dry run on DevNet established

| Stage | Control | Verified |
| --- | --- | --- |
| Prepared, not asked | **Cancel this run** - `Allocation_Cancel` on the send allocation | Offered only on an **ungoverned** run |
| Asked, not executed | **Withdraw this request** - archives the `SettleRunProposal` | Works; proposal left the ledger and **DecMan dropped the action by itself** |
| Executed | none | the money has moved |

### The correction, and it is a better story than the plan

The first implementation used `Allocation_Withdraw`, reasoning that the agent
authorises its own send allocation. **The ledger refused it:**

    cannot-withdraw-committed-allocation

Our send allocation is **committed**, and the standard says what that means:
*"the authorizer cannot withdraw the allocation until the settlement deadline.
Use committed allocations for cases where the executors need a guarantee that
the allocation will be available until settlement."* A committed allocation
ends only by the executors settling it, **the executors cancelling it**, the
deadline passing, or the admin expiring it.

Read from the live contract, the executors are the paying agent **and**
`indivisa-approvers`. **So on a governed run the agent cannot release the cash
alone** - and that is right: the commitment is what makes an approval worth
anything, so undoing it cannot be unilateral either. The console offers the
control only where the agent is the sole executor, and says why not otherwise.

**Not built:** cancelling a governed run as a governed action, proposed and
approved like the settlement. The ledger supports it; the console does not.

### Three things the dry run caught that would have happened in front of BitSafe

1. The cancel design was wrong, as above.
2. **A refused cancellation announced "SETTLEMENT REJECTED"** - wrong strip,
   wrong word, and it is what made the failure confusing. It has its own line
   now.
3. **A second action on DecMan's board that could not be confirmed**
   (`003a5d6160b5ac07`). **Cleared 5 October** - see below. Even so, the
   habit stands: tell BitSafe the exact proposal id on the day, because the
   page matching the right one is not the same as a human clicking the right
   card.

### The stuck action, and two things we had wrong about it (5 October)

Reported to BitSafe. Richard traced it, and **both halves of our diagnosis
were wrong**:

| We said | Actually |
| --- | --- |
| The contract it points at is no longer active | It was live on **both** participants; ACS commitments matched for the week |
| There is no way for a proposer to retract its own action | `GovernableAction_ProposerCancel` exists in their interface, controlled by the proposer, documented for exactly this |

The real cause: its proposer is the **gov2** paying agent, and the live
`GovernanceRules` authorises only **gov1** plus the two members. So every
confirmation was refused for an authorisation reason, not a missing-contract
one. An error we read as "stale" was an error about who was asking.

**Cleared** by exercising `GovernableAction_ProposerCancel` as the gov2
party, which our ledger user still holds `CanActAs` on - update id
`1220d9edfd00...`.

### What this means for our withdraw control

**It does not do what BitSafe think it does.** Richard wrote "your withdraw
control runs the same choice"; it does not. Ours exercises `Archive` on our
own `SettleRunProposal` template. Same outcome - the contract is consumed -
but a different route.

`GovernableAction_ProposerCancel` is the better one: it is their published
interface rather than our template, it is what they expect, and it works for
any `GovernableAction` rather than only ours. **Not changed before the
submission**: the control is filmed-adjacent and the change needs testing on
DevNet, which is not a thing to do on recording day.

**And the documents overstate the gap.** `decentralization.md` presents the
withdraw as filling a hole in the Decentralization Manager. The hole was
narrower: the *choice* existed, and what was missing was a *button*. Correct
that when the control is changed.

**BitSafe's own follow-ups**, from the same reply:

- They will mark cards whose proposer the rules no longer authorise as
  "proposer not authorised" and remove the Confirm button.
- *"A member-governed cancel for proposals whose proposer can no longer act
  is a bigger change, and we would welcome your write-up for it."* - an
  invitation, in writing, for a third contribution. Worth taking after the
  9th.

### Also corrected in the documents

An earlier draft said a confirming approver would be left looking at an action
that could no longer be executed. **It simply disappears** - better than we
claimed, and now stated correctly.

And withdrawing a request **does not release the cash**: measured, six
allocations before and six after. The request and the funding are different
commitments.


## `docs/production-readiness.md` (2 October)

The road after the hackathon: production hardening, known limits, and the
difference between a pilot and real money.

**Framing is deliberate and must be kept if it is edited.** It is forward
work - *not* unfinished basics, *not* hidden blockers, *not* anything needed
to make the demo work. The document opens by saying the submission is complete
and that nothing in it is outstanding on the demo. Section 3 in particular
frames the surrounding product as the deliberate boundary it is - the console
settles, it does not keep the register - rather than as a list of missing
screens.

Its own summary: a pilot with a willing counterparty is about **one quarter of
focused engineering**; full production is mostly not an engineering question.

## Operator sign-in

**Decided 1 October, at the operator's insistence and against the earlier
position.** I had argued a login was out of scope for a hackathon demo. The
objection that settled it: *an application that settles money without a login
is not a thing you can show as secure, and a judge is entitled to read that
as carelessness.* He was right, and I had made a specific mistake - I had
conflated two identities that are not the same:

| | What it is | Where its credential lives |
| --- | --- | --- |
| **Paying agent** | a ledger party | the server. Never the browser |
| **Operator** | a person at the keyboard | the browser, after they sign in |

The paying agent's service-account token being safely server-side said
nothing about whether a person had to prove who they were, and nobody did.

**What was built** - OIDC authorization code with PKCE against the same
Keycloak realm that issues the ledger credential. No client secret: this is a
browser application and a secret in one is not a secret.

- `ui/src/auth.ts` - sign in, complete the redirect, refresh before the
  five-minute token lapses, resume a session on reload.
- `operatorGate()` in `ui/vite.config.ts` - **the check is in the proxy, not
  the page**. The proxy is what holds the credentials, so it is where "who is
  asking?" has to be answered; a check in the page is theatre, because anyone
  can skip a page. Registered from `configureServer` directly, which Vite runs
  **before** its own proxy - a check after the proxy would be a check on the
  way out.
- `/demo/*` stays open, and has to: the page cannot learn where to sign in
  until something tells it. Nothing there is a credential.
- The token is checked and then **deleted from the request**. Forwarding it
  would hand a live credential for our realm to the participant and, worse, to
  a Decentralization Manager somebody else operates.

**Measured 1 October, against the real Keycloak**, with the gate pointed at an
echo server so the forwarded headers could be read:

| Request | Result |
| --- | --- |
| no operator token | **401** `no operator token` |
| a junk token | **401** signature rejected against the realm's JWKS |
| **a live, correctly signed token from another client of the same realm** | **401** `token issued to another client` |
| a live token for the configured client | **200**, and the downstream saw `x-indivisa-operator` absent and `Authorization` present |

The third row is the one that matters: a valid token from the right realm is
still refused if it was not issued to this application.

**Working on DevNet, 2 October.** DevOps created the public client and the
flow runs end to end: signed in as `ui-dcpm-devnet`, token carrying
`azp: chain-experts-devnet-indivisa-ui`, zero refusals from the proxy after
sign-in, and a reload keeps the session and re-arms the refresh. That last one
was the only untested path and it matters: without it an operator stays signed
in for whatever is left of one 200-second token and then silently stops being
able to write.

Checked before touching the server, which saved a round trip: Keycloak serves
its login page for our exact parameters (so client id, redirect URI and PKCE
are right), and the token endpoint returns
`access-control-allow-origin: http://localhost:5173` on both the preflight and
the real POST. CORS was the single most likely thing to go wrong.

One cosmetic item left with DevOps: the realm display name reads **"Chian
Experts Canton Devnet"**. It is on the login page, which is on camera if the
optional sign-in shot is filmed.

**Previously blocked, now resolved:** The flow cannot be exercised
end to end until DevOps creates a **public** Keycloak client in realm
`canton-devnet`: authorization code with PKCE, no secret, redirect
`http://localhost:5173/*`. Until it exists, `infra/devnet/ui.json` carries no
`operator` block, so the console behaves exactly as it did yesterday and
nothing is at risk. The shape to paste in is in
`infra/devnet/ui.example.json`.

### The switch-on runbook (used 2 October; kept for any other deployment)

1. **Add the block to `infra/devnet/ui.json`** (git-ignored), beside `auth`:
   ```json
   "operator": {
     "issuer": "https://<keycloak host>/realms/canton-devnet",
     "clientId": "chain-experts-devnet-indivisa-ui"
   }
   ```
2. **Restart `npm run dev`.** The gate is only registered at startup.
3. Open `http://localhost:5173`. Expect the sign-in screen, not the console.
4. Sign in. Expect to land on the console with the operator name and a sign
   out control at the top right.

**The one failure to expect, and what it looks like.** If the client has no
**Web origin** of `http://localhost:5173`, the browser is blocked from
calling Keycloak token endpoint and the page shows a bare network error with
nothing useful in it; the browser console says CORS. That is a one-field fix
on the Keycloak client, not a problem with our code. Check it first before
investigating anything else.

**Two things already proven, so they are not suspects:** the signature check
works against the live realm keys, and a correctly signed token issued to a
different client of that realm is refused. Both were measured on 1 October
with the ledger service account token.

**Then, and only then, the deck.** Slide 13 gains one line (wording ready in
the session notes) and the PPTX and PDF are re-exported. Held until sign-in
actually works, so a failed client does not cost a wasted export round trip.

**Unauthenticated deployments are deliberately unchanged.** LocalNet and the
judges' Docker stack have no identity provider to sign in against and nothing
but the one machine that can reach them, so they carry no `operator` block
and the gate is not registered at all. A judge still runs
`docker compose up` and gets a console.

**Housekeeping, none of it blocking:** commit; rotate the Keycloak client
secret after DevNet; test the shipped Docker
build paths (`SCRIPT_SOURCE=download`, `UI_SOURCE=build`) on a machine that
does not intercept TLS.


**Proofs 1, 3 and 4 run in Daml Script; proofs 2 and 5 run on LocalNet.** DevNet
is used once, at the end, only to produce a real update id as evidence.
Developing against DevNet would cost uptime we do not control, traffic we do
not need to spend, and the multi-participant setup that proof 2 requires.

The order matters more than the list. Proofs 1–4 gated everything and passed
on 17 September; proof 5, the one that could have killed the idea, was measured
to 1,000 legs on LocalNet on 17–18 September (one transaction, seconds).
Phases 2 to 4 were built on 18 September. Phase 5 is what is left of the main
submission; the BitSafe challenge (its own section below) reached its sandbox
milestones on 22 September. On 23 September the judges' one-command Docker
package was built and verified (`quickstart/`, brought forward from Phase 5
because there was room), and the UI was rebuilt as a settlement console.
**What now remains is the DevNet run, the recording and the deck.**

Done on 16 September: dpm-sdk 3.5.10 confirmed, `sdk-version` corrected, two
missing imports fixed, `dpm build --all` green, `dpm test` gives proof 1 and 4
scaffolds passing and proof 2 failing on the intended assertion.

Done on 17 September: ten V2 DARs vendored from Splice 0.8.1; `Indivisa.Model.*` and `Indivisa.Utils`
rewritten against the real API (`PaymentProposal`, `PaymentAgreement`,
`DistributionRun.Run_Settle` exercising the real `SettlementFactory_SettleBatch`);
**proofs 1, 3 and 4 pass, and proof 2 passes in its single-participant form**,
all in Daml Script against `TestTokenV2`, under both `dpm test` and
`dpm script --ide-ledger --static-time`. One send allocation carrying all three
legs works. The recorded rejection for a missing receipt is below under proof 4.

---

## Phase 0: Wiring (day 1)

No LocalNet needed for this phase. Everything here is a download and a build.

- [x] `git init`, first commit. (17 Sep)
- [x] Fetch the prebuilt DARs from `canton-network/splice` tag `0.8.1`, path
      `daml/dars/`, into `daml/dars/` here. Ten files (the nine plus
      `splice-api-token-metadata-v1`), byte sizes verified against the tree.
      `gh api` cannot stream binaries; `curl` on the raw URL works.
- [x] Wire `data-dependencies`. Model: metadata-v1, holding-v2, allocation-v2,
      allocation-instruction-v2, token-standard-utils. Test: the same plus
      `splice-test-token-v2`. The trading-app DAR is vendored for reference
      only and not a dependency.
- [x] `dpm build --all` against the real DARs; every `VERIFY:` marker gone.
      **LF must be 2.1**: at 2.3 our DAR bundles a second `daml-stdlib` and
      damlc fails with "Cannot continue after interface file error".
- [x] No Splice test helpers needed. `TestTokenV2` is driven directly: create
      `TokenRules`, disclose it, put its cid in the choice context under
      `testTokenV2/tokenRules`, exercise the factories through the interfaces.
- [x] Fund the paying agent. Done as a fixture: registry and owner jointly
      create a `Token`, as Splice's own test env does. `TokenRules_OfferMint`
      not exercised; nothing proven depends on it.
- [ ] Read `OpenZeppelin/canton-specs` → `experiments/cip112-settlement` and
      `docs/reference-architectures/dex.md`. **Reference only**: DAR import is
      gated and nothing there is dependable.
- [ ] Ask NODERS (mostly overtaken - the challenge structure was answered on
      30 Sep, and the DevNet questions by simply running on it):
      1. S3 sponsor challenges and tracks; AI-disclosure policy.
      2. Whether regular DevNet now carries Token Standard V2, or the June
         "Token Standard V2 DevNet" is still the target.
      3. **Which protocol version DevNet runs today** (the June V2 DevNet was
         PV 35 with `alpha-version-support`; LocalNet runs PV 35).
      4. **Does the 0.8.x validator wallet UI display Token Standard V2
         holdings of a registry other than Amulet?** Decides whether a
         holder can log into the wallet and watch `TestTokenV2` cash land
         (display only; no wallet-side transfers needed).

### Phase 0b: LocalNet, five participants · **DONE 17 Sep, no Docker**

`TestTokenV2` has no Splice runtime dependency and no contract keys, so
LocalNet is a plain Canton synchronizer plus participants. It turned out not
to need Docker either: the Canton 3.5.17 JAR that dpm installed runs any
topology from a config file, in one JVM, in memory.

- [x] `infra/localnet/localnet.conf`: BFT sequencer, mediator, **five**
      participants (registry, agent, alice, bob, charlie), each holder on its
      own node. `bootstrap.canton` bootstraps the synchronizer, connects all
      five, uploads the ten DARs plus `indivisa`, pings across. `up.ps1`
      starts and stops it (~5 minutes to boot; DAR uploads dominate).
- [x] Protocol version 35 (the same as the June V2 DevNet), by default.
- [x] `participants.json` for Daml Script; proofs take a `Topology` input so
      the **same script** runs on the IDE ledger and on LocalNet.
- [x] Proofs 1, 2, 3, 3b, 4, 4b all pass on LocalNet (17 Sep, 40 to 55 s
      each including JVM start).
- [x] Party tokens / JSON API auth for the UI: done in Phase 4 (18 Sep), per
      network in `infra/<network>/ui.json`, injected by the dev-server proxy.
- [x] Transaction size per N: proof 5, `docs/benchmark.md` section 2.

Things the real network taught that the IDE ledger could not:
- Parties on different participants cannot co-sign one command. Funding now
  goes through the token's own mint (`TokenRules_OfferMint`, then the agent
  accepts), which is the honest path anyway.
- Participants learn of transactions independently; every cross-participant
  handoff waits for visibility (`awaitVisible`, `awaitInterface`,
  `awaitBalance` in `Test.Fixtures`) or the next command fails with
  `CONTRACT_NOT_FOUND`.
- A rejection arrives as `DAML_FAILURE(9, …): … UNHANDLED_EXCEPTION/…
  GeneralError … missing authorizations`, a different wrapper from the IDE
  ledger's. The regression test matches on the inner text.
- The sequencer's `maxRequestPayloadBytes` defaults to 10 MB. That is the
  hard-cap candidate for one batch.

Postgres storage and Docker remain an option if the demo needs a ledger that
survives restarts; `localnet.conf` is the only file that changes.

---

## Phase 1: The five proofs (days 2–8)

Written in `Indivisa.Model.*`, `Indivisa.Utils` and `Indivisa.Test.*`, which are the real
packages. Nothing here is throwaway.

Proofs 1, 3 and 4 are Daml Script against `TestTokenV2`, run with `dpm test`.
No network. Proofs 2 and 5 wait for Phase 0b.

No bond. No register. No entitlement engine. No UI. No 500 holders.

### Proof 1: does the batch settle at all? **PASSES** (`proof1_batchSettles`)
- [x] One payer, `TestTokenV2` cash, three recipients, in Daml Script.
- [x] **One** committed send allocation carrying all three `transferLegSides`.
      The token accepted it; no fallback to one-per-leg needed.
- [x] Three receipt allocations, one per holder, created by the paying agent
      under the agreements.
- [x] `Run_Settle` exercises `SettlementFactory_SettleBatch`, `actors =
      [payingAgent]`; four `allocationSettleResults` come back.
- [x] 500 / 1,000 / 1,500 land; the agent is at 7,000 unlocked, 0 locked;
      asserted over the V2 `Holding` interface. The run is consumed and a
      `DistributionReceipt` remains.

### Proof 3: do holders authorise once, at onboarding, and never again? **PASSES**

- [x] `PaymentProposal` (agent proposes) and `PaymentAgreement`
      (holder accepts, once) in `Indivisa.Model.Payment`.
      `CreateReceiptAllocation` is controller paying agent,
      guarded by `ensureIsReceiptAllocation` plus our own admin and instrument
      checks; modelled on `TradeSettlementAgreement_CreateReceiptAllocation`.
- [x] `proof3_holdersAuthoriseOnce`: after `onboard`, every submit is by the
      paying agent. Coupon 1 settles. Coupon 2, same agreements, settles.
      Balances double. Read the script: there is no holder-side command.
- [x] `proof4_allOrNone`: missing receipt allocation refused; error recorded
      (see proof 4).
- [x] `proof3_agreementCannotSend`: a "receipt" whose leg debits Alice is
      refused by `ensureIsReceiptAllocation` (`transferLeg[steal] is a receipt
      leg`). Alice's balance untouched.
- [x] Second coupon with no new holder action: in `proof3_holdersAuthoriseOnce`.

### Proof 2: does each recipient see only its own leg?
- [x] Single-participant form (`proof2_visibility_singleParticipant`): before
      settlement each holder sees exactly one `V2.Allocation`, its own, with
      only its own amount; the agent sees four. After settlement each holder's
      `V2.Holding` query returns only its own account. No holder sees a
      `DistributionRun` (holders are no longer observers of it).
- [x] **Re-run on LocalNet with each holder on its own participant: PASSES**
      (`proof2With LocalNet`, 17 Sep). Alice's participant holds one
      allocation (hers) and one account's holdings (hers); likewise Bob and
      Charlie; the agent's participant holds all four allocations. Asserted
      over the V2 `Allocation` and `Holding` interfaces, not our templates.
      This is projection, not party-scoped filtering: Bob's data never
      reaches Alice's node.

> Daml Script's `query` is party-scoped. On one participant that proves
> party-scoped queries, **not** projection. The five-participant run is what
> proves the privacy claim, and it now does.

### Proof 4: is it really all or none? **PASSES**
- [x] `proof4_allOrNone`: Charlie not onboarded, so his receipt allocation is
      missing. Settle refused. Alice, Bob, Charlie all still at 0; agent still
      7,000 unlocked and 3,000 locked; the run still active; no receipt.
      Onboard Charlie, create his receipt, retry: 500 / 1,000 / 1,500.
- [x] `proof4_extraLegRefused`: a four-leg run against three-leg allocations
      is refused the same way.
- [x] Error shape recorded (Splice 0.8.1 utils, Daml 3.5.10). Kept as a
      regression test; the message names the missing party, leg, side, amount
      and instrument:

      ```
      FailureStatus
        errorId  = "UNHANDLED_EXCEPTION/DA.Exception.GeneralError:GeneralError"
        category = InvalidGivenCurrentSystemStateOther
        message  = "'missing authorizations' is not equal to 'empty set'.
          missing authorizations: Set [(Account {owner = Some 'Charlie', provider = None, id = ""},
            TransferLegSide {transferLegId = "leg-3", side = ReceiverSide,
              otherside = Account {owner = Some 'PayingAgent', ...}, amount = 1500.0,
              instrumentId = "USD", meta = ...})]
          empty set: Set []"
      ```
- [ ] Still to add: an expired or insufficient **send** allocation as the bad
      leg, once settlement deadlines are in play.

### Proof 5: where is the ceiling? **FOUND, 22 Sep**: 13,000 legs settle; the command that authorises them refuses at 13,869

Script form (`Indivisa.Test.Scale`, 17 Sep), results in `docs/benchmark.md`:
- [x] N = 3, 10, 50 under `dpm test -p scale`; 250, 500, 1000, 2000 through
      `dpm script ... Scale:scale --input-file n.json --ide-ledger --static-time`.
      **All settle.** 2,000 legs, 2,001 allocations, one `SettleBatch`.
- [x] The settle is **linear**: about 4 ms per leg in the interpreter, flat
      from 250 to 2000 (`scale n` minus `scaleAllocateOnly n`). Nothing
      quadratic in the standard's utils at these sizes.
- [x] One send allocation carrying all N legs works at every N tried, so the
      batch is N+1 allocations, not 2N.
- [x] Client limit found and recorded: the script runner overflows its JVM
      stack at N = 2000 (`forA` over 2,000 submissions); `-Xss64m` lifts it.
      Client, not ledger. Chunk the loop or keep the flag on LocalNet.

Participant form, LocalNet, 17–18 Sep (`docs/benchmark.md` section 2):
- [x] Same script against LocalNet, N = 3, 10, 50, 100, 250, 500, **1000**.
      Every size settled; 1,001 allocations in one transaction.
- [x] Per N: request size (1.67 KB per allocation, 1.67 MB at 1000).
      Envelopes stay at 6 or 7: per node, not per leg.
- [x] **Corrected 18 Sep.** The in-script timings (15–28 s at 250, 104 s at
      500, 333 s at 1000) were the Daml Script runner digesting the result,
      not the ledger: the sequencer log shows the 1,000-leg batch finalised
      4.7 s after interpretation and the script silent for the next 5 min
      24 s. Re-timed from the JSON Ledger API (`infra/settle.ps1`,
      `ui/scripts/settle.ts`, the button's call): **1.6 s at 250, 4.0 s at
      500, 11.1 s at 1,000.** Linear, about 4.5 ms per leg on the ledger.
      No latency wall; no ceiling reached below the size cap.
- [x] The "silent phase" attributed: it was the client. No DEBUG run needed.
- [ ] Traffic cost estimate (needs DevNet's fee parameters).
- [ ] Hit the size cap on purpose to record the rejection message.
- [x] One send allocation carrying N legs, versus several: answered by the
      ceiling (22 Sep). One is simpler and works to 13,869 legs; past that it
      must be several, because the command, not the ledger, is the limit.
- [x] Pre-settlement cost counted (`docs/benchmark.md`, "Onboarding cost"):
      parties ~5 s each, acceptances ~1 s each, receipt allocations batched
      fifty per command; the day for 500 existing holders is ~5 minutes, of
      which 4 s is the settle.
- [x] Whether the **cash registry** is the bottleneck: not at these sizes.
      The registry confirms every leg and the whole confirmation round is
      2.2 s at 500 and 4.7 s at 1,000; nothing stands out per node in the log.
- [x] Hard cap or latency wall: **neither**, and now with the wall found
      (22 Sep, `docs/benchmark.md` section 3). Pushed to refusal: 13,000 legs
      settled in 10.4 s (1.52 MB); 14,000 refused with `RESOURCE_EXHAUSTED:
      gRPC message exceeds maximum size 10485760: 10584915` on the send
      allocation, not the settle. 756 bytes per leg in that command, so the
      limit is 13,869 legs; the fix if ever needed is several send
      allocations. The settle costs 85 bytes per leg and 1,554 per
      allocation, so a realistic one-payment-per-holder run reaches 10 MB
      near 6,400 holders (derived; model reproduces the measured 1,000-holder
      run to 0.6%). Time never bound: 0.69 ms per leg.
- [x] Section 2 of `docs/benchmark.md` filled in (18 Sep).

> LocalNet is the right place for this: push to failure without spending real
> traffic, and control the configuration while you do.
>
> We could find no published figure for how many legs fit in a CIP-112 batch
> settlement. Post the benchmark to the Canton forum whatever happens to the
> hackathon.

**Gate: do not start Phase 2 until proofs 1–4 pass.** Passed 17 September.

---

## Phase 2: The model (days 8–13)

- [x] `Indivisa.Types`: `PaymentLeg`, `Isin`, `EventKind` (Coupon / Dividend /
      Redemption), `RoundingPolicy` (LargestRemainder, RoundHalfUpResidualToIssuer). (18 Sep)
- [x] `Indivisa.Model.Register`: `Instrument`, `Position` (registrar signs,
      holder observes: each holder sees only its own), `RegisterSnapshot`.
      `Instrument_Snapshot` verifies every position contract on-ledger
      (right isin, right registrar), aggregates per holder, sorts. The
      registrar can omit a position; it cannot invent one.
- [x] `Indivisa.Model.Event`: `CorporateAction` (issuer signs, agent
      observes; `amountPerUnit`, record and payment dates).
      `CorporateAction_Entitle` attaches the snapshot and derives the
      schedule **on-ledger**, so the schedule is verifiably announcement x
      snapshot. `CorporateAction_Cancel` for the issuer.
- [x] `Indivisa.Model.Entitlement`: `entitlements`: quantity x amountPerUnit,
      **largest-remainder** rounding by default (floor to the cent, hand the
      residual cents to the largest discarded fractions), sums to the
      announced total exactly; half-up-with-issuer-residual as the
      alternative; zero entitlements dropped. `EntitlementSchedule` records
      policy, exact and paid amounts per holder, and ensures the total.
- [x] `Indivisa.Model.Distribution`: `runFromSchedule`: one leg per entry,
      currency from the schedule, `schedule` link on the run and the receipt.
      Proofs still create runs by hand (`schedule = None`).
- [x] Scripts: `Test.Register` (3), `Test.Entitlement` (5), `Test.Coupon`
      (the whole chain, IDE and LocalNet). Holder-base-at-N is the scale
      harness; the coupon path at N is Phase 3's `Test.Demo`.
- [x] **Model package is now 0.2.0.** Canton refuses to vet two packages with
      the same name and version; `dpm upgrade-check --both old.dar new.dar`
      passes, after moving the new `schedule` fields to the end of their
      records (SCU appends). Uploaded to LocalNet over the JSON API without a
      restart. Since then: 0.3.0 (`SettlementRejected`, 18 Sep) and 0.4.0
      (`DistributionRun.approver`, 22 Sep, for the BitSafe challenge; inert
      when `None`). Each passed `upgrade-check`; the current version is in
      `daml/indivisa/daml.yaml`.

---

## Phase 3: Driver and data (days 13–15) · **built 18 Sep**

- [x] `Test.Demo.demo_seat`: parties, cash, the instrument ("Northwind Rail
      4.375% 2031"), positions, **N payment agreements** (the onboarding step,
      shown once), the announcement (21.875 per unit so the rounding is
      visible), the record-date snapshot and the on-ledger schedule. Emits a
      `DemoSeat` JSON that the attempts and the UI read.
- [x] Realistic holder names (40 first names x 40 surnames, 30 institutions,
      every fourth holder an institution) and heavy-tailed position sizes,
      deterministic in the holder index. **No Alice, Bob and Charlie.**
      Synthetic, and labelled as such.
- [x] The deliberate-failure path, armed on demand: `demo_attempt` with
      `withhold = 1` leaves the last holder without a receipt allocation; the
      batch is refused, nothing moves, and the agent writes a
      `SettlementRejected` record (model 0.3.0) so the pane has something to
      show. `withhold = 0` then creates only the missing allocation and
      settles. The attempt is idempotent: it finds the run and the
      allocations that already exist.
- [x] `demo_smoke` (12 holders, rejected then settled) under `dpm test`.
- [x] `infra/demo.ps1 seat | prepare | attempt` drives it from a shell; the
      participant map is regenerated before each command.
- [x] LocalNet carries the full demo: 50-holder seat (427 s, party creation),
      attempt with one holder withheld **rejected** (reason names the holder,
      `SettlementRejected` written), attempt without **settled 50/50**,
      $252,700.00, 1.9 s (18 Sep).
- [x] The same at the recording size, 250 (18 Sep): seat 1,240 s (party
      creation), prepared with one withheld, pressed in the browser:
      **rejected**, prepared again, pressed: **settled 250/250**,
      $1,197,240.63, 1.6 s submit to commit over the JSON Ledger API.
      Found on the way: the unpaged `/v2/state/active-contracts` refuses
      more than 200 elements; the UI now pages. And the name generator
      repeated names (seven Arjun Tanakas); fixed, with a uniqueness test.

---

## Phase 4: UI (days 15–17) · **built 18 Sep, rebuilt as a console 23 Sep**

Lists and numbers, and the interrogation of them. No forms, no auth flows,
no application backend.

- [x] Paying agent: instrument, holders, total due, allocations ready, **one
      button** that submits `Run_Settle` over the JSON Ledger API with the
      factory disclosed, then the update id (recovered by offset after a
      reload) and submit-to-commit time. On refusal: "SETTLEMENT REJECTED ·
      N requested · 0 executed · NO PARTIAL SETTLEMENT", the reason, and a
      `SettlementRejected` record written on-ledger.
- [x] ~~`Holder.tsx`, one component rendered three times~~, replaced
      23 Sep (below). The per-holder view survives as the drawer.
- [x] JSON Ledger API v2 only, through the dev server's proxy (no CORS on
      the API; nginx in production). No Java tier.
- [x] Verified live in Chrome on LocalNet (18 Sep): 8-holder seat, prepared
      with one withheld -> pressed -> rejected naming the holder; prepared
      again -> pressed -> settled 8/8, $14,371.88, holders paid.
- [x] Tokens for DevNet (18 Sep): participant URLs and bearer tokens come from
      `infra/<network>/ui.json`; the dev server injects the `Authorization`
      header in its proxy and strips the served party map to
      `party_participants`, so no token reaches the browser. `client.ts`
      itself is unchanged. `INDIVISA_NETWORK` picks the network.
- [x] **Rebuilt as a settlement console (23 Sep)**, because three holder
      panes read as a sample of three people rather than as three nodes,
      and a page with one button does not look like something anyone
      operates. Now: a dark header carrying the mark; a row of figures
      (instrument, holders, per unit, total due, an allocations meter, the
      run's state); the button; and four tabs: **Holders** (a card for
      every holder, searchable, filterable by leg state, sortable),
      **Schedule** (sortable, each leg waiting / ready / paid),
      **Privacy** (the per-party check once per participant), **Activity**
      (the settlement and every refusal, read back as contracts).
- [x] A card per holder must not mean a request per holder. `Ledger.reading`
      names several parties in one `filtersByParty`, so the grid costs one
      request set per **node**: twenty cards and two hundred and fifty cost
      the same twelve. The per-party read that proves the privacy claim is
      deliberately kept separate (`useNodeProbe`), run on demand from a card
      and continuously in the Privacy tab.
- [x] Say what the console is. It holds every party's credential, the way a
      demo harness does; the page says so, and then shows that the nodes
      still answer for one party at a time. That is a stronger claim than
      hiding it.
- [x] Arithmetic that reconciles on screen (23 Sep). The per-unit rate is
      21.875, finer than a cent; formatting it as money made 3,809 units look
      like 83,340.92 against a total of 83,321.88. Rates now keep their
      decimals, PER UNIT shows `x N units = <exact>`, TOTAL DUE shows
      `to the cent · LargestRemainder`, and the schedule marks the rows the
      policy moved, with the counts computed from the run.
- [x] Verified live against the judge stack (23 Sep): 20 holders, refused
      naming the withheld holder, `prepare`, settled 20/20 in 698 ms, every
      card green, every per-party count still zero.

> Budgeted at one to two days because it is AI-assisted and the surface is
> small. If Phase 1 or 2 slips, this phase absorbs it, but do not cut it to
> nothing. Season 2's finalists all showed a polished one-minute recording, and
> the contrast between the executor's schedule and a single holder's node is
> the most persuasive thing we can put on screen.

---

## Submission rules, from the organisers (asked and answered 24 Sep)

- **One project, one track**, and the same project enters sponsor challenges
  on top. The track is picked at submission. We do not split the idea or
  submit twice, which is what the single video and single repo already
  assume.
- **Judging is asynchronous.** No live slot, no call. Judges review three
  things on the platform: the **repo**, a **working demo** (live, or a
  recorded video of at most **five minutes**), and **pitch materials**
  (slides *or* a document).
  - Our working demo is unusually strong here: `quickstart/` is a live demo a
    judge can run themselves, and `docs/devnet-run.md` is a real update id
    on DevNet. Both beat a video for credibility; the video is the way in.
  - Pitch materials may be a **document**, not necessarily slides. Worth
    considering given how much written material already exists.
- **The BitSafe challenge has two tiers, and they are exclusive.** A team
  that applies for **Gold** does **not** compete in the contribution pool.
  **That turned out to be wrong, and the organisers said so on 30 September:**
  the challenge is now two separate platform entries and *"You can enter
  both"*. Both are selected on our project. The fork this section describes
  never had to be taken - we qualified for the pool with the sandbox work and
  for Gold with the DevNet settlement, and entered both.
  Worth keeping as a record of how long a published rule can stay wrong: the
  page said Gold applicants were ineligible in three places, from before
  21 September until the restructure nine days later.
- **Grand Final is 21 October** for ten finalists, announced 19 October:
  a 5-minute pitch plus 2 minutes of questions, live. Not part of the
  submission, but it is what the deck should be able to carry.
- The Grofty bounty needs Grofty Wallet in the core flow. Not us.

---

## Phase 5: DevNet, recording and pitch (days 17–20)

Prepared on LocalNet, 18 Sep, so the DevNet step is configuration only:

- [x] Scripts and UI take a network: `infra/<network>/participants.json`
      (runner: host, port, `access_token`, `user_id`) and `ui.json` (JSON
      API URL, token). `demo.ps1 -Network devnet`, `INDIVISA_NETWORK=devnet`.
      Templates in `infra/devnet/*.example.json`; the real files are
      git-ignored.
- [x] The five participant names are the contract between scripts and
      config; on DevNet they may all point at one validator. No Daml change.
- [x] Regression on LocalNet after the Phase 3/4 refactors:
      `infra/localnet/proofs.ps1` runs the six proofs and the coupon chain.
      All seven pass (18 Sep, 28 to 56 s each, while a 250-holder seat was
      running on the same nodes).
- [x] Handover checklist in `infra/README.md`: eight steps, what to send
      back (seat file, both attempt files, the update id).
- [x] `docs/demo-script.md`: shot list, captions, what each caption may claim.
- [x] **One DevNet run, done 24 Sep.** Five holders paid in one transaction
      on Chain-Experts' DevNet validator, update id
      `1220652e2e4d32822c39d2ad72088e163eed04718ad1108998001b01aa3483ff466b`,
      8,421.88 USD, and the deliberate failure refused first. Full record in
      `docs/devnet-run.md`. **One validator, confirmed 23 Sep**:
      all five participant names resolve to the same node, so this run is
      evidence that the real network vets our packages and commits a real
      `SettlementFactory_SettleBatch`, not evidence of cross-operator
      privacy, which stays with the five-participant local run. The console
      now reads each node's own id and says which of the two claims applies.
      A real update id on a real network is still the evidence BitSafe's
      Season 2 postmortem names as a marker of the credible builds,
      everything else was LocalNet.
      **18 Sep: Splice 0.8.1 installed on the DevNet validator** (DevOps
      confirmed), the release the DARs were built against. Next from the
      checklist in `infra/README.md`: upload the DARs (step 2), a ledger user
      with `ParticipantAdmin` and its token (3), fill in `infra/devnet/*.json`
      (4), smoke with `participants-with-parties.ps1 -Network devnet` (5).
      **23 Sep: DevOps added `.github/workflows/actions.yml`**, a manual
      Actions run that takes a Keycloak token and POSTs each DAR to the
      chosen network's participant. It lists the twelve third-party DARs and
      not `indivisa-0.4.0.dar`; the step to add is written out in
      `infra/README.md` step 2. The pipeline failed on an expired token and
      DevOps uploaded by hand instead.
      **Removed before going public (4 Oct):** it never worked, it is not
      part of the submission, and it ran on a self-hosted runner reading
      cluster credentials from an Actions secret - which is not a thing to
      carry into a public repository. The file is kept outside the repo; if
      deployment is ever automated again it belongs in a private one.
      **Checked directly, 23 Sep, and the state is better than feared:**
      all **thirteen** DARs are vetted on the DevNet participant,
      `indivisa-0.4.0` included, so the manual upload was complete. The
      ledger user `d446488e-1170-4211-880e-0e7cd720a5d5` holds
      `ParticipantAdmin` and `CanActAs` on the admin party, which is
      handover step 3 done. The participant id is
      `chain-experts-admin-1::1220d416…ba553`.
      **23 Sep, both unblocked.** DevOps is deploying an HTTPRoute for the
      gRPC Ledger API today (the DNS record already exists). And he chose
      not to change Keycloak, so the clients mint their own tokens:
      `infra/token.ps1`, stamped into the runner map by
      `participants-with-parties.ps1` and refreshed in the background by the
      dev server. Tested against the live identity provider. The runner
      still cannot refresh mid-script, so **keep the DevNet seat to five or
      eight holders**, which the evidence run does not need to exceed.
      `indivisa-governance-v0` and `governance-settlement-v0` are not
      vetted and not committed; they matter only for the BitSafe path.
- [x] **The video is recorded, cut and exported** - 29 Sep,
      `Indivisa-recording/ready/Indivisa-HackCanton-S3.mp4`, **2 m 27 s,
      1920x1080**, inside the two-minute target and well inside the
      five-minute limit. 250 holders on LocalNet: the success run, the
      deliberate refusal, the fix, the retry. Every figure on screen was
      checked against the ledger afterwards - a `DistributionReceipt` of
      250 legs / 1,197,240.63 USD for each run, and a `SettlementRejected`
      of 250 requested / 0 executed for the refusal.
      Three things were learned and are now in the script: the post-settle
      scroll through 250 green cards was the operator's idea and is better
      than what was written; the terminal fix shot is **required**, because
      without it the film cuts from a refusal to a settlement with nothing
      explaining what changed; and an eighth title card was added to carry
      that explanation. Part F was rewritten for **DaVinci Resolve** - the
      script had assumed Clipchamp.
      **The governed settlement is now in the film** (30 Sep): five items
      between the retry and the closing card, taking it to **2 m 27 s**.
      Card 5 had to be rewritten twice - first because it described the
      sandbox's three approver nodes rather than DevNet's two, then because
      it asserted a coupon should not move on one signature immediately
      after two clips of exactly that. It now opens "That was one
      signature", which makes the section read as *default, then option*
      rather than as a contradiction. The operator caught that, not me.
- [x] **A one-command local deployment for the judges**: `quickstart/`, built
      and verified 23 Sep, ahead of the DevNet run rather than after it
      (there was room, and it costs the recording nothing). `cd quickstart &&
      docker compose up` gives one Canton container with the five-participant
      topology and nine vetted packages, a one-shot seed container (the Daml
      Script runner and `Indivisa.Test.Demo`) that seats 20 holders with one
      allocation deliberately withheld, and nginx serving the console and
      proxying the participants. Verified end to end on this machine: refused
      (`20 payments requested · 0 executed`), `docker compose run --rm
      prepare`, settled in 589 ms with the update id on screen.
      `quickstart/README.md` tells the judge when it is ready, what to press and
      what is real; the run is linked from the top of the main README.
      **Still to test elsewhere:** the two shipped build paths
      (`SCRIPT_SOURCE=download` for the script runner, `UI_SOURCE=build` for
      the page) cannot be exercised here, because this machine intercepts TLS
      and a container cannot verify the registry certificate. One clean run
      on another machine, macOS ideally, is the test that matters.
      **Re-verified 5 October against a week of changes**, both paths, by
      driving the page in a browser rather than the API: refused naming the
      withheld holder, `prepare`, then 20 of 20 for 83,321.88 USD in 798 ms.
      Four faults were found in the governed path, each hiding the next, and
      all four are fixed: DecMan's volumes surviving `down -v`; two one-shot
      services auto-starting and racing; a zero-byte state file failing
      silently; and onboarding started before the nodes had connected,
      reported only as `curl: (22)`. **The governed path is now driven from
      the page** like DevNet: nginx proxies `/decman/`, `govern.sh` publishes
      the party into the served map, and `confirm`/`execute` find a
      page-filed proposal on the ledger. Verified end to end: ask on the
      page, 1 of 2, refused below threshold, 2 of 2, settled from the page.
      Detail in `CLAUDE.md`.
      **The image ships a prebuilt `ui/dist`**, so any `ui/src` change needs
      `npm run build` before the image is built, or judges get the old
      bundle. The em-dash sweep caught exactly that.
- [x] **Deck drafted** (24 Sep): fourteen slides. `docs/pitch.md` holds the
      content and what to say over each; `docs/Indivisa-pitch.pptx` is the
      file, regenerated by `infra/pitch/build-pitch.mjs`. Every figure comes
      from `benchmark.md` and `devnet-run.md` rather than being retyped.
      **Superseded 6 October.** `deck.html` became the source, the pptx is now
      edited by hand, and `build-pitch.mjs` was deleted: it generated a deck
      that was eleven days stale, so running it would have regressed the real
      one. The deck now lives on disk and is git-ignored; the PDF goes to the
      submission platform.
      **Still to do:** open it, check the spacing, rehearse against the
      five-minute Grand Final format.
- [x] Label every component **real / simulated / planned**, done in three
      places that a judge actually reads: the deck (slide 12, and slide 13
      for what is not built), `quickstart/README.md`, and `docs/demo-script.md`
      Part H, which says what a caption may and may not claim.
- [ ] Rehearse the answer to *"would anyone really use this?"*

---

## BitSafe challenge: governed settlement · **sandbox end to end 22 Sep, DevNet path agreed 23 Sep**

Separate, capped workstream (the brief and the first-task report are in
`private/`, outside the repo; `docs/decentralization.md` is the public
write-up). Kill criteria from the brief, with status:

| Check | Deadline | Status |
|---|---|---|
| Sandbox runs propose → confirm → execute | 23 Sep | **passed 21 Sep** (BitSafe's own demo.sh, then ours) |
| Scope stays `Run_Settle` only | ongoing | holds: one governed action, nothing else governed |
| Only party/authority changes, not settlement logic | ongoing | holds: `approver` field, executors and actors derived; consent covers joint execution; `SettleBatch` path untouched |
| Main deliverables unchanged by this work | 27 Sep | `indivisa` 0.4.0 is additive (`approver = None` everywhere in the main demo); all 24 main tests pass; LocalNet regression still to run |
| Governed path settles end to end in the sandbox | 1 Oct | **passed 22 Sep**: seat `bs3`, 10 holders, $16,034.38, settled through DecMan |
| Refusal below threshold and success at threshold | 1 Oct | **passed 22 Sep**: 1 of 3 refused ("Enough confirmations..."), 2 of 3 executed; audit trail written |
| Gold application decision | 4 Oct | checkpoint 30 Sep: our DecMan on DevNet, BitSafe confirmed as the second node. **Their half is done** (call, 23 Sep); ours is the deployment |

**Call with BitSafe, 23 September.**
Outcome, and it confirms the plan rather than changing it:

- **A DevNet PoC with a 2-of-2 party is enough for the hackathon.** No
  MainNet party, no third node. Our own analysis had already chosen 2 of 2
  for DevNet, because at 2 of 3 with two nodes ours we could settle without
  them and the shared control would be nominal.
- **BitSafe operate the second node.** That is the thing the sandbox could
  not claim, and it retires our largest caveat: three DecMan nodes on one
  workstation are not three operators; one node of theirs is one operator.
- Sequence: shared Slack channel, exchange node data, peer the two DecMan
  instances, onboard the decentralised party at threshold 2, then exercise
  propose → confirm → execute.
- Their note writes the standard as "DSC 112". It is **CIP-0112**; do not
  let that spelling reach the deck or the channel.

Next, by owner:

- [x] **Us**: Slack addresses sent and the shared channel is live - we ran the
      whole governed settlement through it on 29 Sep with BitSafe.
- [x] **Us (DevOps)**: DecMan beside the DevNet validator, **done 25 Sep**
      at the DevNet Decentralization Manager host (`decman.url` in the
      git-ignored `infra/devnet/ui.json`), Noise listener on 9000.
      Verified from outside without credentials: 9000 open (93 ms), 8080
      filtered, and the admin API refuses every path without a token *and*
      rejects a forged one, so it is not running in the accept-anything
      insecure mode. The login page itself is public, which is correct.
- [x] **Us**: node data sent to BitSafe, **25 Sep**. DecMan's own "share my
      data" button emits the row; our participant id in it matches the value
      read independently from the ledger on 23 Sep, and the address and port
      match what was tested from outside. Kept in
      `private/bitsafe-devnet-peer.md`.
      Note: the truncated second field (`…::1220...a553`) is what the button
      emits on **both** sides, not an error in theirs.
- [x] **BitSafe**: post their DevNet node data, **received 23 Sep**
      (BitSafe). Validated and kept in `private/bitsafe-devnet-peer.md`:
      participant id and public key are well formed, and all three of their
      A records accept TCP on 9000. One field to confirm with them, the
      `name`, which arrived as a truncated UI string.
- [x] **BitSafe**: shared Slack channel created by BitSafe and in daily use.
- [x] **Protocol version: answered by the deployment itself** (25 Sep). The
      worry was that DecMan pins protocol version 35. It is now running
      against our DevNet participant and reading its identity from it, and the
      share-my-data button returned our real participant id, so whatever
      the synchronizer runs, DecMan works against it. Asking BitSafe to
      confirm the synchronizer id is still worth doing, because parties
      cannot span two synchronizers.
- [x] Commit `indivisa-governance-v0-0.1.0.dar` and
      `governance-settlement-v0-0.1.0.dar` - both are in the repository, in
      their own package directories rather than `daml/dars/`. The "so CI can
      upload them" half is moot: the deploy workflow was removed before the
      repository went public.

Done:

- [x] `indivisa` 0.4.0: `DistributionRun.approver : Optional Party` (last
      field, `upgrade-check` passes); `runExecutors`; `Run_Settle` controllers
      and `actors` and the settlement's `executors` all `payingAgent ::
      approver`; `PaymentAgreement.CreateReceiptAllocation` accepts any
      executors that include the agent.
- [x] `governance-settlement-v0`: `BatchSettlementProposal`, a `GovernableAction`
      over a raw V2 `SettleBatch`; no Indivisa dependency; BitSafe's package
      layout. `indivisa-governance-v0`: `SettleRunProposal` over `Run_Settle`.
- [x] `indivisa-governance-test`: nine scripts on the IDE ledger, all green,
      including the three refusal shapes recorded in `decentralization.md`.
      `indivisa-test` moved to LF 2.2 so both test packages share one
      `daml-script` (the model stays 2.1).
- [x] Sandbox tooling: `infra/bitsafe/` (config with the sandbox's public dev
      token, `distribute.ps1`), `infra/govern.ps1` (status, admit, propose,
      confirm, execute, audit against DecMan's REST API), `demo.ps1 -User`
      (rights for the runner's ledger user) and `-Approver`.
- [x] Two network lessons folded into the scripts: the runner grants no user
      rights on the parties it allocates; a participant's clock can be behind
      the runner's by enough to fail `offeredAt = now` (`requestedAt` is now
      five minutes in the past).
- [x] **Regression on 0.4.0: green** (30 Sep). `dpm test` in both test
      packages: **34 tests, 0 failures**. `indivisa-test` 24 - all five
      proofs, the coupon chain end to end, register, entitlement, scale to
      50. `indivisa-governance-test` 10 - `SettleRunProposal` and the
      generic `BatchSettlement` module, each proving below threshold
      refused, proposer alone refused, at threshold settled.
      One stale test was found and fixed: `scaleLegs_wellFormed` asserted
      four-digit leg-id padding where the builder has produced five for some
      time. Test-only - real leg ids are `runId <> "#" <> show i`, unpadded.
      Five digits is correct anyway: the scale runs reach 13,000 legs and
      four stops sorting at 10,000.
      **`dpm test` runs inside a package, not at the multi-package root** -
      at the root it exits 1 with `daml test: Not in package`.
      The main demo is separately regressed by the recording: 250 holders
      seated twice, settled, refused and retried on 28-29 Sep, every figure
      checked against the ledger afterwards.
- [x] The panes show the approver (22 Sep): an APPROVER line on the agent's
      pane, a note that the agent's own button is refused until the vote,
      and honest wording on a holder pane that shares the agent's node. The
      button pressed alone is the "agent refused" shot of the BitSafe clip.
      The vote itself stays in DecMan (its API; its Approvals page does not
      list custom proposals, checked 22 Sep, question for Richie).
- [x] **The governed run is filmed** (30 Sep), against **DevNet** rather than
      the Docker sandbox - so the second approver is BitSafe on BitSafe's
      node, not a container here. Six clips: propose, our confirmation, the
      engine refusing at 1 of 2, their confirmation landing, the settlement,
      the evidence. Five are in the cut.
      Part I of `docs/demo-script.md` was rewritten for this, including the
      trap that cost a take: **every seat allocates a new paying agent, and
      the additional-proposer admission does not carry to it**, so reuse a
      settled tag with `prepare` rather than seating fresh.
      Two takes were also lost to shots that looked right and were not: one
      filmed our own script's guard rather than the ledger refusing (fixed
      with `-Force`), and one showed the previous run's update id because
      the evidence command took the first receipt rather than the newest.
- [x] **Judge package carries the whole product** (24 Sep, stage 1 of 2). The
      judge Canton image now vets all thirteen DARs, governance included,
      57 packages with dependencies, so an inspecting judge finds everything
      we built in the running system. Verified: the five governance-relevant
      packages all report vetted.
- [x] **Judge package, stage 2: the vote inside Docker** (24 Sep, working end
      to end and verified on the ledger: 8 legs, $14,371.88, settled only
      after two of three approvers confirmed; one confirmation refused with
      the ledger's own *'Enough confirmations to execute action' was not
      met*). Three DecMan v1.8.0 containers behind the `govern` compose
      profile, ~150 MB each, so a plain `docker compose up` is untouched and
      6 GB still covers both paths. `quickstart/govern.sh` ports BitSafe's
      `hackathon/seed.sh` and our `infra/govern.ps1` onto this topology.
      ~~Original plan:~~ Three DecMan
      containers against three of our five participants, plus a seeding step
      that reproduces BitSafe's `hackathon/seed.sh` against our topology:
      peer mesh, decentralised party at threshold 2, DAR distribution, member
      parties, governance core. Their scripts are hardcoded to their own
      container names and ports, so this is a port of roughly 250 lines, not
      a configuration change. Raises the judge's memory requirement from 6 GB
      to about 8 GB. **Do not let this destabilise the working package**:
      keep it behind a compose profile so `docker compose up` stays exactly
      as it is today.
- [x] **Both BitSafe contributions prepared** (25 Sep) in `contrib/bitsafe/`:
      the reusable module as one PR, and `INTEGRATING.md`, six undocumented
      things that each cost hours, as another. Branch names, commit types and
      draft descriptions follow their `docs/CONTRIBUTING.md`. Send the docs
      one first. **Still to do: open the two PRs.**
- [x] **Two pull requests to BitSafe - both open, #516 and #517 (4-5 Oct).**
      `contrib/bitsafe/`: the `governance-settlement-v0` module, and
      `INTEGRATING.md`, now **nine** findings after the DevNet run added the
      member-with-no-node lockout. Send the documentation one first - it is
      useful to them whether or not they want the module. Ask which branch
      (`main` or `hackathon`). A prepared PR is not a merged PR, and the
      challenge scores merged ones.
> **Whether the two tiers are exclusive is unresolved, and it decides the
> plan.** BitSafe own challenge page says *"Gold applicants are not eligible
> for the contribution pool"*, and the organiser said the same. But BitSafe
> have said on Telegram that **the page is wrong and they will correct it**,
> and that a team may enter both. That is the rule author disowning their own
> published text, not an unwritten claim contradicting it, so it very likely
> stands. Being confirmed with them directly (26 Sep).
>
> Two more things in their wording. The contribution pool is *"for teams
> without a node"*, and we have had one since 24 September, and it is *"split
> by two teams"*, so it is smaller per team than it reads.
>
> **The decision turns on that answer.** If both are open, apply for Gold
> regardless, since it costs nothing and the contribution work stands on its own.
> If they are exclusive after all, apply for Gold only once the governed
> settlement has actually run on DevNet, because applying on expectation and
> not finishing would forfeit the pool and win nothing.
>
> Either way the fallback is strong and already built: the contribution pool asks for a reproducible LocalNet demo
> of an integration, a custom module, or an open-source contribution, and we
> have all four: `quickstart/` runs the governed flow in one command,
> `governance-settlement-v0` is the module, and `contrib/bitsafe/` holds two
> ready PRs.

- [x] **Gold: the governed settlement ran on DevNet - 29 September.**
      A coupon settled through `indivisa-approvers` at **2 of 2**: our
      confirmation and BitSafe's, on their own node. 5 legs, 8,421.88 USD,
      update id
      `1220eb437ef12213805d81db4f425056c1b0fdf2eb4f1de3f1882d037eefbd60c6ac`.
      Read it back with `pwsh infra/bitsafe/govern-devnet.ps1 evidence`;
      the record is `infra/devnet/demo/evidence-gov1.json`.
      **Apply for Gold by 4 October.** Whether Gold and the contribution
      pool are exclusive is still unresolved - get it in writing.
      Four things cost the day, all now scripted or documented:
      **the TLS truststore** (`infra/trust-store.ps1`: `--cacrt` silently
      stopped working, and a PKCS12 written by .NET loads as zero trust
      anchors because Java wants keytool's trusted-key-usage attribute);
      **the missing asset package** on BitSafe's node
      (`infra/bitsafe/verify-packages.ps1` asks the ledger rather than the
      DecMan UI, which reported "uploading" for a day while nothing
      happened); **the unauthorised proposer**
      (`SelfAction_AddAdditionalProposer` is in their Daml and API but not
      their UI - BitSafe are adding it); and **a self-inflicted lockout** -
      a member with no node of its own still counts towards the threshold,
      so the party could not reach its own threshold, and only
      `PUT /party-config` could unpick it (`infra/bitsafe/confirm-as-member.ps1`).
- [ ] Java paying-agent daemon: watches payment dates, fires the run without a
      human. The honest production component, invisible in the video. First to be
      cut.
- [ ] Dividend and redemption as second and third event types, to show the
      engine generalises.
- [ ] Post the benchmark to the Canton forum.
- [ ] **Withdraw through `GovernableAction_ProposerCancel`** rather than
      archiving `SettleRunProposal` directly. Same outcome, but it is
      BitSafe's published interface rather than our template, it is what they
      assume we already do, and it would work for any `GovernableAction`.
      Needs a DevNet test, so it was deliberately not done on recording day.
      Then correct `decentralization.md`, which still implies the mechanism
      was missing when only the button was.
- [ ] **Write up member-governed cancel for BitSafe** - retiring a proposal
      whose proposer can no longer act. They invited it in writing on
      5 October: *"a bigger change, and we would welcome your write-up for
      it."* A third contribution, after the 9th.
- [ ] **Adopt the reviewer's `ensure` fix here, as a real
      `governance-settlement-v1`.** Their clause rejects a settlement naming a
      third executor at creation instead of after the vote. A changed `ensure`
      is a new package lineage rather than a version bump, so the rename has to
      ripple through `quickstart/canton.Dockerfile`, `quickstart/bootstrap.canton`,
      `infra/bitsafe/distribute.ps1`, `verify-packages.ps1`, three `daml.yaml`
      files and four documents, then a fresh DevNet upload and a re-verified
      judge package. **Not before the Grand Final:** the configuration it
      rejects is one Indivisa cannot create (`runExecutors run = payingAgent ::
      approver` is exactly two parties, and the product settles through
      `SettleRunProposal`). Reasoning in `contrib/bitsafe/README.md`.

---

## Open decisions

- [x] **Which V2 cash instrument: `TestTokenV2`, and the question is closed**
      (29 Sep). Asked in the HackCanton channel and answered: there is **no
      required cash asset**. Judges look at whether the settlement works,
      whether it is genuinely on Canton, and whether we are clear about what
      is a stand-in. Our reason was endorsed unprompted - the reference asset
      is signed by owner and admin, so it keeps the receiver-authorisation
      case instead of skipping it. The disclosure, and the "configuration
      change, not a redesign" framing, are now in `README.md`,
      `quickstart/README.md`, deck slides 12 and 13, and video card 2;
      `docs/canton-coin.md` sets out what a switch would take (nothing in
      the model - one field and one registry adapter).
      Their caveat: **sponsor challenges set their own conditions**. The
      Grofty bounty needs MainNet end to end, where a test token would not
      count. BitSafe's Gold condition is a decentralised party on DevNet,
      with no asset condition known - worth confirming.
- [ ] One send allocation with N legs, or N send allocations. One works to
      2,000 legs; the comparison is optional now.
- [x] What N the headline claims: **13,000 legs settled in one transaction**
      (22 Sep), and for holders, 1,000 measured with ~6,400 derived. Never
      say "13,000 holders": it was 13,000 legs over 250 holders.
- [ ] Whether the issuer-funds-paying-agent leg rides the same batch or precedes
      it.
- [x] LF target: **2.1**, forced by the V2 DARs' bundled stdlib (17 Sep).
- [x] Licence for the public repo: **Apache-2.0**, copyright Chain-Experts
      (21 Sep). `LICENSE` is the verbatim licence text; `NOTICE` carries our
      copyright and the attribution for the ten Splice DARs in `daml/dars/`,
      which are Apache-2.0 (Digital Asset (Switzerland) GmbH) and may be
      redistributed unmodified. Splice has no NOTICE file of its own, so
      nothing else has to be carried.
