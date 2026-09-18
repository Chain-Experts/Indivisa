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

### Phase 0b — LocalNet, five participants · **DONE 17 Sep, no Docker**

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
- [ ] Party tokens / JSON API auth for the UI: LocalNet has no auth, so this
      is a Phase 4 item, not a blocker.
- [ ] Transaction size and view count per N: see proof 5.

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

Participant form, LocalNet, 17–18 Sep (`docs/benchmark.md` section 2):
- [x] Same script against LocalNet, N = 3, 10, 50, 100, 250, 500, **1000**.
      Every size settled; 1,001 allocations in one transaction.
- [x] Per N: request size (1.67 KB per allocation, 1.67 MB at 1000) and
      submission-to-commit (5 s at 100, 15–28 s at 250, 104 s at 500,
      333 s at 1000). Envelopes stay at 7: per node, not per leg.
- [x] **Latency wall, not a hard cap.** Size alone would allow ~6,200 per
      batch; latency grows about N^1.7 with a silent phase the INFO log
      cannot attribute. Product answer: a few hundred holders per atomic
      batch on this hardware; thousands as back-to-back batches.
- [ ] DEBUG run at N = 500 to attribute the silent phase.
- [ ] Traffic cost estimate (needs DevNet's fee parameters).
- [ ] Hit the size cap on purpose to record the rejection message.
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

- [x] `Indivisa.Types` — `PaymentLeg`, `Isin`, `EventKind` (Coupon / Dividend /
      Redemption), `RoundingPolicy` (LargestRemainder, RoundHalfUpResidualToIssuer). (18 Sep)
- [x] `Indivisa.Model.Register` — `Instrument`, `Position` (registrar signs,
      holder observes: each holder sees only its own), `RegisterSnapshot`.
      `Instrument_Snapshot` verifies every position contract on-ledger
      (right isin, right registrar), aggregates per holder, sorts. The
      registrar can omit a position; it cannot invent one.
- [x] `Indivisa.Model.Event` — `CorporateAction` (issuer signs, agent
      observes; `amountPerUnit`, record and payment dates).
      `CorporateAction_Entitle` attaches the snapshot and derives the
      schedule **on-ledger**, so the schedule is verifiably announcement x
      snapshot. `CorporateAction_Cancel` for the issuer.
- [x] `Indivisa.Model.Entitlement` — `entitlements`: quantity x amountPerUnit,
      **largest-remainder** rounding by default (floor to the cent, hand the
      residual cents to the largest discarded fractions), sums to the
      announced total exactly; half-up-with-issuer-residual as the
      alternative; zero entitlements dropped. `EntitlementSchedule` records
      policy, exact and paid amounts per holder, and ensures the total.
- [x] `Indivisa.Model.Distribution` — `runFromSchedule`: one leg per entry,
      currency from the schedule, `schedule` link on the run and the receipt.
      Proofs still create runs by hand (`schedule = None`).
- [x] Scripts: `Test.Register` (3), `Test.Entitlement` (5), `Test.Coupon`
      (the whole chain, IDE and LocalNet). Holder-base-at-N is the scale
      harness; the coupon path at N is Phase 3's `Test.Demo`.
- [x] **Model package is now 0.2.0.** Canton refuses to vet two packages with
      the same name and version; `dpm upgrade-check --both old.dar new.dar`
      passes, after moving the new `schedule` fields to the end of their
      records (SCU appends). Uploaded to LocalNet over the JSON API without a
      restart.

---

## Phase 3 — Driver and data (days 13–15) · **built 18 Sep**

- [x] `Test.Demo.demo_seat` — parties, cash, the instrument ("Northwind Rail
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
- [x] `infra/localnet/demo.ps1 seat | attempt` drives it from a shell; the
      participant map is regenerated before each command.
- [ ] Confirm LocalNet carries the full demo at the recording size (250):
      50-holder seat and both attempts on 18 Sep, 250 next.

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
