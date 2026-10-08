# Modules

Every file, and what is in it. For the order of work see `TASKS.md`; for the reasoning see `architecture.md`.

```
Indivisa/
├── README.md                      public front door
├── TASKS.md                       order of work
├── LICENSE                        Apache-2.0, verbatim
├── NOTICE                         our copyright; attribution for the vendored Splice DARs
├── multi-package.yaml
├── .gitignore
│
├── daml/
│   ├── dars/                      prebuilt Token Standard V2 DARs, Splice 0.8.1
│   │                              (ten files; listed in NOTICE)
│   ├── indivisa/                  package `indivisa`, uploaded to participants
│   │   ├── daml.yaml
│   │   └── Indivisa/
│   │       ├── Types.daml                 vocabulary, no V2
│   │       ├── Utils.daml                 our vocabulary in V2 terms
│   │       ├── Model/
│   │       │   ├── Payment.daml           the once-only consent (V2)
│   │       │   ├── Distribution.daml      the run and its settle (V2)
│   │       │   ├── Register.daml          instrument, positions, snapshot
│   │       │   ├── Event.daml             the corporate action
│   │       │   └── Entitlement.daml       rate x position, rounding
│   │
│   ├── indivisa-test/             package `indivisa-test`, never uploaded (LF 2.2; the model is 2.1)
│   │   ├── daml.yaml
│   │   └── Indivisa/Test/
│   │       ├── Fixtures.daml              cast, cash, funding, onboarding, waits
│   │       ├── Agent.daml                 the paying agent's client moves
│   │       ├── Distribution.daml          proofs 1 to 4, and what the run refuses
│   │       ├── Payment.daml               the holder's consent, and its limits
│   │       ├── Event.daml                 the announcement, and a schedule's provenance
│   │       ├── Register.daml              positions, transfer, snapshot
│   │       ├── Entitlement.daml           the rounding arithmetic
│   │       ├── Coupon.daml                the whole chain, end to end
│   │       ├── Scale.daml                 proof 5 harness
│   │       └── Demo.daml                  seat a realistic holder base, run the day, arm the failure
│   │
│   ├── governance-settlement-test/ self-contained tests for the above: no Indivisa, so the package
│   │                              lifts into BitSafe's repo as it stands
│   ├── governance-settlement/     package `governance-settlement-v0`: a V2 batch settlement as a
│   │   └── daml/Governance/Settlement/BatchSettlement.daml     governed action; no Indivisa in it (for BitSafe's repo)
│   ├── indivisa-governance/       package `indivisa-governance-v0`: SettleRunProposal over Run_Settle
│   │   └── daml/Indivisa/Governance/SettleRunProposal.daml
│   ├── indivisa/indivisa-0.4.0.dar   a copy of the build output, committed so CI can upload it with no Daml toolchain
│   └── indivisa-governance-test/  the governance proofs (IDE ledger) and the propose script
│       ├── Indivisa/Test/Governance.daml          1 of 3 refused, agent alone refused, 2 of 3 settles
│       ├── Indivisa/Governance/Demo.daml         govern_propose, driven by infra/govern.ps1
│       └── Governance/Settlement/Test/BatchSettlementTest.daml   the generic module on its own
│
├── ui/                            the settlement console (Vite + React, no backend)
│   ├── README.md
│   ├── package.json
│   ├── vite.config.ts             proxy per participant (ui.json), serves the seat and the map
│   ├── index.html
│   ├── public/indivisa-logo.png   the mark, in the dark header bar and as the favicon
│   ├── scripts/settle.ts          the button's settle, from Node, for the benchmark
│   └── src/
│       ├── main.tsx
│       ├── auth.ts                operator sign-in: OIDC authorization code with PKCE, no secret
│       ├── App.tsx                the shell: sign-in gate, four desks, register rail, outcome strip, leg state per holder
│       ├── config.ts
│       ├── styles.css
│       ├── ledger/
│       │   ├── client.ts          one connection per party; reading(parties) for several at once
│       │   └── queries.ts         agentState, holderState, nodeHolders, book (every coupon), settle
│       ├── state/
│       │   ├── useAgent.ts        the executor's poll and the one command
│       │   └── useHolders.ts      the grid's poll, one request set per node, and useNodeProbe
│       ├── panes/
│       │   ├── RunBar.tsx         the figures, the coupon set-up, the release choice, the button
│       │   ├── Holders.tsx        a card per holder, search / filter / sort, and the drawer
│       │   ├── Holder.tsx         the register at /holders, and one holder's own page
│       │   ├── Approver.tsx       the committee at /approvers, and one member's own page
│       │   ├── Privacy.tsx        the per-party check, once per participant
│       │   └── Activity.tsx       the settlement and every refusal, as contracts
│       └── components/
│           ├── Money.tsx          tabular figures; rates keep their extra decimals
│           ├── LegTable.tsx       the schedule, sortable, each leg in one of four states
│           ├── NodeAnswer.tsx     the six counts and the verdict
│           ├── Tabs.tsx
│           ├── CopyId.tsx         an update id or party id, shortened, copied in full on click
│           └── StatusPill.tsx
│
├── quickstart/                     one command, for anyone who wants to run it
│   ├── README.md                  when it is ready, what to press, what is real
│   ├── docker-compose.yml         canton + a one-shot seed + web; prepare behind a profile
│   ├── canton.Dockerfile          the public Canton image, our topology, all thirteen DARs
│   ├── canton.conf                5 participants and a synchronizer, every API on 0.0.0.0
│   ├── bootstrap.canton           connect, upload thirteen DARs, then write /indivisa/ready last
│   ├── seed.Dockerfile            the Daml Script runner, fetched from DA's public registry
│   ├── seed.sh                    seat / prepare; fingerprints the ledger and re-seats if it changed
│   ├── govern.sh                  the approvers: seat / confirm N / execute N / status
│   ├── participants.json          the five JSON APIs inside the compose network
│   ├── web.Dockerfile             the built console on nginx
│   └── nginx.conf                 serves the page, proxies /api/<participant>/ to the five nodes and /decman/ to an approver
│
├── infra/
│   ├── README.md                  what any network needs; LocalNet; DevNet handover
│   ├── demo.ps1                   seat / prepare / attempt, the demo from a shell (-Network)
│   ├── participants-with-parties.ps1   adds every existing party to the runner's map,
│   │                              minting the token twice: once to walk the map, once before writing it
│   ├── settle.ps1                 prepare N legs by script, settle over the JSON API from Node, time it
│   ├── publish-ui.ps1             build the console and gather the read-only deployment into one folder
│   ├── govern.ps1                 the governed settlement against BitSafe's DecMan: admit, propose, confirm, execute, audit
│   ├── localnet/
│   │   ├── localnet.conf          1 synchronizer, 5 participants, in memory
│   │   ├── bootstrap.canton       connect, upload DARs, ping
│   │   ├── participants.json      participants for Daml Script (host, port)
│   │   ├── ui.json                the same five, as JSON Ledger API URLs for the UI
│   │   ├── up.ps1                 start / -Down / -Heap
│   │   └── proofs.ps1             the six proofs and the coupon, one line each
│   ├── devnet/
│   │   ├── participants.example.json   same shape plus access_token, user_id per participant
│   │   ├── ui.example.json        same shape plus token; the real files are git-ignored
│   │   └── nginx.conf.example     the read-only public deployment: TLS, the page, read-only proxying
│   └── bitsafe/                   BitSafe's sandbox as a network: config with its public dev token,
│       └── distribute.ps1         and the DAR distribution through DecMan
│
└── docs/
    ├── modules.md                 this file
    ├── questions.md               the questions people ask, answered with pointers to the evidence
    ├── architecture.md            components, settlement flow, boundaries, settled and open questions
    ├── explainer.html             the story for a beginner, standalone page
    ├── logo.png                   the mark, used by the console and the deck
    ├── benchmark.md               proof 5 results: interpreter to 2,000 legs, LocalNet to 1,000
    ├── canton-coin.md             what a different cash asset would take: nothing in the model, one registry adapter
    ├── devnet-run.md              the DevNet evidence: update id, network, what it proves
    ├── diagrams.md                the templates and their relations; the workflow, start to finish (Mermaid)
    ├── decentralization.md        the governed settlement: risk, before and after, evidence, how to reproduce
    ├── production-readiness.md    the road after the hackathon: hardening, known limits, pilot versus real money
    └── explained-from-zero.md     the whole idea, BitSafe included, from zero: finance words, blockchain, the flow, the vote
```

## `daml/indivisa/`: the model

| Module | Contains | Touches V2 |
|---|---|---|
| `Types.daml` | Vocabulary, no templates: `Isin`, `EventKind` (Coupon / Dividend / Redemption), `RoundingPolicy` (LargestRemainder, RoundHalfUpResidualToIssuer), `PaymentLeg`. | no |
| `Utils.daml` | Our vocabulary in V2 terms: `settlementInfo` (takes the executors), `holderAccount`, `transferLegOf`. Used by the ledger itself (`Run_Settle` derives the transfer legs and the settlement from these), so anything a client builds must agree with them. | **yes** |
| `Model/Payment.daml` | `PaymentProposal` (agent proposes; holder `Accept`s once, or `Decline`s; agent may `Withdraw`) and `PaymentAgreement`. Its one choice, `CreateReceiptAllocation`, lets the paying agent create that holder's receipt allocations, guarded by `ensureIsReceiptAllocation` plus admin and instrument checks; the consent covers settlements the agent executes alone or with an approver (0.4.0). | **yes** |
| `Model/Distribution.daml` | `DistributionRun` (paying agent only; no holder observers) whose `Run_Settle` exercises `SettlementFactory_SettleBatch`, and `DistributionReceipt`, what the agent keeps after a run; both link the `EntitlementSchedule` they pay. `SettlementRejected`, the agent's own record of a refused batch (a refused transaction leaves nothing behind). `runFromSchedule` builds a run leg for leg from a schedule. `approver : Optional Party` (0.4.0): a second executor whose authority the settle needs; `runExecutors` feeds the choice's controllers, the batch's actors and the allocations' executors. Plus `runTotal`, `runSettlementInfo`, `runTransferLegs`. | **yes** |
| `Model/Register.daml` | `Instrument` (registrar signs, issuer observes; ISIN, name, currency, denomination, coupon rate, maturity). `Position` (registrar signs, holder observes: each holder sees only its own; `Position_Transfer`). `RegisterSnapshot`, created by `Instrument_Snapshot`, which verifies every position contract and aggregates per holder. The bond is **not** tokenized. | no |
| `Model/Event.daml` | `CorporateAction` (issuer signs, agent observes): kind, currency, `amountPerUnit`, record and payment dates. `CorporateAction_Entitle` attaches the snapshot and derives the schedule on-ledger; `CorporateAction_Cancel`. | no |
| `Model/Entitlement.daml` | `entitlements`: quantity x amountPerUnit under a `RoundingPolicy`; largest-remainder by default so the legs sum to the announced total exactly; zero entitlements dropped. `EntitlementSchedule` records exact and paid amounts per holder, the policy, and ensures the total. | no |

**Token Standard V2 is touched by `Indivisa.Utils` and `Indivisa.Model.*`, and nothing else.** `Types`, `Register`, `Event` and `Entitlement` are plain Daml. If V2 changes, `Utils`, `Model/Payment` and `Model/Distribution` change.

Rule for what lives in the model: only what the ledger executes or what the ledger's own choices call. Functions used solely by scripts belong in the test package, however product-like they are. The allocation-spec builders are the example: they are the paying agent's client logic, so they sit in `Indivisa.Test.Agent`.

## `daml/indivisa-test/`: scripts

| Module | Holds |
|---|---|
| `Fixtures.daml` | `Cast` (parties), `Cash` (the reference token: rules contract, disclosure, choice context), `setup`, `fund` (simulated cash), balances through the V2 `Holding` interface, `onboard` / `onboardAll`, `threeLegs`, `createRun`, `requestedAt`, `errorText`. Shared by the rest. |
| `Agent.daml` | The paying agent's client moves: `sendAllocationSpec`, `receiptAllocationSpec` and their `run*` forms, `allocateSend`, `allocateReceipt`, `trySettle`, `settle`. A UI or daemon reimplements exactly this sequence. |
| `Distribution.daml` | The proofs, assertions only: batch settles (1), per-holder visibility in single-participant form (2), holders authorise once and the delegation cannot be abused (3), one bad leg settles zero with the rejection recorded (4). Plus the runs the ledger refuses to record (no legs, a leg of nothing, two legs under one id, an account the agent does not own) and the parties that cannot settle one. |
| `Payment.daml` | What the standing agreement does and does not authorise. The two ways a proposal ends without one (decline, withdraw); only the holder may accept and only the agent may withdraw; the account must belong to the holder. Then five refusals, each the passing receipt submission with one field changed: an executor list without the agent, another holder's account as authorizer, `committed = True`, the holder's own holdings as funding, another administrator or another currency. |
| `Event.daml` | The announcement must be payable; only the issuer may cancel and only the paying agent may entitle; and the three refusals that make a schedule's provenance checkable, a snapshot of another instrument, of another record date, or kept by another registrar. The foreign snapshot is disclosed on purpose, so the guard refuses it rather than the visibility rules. |
| `Register.daml` | Positions aggregate and transfer; each holder sees only its own; the snapshot freezes and is verified against real position contracts. Plus the master data the registrar cannot record (no face value, a negative rate, a position of nothing, a snapshot carrying a zero), a transfer that is not positive, and the register as the registrar's book alone. |
| `Entitlement.daml` | The arithmetic: largest remainder hands out the residual cent; half-up lets the total follow; sums are exact across rates and sizes; zero entitlements dropped; the schedule template ensures its total. |
| `Coupon.daml` | The whole chain: register, announcement, snapshot, on-ledger schedule (Charlie gets the residual cent), run from schedule, one settlement, balances equal the schedule, receipt links the schedule, holders never see the schedule or the run. IDE and LocalNet. |
| `Scale.daml` | Proof 5 harness: `scale n` runs the whole day for N holders, `scaleAllocateOnly n` stops before the settle, `scalePrepare` does the same and emits what the JSON API settle client needs (`PreparedOut`). Sizes 3, 10, 50 under `dpm test -p scale`; larger through the runner with an input file, settled by `infra/settle.ps1`. Results in `benchmark.md`. |
| `Demo.daml` | `demo_seat` builds the whole seat: parties with realistic names and heavy-tailed positions, cash, **three bonds** and **six coupons** between them, and the onboarding. `paidCoupon` is the helper that takes one coupon from announcement to settlement and funds itself with exactly what it pays, so the register opens as a book rather than a fixture: the demo bond's live coupon and its governed one, two paid coupons on the second bond, and on the third one paid and one only announced. **Only instruments whose holders the demo never pays carry paid history** - paying the demo bond's own holders in the seat would start them with cash and spoil the card that goes from 0.00 to its amount. It leaves the last holder with a `PaymentProposal` and no `PaymentAgreement`, so the first coupon's settlement is refused for a cause anybody in the industry recognises, and it leaves the **second coupon entitled with no run**, which is what lets one stack carry both the ungoverned and the governed demonstrations. The second bond's coupon is settled in the seat, so the register opens with something finished. Emits a `DemoSeat` JSON for the run and the panes. `demo_attempt` finds or creates the run, creates only the allocations still missing, and settles. `demo_smoke` walks all of it under `dpm test`, both coupons included, and its closing assertion is that the agent is left holding exactly its float. |

## `daml/governance-*`, `daml/indivisa-governance*`: the BitSafe packages

Outside the model package on purpose, so `indivisa` carries no governance dependency; LF 2.2 because BitSafe's interface package is.

| Package | Holds |
|---|---|
| `governance-settlement-v0` | `Governance.Settlement.BatchSettlement.BatchSettlementProposal`: a `GovernableAction` whose `executeImpl` is one V2 `SettlementFactory_SettleBatch`, executed with the governance party's and the proposer's authority. Depends on `governance-action-v1` and the Splice V2 API only. The reusable contribution, in BitSafe's package layout. |
| `indivisa-governance-v0` | `Indivisa.Governance.SettleRunProposal`: the same pattern over `Run_Settle`, so the run is consumed and the receipt written. Forty lines. |
| `indivisa-governance-test` | `Indivisa.Test.Governance` (three members, threshold two: 1 of 3 refused, agent alone refused, 2 of 3 settles, proposer cancel, no-approver unchanged, a proposal with no allocations refused, and only the admitted proposer may file one), `Governance.Settlement.Test.BatchSettlementTest` (the generic module without Indivisa), `Indivisa.Governance.Demo.govern_propose` (the shell-driven proposal). Reuses `indivisa-test`'s cash and agent fixtures. |

## `ui/`: the settlement console

| File | Does |
|---|---|
| `ledger/client.ts` | JSON Ledger API v2 over fetch: ledger end, active contracts by template or interface, submit-and-wait, update-by-offset. One client per party, pointed at its participant; `reading(parties)` returns one that reads several at once. No Java tier. |
| `ledger/queries.ts` | `agentState` (instrument, schedule, run, allocations, rejections, receipt with update id, and the outstanding proposal), `holderState` (one party alone: mine, and the counts of everything else), `nodeHolders` (every holder on one node, in one pass), `factoryDisclosure`, `settle`, `recordRejection`, `proposeSettlement`, `withdrawProposal`, `cancelRun` (`Allocation_Cancel` on the send allocation, which is the only one that locks anything; the actors must be the settlement executors, because the allocation is committed), `executeDisclosures`. Receipts, rejections and the proposal are all matched on ledger offsets, never on the run id alone: a run id is reused and does not identify an outcome. |
| `ledger/decman.ts` | The approvers vote, read and executed through BitSafe Decentralization Manager via the `/decman/` proxy. Deliberately has no `confirm`: an approver confirming in software the proposer wrote and hosts would hollow out the only claim the governed path makes. `committee()` reads the party's members and threshold from `GET /governance/state`, which carries them from the moment the party is deployed, so the release choice can name the real committee **before** a proposal exists; `vote()` cannot, because confirmations only exist once something has been filed. |
| `auth.ts` | Operator sign-in: OIDC authorization code with PKCE, no client secret. One `keep()` writes the token, so the in-memory copy the request headers use can never go stale; `resumeSession` picks up a session on reload and schedules the refresh from the token own `exp`. |
| `state/useAgent.ts` | The executor connection and its commands, held at the top of the app because the header and every tab read from them. `onSettle` branches: a run naming an approver files a request instead of attempting a payment. `onWithdraw` archives a request filed by mistake; `onCancelRun` releases the cash a prepared run locked, offered only where the agent is the sole executor. |
| `state/useVote.ts` | Polls DecMan every three seconds while a request is outstanding. On repeated failure it sets the error **and clears the stale count** - a number nobody can refresh is worse than no number. |
| `state/useHolders.ts` | The grid's poll (one request set per participant, not per holder) and `useNodeProbe`, the deliberately separate per-party read that proves the claim. |
| `App.tsx` | The shell: a three-stage boot (learn whether sign-in is required, complete it, then read the ledger), the sign-in gate, the four desks and their routing, the register rail (one row per coupon, grouped by bond), the working header, the outcome strip, the four tabs of the agent's desk, and the withdraw control. Derives each holder's leg state from the agent's own two reads - who has given settlement instructions, and whose payment is authorised - so the two halves can never be shown from different moments. |
| `panes/RunBar.tsx` | Instrument, holders, per unit, total due, the authorisation meter, the four leg counts beside the button, the coupon set-up panel, the release choice, the run state, the button, and - on an ungoverned run - the cancel control. On a governed run the ask button is disabled while allocations are incomplete: approvers decide whether a payment goes out, not whether the data is ready. A run with no send allocation but holders authorisations still in place is a cancelled run, and says so. A refused cancellation gets its own line rather than the settlement strip: a cancellation that was declined is not a settlement that was rejected. |
| `panes/Holders.tsx` | A card per holder with search, filter and sort, and the drawer that asks one node as one party. Each card carries one of four states - **NO DETAILS**, **TO AUTHORISE**, **READY**, **PAID** - and between them they say whose move it is. Two states would not: a leg that is not ready is held up either by the holder who owes their settlement instructions, which nothing on the agent's screen can fix, or by the agent who has not authorised the payment, which is one button. |
| `panes/Holder.tsx` | `/holders`, the whole register across every bond, and a page per holder read **as that holder from that holder's own node**: their cash, whether their settlement instructions are on file, their positions, and the one action a holder ever takes. There is no sign-in and the page says so: a holder would arrive through their own bank with their own credential, and this demo holds every party's. The agent's screen used to carry a button that supplied a missing holder's details, which is not something a paying agent can do. |
| `panes/Approver.tsx` | `/approvers`, the members of the decentralised party with the threshold read from its own governance rules, and a page per member showing where it stands on the outstanding request. It confirms, and withdraws that confirmation again, through `/decman/<node>/` so both reach **that member's own node** and the contract is one that member signs. There is deliberately no reject: a threshold has no veto, so a member that does not want the payment released simply never confirms, and a button for that would write nothing to the ledger. Withdrawing is the real "no" and it is a ledger event (`GovernanceConfirmation_Cancel`), which is why the vote pairs each confirmation with the member that signed it. The page says plainly that the button would not exist in a deployment, where a member confirms in its own application at its own company. It is here because this package runs the approver nodes with `DECPM_INSECURE` so a judge needs no identity provider, and their own approvals view lists a party's actions only for an authenticated session; on DevNet, behind Keycloak, that view is where a member confirms. Executing stays on the agent's desk, since only the agent's node holds the contracts `executeImpl` needs. |
| `panes/Privacy.tsx` | The same question once per participant, refreshed continuously. |
| `panes/Activity.tsx` | The settlement and every refusal, read back as contracts. |
| `components/*` | `Money` (tabular figures), `LegTable` (every holder, sortable, each leg waiting / ready / paid, and a footer naming whoever is holding the batch up), `NodeAnswer`, `Tabs`, `CopyId`, `StatusPill`. |
| `public/indivisa-logo.png` | The mark, in the dark header bar. |
| `config.ts` | Loads the seat and the party-to-participant map; display names from party ids. |
| `vite.config.ts` | Dev proxy per participant from `infra/<network>/ui.json`, bearer tokens minted and refreshed server-side (ledger by client credentials, DecMan from a stored refresh token); serves the seat and the party map at `/demo/*`, reduced to what the page may see. Also `operatorGate()`: registered from `configureServer`, which Vite runs **before** its own proxy, so an unauthenticated `/api/` or `/decman/` request is refused on the way in. The operator token is verified against the realm published keys, checked to have been issued to this client, and then deleted from the request rather than forwarded. |
| `scripts/settle.ts` | The same `settle` call as the button, run from Node against `infra/<network>/ui.json` directly (no proxy; adds the bearer header itself). `infra/settle.ps1` bundles it with esbuild and runs it after a script-side prepare; it is how the benchmark times submit to commit without the Daml Script runner. |

## `quickstart/`: run it with one command

Docker, for anyone who wants to see it work without a toolchain. Build context is the repository root, so the images carry the same DARs and the same scripts the proofs run.

| File | Does |
|---|---|
| `docker-compose.yml` | Three services: `canton`, a one-shot `seed`, `web`. `prepare` is a fourth, behind the `manual` profile, that reuses the seed image. The seed and the page share a `demo` volume. |
| `canton.Dockerfile`, `canton.conf`, `bootstrap.canton` | Canton 3.5 on the public image, five participants and a synchronizer in one container, every API bound to `0.0.0.0`. The bootstrap uploads all thirteen DARs (the eight Splice ones, `indivisa`, and the governance layer (BitSafe's two plus our `indivisa-governance-v0` and `governance-settlement-v0`), 57 packages once dependencies are counted) and writes `/indivisa/ready` **last**: the compose healthcheck waits for that file, because the API answers while the uploads are still running. |
| `seed.Dockerfile`, `seed.sh` | The Daml Script runner (fetched at build time from Digital Asset public registry as an OCI blob, or `--build-arg SCRIPT_SOURCE=local`) running `Indivisa.Test.Demo`. `seat` creates the parties, **three bonds and six coupons**, the onboarding, then the first coupon's run and every payment it can authorise. The second coupon is entitled and deliberately left without a run, which is what lets one stack carry both demonstrations: the first is released by the paying agent alone and the second by the approvers, and the page decides which when it creates each run. There is no `INDIVISA_GOVERNED` any more. One holder is left with a `PaymentProposal` and no `PaymentAgreement`, so the agent has nowhere to send their money and the first press is refused; that holder provides their settlement instructions on their own page, and the agent authorises from its own. `prepare` is the same step from the terminal. The party map is rebuilt from the ledger each time, because the runner only routes parties it allocated itself. |
| | The seat outlives the ledger (`docker compose down` keeps the volume) so the seed fingerprints the ledger with the agent participant id and re-seats when it does not match. Without that, a second `up` serves a seat whose parties no longer exist. |
| `web.Dockerfile`, `nginx.conf` | The built page on nginx, which also proxies `/api/<participant>/` to the five JSON Ledger APIs. It injects the demo bearer token, so the browser never holds a credential. `/decman/` reaches the first approver node for reads and the execute, and `/decman/1|2|3/` reaches one node each, because a confirmation is signed by one member on that member's own node. Every one of them is resolved per request through Docker's embedded DNS, so the ungoverned stack boots with no approver present. `--build-arg UI_SOURCE=prebuilt` takes `ui/dist` from the host instead of running npm in the container. |
| `participants.json` | The five JSON API endpoints inside the compose network, before party routing is added. |
| `govern.sh` | The governed settlement inside the package: `seat` builds the decentralised party (peer mesh, onboarding at threshold 2, member parties, governance rules, admitting the agent as proposer), then `confirm N`, `execute N`, `status`. **No `prepare` or `propose`:** both were hardwired to the seat's own schedule, which is the first coupon, and the first coupon is settled by the paying agent alone before anybody reaches the governed demonstration. The page sets the second coupon up and files the request; `confirm` and `execute` find the newest `SettleRunProposal` on the ledger, so they act on it whoever filed it. A port of BitSafe's `hackathon/seed.sh` and our `infra/govern.ps1` onto this topology; it skips their DAR-distribution step because `bootstrap.canton` has already vetted everything. |
| three `decman-*` services | BitSafe's Decentralization Manager `v1.8.0`, unmodified, one per holding participant, all behind the `govern` compose profile so `docker compose up` is unchanged. About 150 MB each. |
| `README.md` | For whoever runs it: when it is ready, what to press, what is real and what is simulated, and the optional governed run. |

## `contrib/bitsafe/`: what we are giving back

Two pull requests and one design issue for `github.com/DLC-link/decentralization-manager`, following their `docs/CONTRIBUTING.md`. Both pull requests are through two review rounds, with nothing outstanding on our side.

| File | Does |
|---|---|
| `README.md` | What was submitted, when, the decisions behind each one, and what each review round changed |
| `INTEGRATING.md` | The documentation PR itself: seven things not in their docs, each found the hard way while pointing DecMan at our own Canton. A verbatim copy of the page as it stands on #516, so it keeps their 80-column style rather than ours |
| `member-governed-cancel-design.md` | Issue #518: retiring a proposal whose proposer can no longer act. Five design questions and an offer to implement, rather than a pull request that implicitly says merge this |

**There is no copy of the module here.** An earlier draft kept one under `contrib/bitsafe/module/` and it drifted: its test still imported Indivisa's fixtures after the submitted one had been cut loose from them. The code that was contributed is the code that builds, `daml/governance-settlement/` and `daml/governance-settlement-test/`, and nothing is kept in step by hand.

## Not built, deliberately

- **No Java.** An optional paying-agent daemon only if ahead of schedule; first to be cut.
- **No bond tokenization.** Cash only.
- **No announcement-data layer.** Chainlink and DTCC own that; Indivisa is the payment layer.
- **No registry adapters.** Demo data is synthetic and labelled as such.

About 620 lines of Daml in the model, 150 in the two governance packages and 2,270 in scripts; 3,174 of TypeScript and 373 of CSS; 2,060 of PowerShell, Canton config, shell and Docker, `quickstart/` included (recounted 2 Oct, after the governed console actions and operator sign-in).
