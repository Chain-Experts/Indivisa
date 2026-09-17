# Infrastructure

Two targets. LocalNet is what the proofs and benchmarks run on today. DevNet is
the evidence run for the submission and is handed to DevOps; this page is
written so that handover needs no Daml knowledge.

## What Indivisa needs from any network

Nothing exotic. Any Canton participant on protocol version 34 or later that
can host parties and accept DAR uploads, connected to a synchronizer.

| Need | Value |
|---|---|
| Canton | 3.5.x participant (LocalNet uses 3.5.17). LF 2.1 packages. |
| Packages to upload | the ten DARs in `daml/dars/` (Token Standard V2 from Splice 0.8.1, plus `splice-test-token-v2`, the reference cash) and `daml/indivisa/.daml/dist/indivisa-0.1.0.dar` |
| Parties | one cash registry, one paying agent, N holders. Privacy needs holders on participants **other than** the agent's; ideally each custodian on its own node. |
| Ledger API | gRPC, one per participant, for Daml Script. JSON Ledger API for the UI. |
| Auth | none on LocalNet. On DevNet whatever the validator enforces; Daml Script takes `--access-token-file`. |
| Time | participants assign ledger time at submission; nothing to configure. |

There is no off-ledger service. The paying agent's client is a Daml Script
(`Indivisa.Test.Agent`) run from a laptop; the UI reads the JSON Ledger API
directly.

## LocalNet

One JVM, in memory: a BFT sequencer, a mediator, five participants. The
Canton binary is the one dpm already installed; nothing is downloaded.

```
pwsh infra/localnet/up.ps1          # start, wait until bootstrapped (~5 min: DAR uploads)
pwsh infra/localnet/up.ps1 -Down    # stop
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
- `localnet/participants.json` — the map Daml Script needs to put each party
  on its participant (`--participant-config`).
- `localnet/log/` — `canton.log`, stdout, stderr, pid. Ignored by git.

Run the proofs against it (from `daml/indivisa-test`, after `dpm build --all`):

```
echo "\"LocalNet\"" > localnet.json
dpm script --dar .daml/dist/indivisa-test-0.1.0.dar \
  --script-name Indivisa.Test.Distribution:proof1With \
  --input-file localnet.json \
  --participant-config ../../infra/localnet/participants.json
```

The same for `proof2With`, `proof3With`, `proof3bWith`, `proof4With`,
`proof4bWith`. For the benchmark, `Indivisa.Test.Scale:scaleWith` with
`{"topology":"LocalNet","holders":500}` and `JAVA_TOOL_OPTIONS=-Xss64m` (the
script runner's own stack, see `docs/benchmark.md`).

Things learned on 17 September that a fresh reader will hit:

- Parties on different participants cannot co-sign one command; every step
  is a single-party submission. Funding therefore goes through the token's
  own mint (`TokenRules_OfferMint` by the registry, accepted by the agent).
- Participants learn of transactions independently. After any handoff to a
  party on another participant the script waits until that party can see the
  contract (`awaitVisible` and friends in `Indivisa.Test.Fixtures`). Without
  that, the second command fails with `CONTRACT_NOT_FOUND`.
- Party names carry a time tag on LocalNet so scripts can be re-run against
  a ledger that still holds earlier runs.
- **The script runner only knows where a party lives if it allocated that
  party in the same run.** Any party that already exists must be listed in
  `party_participants`, or its submissions go to the default participant and
  fail with `NO_SYNCHRONIZER_ON_WHICH_ALL_SUBMITTERS_CAN_SUBMIT`.
  `participants-with-parties.ps1` reads every participant's JSON Ledger API
  and writes that map. This matters for DevNet too: the holders' parties
  exist before the script does.
- One JVM for five nodes wants heap. At 4 GB it sat at 3.9 GB after a few
  hundred parties and thousands of contracts and settle times inflated;
  `up.ps1 -Heap 12g`.
- The sequencer's `maxRequestPayloadBytes` is 10 MB by default. That is the
  hard ceiling candidate for one batch.

For a demo that must survive a restart, switch the participants' storage to
Postgres in `localnet.conf`; nothing else changes.

## DevNet (handover)

Goal: one real distribution on DevNet, its update id and receipt captured as
evidence. Everything below is config; no code changes are expected.

1. **A validator node on DevNet**, the standard Splice validator deployment
   (Docker Compose or Helm). Confirm with NODERS which DevNet carries Token
   Standard V2 today: regular DevNet, or the June "Token Standard V2 DevNet"
   (single SV, protocol version 35, `alpha-version-support`). LocalNet runs
   PV 35 already.
2. **Upload the DARs** from `daml/dars/` and `indivisa-0.1.0.dar` through the
   participant's admin API, exactly as `bootstrap.canton` does locally.
3. **Parties.** For evidence, one validator hosting all parties is acceptable
   and simplest. For the privacy claim on DevNet, a second validator for the
   holders is what makes it real; the topology file for Daml Script then
   lists both participants.
4. **Cash.** `TestTokenV2` is uploaded like any package and its registry party
   is ours, so no dependency on Canton Coin or on anyone else's asset. If a
   Canton Coin run is wanted later, that is a separate decision (see
   `TASKS.md`, open decisions).
5. **Run.** `participants.json` with the validator's ledger API host, port and
   token file; then the same `dpm script` commands as above with
   `--access-token-file`.
6. **Capture.** The `DistributionReceipt` contract id and the update id of the
   `Run_Settle` transaction, from the ledger API or the validator's console.

What NOT to do: do not point the scripts at DevNet while developing. LocalNet
is free, instant to reset and under our control; DevNet costs traffic and
uptime we do not own.
