# Run Indivisa yourself

One command, one page, about five minutes. Nothing to install but Docker,
nothing to configure, no account anywhere.

```bash
docker compose up
```

Wait for `Ready. Open http://localhost:8080` in the terminal (see **When is
it ready?** just below — the first run takes a few minutes, most of it
seating the holders), then open that page.

You will need Docker with Compose v2, about **6 GB of memory** given to it
(Docker Desktop: Settings → Resources), and ~2 GB of disk. The first run
downloads the images and builds two small ones; later runs start in about
a minute.

If `docker compose up` is not available as one word on your system, use
`docker-compose up`; everything else is the same.

## When is it ready?

The terminal keeps printing while it builds the network and seats the demo.
**Wait for these two lines**, which are the last thing the seed says:

```
indivisa-seed  | ==> Ready. Open http://localhost:8080 and press the button.
indivisa-seed exited with code 0
```

That is the moment to switch to the browser. Opening the page earlier is
harmless — it will say *No seat file* — just reload once those lines appear.

What you see before them, so you can tell progress from a stall:

| In the terminal | What is happening | Roughly |
|---|---|---|
| many Canton lines, ending `Indivisa LocalNet is up` | five participants started, nine packages vetted | 1 min |
| `Container indivisa-canton Healthy` | the network is ready for a client | |
| `==> Waiting for the ledger` … `all five participants are answering` | | seconds |
| `==> Seating N holders` | **the long step.** Each holder is a party, and a party takes a few seconds. Nothing prints while it works | 2 min for 8, 4 min for 20 |
| `seated N holders; schedule total …` | the bond, the register, the onboarding and the payment schedule exist | |
| `==> Preparing the run, with one holder deliberately left out` | the cash is set aside and the receipts are made ready | ~20 s |
| `withholding the receipt allocation of '…'` | **the holder that will block the first attempt.** Note the name; you will see it again in the refusal | |
| `==> Ready…` | go to the browser | |

The terminal stays busy after that: Canton and the web server keep running
in the foreground, which is normal. Leave the window open — `Ctrl+C` there
stops the demo.

## What you are looking at

A bond pays its coupon. The paying agent must pay every holder. Every figure
on the page is read live from the participant that holds it — there is no
application server in between, and nothing is cached:

- **The header**: the bond, the event, how many holders, the total due, and
  how many allocations are on the ledger out of how many the batch needs.
  Below it, the one button.
- **Holders**: a card for every holder — all twenty — each read from the
  participant that hosts it, showing its units, what it is due and what cash
  it has. Search them, filter by leg state, sort by amount.
- **Click any card.** The page asks that holder's node, as that holder and
  nobody else, what it will hand over: its own position, agreement,
  allocation and cash, and then six counts of what that node holds about
  *anyone else*. They are zero, and they stay zero through the settlement.
  Not filtered — never delivered.
- **Schedule** is the same twenty rows as the executor sees them, sortable.
  **Privacy** runs that check once per participant, continuously.
  **Activity** is what the ledger did, with the update id.

## The thing worth testing

The run has been prepared with **one holder deliberately left out**, so:

1. Press **Settle N legs in one transaction**.
   It is refused. The pane shows `SETTLEMENT REJECTED · N payments
   requested · 0 executed · NO PARTIAL SETTLEMENT`, and the ledger's own
   reason names the holder that is missing. The page names them too, before
   you press: the allocations line reads *waiting for <name>*, and that
   holder's row in the schedule is the one marked **waiting**. Check the
   cards: nothing moved, for anyone. That is atomicity, demonstrated rather
   than claimed.
2. Fix the missing holder. **Leave the browser open and leave the first
   terminal running** — that one is the network itself. Open a *second*
   terminal, go to the same folder, and run:

   ```bash
   docker compose run --rm prepare
   ```

   It takes a few seconds and ends with `Done. The page shows every
   allocation ready`. The page notices by itself: it re-reads the ledger
   every two seconds, so the allocations line stops saying *1 missing* and
   the button becomes pressable again. Nothing to reload, nothing to
   restart.
3. Press the button again.
   Settled. Every holder is paid in the same transaction, the update id of
   that transaction appears on screen, every card turns green and every row
   in the schedule turns **paid** — while each holder's counts of other
   holders stay at zero. Open a card again and check that for yourself.

To start over: `docker compose down && docker compose up`. The demo is
seated again from scratch, so it takes as long as the first run. (`down`
leaves a small volume behind; `docker compose down -v` removes that too.)

## What is real and what is not

**Real:** the ledger (Canton 3.5, five participants, one synchronizer), the
Daml contracts, the settlement, the refusal, the privacy, every number on
screen. The transaction is a genuine Token Standard V2
`SettlementFactory_SettleBatch`.

**Simulated:** the cash is `TestTokenV2`, the standard's own reference
token, with our registry party — not Canton Coin. The holders, their names
and their positions are generated. This network is five participants in one
container on your machine, not five companies.

## If something goes wrong

| What you see | What to do |
|---|---|
| `canton` keeps restarting, or the page never loads | Docker has too little memory. Give it 6 GB and `docker compose down && docker compose up`. |
| The page says "No seat file" | The seed has not finished. Wait for `Ready. Open http://localhost:8080` in the terminal, then reload. To watch just that container: `docker compose logs -f seed`. |
| Port 8080 is taken | `INDIVISA_PORT=8081 docker compose up` |
| The button says "Prepare the run first" | The seed did not finish; see above. |

## What this does not show

This is a local network, so it proves the mechanism, not a deployment. The
same code runs on Canton's DevNet; the submission carries that run's update
id as evidence. And the holder base here is small (twenty by default,
`INDIVISA_HOLDERS` to change it) because creating parties takes a few
seconds each; the measured limits are in `docs/benchmark.md` — 13,000
payment legs in one transaction, and where that stops.
