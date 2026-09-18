# Tasks

**18 September 2026. Submission 9 October. 21 days.**

**Proofs 1, 3 and 4 run in Daml Script; proofs 2 and 5 run on LocalNet.** DevNet
is used once, at the end, only to produce a real update id as evidence.
Developing against DevNet would cost uptime we do not control, traffic we do
not need to spend, and the multi-participant setup that proof 2 requires.

The order matters more than the list. Proofs 1–4 gated everything and passed
on 17 September; proof 5, the one that could have killed the idea, was measured
to 1,000 legs on LocalNet on 17–18 September (one transaction, seconds).
Phases 2 to 4 were built on 18 September. Phase 5 is what is left.

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
- [ ] Ask NODERS:
      1. S3 sponsor challenges and tracks; AI-disclosure policy.
      2. Whether regular DevNet now carries Token Standard V2, or the June
         "Token Standard V2 DevNet" is still the target.
      3. **Which protocol version DevNet runs today** (the June V2 DevNet was
         PV 35 with `alpha-version-support`; LocalNet runs PV 35).
      4. **Does the 0.8.x validator wallet UI display Token Standard V2
         holdings of a registry other than Amulet?** Decides whether a
         holder can log into the wallet and watch `TestTokenV2` cash land
         (display only; no wallet-side transfers needed).

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

### Proof 5 — where is the ceiling? **MEASURED**: not reached at 1,000 legs; linear

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
- [ ] Two shapes per N: **one** send allocation carrying N `transferLegSides`,
      versus N send allocations. Expected view count is N receipt allocations
      plus send allocation(s) plus root; measure, do not assume.
- [x] Pre-settlement cost counted (`docs/benchmark.md`, "Onboarding cost"):
      parties ~5 s each, acceptances ~1 s each, receipt allocations batched
      fifty per command; the day for 500 existing holders is ~5 minutes, of
      which 4 s is the settle.
- [x] Whether the **cash registry** is the bottleneck: not at these sizes.
      The registry confirms every leg and the whole confirmation round is
      2.2 s at 500 and 4.7 s at 1,000; nothing stands out per node in the log.
- [x] Hard cap or latency wall: **neither reached**. Size at 1,000 legs is a
      sixth of the sequencer cap; latency is linear and single-digit seconds.
- [x] Section 2 of `docs/benchmark.md` filled in (18 Sep).

> LocalNet is the right place for this: push to failure without spending real
> traffic, and control the configuration while you do.
>
> Nobody has published how many legs fit in a CIP-112 batch. Post the benchmark
> to the Canton forum whatever happens to the hackathon.

**Gate: do not start Phase 2 until proofs 1–4 pass.** Passed 17 September.

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

## Phase 4 — UI (days 15–17) · **built 18 Sep**

Four panes. Lists and numbers. No forms, no routing, no state library.

- [x] Paying agent: instrument, holders, total due, allocations ready, **one
      button** that submits `Run_Settle` over the JSON Ledger API with the
      factory disclosed, then the update id (recovered by offset after a
      reload) and submit-to-commit time. On refusal: "SETTLEMENT REJECTED ·
      N requested · 0 executed · NO PARTIAL SETTLEMENT", the reason, and a
      `SettlementRejected` record written on-ledger.
- [x] `Holder.tsx` — one component rendered three times: my position, my
      agreement, my allocation, my cash, and six always-zero counts of what
      this node holds about anyone else.
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

> Budgeted at one to two days because it is AI-assisted and the surface is
> small. If Phase 1 or 2 slips, this phase absorbs it — but do not cut it to
> nothing. Season 2's finalists all showed a polished one-minute recording, and
> the four-pane contrast is the most persuasive thing we can put on screen.

---

## Phase 5 — DevNet, recording and pitch (days 17–20)

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
- [ ] **One DevNet run** (DevOps). Deploy, execute a real distribution, capture
      the update id and ledger receipt. This is the evidence BitSafe's Season 2
      postmortem names as a marker of the credible builds — everything else
      was LocalNet. Confirm first (Phase 0 NODERS questions 2 and 3) which
      DevNet carries V2 and what protocol version it demands.
      **18 Sep: Splice 0.8.1 installed on the DevNet validator** (DevOps
      confirmed), the release the DARs were built against. Next from the
      checklist in `infra/README.md`: upload the DARs (step 2), a ledger user
      with `ParticipantAdmin` and its token (3), fill in `infra/devnet/*.json`
      (4), smoke with `participants-with-parties.ps1 -Network devnet` (5).
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
- [ ] One send allocation with N legs, or N send allocations. One works to
      2,000 legs; the comparison is optional now.
- [x] What N the headline claims: **1,000 legs in one transaction, measured**;
      a few hundred per batch is the comfortable size (18 Sep).
- [ ] Whether the issuer-funds-paying-agent leg rides the same batch or precedes
      it.
- [x] LF target: **2.1**, forced by the V2 DARs' bundled stdlib (17 Sep).
- [ ] Licence for the public repo.
