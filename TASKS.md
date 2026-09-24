# Tasks

**23 September 2026. Submission 9 October. 16 days.**

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
package was built and verified (`judge/`, brought forward from Phase 5
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

### Proof 5 — where is the ceiling? **FOUND, 22 Sep**: 13,000 legs settle; the command that authorises them refuses at 13,869

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
      restart. Since then: 0.3.0 (`SettlementRejected`, 18 Sep) and 0.4.0
      (`DistributionRun.approver`, 22 Sep, for the BitSafe challenge; inert
      when `None`). Each passed `upgrade-check`; the current version is in
      `daml/indivisa/daml.yaml`.

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

## Phase 4 — UI (days 15–17) · **built 18 Sep, rebuilt as a console 23 Sep**

Lists and numbers, and the interrogation of them. No forms, no auth flows,
no application backend.

- [x] Paying agent: instrument, holders, total due, allocations ready, **one
      button** that submits `Run_Settle` over the JSON Ledger API with the
      factory disclosed, then the update id (recovered by offset after a
      reload) and submit-to-commit time. On refusal: "SETTLEMENT REJECTED ·
      N requested · 0 executed · NO PARTIAL SETTLEMENT", the reason, and a
      `SettlementRejected` record written on-ledger.
- [x] ~~`Holder.tsx` — one component rendered three times~~ — replaced
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
      run's state); the button; and four tabs — **Holders** (a card for
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
> small. If Phase 1 or 2 slips, this phase absorbs it — but do not cut it to
> nothing. Season 2's finalists all showed a polished one-minute recording, and
> the contrast between the executor's schedule and a single holder's node is
> the most persuasive thing we can put on screen.

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
- [x] **One DevNet run — done 24 Sep.** Five holders paid in one transaction
      on Chain-Experts' DevNet validator, update id
      `1220652e2e4d32822c39d2ad72088e163eed04718ad1108998001b01aa3483ff466b`,
      8,421.88 USD, and the deliberate failure refused first. Full record in
      `docs/devnet-run.md`. **One validator, confirmed 23 Sep**:
      all five participant names resolve to the same node, so this run is
      evidence that the real network vets our packages and commits a real
      `SettlementFactory_SettleBatch` — not evidence of cross-operator
      privacy, which stays with the five-participant local run. The console
      now reads each node's own id and says which of the two claims applies.
      A real update id on a real network is still the evidence BitSafe's
      Season 2 postmortem names as a marker of the credible builds —
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
- [ ] Record 60–90 seconds. Success run first; the labelled failure run second,
      captioned as an atomicity demonstration before the click; then the retry.
- [x] **A one-command local deployment for the judges** — `judge/`, built
      and verified 23 Sep, ahead of the DevNet run rather than after it
      (there was room, and it costs the recording nothing). `cd judge &&
      docker compose up` gives one Canton container with the five-participant
      topology and nine vetted packages, a one-shot seed container (the Daml
      Script runner and `Indivisa.Test.Demo`) that seats 20 holders with one
      allocation deliberately withheld, and nginx serving the console and
      proxying the participants. Verified end to end on this machine: refused
      (`20 payments requested · 0 executed`), `docker compose run --rm
      prepare`, settled in 589 ms with the update id on screen.
      `judge/README.md` tells the judge when it is ready, what to press and
      what is real; the run is linked from the top of the main README.
      **Still to test elsewhere:** the two shipped build paths
      (`SCRIPT_SOURCE=download` for the script runner, `UI_SOURCE=build` for
      the page) cannot be exercised here, because this machine intercepts TLS
      and a container cannot verify the registry certificate. One clean run
      on another machine, macOS ideally, is the test that matters.
- [ ] Deck: the problem in Canton's own numbers, what V2 changed in June, the
      demo, the benchmark, the honest limits.
- [ ] Label every component **real / simulated / planned**.
- [ ] Rehearse the answer to *"would anyone really use this?"*

---

## BitSafe challenge — governed settlement · **sandbox end to end 22 Sep, DevNet path agreed 23 Sep**

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

**Call with BitSafe, 23 September** (BitSafe, BitSafe).
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

- [ ] **Us**: send the Slack-associated email addresses to BitSafe (Telegram).
- [ ] **Us (DevOps)**: a DecMan instance beside the DevNet validator, with
      the seven Canton Admin API services reachable to it, and its Noise
      listener reachable from BitSafe. **The port is ours to choose** —
      9000 is only the default (`--noise-port`, `DECPM_NOISE_PORT`), and
      BitSafe's own peers run on 443, 8443, 6865 and 5008, so 443 is
      available if it makes the gateway simpler.
- [ ] **Us**: post our node data in the channel once DecMan is up. A peer
      row is `participant_id`, `name`, `address`, `port`, `public_key` —
      the key comes from `GET /keys/status`, and peers are exchanged
      through `GET`/`POST /network-config`.
- [x] **BitSafe**: post their DevNet node data — **received 23 Sep**
      (BitSafe). Validated and kept in `private/bitsafe-devnet-peer.md`:
      participant id and public key are well formed, and all three of their
      A records accept TCP on 9000. One field to confirm with them, the
      `name`, which arrived as a truncated UI string.
- [ ] **BitSafe**: create the shared channel (BitSafe).
- [ ] **Verify before deploying**: DecMan pins protocol version 35. Confirm
      our DevNet synchronizer runs 35 — the JSON API does not report it
      (`/v2/version` gives Canton 3.5.17 and nothing about the protocol),
      so it has to come from the Canton console or from BitSafe.
- [ ] Commit `indivisa-governance-v0-0.1.0.dar` and
      `governance-settlement-v0-0.1.0.dar` so CI can upload them, the way
      `indivisa-0.4.0.dar` is committed.

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
- [ ] LocalNet regression of the six proofs and the main demo on 0.4.0
      (LocalNet is down while the sandbox has the memory).
- [x] The panes show the approver (22 Sep): an APPROVER line on the agent's
      pane, a note that the agent's own button is refused until the vote,
      and honest wording on a holder pane that shares the agent's node. The
      button pressed alone is the "agent refused" shot of the BitSafe clip.
      The vote itself stays in DecMan (its API; its Approvals page does not
      list custom proposals, checked 22 Sep, question for Richie).
- [ ] Record the governed run: `docs/demo-script.md`, Part I. It is **not a
      separate film** any more (24 Sep): one submission enters both the main
      competition and BitSafe's challenge, so the footage is items 10 and 12
      of the single under-two-minute video.
- [x] **Judge package carries the whole product** (24 Sep, stage 1 of 2). The
      judge Canton image now vets all thirteen DARs, governance included —
      57 packages with dependencies — so an inspecting judge finds everything
      we built in the running system. Verified: the five governance-relevant
      packages all report vetted.
- [x] **Judge package, stage 2: the vote inside Docker** (24 Sep, working end
      to end and verified on the ledger: 8 legs, $14,371.88, settled only
      after two of three approvers confirmed; one confirmation refused with
      the ledger's own *'Enough confirmations to execute action' was not
      met*). Three DecMan v1.8.0 containers behind the `govern` compose
      profile, ~150 MB each, so a plain `docker compose up` is untouched and
      6 GB still covers both paths. `judge/govern.sh` ports BitSafe's
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
- [ ] Offer `governance-settlement-v0` to BitSafe's repository as a pull
      request (needs their `multi-package.yaml` entry and a `daml.yaml` at
      their SDK version).
- [ ] Gold: DevOps request sent (`private/devops-handover-message.md` §6, outside the repo);
      30 Sep checkpoint.

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
