# Benchmark — how many legs fit in one CIP-112 batch

Proof 5. Nobody has published this number. Whatever it turns out to be, it goes
here and to the Canton forum.

Two kinds of measurement, kept apart:

1. **Interpreter (Daml Script, IDE ledger).** No network, no size limits. Tells
   us whether the settlement logic is linear in N and where the client falls
   over. Done 17 September 2026, below.
2. **Participant (LocalNet, then DevNet).** Real transaction bytes, view
   count, submission-to-commit latency, and the actual ceiling. Started 17
   September on LocalNet, section 2.

Everything here is `TestTokenV2` as the cash instrument, one committed send
allocation carrying all N legs, N receipt allocations created by the paying
agent under the holders' agreements, one `SettlementFactory_SettleBatch`.

---

## 1. Interpreter, 17 September 2026

### Method

`Indivisa.Test.Scale.scale n` runs the paying agent's whole day for N holders:
N `allocateParty`, fund the agent, N proposals, N acceptances, the run, 1 send
allocation, N receipt allocations, one settle, spot-check balances.
`scaleAllocateOnly n` is the same script stopped before the settle. The
difference is the cost of the one transaction in the interpreter.

Runner: `dpm script --ide-ledger --static-time` (static time is required; see
`Indivisa.Test.Fixtures.requestedAt`). Each size is a fresh JVM. Wall time is
`Measure-Command` in PowerShell on a Windows 11 workstation, dpm-sdk 3.5.10,
Splice 0.8.1 DARs. Client JVM given `-Xss64m -Xmx4g` (see "client stack"
below); the same flags were used for every row.

```
dpm script --dar .daml/dist/indivisa-test-0.1.0.dar \
  --script-name Indivisa.Test.Scale:scale --input-file n.json \
  --ide-ledger --static-time
```

### Results

| N holders | Allocate only | Full day | **Settle** (difference) | Settle per leg | Allocations settled |
|---|---|---|---|---|---|
| 250 | 16.1 s | 17.2 s | **1.1 s** | 4.4 ms | 251 |
| 500 | 20.1 s | 22.2 s | **2.1 s** | 4.2 ms | 501 |
| 1000 | 34.6 s | 39.3 s | **4.7 s** | 4.7 ms | 1001 |
| 2000 | 84.3 s | 92.1 s | **7.8 s** | 3.9 ms | 2001 |

Every row settled every leg: first and last holder at their exact amounts,
the agent back to its float, nothing left locked. Sizes 3, 10 and 50 run under
`dpm test -p scale` (24 s for all three, including compilation).

### What this says

- **The settlement is linear in N.** About 4 ms per leg in the interpreter,
  flat from 250 to 2000. The standard's default `SettleBatch` implementation
  builds sets over every leg side and checks uniqueness; none of that turned
  out quadratic at these sizes.
- **One send allocation can carry 2,000 legs.** The token accepted a single
  committed allocation with 2,000 `transferLegSides`. So the batch is N+1
  allocations, not 2N.
- **The whole-day growth is the client and the in-memory ledger, not the
  settle.** 6,000 submissions and 2,000 party allocations against the IDE
  ledger's store account for the 84 s at N = 2000.

### Client stack

At N = 2000 the script runner died with `java.lang.StackOverflowError` in its
free-monad interpreter (`Free$Result$Ask.transform`): a `forA` over 2,000
submissions builds a continuation chain deeper than the default JVM thread
stack. `JAVA_TOOL_OPTIONS=-Xss64m` lifts it. This is the **client**, not the
ledger. On LocalNet the same runner is our client, so either keep the flag or
chunk the allocation loop; the paying agent's real client would batch anyway.

### What this cannot say

- The ceiling. The IDE ledger has no transaction size limit and no
  synchronizer. A real participant enforces a maximum request size, the
  sequencer enforces its own, and confirmation latency grows with views.
- Bytes and views. CIP-0120 assumes ~100 bytes per view and root + 2 per
  leg; with our shape it is root + (N+1) allocation settles plus the holding
  archives and creates. Measured only on a participant.
- Whether the cash registry becomes the bottleneck. It confirms every leg in
  its instrument; in the interpreter there is nothing to confirm.

---

## 2. LocalNet, 17 September 2026 — in progress

Same scripts, real participants: `infra/localnet/` (Canton 3.5.17, protocol
version 35, one BFT sequencer, one mediator, five participants in one JVM on
one workstation, in-memory storage). Registry, agent and each of the three
holder nodes are separate participants; scale-run holders are spread
round-robin over the three holder nodes.

### Method

`Indivisa.Test.Scale:scaleWith` with `{"topology":"LocalNet","holders":N}`
and `--participant-config infra/localnet/participants.json`. The settle's
submission-to-commit time is bracketed inside the script (`getTime` is wall
time on a participant). Request size and envelope count come from the
sequencer's own INFO log line for the agent's submission:

```
GrpcSequencerService ... 'PAR::agent::...' sends request with id '...'
  of size 101449 bytes with 7 envelopes.
```

The settle is the agent's largest request in the run by a wide margin, so it
is unambiguous. Envelopes are per recipient node (mediator plus the
participants that must confirm), not per leg; with five participants the
count stays at 7 whatever N is. On DevNet it grows with the number of
validators hosting holders.

### Results

| N holders | Allocations settled | Settle request size | Envelopes | Settle, submission to commit | Whole day (sequential client) | Result |
|---|---|---|---|---|---|---|
| 3 | 4 | 19.5 KB | 7 | (proofs; not timed) | 40–55 s incl. JVM start | settled |
| 10 | 11 | 30.4 KB | 7 | within noise of the two-run method | 113 s | settled |
| 50 | 51 | 101.4 KB | 7 | ~20 s by the two-run method (±10 s) | 453 s | settled |
| 100 | | | | | | pending |
| 250 | | | | | | pending |
| 500 | | | | | | pending |
| 1000 | | | | | | pending |

### Reading it so far

- **Size is linear: about 1.8 KB per allocation plus ~12 KB.** Extrapolated,
  500 holders is ~0.9 MB and 1,000 is ~1.8 MB. The sequencer's default
  `maxRequestPayloadBytes` is 10,485,760, which puts the hard cap near 5,500
  allocations per batch on this configuration. To be confirmed by hitting it.
- **The whole day is dominated by the client, not the ledger.** Sequentially,
  each command costs about a second of round trip on a real synchronizer:
  55 party allocations and ~210 commands make 7.5 minutes for 50 holders.
  The paying agent submits every receipt allocation itself, so a real client
  batches them: fifty exercises per command, one transaction per batch
  (`Indivisa.Test.Agent.allocateReceipts`, `Fixtures.onboardAll`). The
  settle is not batched; it is one transaction by design.
- Party allocation is a topology transaction per party and is the slowest
  single step (2–3 s each). It is onboarding, paid once, and on DevNet the
  holders' parties already exist.

### Still to do

- N = 100, 250, 500, 1000 with the in-script settle timing and the batched
  client.
- Push N until the sequencer rejects the settle; record the message and the
  size it names. That is the ceiling.
- The second shape (N send allocations instead of one) for comparison.
- Whether the registry participant, which confirms every allocation, is the
  latency wall: read its confirmation times from `canton.log`.
