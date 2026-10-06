# Benchmark: how many legs fit in one CIP-112 batch

Proof 5. We could find no published figure for how many legs fit in a CIP-112
batch settlement. Whatever it turns out to be, it goes here and to the Canton
forum.

Two kinds of measurement, kept apart:

1. **Interpreter (Daml Script, IDE ledger).** No network, no size limits. Tells
   us whether the settlement logic is linear in N and where the client falls
   over. Done 17 September 2026, below.
2. **Participant (LocalNet, then DevNet).** Real transaction bytes,
   submission-to-commit latency, and the ceiling. LocalNet 17–18 September,
   section 2, including a correction to its own first numbers.

Everything here is `TestTokenV2` as the cash instrument, one committed send
allocation carrying all N legs, N receipt allocations created by the paying
agent under the holders' agreements, one `SettlementFactory_SettleBatch`.


## A leg and an allocation, because the difference drives every number here

**A leg is a line of the instruction.** Pay this holder this amount of this
instrument. In the settle request it is an id, two account references, an
amount and an instrument name. **About 85 bytes.**

**An allocation is a party's authorisation**, and it is a contract on the
ledger with the cash set aside behind it. Each one carries a complete copy of
the settlement it belongs to, including the executor list, plus the account
authorising, the leg sides it covers, the holdings backing it, and timestamps
and expiry. **About 1,554 bytes**, roughly eighteen times a leg. The ledger
also fetches each one, validates it against the settlement and exercises a
choice on it, so an allocation is work as well as bytes.

The Token Standard requires both sides to have authorised. The paying agent
can sign once for every leg, but each receiving holder needs its own
authorisation, and each of those is its own contract. **A thousand holders is
one agent allocation plus a thousand receipt allocations: 1,001 allocations
for 1,000 legs.**

That is why the two experiments below are not comparable as a single series.
Section 2 is the real shape, one allocation per holder. Section 3 lets 250
holders share, so 13,000 legs ride on 251 allocations: thirteen times the
lines, a quarter of the signatures, a slightly smaller transaction. Signatures
are the expensive thing.

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

## 2. LocalNet, 17–18 September 2026

Same scripts, real participants: `infra/localnet/` (Canton 3.5.17, protocol
version 35, one BFT sequencer, one mediator, five participants in one JVM on
one 32-core workstation, in-memory storage, 12 GB heap). Registry, agent and
each of the three holder nodes are separate participants; holders are spread
round-robin over the three holder nodes.

### A correction first

The first version of this section (17–18 September) reported 104 s for 500
legs and 333 s for 1,000, timed from inside the Daml Script that submitted
the settle, and called the result a latency wall. **That timing was the
client, not the ledger.** The sequencer log for the 1,000-leg run shows the
agent participant finishing interpretation at 01:23:22.8, the mediator
finalising at 01:23:27.5 and the script fetching the committed transaction
at 01:23:28.1; the script then made no request to any node until 01:28:52.
Five minutes twenty-four seconds went into the Daml Script runner digesting
a transaction tree of a thousand exercise nodes after the ledger was done.
The same shape at 500: ledger done in 2.6 s, script silent for 100 s.

So the settle is now timed by the client a paying agent would actually use:
`POST /v2/commands/submit-and-wait` on the JSON Ledger API, from the four
panes' button in a browser and from `ui/scripts/settle.ts` in Node
(`infra/settle.ps1`). The ledger's own view, from the sequencer log
(`Phase 1 completed` on the agent's participant to `Phase 6: Finalized` at
the mediator), is given beside it. The old in-script figures are kept in
the last column as what they are: the cost of reading a large result back
through Daml Script.

### Method

Prepare: `Indivisa.Test.Scale:scalePrepare` with
`{"topology":"LocalNet","holders":N}` and `--participant-config` generated
by `infra/participants-with-parties.ps1` so holders from earlier runs are
reused (parties are the expensive part). Settle: `infra/settle.ps1`, which
runs the prepare and then `ui/scripts/settle.ts`, the same `Run_Settle`
exercise the UI's button submits, with the registry's `TokenRules` disclosed,
timed with `performance.now()` around `submit-and-wait`. Request size and
envelope count come from the sequencer's INFO line for the agent's
submission:

```
GrpcSequencerService ... 'PAR::agent::...' sends request with id '...'
  of size 1667911 bytes with 7 envelopes.
```

The settle is the agent's largest request in the run by a wide margin, so it
is unambiguous. Envelopes are per recipient node (mediator plus the
participants that must confirm), not per leg; with five participants the
count is 6 or 7 whatever N is. On DevNet it grows with the number of
validators hosting holders.

### Results

| N legs | Allocations | Settle request | **Submit to commit, JSON API** | Ledger: interpret to finalise | In-script (runner overhead) | Result |
|---|---|---|---|---|---|---|
| 8 | 9 | | **0.5 s** (browser) | | | settled |
| 10 | 11 | 30.4 KB | | 0.4 s | 0.7 s | settled |
| 50 | 51 | 101.4 KB | | 0.5 s | 1.9 s | settled |
| 100 | 101 | 187.7 KB | | 0.7 s | 5.4 s | settled |
| 250 | 251 | 440–545 KB | **1.6 s** (browser, demo seat) | 0.9–1.1 s | 15–28 s | settled |
| 500 | 501 | 811–843 KB | **4.0 s** (Node) | 2.1–2.6 s | 104 s | settled |
| 1000 | 1001 | **1.64–1.67 MB** | **11.1 s** (Node) | 4.2–4.7 s | 333 s | settled |

Every row settled every leg on real participants. One committed send
allocation carried all N legs in every row. The 250 row is the recording
seat (250 synthetic holders, $1,197,240.63), settled from the console with
every holder's own node being read at the same time.

### What it says

**1. Size is linear and far from the cap.** 1.67 KB per allocation plus
~13 KB. The sequencer's default `maxRequestPayloadBytes` is 10,485,760, so by
size alone one batch could carry about 6,200 allocations. Size is not the
limit.

**2. Latency is linear too, and small.** The ledger confirms a batch in
about 4.5 ms per leg on this machine (0.9 s at 250, 2.2 s at 500, 4.7 s at
1,000), and what a client sees, interpretation and delivery included, is
two to two and a half times that: 1.6 s at 250, 4.0 s at 500, 11.1 s at 1,000 (of which
4.2 s is confirmation; the rest is the agent participant interpreting a
thousand legs before submission and indexing them after). There is no wall in
sight below the size cap; whatever the ceiling is on this machine, it is
above a thousand legs and was not reached.

**3. The product answer.** A coupon run of a few hundred holders is one
transaction that settles in a second or two; a thousand holders is one
transaction in about ten seconds. The earlier advice to split thousands into
back-to-back batches of a few hundred was based on the runner's overhead and
is withdrawn; it may still be sensible for operational reasons (a batch that
fails names one holder and blocks the rest), but it is not a performance
requirement.

**4. The lesson for anyone benchmarking Daml.** Do not time a large
transaction from inside Daml Script. The runner's cost of converting the
returned transaction tree grows far faster than the ledger's cost of
committing it (100 s at 500 nodes, 324 s at 1,000, against 2.6 s and 4.7 s
on the ledger). Time it from the Ledger API, and check the sequencer log.

**5. What this LocalNet cannot tell us.** All five nodes share one JVM and
one machine; on DevNet the confirming nodes are separate machines (parallel
work, but network hops), the sequencer is the real one, and the holders sit
on however many validators host them, which multiplies envelopes. The DevNet
run should reproduce 250 and, if traffic allows, 500 and 1,000.

### Onboarding cost, for completeness

Not the subject of the benchmark, but measured on the way: a party is a
topology transaction, about 5 s each on this synchronizer, and an acceptance
is one command per holder, about 1 s. The batched client
(`Test.Agent.allocateReceipts`, `Fixtures.onboardAll`) puts fifty proposals
or fifty receipt allocations in one command, so the day for 500 holders whose
parties already exist is about 5 minutes, of which 4 s is the settle.

### Still to do

- The same sweep on DevNet at 250, 500 and 1,000.
- Traffic cost (needs DevNet's fee parameters).
- A realistic-shape run past 1,000 holders, to check the 6,400 figure by
  measurement rather than by model. It costs a party per holder at about
  four seconds each, so 6,400 holders is seven hours of party creation.
---

## 3. Where it stops, 22 September 2026

Section 2 answered "how big can one settlement be" with sizes we had run.
This section pushed until something refused, and something did. Two limits
exist, they are different, and the one that binds first is not the one we
expected.

### Method

Same LocalNet (Canton 3.5.17, five participants in one JVM, 16 GB heap),
fresh ledger, 250 holder parties created once and reused by every row. The
sweep is `infra/localnet/ceiling.ps1`, which for each size prepares the run
with the script and settles it with the Node client over the JSON Ledger
API, then reads the sequencer's log for that submission's size and its
phase 1 to phase 6 stamps. Raw rows: `infra/localnet/log/ceiling.csv`.

Past 250 legs the legs are spread over the same 250 holders
(`Indivisa.Test.Scale.scaleLegsN`), so a holder receives several. That is
**not** the shape of a coupon run: the batch is 251 allocations rather than
one per leg. It is a deliberate instrument. Holding the allocation count
fixed while the leg count grows separates the cost of a leg from the cost
of an allocation, which is what makes the realistic-shape answer below a
calculation rather than a guess.

### Results

| Legs | Allocations | Settle request | Submit to commit | Ledger: interpret to finalise | Result |
|---|---|---|---|---|---|
| 1,000 | 251 | 494 KB | 2.0 s | 1.1 s | settled |
| 2,000 | 251 | 582 KB | 2.9 s | 1.7 s | settled |
| 4,000 | 251 | 751 KB | 3.7 s | 1.9 s | settled |
| 6,000 | 251 | 919 KB | 5.7 s | 3.2 s | settled |
| 8,000 | 251 | 1.09 MB | 7.8 s | 4.8 s | settled |
| 12,000 | 251 | 1.43 MB | 9.9 s | 5.9 s | settled |
| **13,000** | 251 | **1.52 MB** | **10.4 s** | 5.9 s | **settled** |
| 14,000 | 251 | | | | **refused, before the settle** |
| 20,000 | 251 | | | | **refused, before the settle** |

### What refused it, verbatim

Not the settlement. The command that *prepares* it: the single send
allocation in which the paying agent authorises every leg at once
(`Indivisa.Test.Agent.allocateSend`).

```
RESOURCE_EXHAUSTED: gRPC message exceeds maximum size 10485760: 10584915
  at Indivisa.Test.Agent:72        (14,000 legs)

RESOURCE_EXHAUSTED: gRPC message exceeds maximum size 10485760: 15124323
  at Indivisa.Test.Agent:72        (20,000 legs)
```

Both payloads are **756 bytes per leg**, exactly, so the limit is
arithmetic: 10,485,760 / 756 = **13,869 legs in one send allocation**. We
settled 13,000 and were refused at 14,000; the measurement and the
arithmetic agree to within 1%.

This is the Ledger API's own gRPC message limit on the way in, not a
Canton transaction limit, and the fix is in the standard: split the send
side into several allocations. The settlement takes a list of them. That
answers the open question "one send allocation carrying N legs, or N of
them": one is simpler and cheaper until about thirteen thousand legs, and
beyond that it has to be several.

### The two ceilings, separated

Fitting the seven settled rows (allocations fixed, legs varying):

| | |
|---|---|
| Cost of a leg in the settle request | **85 bytes** |
| Cost of an allocation in the settle request | **1,554 bytes** |
| Fixed overhead | ~20 KB |
| Cost of a leg in the send-allocation command | **756 bytes** |
| Time | **0.69 ms per leg**, submit to commit |

The model is checked against a measurement it did not come from: for the
1,000-holder run of section 2 (1,001 allocations, 1,000 legs) it predicts a
1.66 MB settle request; the sequencer logged 1.67 MB. **0.6% error.**

So, on this hardware:

1. **A settlement of a real coupon run**, one allocation per holder,
   reaches the 10 MB request cap at about **6,400 holders**. Derived, not
   measured: the largest realistic-shape run actually settled is 1,000
   holders at 1.67 MB.
2. **A settlement whose legs share allocations** reaches 10 MB at about
   120,000 legs, but cannot be prepared past **13,869 legs** in one send
   allocation. Measured.
3. **Time is not the binding constraint** at any size we reached. Thirteen
   thousand legs committed in 10.4 s, of which the ledger's own
   confirmation was 5.9 s.

### What to say out loud, and what not to

Say: *we settled 13,000 payment legs in one transaction in ten seconds, and
the first hard limit we met was the gRPC message size of the command that
authorises them, at 13,869 legs; a realistic coupon run of one payment per
holder reaches Canton's 10 MB transaction budget near 6,400 holders.*

Do not say: "Indivisa pays 13,000 holders in one transaction." It does not.
Thirteen thousand *legs* over 250 holders is not the same as 13,000
holders, and the honest figure for holders is the derived 6,400, with 1,000
the largest actually run.

Do not say the limit is Canton's transaction size. On this evidence Canton
was never the constraint; the client's command was.

**Do not line the two series up as one progression.** "250 legs in 1.6 s,
1,000 in 11.1 s, 13,000 in 10.4 s" reads as work getting faster as it grows,
and invites the reader to conclude the numbers are wrong or massaged. They
come from two experiments with different shapes. Section 2 is one allocation
per holder; section 3 pins allocations at 251 and grows only the legs. The
same thousand legs took **11.1 s with 1,001 allocations and 2.0 s with 251**,
because an allocation costs about 1,554 bytes and a leg about 85.

If both are quoted together, quote the allocation count with them, or say
which experiment each came from. The deck does this correctly by showing only
the realistic shape on the slide and giving the derived 6,400-holder figure
for the ceiling.

**The answer if a judge asks why 13,000 beat 1,000.** Allocations are the
cost, not legs. The thousand-holder run carried a thousand allocations; the
thirteen-thousand-leg run carried 251, so it was the smaller transaction:
1.52 MB against 1.67 MB. Holding allocations fixed was deliberate, because it
separates the two costs, and that separation is what makes the 6,400-holder
figure a calculation rather than a guess. Within the fixed-allocation sweep
the times rise monotonically from 2.0 s to 10.4 s, and the 13,000 row was
measured last, after the warmest rows had already run.

### What this still cannot say

This is one machine: five participants in one JVM, one synchronizer,
in-memory storage, no traffic pricing. On DevNet the confirming nodes are
separate machines, the sequencer is real, and traffic costs money. The
sizes should carry over almost exactly, since they are properties of the
serialised transaction, and the times should not.
