# Benchmark — how many legs fit in one CIP-112 batch

Proof 5. Nobody has published this number. Whatever it turns out to be, it goes
here and to the Canton forum.

Two kinds of measurement, kept apart:

1. **Interpreter (Daml Script, IDE ledger).** No network, no size limits. Tells
   us whether the settlement logic is linear in N and where the client falls
   over. Done 17 September 2026, below.
2. **Participant (LocalNet, then DevNet).** Real transaction bytes, view
   count, submission-to-commit latency, and the actual ceiling. Pending
   Phase 0b.

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

## 2. Participant — pending

Same script, pointed at LocalNet (`infra/localnet/`), then DevNet.

Per N to record: transaction size in bytes, view count, submission to commit
latency, estimated traffic cost, and the failure reason if rejected. Two
shapes: one send allocation carrying N legs, versus N send allocations. Note
whether the limit is a hard cap or a latency wall; they imply different
product answers.

| N | Bytes | Views | Latency | Shape | Result |
|---|---|---|---|---|---|
| 3 | | | | | |
| 10 | | | | | |
| 50 | | | | | |
| 100 | | | | | |
| 250 | | | | | |
| 500 | | | | | |
| 1000 | | | | | |
