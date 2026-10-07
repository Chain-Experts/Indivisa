# Run Indivisa yourself

One command, one page. Nothing to install but Docker, nothing to configure, no account anywhere.

Budget **about fifteen minutes for the first run** and a couple for later ones. Most of that first run is the machine working while you wait: building a Canton network, vetting thirteen packages on five participants, and creating twenty holders one at a time.

```bash
docker compose up
```

Wait for `Ready. Open http://localhost:8080` in the terminal (see **When is it ready?** just below; the first run takes a few minutes, most of it seating the holders), then open that page.

You will need Docker with Compose v2, **6 GB of memory** given to it (Docker Desktop: Settings → Resources) and ~2 GB of disk. The optional governed run at the end adds about 0.5 GB, so 6 GB covers everything here.

If `docker compose up` is not available as one word on your system, use `docker-compose up`; everything else is the same.

## When is it ready?

The terminal keeps printing while it builds the network and seats the demo. **Wait for these two lines**, which are the last thing the seed says:

```
indivisa-seed  | ==> Ready. Open http://localhost:8080 and press the button.
indivisa-seed exited with code 0
```

That is the moment to switch to the browser. Opening the page earlier is harmless: it says it is waiting for the demo to finish seating, and picks the demo up by itself when the seed is done. No reload needed.

**If it seems stuck, it probably is not.** Canton prints nothing for minutes at a time while it vets packages. `docker compose ps` will show `indivisa-canton` as `starting` or `healthy`; as long as it is not `unhealthy` or restarting, leave it alone.

What you see before them, so you can tell progress from a stall:

| In the terminal | What is happening | Roughly |
|---|---|---|
| many Canton lines, ending `Indivisa LocalNet is up` | five participants started, thirteen DARs vetted on each | 4–8 min, and it prints nothing for long stretches |
| `Container indivisa-canton Healthy` | the network is ready for a client | |
| `==> Waiting for the ledger` … `all five participants are answering` | | seconds |
| `==> Seating N holders` | each holder is a party, and a party takes a few seconds. Nothing prints while it works | 2 min for 8, 4 min for 20 |
| `seated N holders; schedule total …` | the bond, the register, the onboarding and the payment schedule exist | |
| `==> Preparing the run, with one holder deliberately left out` | the cash is set aside and the receipts are made ready | ~20 s |
| `withholding the receipt allocation of '…'` | **the holder that will block the first attempt.** Note the name; you will see it again in the refusal | |
| `==> Ready…` | go to the browser | |

The terminal stays busy after that: Canton and the web server keep running in the foreground, which is normal. Leave the window open: `Ctrl+C` there stops the demo.

## What you are looking at

A bond pays its coupon. The paying agent must pay every holder. Every figure on the page is read live from the participant that holds it. There is no application server in between, and nothing is cached:

- **The header**: the bond, the event, how many holders, the total due, and how many allocations are on the ledger out of how many the batch needs. That count is one more than the number of holders: each holder authorises its own receipt, and the paying agent adds one send allocation carrying every leg. Token Standard V2 wants both sides of every leg. Below it, the one button.
- **Holders**: a card for every holder, all twenty, each read from the participant that hosts it, showing its units, what it is due and what cash it has. Search them, filter by leg state, sort by amount.
- **Click any card.** The page asks that holder's node, as that holder and nobody else, what it will hand over: its own position, agreement, allocation and cash, and then six counts of what that node holds about *anyone else*. They are zero, and they stay zero through the settlement. Not filtered. Never delivered.
- **Schedule** is the same twenty rows as the executor sees them, sortable, and it shows its own arithmetic: the coupon rate is finer than a cent, so a few holders land between cents and largest-remainder rounding decides which way each one goes, marked in the table, with the parts still summing to the total exactly. **Privacy** runs that check once per participant, continuously. **Activity** is what the ledger did, with the update id.

## The thing worth testing

The run has been prepared with **one holder deliberately left out**, so:

1. Press **Settle N legs in one transaction**. It is refused. A red strip appears across the page: `SETTLEMENT REJECTED · N payments requested · 0 executed · NO PARTIAL SETTLEMENT`, with the ledger's own reason, which names the holder that is missing. The page names them too, before you press: the note under the button reads **Waiting for <name>**, the **Waiting 1** chip filters the grid down to that one card, and its row in the schedule is the one marked **waiting**. Check the other cards: nothing moved, for anyone. That is atomicity, demonstrated rather than claimed.
2. Fix the missing holder. **Leave the browser open and leave the first terminal running**: that one is the network itself. Open a *second* terminal, go to the same folder, and run:

   ```bash
   docker compose run --rm prepare
   ```

   It takes a few seconds and ends with `Done. The page shows every allocation ready`. The page notices by itself: it re-reads the ledger every two seconds, so the allocations meter fills to N+1, the **Waiting for <name>** note disappears and every card turns **ready**. Nothing to reload, nothing to restart.
3. Press the button again. Settled. Every holder is paid in the same transaction, the update id of that transaction appears on screen, every card turns green and every row in the schedule turns **paid**, while each holder's counts of other holders stay at zero. Open a card again and check that for yourself.

To start over: `docker compose down && docker compose up`. The demo is seated again from scratch, so it takes as long as the first run. (`down` leaves a small volume behind; `docker compose down -v` removes that too.)

## Optional: make it need more than one signature

Everything above settles on the paying agent pressing one button. A coupon worth millions should not. The package can also run the same settlement **governed**: a party that no single company controls, which acts only when two of its three members agree.

This is BitSafe's Decentralization Manager, unmodified, running as three approver nodes beside the ledger. Nothing above changes: the governed path is opt-in and starts differently:

```bash
docker compose --profile govern down -v                  # start clean
INDIVISA_GOVERNED=1 docker compose --profile govern up -d
docker compose run --rm govern-seed                      # ~2 min, once
docker compose run --rm govern prepare
```

Open http://localhost:8080. **The button has changed.** It no longer settles. It reads *Ask the approvers to settle 20 legs* (or however many holders you seated), because the run now names an approver and the paying agent alone no longer has the authority to pay. Press it: that files the request, and nothing moves.

Now two of the three approvers must agree. Each has their own node:

```bash
docker compose run --rm govern confirm 1    # one approver agrees
docker compose run --rm govern confirm 2    # a second agrees
```

Watch the strip on the page as you do: it goes from one of two to two of two, read live from the approvers' own software. At two, a second button appears. Press it, and the coupon settles.

The refusal below threshold is worth seeing. Between the two confirms, try:

```bash
docker compose run --rm govern execute 2    # REFUSED, one is not enough
```

It is not our code declining; it is the ledger:

```
The requirement 'Enough confirmations to execute action' was not met.
```

`docker compose run --rm govern status` shows where a vote stands at any point. The three approver nodes have their own web interfaces on http://localhost:8081, 8082 and 8083 if you want to see the invitations and the confirmations from their side.

If you would rather not use the page at all, the whole thing also runs from the terminal: `govern propose` files the same request, and `govern execute 3` settles it once two approvers have confirmed.
## What is real and what is not

**Real:** the ledger (Canton 3.5, five participants, one synchronizer), the Daml contracts, the settlement, the refusal, the privacy, every number on screen. The transaction is a genuine Token Standard V2 `SettlementFactory_SettleBatch`.

**Simulated:** the cash is `TestTokenV2`, the standard's own reference token, with our registry party, not Canton Coin. We chose it deliberately rather than for convenience: its `Token` is signed by owner **and** admin, so it forces the same receiver-authorisation path as Canton Coin. A single-signatory asset would have let us skip the problem this product exists to solve. What the asset would take to change is in [`../docs/canton-coin.md`](../docs/canton-coin.md): the model names no asset, so it is one field and one registry adapter. The holders, their names and their positions are generated. This network is five participants in one container on your machine, not five companies.

## What this does not show

This is a local network, so it proves the mechanism, not a deployment. The same code runs on Canton's DevNet; the submission carries that run's update id as evidence. And the holder base here is small (twenty by default, `INDIVISA_HOLDERS` to change it) because creating parties takes a few seconds each; the measured limits are in `docs/benchmark.md`: 13,000 payment legs in one transaction, and where that stops.

## If something goes wrong

| What you see | What to do |
|---|---|
| `canton` keeps restarting, or the page never loads | Docker has too little memory. Give it 6 GB and `docker compose down && docker compose up`. |
| The page says it is waiting for the demo to finish seating | That is the normal first few minutes. It picks the demo up by itself. To watch the seed: `docker compose logs -f seed`. |
| Port 8080 is taken | `INDIVISA_PORT=8081 docker compose up` |
| The button says "Prepare the run first" | The seed did not finish; see above. |
| The governed seat fails with a 409, or DecMan says onboarding is already complete | The approver nodes keep their own volumes, and a plain `docker compose down -v` does not clear them, so they carry a party the new ledger has never heard of. Use `docker compose --profile govern down -v`. |
