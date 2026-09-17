# Tasks

**17 September 2026. Submission 9 October. 22 days.**

**Proofs 1, 3 and 4 run in Daml Script; proofs 2 and 5 run on LocalNet.** DevNet
is used once, at the end, only to produce a real update id as evidence.
Developing against DevNet would cost uptime we do not control, traffic we do
not need to spend, and the multi-participant setup that proof 2 requires.

The order matters more than the list. Proofs 1–4 gate everything. **Proof 5 can
still kill the idea**; proof 3 was answered by reading the released code on 16
September (see `CLAUDE.md`) and is now a confirmation, not a discovery. Reach
both in week one anyway.

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

## Phase 0 — Wiring (day 1)

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
      `docs/reference-architectures/dex.md`. **Reference only** — DAR import is
      gated and nothing there is dependable.
- [ ] Ask NODERS: S3 sponsor challenges and tracks, AI-disclosure policy,
      whether regular DevNet now carries V2 or the June "Token Standard V2
      DevNet" (protocol version 35) is still the target.

### Phase 0b — LocalNet, four participants (days 1–5) · *DevOps, in parallel*

Needed only for proofs 2 and 5. Do not let it block Phase 1.

`TestTokenV2` has no Splice runtime dependency and no contract keys, so
**LocalNet is a plain Canton synchronizer plus participants** — no SV, no
Amulet, no Scan, no Keycloak. `cn-quickstart` is the wrong tool here; it is only
worth reaching for if the DevNet evidence run uses Canton Coin. Use the Canton
image from the Splice 0.8.1 release and a hand-written `canton.conf`.

Proof 2 needs each party on its **own** participant. A single-participant setup
cannot prove privacy, and privacy is the claim the whole pitch rests on.

- [ ] Start Docker Desktop. It does not start on its own.
- [ ] Four participants, four Postgres, one synchronizer, in Docker Compose.
      Paying agent, Alice, Bob, Charlie.
- [ ] Upload the V2 DARs, `splice-test-token-v2`, and `indivisa` to all four.
- [ ] Four party tokens, all valid simultaneously — the UI opens four panes
      against four identities at once.
- [ ] Read transaction size, view count and submission-to-completion latency off
      a participant. Proof 5 needs these numbers, not impressions.

> Environment setup is the most-cited friction point in the Canton developer
> survey. If this runs past five days, say so and re-plan. Phase 1 proceeds
> regardless.

Committed to `infra/localnet/`.

---

## Phase 1 — The five proofs (days 2–8)

Written in `Indivisa.Model.*`, `Indivisa.Utils` and `Indivisa.Test.*` — the real
packages. Nothing here is throwaway.

Proofs 1, 3 and 4 are Daml Script against `TestTokenV2`, run with `dpm test`.
No network. Proofs 2 and 5 wait for Phase 0b.

No bond. No register. No entitlement engine. No UI. No 500 holders.

### Proof 1 — does the batch settle at all? **PASSES** (`proof1_batchSettles`)
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

### Proof 3 — do holders authorise once, at onboarding, and never again? **PASSES**

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

### Proof 2 — does each recipient see only its own leg?
- [x] Single-participant form (`proof2_visibility_singleParticipant`): before
      settlement each holder sees exactly one `V2.Allocation`, its own, with
      only its own amount; the agent sees four. After settlement each holder's
      `V2.Holding` query returns only its own account. No holder sees a
      `DistributionRun` (holders are no longer observers of it).
- [ ] Re-run on the **four-participant** LocalNet.
- [ ] Assert from each party's own participant: Alice sees her leg and neither
      Bob's nor Charlie's. Likewise B and C. Paying agent sees all three.
- [ ] Assert over the V2 **Holding** interface, not just our own templates — the
      strong claim is that Alice cannot see a Holding belonging to Bob.

> Daml Script's `query` is party-scoped. On one participant that proves
> party-scoped queries, **not** projection. Only the four-participant run proves
> the privacy claim.

### Proof 4 — is it really all or none? **PASSES**
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

### Proof 5 — where is the ceiling? **KILL SWITCH** — script form done, participant form pending

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

Participant form (needs Phase 0b):
- [ ] Same script against LocalNet, N = 3 → 1000 and past it.
- [ ] Per N: transaction size, view count, submission-to-completion latency,
      estimated traffic cost, failure reason if rejected.
- [ ] Two shapes per N: **one** send allocation carrying N `transferLegSides`,
      versus N send allocations. Expected view count is N receipt allocations
      plus send allocation(s) plus root; measure, do not assume.
- [ ] Count the pre-settlement cost too: N receipt allocations are N separate
      commands before the batch. Report it honestly; it is the "asynchronous
      allocation phase" in `docs/architecture.md`.
- [ ] Note whether the **cash registry** becomes the bottleneck — it confirms
      every leg in its instrument.
- [ ] Note whether the limit is a hard cap or a latency wall. They imply
      different product answers.
- [ ] Fill in section 2 of `docs/benchmark.md`.

> LocalNet is the right place for this: push to failure without spending real
> traffic, and control the configuration while you do.
>
> Nobody has published how many legs fit in a CIP-112 batch. Post the benchmark
> to the Canton forum whatever happens to the hackathon.

**Gate: do not start Phase 2 until proofs 1–4 pass.**

---

## Phase 2 — The model (days 8–13)

- [ ] `Indivisa.Types` — vocabulary, no templates. `PaymentLeg` is there (17 Sep);
      the rest arrives with Register, Event and Entitlement.
- [ ] `Indivisa.Model.Register` — instrument, positions, record-date snapshot. Plain
      Daml, no V2.
- [ ] `Indivisa.Model.Event` — coupon announcement: rate, record date, payment date.
- [ ] `Indivisa.Model.Entitlement` — rate x position x period. **Settle the rounding
      policy here and record it on-ledger.** The legs must total the announced
      distribution exactly; a settlement off by one cent does not settle.
- [ ] `Indivisa.Model.Distribution` — generalise from the proof into the real path.
      `PaymentAgreement` stays in `Model.Payment`; `Utils` and `Model.*` are the
      only places allowed to touch V2. Client-side builders stay in `Test.Agent`.
- [ ] Scripts: `Test.Register`, `Test.Entitlement`, and `Test.Distribution`
      extended to a holder base at whatever N proof 5 established.

---

## Phase 3 — Driver and data (days 13–15)

- [ ] `Test.Demo` — create the instrument, seat N holders, **sign N payment
      agreements** (the onboarding step, shown once in the recording so the
      "holders authorise once" claim is visible), announce the coupon.
- [ ] Realistic holder names and position sizes. **No Alice, Bob and Charlie in
      the recording.**
- [ ] The deliberate-failure path, armed on demand.
- [ ] Confirm the four-participant LocalNet carries the full demo, not just the
      three-leg proof.

---

## Phase 4 — UI (days 15–17)

Four read-only panes. Lists and numbers. No forms, no routing, no state library.

- [ ] Paying agent: instrument, holder count, total due, one button, result with
      update id.
- [ ] `Holder.tsx` — **one component rendered three times**, one per party.
- [ ] Reads the ledger directly over the **JSON Ledger API v2**. No Java tier.
- [ ] Visibly empty where a holder cannot see another's data. That contrast is
      the demo, and it works in a plain table.

> Budgeted at one to two days because it is AI-assisted and the surface is
> small. If Phase 1 or 2 slips, this phase absorbs it — but do not cut it to
> nothing. Season 2's finalists all showed a polished one-minute recording, and
> the four-pane contrast is the most persuasive thing we can put on screen.

---

## Phase 5 — DevNet, recording and pitch (days 17–20)

- [ ] **One DevNet run.** Deploy, execute a real distribution, capture the update
      id and ledger receipt. This is the evidence BitSafe's Season 2 postmortem
      names as a marker of the credible builds — everything else was LocalNet.
      Confirm first (Phase 0 NODERS question) which DevNet carries V2 and what
      protocol version it demands; the June V2 DevNet needed PV 35 and
      `alpha-version-support`.
- [ ] Record 60–90 seconds. Success run first; the labelled failure run second,
      captioned as an atomicity demonstration before the click; then the retry.
- [ ] Deck: the problem in Canton's own numbers, what V2 changed in June, the
      demo, the benchmark, the honest limits.
- [ ] Label every component **real / simulated / planned**.
- [ ] Rehearse the answer to *"would anyone really use this?"*

---

## Phase 6 — Buffer (days 20–23)

You will need it.

---

## Optional, only if ahead

- [ ] Java paying-agent daemon — watches payment dates, fires the run without a
      human. The honest production component, invisible in the video. First to be
      cut.
- [ ] Dividend and redemption as second and third event types, to show the
      engine generalises.
- [ ] Post the benchmark to the Canton forum.

---

## Open decisions

- [ ] Which V2 cash instrument for the DevNet evidence run — `TestTokenV2` again,
      or Canton Coin. If Canton Coin: check whether Amulet's V2 implementation
      accepts receipt allocations created through a third-party agreement the
      way `TestTokenV2` does, or only through its own `TransferPreapproval`.
- [ ] One send allocation with N legs, or N send allocations. Proof 5 decides.
- [ ] What N the headline claims. Set by proof 5, not by ambition.
- [ ] Whether the issuer-funds-paying-agent leg rides the same batch or precedes
      it.
- [x] LF target: **2.1**, forced by the V2 DARs' bundled stdlib (17 Sep).
- [ ] Licence for the public repo.
