# Run Indivisa yourself

One command, one page. Nothing to install but Docker, nothing to configure, no account anywhere.

Budget **about fifteen minutes for the first run** and a couple for later ones. Most of that first run is the machine working while you wait: building a Canton network, vetting thirteen packages on five participants, and creating twenty holders one at a time.

```bash
docker compose up
```

Wait for `Ready. Open http://localhost:8080` in the terminal (see **When is it ready?** just below; the first run takes a few minutes, most of it seating the holders), then open that page.

**To see everything the package can do, start it with the approvers instead:** `docker compose --profile govern up -d`. That adds three Decentralization Manager nodes and builds a decentralised party while the holders are being seated, so it costs no extra waiting, and the second coupon in the register can then be released by the approvers rather than by the paying agent alone. It is one command either way, and nothing has to be torn down between the two.

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
| `seated N holders; schedule total …` | three bonds, the register, the onboarding and four coupons exist, three of them already paid. One holder has given no settlement instructions, so the first press will be refused | |
| `==> Preparing the first coupon. One holder has not provided settlement instructions` | the cash is set aside and every payment the agent can authorise is authorised | ~20 s |
| `==> Ready…` | go to the browser | |

The terminal stays busy after that: Canton and the web server keep running in the foreground, which is normal. Leave the window open: `Ctrl+C` there stops the demo.

## What you are looking at

A bond pays its coupon. The paying agent must pay every holder. Every figure on the page is read live from the participant that holds it. There is no application server in between, and nothing is cached:

- **The header**: the bond, the event, how many holders, the total due, and how many allocations are on the ledger out of how many the batch needs. That count is one more than the number of holders: each holder authorises its own receipt, and the paying agent adds one send allocation carrying every leg. Token Standard V2 wants both sides of every leg. Below it, the one button.
The register down the left is a book, not a single bond: three instruments and four coupons, three of them finished. Every paid row is a real settlement with its own receipt and update id, so open one and check it rather than taking the word for it. The fourth is the one you are about to work.

- **Holders**: a card for every holder, all twenty, each read from the participant that hosts it, showing its units, what it is due and what cash it has. Search them, filter by leg state, sort by amount. Each card carries one of four states, and between them they say whose move it is: **NO DETAILS** (the holder has given no settlement instructions, so nothing on the agent's screen can fix it), **TO AUTHORISE** (instructions on file, the payment not authorised yet, which the agent does alone), **READY** (authorised and waiting for the batch) and **PAID**. The same four are counted on one line beside the button, so you can see where a run stands without opening a tab.
- **Click any card.** The page asks that holder's node, as that holder and nobody else, what it will hand over: its own position, agreement, allocation and cash, and then six counts of what that node holds about *anyone else*. They are zero, and they stay zero through the settlement. Not filtered. Never delivered.
- **Schedule** is the same twenty rows as the executor sees them, sortable, and it shows its own arithmetic: the coupon rate is finer than a cent, so a few holders land between cents and largest-remainder rounding decides which way each one goes, marked in the table, with the parts still summing to the total exactly. **Privacy** runs that check once per participant, continuously. **Activity** is what the ledger did, with the update id.

## The thing worth testing

One holder has not given the paying agent their **settlement instructions**, which is one of the commonest reasons a real payment fails: a holder new to this agent, a bank account that changed, details that went stale. So:

1. Press **Settle N legs in one transaction**. It is refused. A red strip appears across the page: `SETTLEMENT REJECTED · N payments requested · 0 executed · NO PARTIAL SETTLEMENT`, with the ledger's own reason, which names the holder that is missing. The page names them too, before you press: the line beside the button reads **1 waiting on the holder**, the **No details 1** chip filters the grid down to that one card, and its row in the schedule is the one marked **no details**. Check the other cards: nothing moved, for anyone. That is atomicity, demonstrated rather than claimed.
2. Fix it. The page names the holder and tells you it cannot be fixed from the agent's screen, because the holder has given no **settlement instructions**: the paying agent has nowhere to send their money. Click **Holder** at the top, open that holder, and press **Provide settlement instructions**. That is the only thing a holder ever does, and it is done once: every coupon after this one lands without them doing anything.

   Go back to **Paying agent**. That holder's card has moved from **NO DETAILS** to **TO AUTHORISE**, which is the whole point of the two states: the holder has done their part and the run is now waiting on the agent. Press **Authorise the 1 remaining payment**. The meter fills to N+1 of N+1 and every card reads **READY**. In a deployment this step happens by itself when the run is prepared; it is a button here so you can watch it.
**Two of those buttons would not exist in a real deployment, and it is worth knowing which.**

**Authorise the N remaining payments** is a button here so you can watch it. In a deployment the agent's software does it by itself the moment the run is prepared: it has the holders' settlement instructions, so there is nothing to decide and nobody to ask. It is separated out here because it is the step that turns "the holder said where to pay them" into "this payment is authorised on the ledger", and that is worth seeing happen.

**Settle would not be pressable while a holder's details are missing.** A real payout system does not let an operator fire a batch it already knows the ledger will refuse. We leave it enabled on this path on purpose, because the refusal **is** the demonstration: it is how you see that nobody is paid rather than everybody but one. On the governed run below it is disabled while anything is outstanding, for exactly that reason, since the approvers decide whether a payment goes out and should not be asked to approve one that cannot execute.

3. Press the button again. Settled. Every holder is paid in the same transaction, the update id of that transaction appears on screen, every card turns green and every row in the schedule turns **paid**, while each holder's counts of other holders stay at zero. Open a card again and check that for yourself.

To start over: `docker compose --profile govern down -v`, then bring it up again. **Use `--profile govern` on the way down even if you did not use it on the way up**: the approver nodes keep their own volumes behind that profile, and a plain `down -v` leaves them holding a party the new ledger has never heard of, which shows up later as a 409 from the governed seat. The demo is seated again from scratch, so it takes as long as the first run. You do **not** need to start over for the governed run below: it is the next coupon on the same bond, on the same stack.

## Optional: make it need more than one signature

Everything above settles on the paying agent pressing one button. A coupon worth millions should not. The package can also run the same settlement **governed**: a party that no single company controls, which acts only when two of its three members agree.

This is BitSafe's Decentralization Manager, unmodified, running as three approver nodes beside the ledger. Nothing above changes, and **nothing has to be torn down**: you declare the next coupon on the same bond and give it a term the first one did not have. The coupon you just paid was released by the paying agent alone; this one will not be.

**If you started with `--profile govern` at the top, you have everything already** and there is nothing to run here: the approvers were built while the holders were being seated. If you started with the plain `docker compose up`, add them now, to the stack you already have:

```bash
docker compose --profile govern up -d
```

That is the whole terminal, and it is the same command either way. It builds the decentralised party itself: three nodes, a peer mesh, and rules at a threshold of two. Everything after this is on the page.

Open http://localhost:8080. The bond you just paid has **no next coupon yet**, because declaring one is not the paying agent's to do. Go to the **Issuer** desk and declare it.

That desk has no register down the side, deliberately: an issuer has no sight of the paying agent's book and no route to its node. It reads its own participant instead, so the Bond field lists only bonds it has actually issued, and it tells you which company it is announcing as. Each of the three bonds here has an issuer of its own.

Check the Bond field reads **Northwind Rail 4.375% 2031**, then a rate of 21.875, a record date of 2028-05-15, a payment date of 2028-06-01, and then the term that matters:

> **This coupon cannot be released by the paying agent alone.**

Press **Announce**. That is the whole point of the issuer having a desk at all. The approvers exist to stop a paying agent releasing a payout unchecked, so the agent deciding whether that applies would protect nobody: the party being guarded against would be choosing the guard. The issuer's money, the issuer's term.

Now go back to **Paying agent**. The new coupon is in the register, and the panel states the term read-only - the agent can read it and cannot change it.

Press **Freeze the register, derive the schedule, create the run**. Three ledger steps in order, and worth knowing what they are:

- **Freeze the register.** A register changes every day as people buy and sell, and a coupon is owed to whoever held the bond on one particular day. A copy is taken on that day and kept, so trading afterwards cannot change who is paid. The industry calls that day the record date.
- **Derive the schedule.** Units times the rate per unit, rounded to the cent, for every holder in that frozen copy. The word doing the work is *derive*: it is computed on the ledger from the announcement and the snapshot rather than typed in or uploaded, so you can check the arithmetic instead of trusting it.
- **Create the run.** The payment, leg for leg from the schedule, carrying the issuer's term.

`Run_Settle` refuses a settlement that names no second authority against that term, so nothing on the paying agent's screen can waive it.

Above that button is the choice that matters, and the page makes you look at it: **how should this run be released?** Either the paying agent alone, which settles the moment it presses the button, or the approvers must agree. The second option is selected by itself here because this stack has a decentralised party, and it is filled in from that party's live governance rules rather than from anything we wrote in this document: the threshold it shows (**2 of 3**) and the three member names under it are read from the rules contract through the approvers' own software. Press **Create the run**, then **Authorise the N remaining payments**.

Every card reads **TO AUTHORISE**, and none reads **NO DETAILS**: this is a new run so nothing is authorised yet, and every holder gave their settlement instructions once, during the first coupon, which is the whole point of giving them once. That is also why the approvers can be asked at all. On a governed run the ask button stays disabled while anything is outstanding, because the approvers decide whether a payment goes out and should not be asked to approve one the ledger would refuse.

One honest note on that **2 of 3**. Counting members is not counting companies. All three approver nodes here run on your machine, so what this demonstrates locally is that no single *member* can release the payment. Members on separate nodes at separate companies is what the DevNet run showed, with BitSafe holding one of two confirmations on their own infrastructure.

**The button has changed.** It no longer settles. It reads *Ask the approvers to settle 20 legs* (or however many holders you seated), because the run now names an approver and the paying agent alone no longer has the authority to pay. Press it: that files the request, and nothing moves.

Now two of the three approvers must agree, and that happens on the **Approver** desk at the top of the page. It lists the three members, the threshold read from the party's own governance rules, and where each member stands on the request in front of it. Open one and confirm as that member; open a second and do the same. The strip goes from one of two to two of two, read live from the approvers' own software.

**Try taking an agreement back, because it is the more interesting half.** On a member that has confirmed, press **Withdraw this confirmation**. The count goes *down*, and the settle on the agent's desk stops being pressable again. That is what a "no" is in a threshold model: there is no reject button and there does not need to be, because a member that does not want the payment released simply never confirms and the threshold is never reached. What a member can do is change its mind, and that is a contract it signed and then archived, visible to everyone who can see the party.

At two, the greyed-out *Waiting for the approvers* button on the paying agent's desk disappears and a green **Settle N legs, now approved** takes its place, so there is only ever one thing to press. Press it, and the coupon settles.

**Read the note on a member's page before you press anything there.** That button would not exist in a deployment: a member confirms in its own application, at its own company, behind its own sign-in, and the paying agent's console would have no route to it. It is on this stack because the demo holds every party's credential. What is not theatre is the rule it cannot get around, and you can check that yourself: with one confirmation in, ask the ledger to execute anyway.

```bash
docker compose run --rm govern execute 2    # REFUSED, one is not enough
```

It is not our code declining; it is the ledger:

```
The requirement 'Enough confirmations to execute action' was not met.
```

`docker compose run --rm govern status` shows where a vote stands at any point. The three approver nodes have their own web interfaces on http://localhost:8081, 8082 and 8083, linked from each member's page, if you want to see the party, the peer mesh and the audit trail from their side.

There is no terminal route for the vote any more. `govern prepare` and `govern propose` were removed on 8 October, because both were hardwired to the first coupon on the bond and that one is settled by the paying agent alone before you reach this point. The page files the request and executes it; `govern confirm N`, `govern execute N` and `govern status` remain, and `execute` below the threshold is the refusal above.
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
| The page says there is no run yet and opens a set-up panel | On the ungoverned path the seed did not finish; see above. On the governed path that is correct: the run is yours to create, from that panel. |
| Setting a coupon up says a run already exists and names no approver | You are asking for the approvers on a coupon whose run was already created without them, and an approver cannot be added to a run that exists. Settle or cancel that run, or pick a coupon that has none. The page refuses rather than quietly handing back the ungoverned run, which would be a payment one company could release while you believed it needed two. |
| The governed seat fails with a 409, or DecMan says onboarding is already complete | The approver nodes keep their own volumes, and a plain `docker compose down -v` does not clear them, so they carry a party the new ledger has never heard of. If you are starting the whole stack again, use `docker compose --profile govern down -v`. |
