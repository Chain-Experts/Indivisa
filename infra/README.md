# Infrastructure

Two networks, one layout. LocalNet is what the proofs and benchmarks run on
today. DevNet is the evidence run for the submission and is handed to DevOps;
this page is written so that handover needs no Daml knowledge.

A third way to run the whole thing needs none of this: `quickstart/` packages the
network, the seat and the console into `docker compose up`. It is for
someone who wants to see it work, not for development or for evidence,
LocalNet is faster to iterate on and DevNet is what a judge will believe.

```
infra/
├── demo.ps1                        seat / prepare / attempt   -Network localnet|devnet
├── participants-with-parties.ps1   regenerates the runner's party map        -Network
├── settle.ps1                      the benchmark client: prepare N legs, settle over the JSON API, time it
├── govern.ps1                      the governed settlement against BitSafe's DecMan (admit, propose, confirm, execute, audit)
├── publish-ui.ps1                  build the console and gather the read-only public deployment into one folder
├── localnet/   participants.json, ui.json, localnet.conf, bootstrap.canton, up.ps1, proofs.ps1
├── devnet/     participants.example.json, ui.example.json   (copy, fill in, keep out of git)
│            nginx.conf.example   the read-only public deployment for judges
└── bitsafe/    BitSafe's sandbox as a network: participants.json, ui.json (its public dev token), distribute.ps1
```

**Uploading the packages from CI.** `.github/workflows/actions.yml` is the
DevOps path: run it by hand from the Actions tab, pick the network, and it
takes a token from Keycloak and POSTs each DAR to that network's participant
at `/v2/dars` (a real route on the JSON Ledger API; the participant ignores
the content type). It uploads the ten Splice DARs and BitSafe's two. It does
**not** upload ours: `indivisa-0.4.0.dar` is committed at
`daml/indivisa/indivisa-0.4.0.dar` for exactly this, but no step references
it, and nothing settles without it. See step 2 below.

Every network is a directory with two files:

| File | Read by | Holds |
|---|---|---|
| `participants.json` | Daml Script (`--participant-config`) | per participant: `host`, `port` of the gRPC Ledger API, and on DevNet `access_token`, `user_id` |
| `ui.json` | the dev server and `participants-with-parties.ps1` | per participant: `jsonApi` base URL and, on DevNet, `token` |

The five participant **names** are fixed by the scripts: `registry`, `agent`,
`alice`, `bob`, `charlie`. On LocalNet they are five nodes. On DevNet they are
keys that may point at the same validator; the scripts do not care. The
scripts' `"LocalNet"` topology means "named participants, one party per
command", so nothing in Daml changes between the two networks.

Tokens never reach the browser: the dev server adds the bearer header on the
way through its proxy, and the party map it serves is reduced to
party -> participant before it leaves the server.

## What Indivisa needs from any network

Nothing exotic. Any Canton participant on protocol version 34 or later that
can host parties and accept DAR uploads, connected to a synchronizer.

| Need | Value |
|---|---|
| Canton | 3.5.x participant (LocalNet uses 3.5.17). LF 2.1 packages. |
| Splice (validator) | whatever DevNet mandates today (0.8.x), never below 0.6.11 (first release with Token Standard V2). Built and tested against 0.8.1; the V2 DARs are byte-identical through 0.8.3 (Canton 3.5.18), checked 18 Sep. DevNet's JSON API reports Canton **3.5.17** (measured 23 Sep at the DevNet JSON API `/v2/version`), so the paged active-contracts endpoint is available there. |
| Packages to upload | the ten DARs in `daml/dars/` (Token Standard V2 from Splice 0.8.1, plus `splice-test-token-v2`, the reference cash) and `daml/indivisa/.daml/dist/indivisa-<version>.dar` |
| Parties | one cash registry, one paying agent, N holders; the scripts create them. Privacy needs holders on a participant **other than** the agent's. |
| Ledger API | gRPC, one per participant, for Daml Script. JSON Ledger API for the UI. |
| Auth | none on LocalNet. On DevNet whatever the validator enforces: a bearer token per participant in both files, and `-User <ledger user>` on `demo.ps1` and `settle.ps1` so the scripts grant that user act-as rights on every party they allocate (the runner does not). |
| Time | participants assign ledger time at submission; nothing to configure. |

There is no off-ledger service. The paying agent's client is a Daml Script
(`Indivisa.Test.Agent`, driven by `demo.ps1`) run from a laptop; the UI reads
the JSON Ledger API directly.

## LocalNet

One JVM, in memory: a BFT sequencer, a mediator, five participants. The
Canton binary is the one dpm already installed; nothing is downloaded.

```
pwsh infra/localnet/up.ps1 -Heap 12g   # start, wait until bootstrapped (~5 min: DAR uploads)
pwsh infra/localnet/up.ps1 -Down       # stop
pwsh infra/localnet/proofs.ps1         # the six proofs and the coupon chain, one line each
```

| Node | Ledger API | Admin API | JSON API |
|---|---|---|---|
| registry (cash) | 5011 | 5012 | 5013 |
| agent (paying agent) | 5021 | 5022 | 5023 |
| alice | 5031 | 5032 | 5033 |
| bob | 5041 | 5042 | 5043 |
| charlie | 5051 | 5052 | 5053 |
| sequencer1 | public 5001 | 5002 | |
| mediator1 | | 5202 | |

Files:

- `localnet/localnet.conf`: the topology. Ports as above; `storage.type = memory`.
- `localnet/bootstrap.canton`: starts the nodes, bootstraps the synchronizer,
  connects every participant, uploads the DARs, pings across.
- `localnet/participants.json`, `localnet/ui.json`: as above, no tokens.
- `localnet/log/`: `canton.log`, stdout, stderr, pid, proof logs. Ignored by git.

To run one proof by hand (from `daml/indivisa-test`, after `dpm build --all`):

```
echo "\"LocalNet\"" > localnet.json
dpm script --dar .daml/dist/indivisa-test-0.1.0.dar \
  --script-name Indivisa.Test.Distribution:proof1With \
  --input-file localnet.json \
  --participant-config ../../infra/localnet/participants.json
```

The same for `proof2With`, `proof3With`, `proof3bWith`, `proof4With`,
`proof4bWith`, `Indivisa.Test.Coupon:couponWith`.

For the benchmark, `pwsh infra/settle.ps1 -Holders 500`: the script prepares
N legs on the reused `Holder-*` parties (`Indivisa.Test.Scale:scalePrepare`),
then a Node client settles over the JSON Ledger API and prints submit to
commit. Do not time the settle from inside a script: the Daml Script runner
takes minutes to digest a large transaction tree after the ledger has
committed it (`docs/benchmark.md`).

Things learned on 17 September that a fresh reader will hit:

- Parties on different participants cannot co-sign one command; every step
  is a single-party submission. Funding therefore goes through the token's
  own mint (`TokenRules_OfferMint` by the registry, accepted by the agent).
- Participants learn of transactions independently. After any handoff to a
  party on another participant the script waits until that party can see the
  contract (`awaitVisible` and friends in `Indivisa.Test.Fixtures`). Without
  that, the second command fails with `CONTRACT_NOT_FOUND`.
- Party names carry a time tag so scripts can be re-run against a ledger
  that still holds earlier runs.
- **The script runner only knows where a party lives if it allocated that
  party in the same run.** Any party that already exists must be listed in
  `party_participants`, or its submissions go to the default participant and
  fail with `NO_SYNCHRONIZER_ON_WHICH_ALL_SUBMITTERS_CAN_SUBMIT`.
  `participants-with-parties.ps1` reads every participant's JSON Ledger API
  and writes that map; `demo.ps1` runs it before every command. This matters
  for DevNet too: the seat's parties exist before the attempt does.
- One JVM for five nodes wants heap. At 4 GB it sat at 3.9 GB after a few
  hundred parties and thousands of contracts; `up.ps1 -Heap 12g`. (The
  slow settles first blamed on the heap were the script runner, not the
  ledger; see `docs/benchmark.md`.)
- The sequencer's `maxRequestPayloadBytes` is 10 MB by default. That is the
  hard ceiling candidate for one batch.

### The demo

```
pwsh infra/demo.ps1 seat    -Holders 250 -Tag sep18   # once: parties, register, onboarding, schedule
pwsh infra/demo.ps1 attempt -Tag sep18 -Withhold 1    # rejected: one holder not ready, 0 of 250 executed
pwsh infra/demo.ps1 attempt -Tag sep18                # settled: 250/250
```

Add `-Network devnet` to every line for DevNet. The seat writes
`infra/<network>/demo/seat-<tag>.json` with every party and contract id the
run and the console need. Each attempt writes its outcome next to it.
Party names are `<Name>-<tag>`, e.g. `Meridian-Paying-Agent-sep18`,
`Pine-Pension-Fund-sep18`, `Maya-Lindqvist-sep18`; pick a new tag to seat
again on the same ledger. Names and position sizes are synthetic.

Seating cost is party creation (~5 to 7 s each), so 250 holders takes
25 to 30 minutes; the attempts take seconds to tens of seconds.

### Updating the model on a running LocalNet

Bump `version` in `daml/indivisa/daml.yaml`, `dpm build --all`, check the
upgrade, upload to every participant over the JSON Ledger API:

```
dpm upgrade-check --both <previous>.dar daml/indivisa/.daml/dist/indivisa-<new>.dar
curl -X POST http://localhost:5013/v2/packages -H "Content-Type: application/octet-stream" \
  --data-binary @daml/indivisa/.daml/dist/indivisa-<new>.dar      # and 5023, 5033, 5043, 5053
```

Canton refuses a second package with the same name and version
(`KNOWN_PACKAGE_VERSION`); a change the upgrade check rejects needs a new
package name, not a version: the `name` in `daml.yaml` is the Smart Contract Upgrade identity, and a change the upgrade check rejects starts a new lineage (`indivisa-v2`).

For a demo that must survive a restart, switch the participants' storage to
Postgres in `localnet.conf`; nothing else changes.

## DevNet (handover)

Goal: one real distribution on DevNet, its update id and receipt captured as
evidence. Everything below is config; no code changes are expected.

**Before you start.** Confirm with NODERS which DevNet carries Token Standard
V2 today: regular DevNet, or the June "Token Standard V2 DevNet" (single SV,
protocol version 35, `alpha-version-support`). LocalNet runs PV 35 already.
The V2 interface packages must be vetted on the validator, which step 2 does.

### Checklist

1. **A validator node on DevNet**, the standard Splice validator deployment
   (Docker Compose or Helm), with its Ledger API (gRPC) and JSON Ledger API
   reachable from the machine that will run the scripts.

   **There is one validator, and that is settled** (23 Sep): Chain-Experts
   runs DevNet, TestNet and MainNet, each on a different version and for a
   different purpose, not several validators on one network. So all five
   participant names point at the same node, which the scripts have always
   allowed. What it costs is the strong form of the privacy claim: on one
   node the ledger declines to hand one party another party's contracts,
   which is real and enforced by Canton, but it is not "the data never
   arrived". The console reads each participant's own id from
   `/v2/parties/participant-id` and says whichever of the two is true, so
   nothing has to be remembered at demo time. The strong claim stays where
   it is honest: the local run and `quickstart/`, both with five participants.
2. **Upload the DARs**: the ten in `daml/dars/` **and ours**,
   `daml/indivisa/indivisa-0.4.0.dar` (committed; identical to
   `daml/indivisa/.daml/dist/`, which `dpm build --all` produces. The
   current version is in `daml/indivisa/daml.yaml`). Either through the
   validator's console (`participant.dars.upload`, as
   `localnet/bootstrap.canton` does) or over the JSON Ledger API,
   `POST <jsonApi>/v2/packages` or `/v2/dars` with the bearer token: both
   routes work on Canton 3.5. Repeat on every validator.

   The CI workflow does the twelve third-party DARs and stops there, so
   **add a step for ours** or the run fails with PACKAGE_SELECTION_FAILED at
   the first command:

   ```yaml
   - name: deploy dar indivisa
     run: |
       curl -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/octet-stream" --data-binary @daml/indivisa/indivisa-0.4.0.dar --expand-url "http://participant.${{ github.event.inputs.net_name }}.svc.cluster.local:7575/v2/dars"
   ```

   The BitSafe challenge needs two more on top:
   `indivisa-governance-v0-0.1.0.dar` and `governance-settlement-v0-0.1.0.dar`
   from `daml/*/.daml/dist/`. Neither is committed yet, so commit them the
   same way before adding their steps.
3. **A ledger user** on each validator with `ParticipantAdmin`, so the
   scripts can allocate parties; the runner grants that user act-as rights
   on each party it allocates (that is what `user_id` in `participants.json`
   is for). The bearer token for that user goes into both config files.
4. **Config.** Copy `infra/devnet/participants.example.json` to
   `participants.json` and `ui.example.json` to `ui.json`, fill in host,
   port, `access_token`, `user_id` and `jsonApi`. Both real files are
   git-ignored; never commit them. If the JSON API is HTTPS with a private
   or self-signed certificate (usual behind a VPN), set `"insecureTls": true`
   in `ui.json`. If the gRPC Ledger API is behind TLS, add `-Tls` (and
   `-CaCrt <file>` for a private CA) to every `demo.ps1`, `settle.ps1` and
   `proofs.ps1` call below.
5. **Smoke.** `pwsh infra/participants-with-parties.ps1 -Network devnet`
   must print a party count (0 is fine) for every participant name. If it
   warns "cannot reach", the JSON API URL or token is wrong.
6. **Seat and run.**
   ```
   pwsh infra/demo.ps1 seat    -Network devnet -Holders 250 -Tag devnet1
   pwsh infra/demo.ps1 attempt -Network devnet -Tag devnet1 -Withhold 1   # rejected, on purpose
   pwsh infra/demo.ps1 attempt -Network devnet -Tag devnet1               # settled
   ```
   Use a smaller `-Holders` first (say 8) to prove the path, then 250.
7. **Capture and send back.** From `infra/devnet/demo/`: `seat-devnet1.json`
   and the two `attempt-devnet1-*.json` files. The settled one carries
   `receiptCid`, `legsSettled`, `total`, `settleMs`; the rejected one carries
   `reason`. Also the **update id** of the settle transaction: the UI shows
   it, or query the agent's JSON API for the `DistributionReceipt` and read
   `updateId` from `POST /v2/updates/update-by-offset` at its offset. Those
   are the evidence.
8. **The console on DevNet**, optional:
   `INDIVISA_NETWORK=devnet INDIVISA_TAG=devnet1 npm run dev` in `ui/`
   (PowerShell: `$env:INDIVISA_NETWORK="devnet"; $env:INDIVISA_TAG="devnet1"`).
   Run `demo.ps1 prepare -Network devnet -Tag devnet1` instead of `attempt`
   so the button on screen does the settle.

What NOT to do: do not point the scripts at DevNet while developing. LocalNet
is free, instant to reset and under our control; DevNet costs traffic and
uptime we do not own. And do not use Canton Coin as the cash: `TestTokenV2`
is uploaded like any package and its registry party is ours, so there is no
dependency on anyone else's asset (see `TASKS.md`, open decisions, for the
Canton Coin question).

## BitSafe's sandbox (the governed settlement)

The third network, `infra/bitsafe/`, is BitSafe's Decentralization Manager
sandbox: Splice LocalNet 0.6.12 (Canton 3.5.8, three participants in one
container) plus three DecMan nodes, brought up by their `hackathon/up.sh`
and seeded by `seed.sh`. Its ledger token is the public LocalNet dev token
from their repository, so the config is committed. Steps, in order, from a
clean clone: `docs/decentralization.md`, section 6. In short:
`bitsafe/distribute.ps1` (our DARs to all three nodes), `demo.ps1 seat
-Network bitsafe -User ledger-api-user`, `govern.ps1 admit`, `demo.ps1
prepare -Approver <party>`, `govern.ps1 propose | confirm | execute | audit`.
Run on 22 September: one confirmation refused, two settled.

Docker wants 12 GB; stop our LocalNet or start it with `-Heap 6g` while
the sandbox is up.

### The console

```
cd ui && npm install
$env:INDIVISA_TAG = "sep18"; npm run dev    # http://localhost:5173, LocalNet
```

The button on the paying agent's pane submits `Run_Settle` over the JSON
Ledger API; `demo.ps1 prepare` runs before it (allocations), not `attempt`
(which would settle from the script). See `ui/README.md`.
