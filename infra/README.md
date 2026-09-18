# Infrastructure

Two networks, one layout. LocalNet is what the proofs and benchmarks run on
today. DevNet is the evidence run for the submission and is handed to DevOps;
this page is written so that handover needs no Daml knowledge.

```
infra/
├── demo.ps1                        seat / prepare / attempt   -Network localnet|devnet
├── participants-with-parties.ps1   regenerates the runner's party map        -Network
├── localnet/   participants.json, ui.json, localnet.conf, bootstrap.canton, up.ps1, proofs.ps1
└── devnet/     participants.example.json, ui.example.json   (copy, fill in, keep out of git)
```

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
| Packages to upload | the ten DARs in `daml/dars/` (Token Standard V2 from Splice 0.8.1, plus `splice-test-token-v2`, the reference cash) and `daml/indivisa/.daml/dist/indivisa-<version>.dar` |
| Parties | one cash registry, one paying agent, N holders; the scripts create them. Privacy needs holders on a participant **other than** the agent's. |
| Ledger API | gRPC, one per participant, for Daml Script. JSON Ledger API for the UI. |
| Auth | none on LocalNet. On DevNet whatever the validator enforces: a bearer token per participant in both files. |
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

- `localnet/localnet.conf` — the topology. Ports as above; `storage.type = memory`.
- `localnet/bootstrap.canton` — starts the nodes, bootstraps the synchronizer,
  connects every participant, uploads the DARs, pings across.
- `localnet/participants.json`, `localnet/ui.json` — as above, no tokens.
- `localnet/log/` — `canton.log`, stdout, stderr, pid, proof logs. Ignored by git.

To run one proof by hand (from `daml/indivisa-test`, after `dpm build --all`):

```
echo "\"LocalNet\"" > localnet.json
dpm script --dar .daml/dist/indivisa-test-0.1.0.dar \
  --script-name Indivisa.Test.Distribution:proof1With \
  --input-file localnet.json \
  --participant-config ../../infra/localnet/participants.json
```

The same for `proof2With`, `proof3With`, `proof3bWith`, `proof4With`,
`proof4bWith`, `Indivisa.Test.Coupon:couponWith`. For the benchmark,
`Indivisa.Test.Scale:scaleWith` with `{"topology":"LocalNet","holders":500}`
and `JAVA_TOOL_OPTIONS=-Xss64m` (the script runner's own stack, see
`docs/benchmark.md`).

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
  hundred parties and thousands of contracts and settle times inflated;
  `up.ps1 -Heap 12g`.
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
run and the four panes need. Each attempt writes its outcome next to it.
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
package name, not a version (see `CLAUDE.md`).

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
   reachable from the machine that will run the scripts. Two validators if
   the privacy claim is to be shown on DevNet (holders on the second one);
   one is enough for the evidence run.
2. **Upload the DARs**: the ten in `daml/dars/` and
   `daml/indivisa/.daml/dist/indivisa-<version>.dar` (built with
   `dpm build --all` from the repo root; current version in
   `daml/indivisa/daml.yaml`). Either through the validator's console
   (`participant.dars.upload`, as `localnet/bootstrap.canton` does) or over
   the JSON Ledger API, `POST <jsonApi>/v2/packages` with the DAR as
   `application/octet-stream` and the bearer token. Repeat on every validator.
3. **A ledger user** on each validator with `ParticipantAdmin`, so the
   scripts can allocate parties; the runner grants that user act-as rights
   on each party it allocates (that is what `user_id` in `participants.json`
   is for). The bearer token for that user goes into both config files.
4. **Config.** Copy `infra/devnet/participants.example.json` to
   `participants.json` and `ui.example.json` to `ui.json`, fill in host,
   port, `access_token`, `user_id` and `jsonApi`. Both real files are
   git-ignored; never commit them.
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
8. **The four panes on DevNet**, optional:
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

### The four panes

```
cd ui && npm install
$env:INDIVISA_TAG = "sep18"; npm run dev    # http://localhost:5173, LocalNet
```

The button on the paying agent's pane submits `Run_Settle` over the JSON
Ledger API; `demo.ps1 prepare` runs before it (allocations), not `attempt`
(which would settle from the script). See `ui/README.md`.
