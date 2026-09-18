# The recording

Sixty to ninety seconds, one take per shot, no voice-over needed (captions
carry it; add voice if time allows). Screen at 1920x1080, browser at 125%,
the four panes filling the window. Nothing on screen is mocked: every number
is read from the ledger while recording.

Order matters. **Success first**, so the viewer has seen the thing work
before we break it; then the labelled failure, captioned as an atomicity
demonstration *before* the click; then the retry. That is the order Season
2's postmortems say credible builds used, and it is the honest order: the
failure is a feature we are showing, not an accident we are explaining.

## Setup, before recording

Two seats on the same network, so the success take and the failure take do
not need a reset between them:

```
pwsh infra/demo.ps1 seat -Holders 250 -Tag take1     # ~25 min each; run both the day before
pwsh infra/demo.ps1 seat -Holders 250 -Tag take2
```

On the day:

```
pwsh infra/demo.ps1 prepare -Tag take1               # all 251 allocations ready
pwsh infra/demo.ps1 prepare -Tag take2 -Withhold 1   # one holder left without a receipt allocation
```

One dev server shows one seat, so either run two on two ports or record
take1, restart on take2 and record again. Two sittings is simplest.

```
$env:INDIVISA_TAG = "take1"; npm run dev            # tab A
$env:INDIVISA_TAG = "take2"; npx vite --port 5174   # tab B, later
```

Check before pressing record: agent pane says **prepared**, allocations
**251 of 251** (take1) or **250 of 251 · 1 missing** (take2); the three
holder panes say **allocated** and show **0** on every "others" line.

## Shot list

| # | Seconds | On screen | Caption | Real / simulated |
|---|---|---|---|---|
| 1 | 0–8 | The four panes, still. Cursor idle. | **A bond coupon. 250 holders. One paying agent.** Every number here is read live from a Canton ledger. | real: ledger reads · simulated: holders, cash |
| 2 | 8–16 | Slow scroll of the schedule table on the agent pane, then back to the top. | The paying agent sees every holder and every amount. Total due $X. | real |
| 3 | 16–24 | Hover over one holder pane, then the next. | Each holder's node sees its own line. **The counts of what it holds about anyone else: zero.** Not filtered. Never delivered. | real |
| 4 | 24–32 | Click **Settle 250 legs in one transaction**. Button reads *Settling…* | One transaction. All 250 paid at the same instant, or nobody. | real |
| 5 | 32–44 | The agent pane flips to **SETTLED · 250 of 250 · $X** with the update id and the submit-to-commit time; the holder panes flip to **paid** with their cash. | Settled. Update id on screen. Every holder paid; still zero about the others. | real |
| 6 | 44–50 | Cut to tab B (take2). Same panes, **250 of 251 · 1 missing** in amber. | Now the same run with one holder not ready. **This is the atomicity test.** | real |
| 7 | 50–58 | Click the button. | If any leg cannot settle, nothing moves. | real |
| 8 | 58–70 | **SETTLEMENT REJECTED · 250 payments requested · 0 executed · NO PARTIAL SETTLEMENT**, the reason naming the holder, the on-ledger record line. Holder panes unchanged: still **allocated**, cash unchanged. | Refused by the ledger. Zero paid. The refusal itself is recorded. | real |
| 9 | 70–80 | Terminal, one line: `demo.ps1 prepare -Tag take2`. Back to tab B: **251 of 251**. Click. **SETTLED · 250 of 250**. | The missing holder is made ready. Same button. Settled. | real |
| 10 | 80–90 | Still frame, the settled agent pane. | Corporate actions, settled in one atomic batch, without exposing the register. Chain-Experts · HackCanton Season 3. | |

On LocalNet a 250-leg settle commits in about 1.6 s, so shot 4 to shot 5 is
one cut: the button reads *Settling…* for a moment and the pane flips. Hold
shot 5 long enough for the update id and the commit time to be read; that
line is the evidence. Do not speed anything up; if a viewer thinks it looks
too fast, the sequencer log and the benchmark are the answer, not a slower
cut.

## What each caption may and may not claim

- "Every holder paid at the same instant or nobody" — yes, that is what
  `SettlementFactory_SettleBatch` in one transaction means, and shot 8 shows
  the "nobody" half.
- "No holder sees another's payment" — yes on LocalNet, where each holder is
  on its own participant; the zeros are absence, not filtering. On a
  one-validator DevNet say "each holder's view contains only its own leg".
- **Never** "zero information leakage": the paying agent sees everything, by
  design, and shot 2 shows it.
- "One transaction" — yes; the update id on screen is one id. Do not say
  "one block" or "one second".
- The cash is `TestTokenV2`, the reference Token Standard V2 asset, not
  Canton Coin; the holders and their positions are generated. Both labels
  are in the page header throughout the recording; leave the header in shot.

## Numbers to have ready for the voice-over or the deck

From `docs/benchmark.md`, LocalNet, Canton 3.5.17, one transaction:

| Legs | Transaction size | Submit to commit |
|---|---|---|
| 250 | 440–545 KB | 1.6 s |
| 500 | 0.8 MB | 4.0 s |
| 1,000 | 1.67 MB | 11.1 s |

And the sentence: *"Nobody had published how many legs fit in a CIP-112
batch. We measured it: a thousand holders, one transaction, 11.1 s on one
workstation, and we had not found the ceiling."*
