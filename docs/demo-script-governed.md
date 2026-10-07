# The governed settlement: a complete recording script

A coupon that one company cannot pay on its own, settled on Canton DevNet, with BitSafe holding one of the two approvals on their own node.

Target length **about two minutes**. Everything is driven from the page.

---

## Rehearsed on DevNet, 2 October

Everything in Part D except BitSafe own confirmation has been run end to end against the real network: `fund`, `prepare`, the page filing the request, our own confirmation moving it to 1 of 2, the green button correctly **not** appearing, and the request withdrawn again cleanly. The DecMan token, the vote, and operator sign-in all worked.

Three things the rehearsal changed, and they are in the script below: tell BitSafe which action to confirm (A3b), sign-in is now a real shot rather than a maybe (Part F), and the withdraw link is on screen from shot 2 (Part F2).

## What changed on 1 October, and why this script was rewritten

The previous version of this film had the paying agent press its own button and the **ledger refuse it**. That shot no longer exists, and cannot.

The console now knows the run needs approval, so the button files a request instead of attempting a payment. That is a better product and a weaker demonstration, and the film has to take the trade: a button that asks for approval cannot also be a button that gets refused.

**What survives, and it is the stronger half:** at one approval out of two, nothing can be executed. That refusal is real, it is the threshold doing its job, and it is still on camera.

Two steps that used to be PowerShell - `propose` and `execute` - are now page actions. The only terminal left is the **reset**, which is seat preparation rather than settlement, and card 7 says so out loud.

---

## What you need

- The repository, built (`dpm build --all`).
- `ui\.env.local` filled in (copy `ui\.env.example`). It carries the network, the tag and the client secret, so starting the console is `npm run dev` and nothing else.
- **Someone at BitSafe available to press Confirm**, at a time agreed in advance. This is the only part you cannot do alone, and it is the part the film exists to show.
- OBS and DaVinci Resolve.
- The seven cards, already exported to `../Indivisa-recording/governed-cards/Slide1.PNG` to `Slide7.PNG`.

No LocalNet. No Docker. Everything here runs against the real DevNet.

## Time

About **70 minutes**, of which roughly 8 minutes is filming. The rest is setting up and waiting for BitSafe.

---

## Part A. Reset the run (not filmed, about 5 minutes)

This is the only terminal work, and it happens before the camera starts.

### A1. Open PowerShell

```powershell
cd <the repository>
```

The client secret comes from `infra\devnet\ui.json`, so there is nothing to paste.

### A2. Top up the agent, then create the run

```powershell
pwsh infra\bitsafe\govern-devnet.ps1 fund -Tag gov1
pwsh infra\bitsafe\govern-devnet.ps1 prepare -Tag gov1
```

`prepare` ends with `6 allocations, 5 legs, total 8421.88`.

**Why `gov1` and not a fresh name.** Every seat creates a brand new paying agent party, and a new party is not an admitted proposer - it would need BitSafe to approve its admission first, which is another round of waiting. `gov1`'s agent was admitted on 29 September. Reuse it.

**Why `fund` first.** The seat funds the agent with exactly one run's worth of cash. A second run on the same seat has nothing to pay with, and `prepare` fails saying there are no holdings. `fund` tops up the *existing* agent, which is the whole point: it avoids a new seat.

### A3. Nothing else to run

There is no `propose` and no `disclose`. The page does both.

### A3b. Tell BitSafe which action to confirm

**Do this before they start, every time.** Run:

```powershell
pwsh infra\bitsafe\govern-devnet.ps1 status -Tag gov1
```

and send them the `action cid` and `description` it prints.

This is not belt-and-braces. On 2 October their Approvals tab carried a **second action that could not be confirmed** (`003a5d6160b5ac07`): its proposer was an old `gov2` paying agent the live rules do not authorise, so every confirmation was refused. **Cleared on 5 October** by exercising `GovernableAction_ProposerCancel` as that party, so the board should now show exactly one card.

The habit stands anyway. If an approver confirms the wrong card the page sits at 0 of 2, nothing on screen explains why, and they believe they have acted. Naming the action costs one line and removes the guess.

### A4. Close any other console first

**Only one dev server may run at a time.** Two of them fight over the same rotating DecMan refresh token - Keycloak invalidates a refresh token once it is used, so the second server kills the first one session and reports `invalid_grant: Token is not active`. Since 1 October the port is pinned, so a second server fails loudly on `Port 5173 is already in use` rather than quietly starting on 5174 where sign-in would not work. If you see that message, close the other window; do not change the port.

---

## Part B. The cards

Seven, already built and verified. In order:

| | Headline | Supporting |
|---|---|---|
| 1 | **Indivisa** | A coupon that one company cannot pay on its own. |
| 2 | A bond coupon. Five holders. One paying agent. | And an approver: a party no single company controls. |
| 3 | The agent cannot settle this alone. | So it asks. The button files a request, not a payment. |
| 4 | Two approvers. One of them is not ours. | BitSafe run the second node, on their own machine. |
| 5 | One approval is not enough. | At one of two, there is nothing to press. |
| 6 | Both agreed. One transaction. Five holders paid. | Settled on Canton DevNet. |
| 7 | This console settles. It does not keep the register. | Holders, positions and the schedule come from systems a paying agent already runs. Here a script stands in for them. |

These seven cards are the governed set, superseded on 5 October when the two films became one. The film that shipped carries fourteen cards, built in `../Indivisa-recording/final-cards.pptx`. The prompt that generated this set was deleted with `docs/prompts/`: it described a six-card, ninety-second cut that no longer exists.

---

## Part C. Set up the screen and the recorder (about 15 minutes)

### C1. The DecMan refresh token

Do this **first**, because the console reads it at startup.

Open the Decentralization Manager - its address is `decman.url` in `infra\devnet\ui.json` - sign in, press **F12**, click **Console**, and paste:

```js
sessionStorage.getItem("dec_party_manager_refresh_token")
```

Copy the value **without the quotes** into:

```
infra/devnet/decman-refresh.txt
```

That file is git-ignored. The dev server trades it for access tokens and writes the rotated one back, so the session stays alive for the whole recording. **Do not use `dec_party_manager_token`** - that is the short-lived access token, and it will expire in the middle of the film.

Close the browser console.

### C2. The console

```powershell
cd ui
npm run dev
```

It should print, among other lines:

```
[indivisa] ledger token minted, lives 300s, refreshing every 198s
[indivisa] DecMan token minted from the refresh token, lives ...s
```

**If the second line is missing or warns**, the vote will show as unavailable and the film cannot be made. Fix it before going on.

Leave this window alone - it is serving the page.

### C3. Check the page before you record

Open `http://localhost:5173` in Chrome. **On DevNet it asks you to sign in first** - that is the gate working, and it is shot 0 (Part F). Sign in, then check the console shows:

- HOLDERS **5**, TOTAL DUE **8,421.88 USD**, ALLOCATIONS **6 / 6**, RUN **PREPARED**.
- A button reading **Ask the approvers to settle 5 legs**.
- Below it: **Approver `indivisa-approvers`** - a decentralised party; its members must confirm before the settle can execute.

**If the approver line is missing, stop.** The run has no approver and the whole film depends on it. Re-run `prepare`.

### C4. Chrome

Two tabs, nothing else:

1. `http://localhost:5173` - the console.
2. The Decentralization Manager (`decman.url` in `infra\devnet\ui.json`), on the **Approvals** tab.

Hide the bookmarks bar with **Ctrl+Shift+B**. Press **F11** for full screen.

**Never show the DecMan Parties tab on camera.** It displays the Keycloak client id and secret.

### C5. OBS

- Settings → **Video**: 1920x1080 for both resolutions, 30 fps.
- Settings → **Output**: Simple; Recording Path `../Indivisa-recording/raw`; High Quality, Medium File Size; **MP4**.
- Settings → **Audio**: every device **Disabled**. You are not speaking.
- Sources → **+** → **Display Capture** → the monitor Chrome is on.

Record ten seconds, check it plays and the text is sharp, delete it.

**Check the recording path.** OBS defaults to your Videos folder, and on 30 September a whole session was recorded there by mistake.

---

## Part D. The eight shots

**Film shot 0 first - it is described in Part F**, because it only exists now that sign-in works and it would have broken the numbering to insert it here. Everything below assumes you are signed in and looking at the console.

You say nothing. The cards carry the words.

Record each shot as its own file, named for the shot. A fluffed mouse move then costs one shot, not the session.

### Shot 1 - the run, waiting (about 10 seconds)

Console tab, at the top of the page. **One still frame, held about eight seconds.** No scrolling and no clicking: at five holders the whole run is on screen at once, and the only thing a moving cursor would do is pull the eye away from the figures. (The 250-holder film scrolls because it has to; this one does not.)

**What the viewer must see, and all three matter:**

- the figures - 5 holders, 8,421.88 USD, 6 / 6 allocations, PREPARED
- all five holder cards READY
- **the approver named under the button** - the setup for the whole film

Check that last line is legible at 1920x1080 before you record it. It is the smallest text on screen and the most important.

If you want emphasis, put a slow push-in on the figures in the edit. It looks deliberate where a wandering mouse pointer looks like a screen share.

### Shot 2 - the agent asks (about 12 seconds)

- Move the cursor to **Ask the approvers to settle 5 legs** and hold for a beat before clicking.
- Click once.
- Stay still.

**What should happen:** the button becomes inactive and an amber strip appears reading **0 of 2 confirmed**.

**This is the shot that replaced the ledger refusal.** The agent pressed its own button and no money moved, because the button does not move money. Card 3 says exactly that over it.

### Shot 3 - our own approval (about 15 seconds)

Switch to the DecMan tab, **Approvals**.

- The pending action is there. Hold for two seconds.
- Press **Confirm**.
- Wait for it to show as confirmed.

We are one of the two members, so confirming here is us doing our own half - not us approving on anybody's behalf.

### Shot 4 - one is not enough (about 12 seconds)

Switch back to the console.

- The strip now reads **1 of 2 confirmed**.
- Hold. Move the cursor across the page and show there is **no green button**.

**This is the refusal that survives**, and it is a better one than the old shot: nothing is being rejected by an error message, there is simply nothing to press. Card 5 goes here.

### Shot 5 - BitSafe agree (about 12 seconds)

Message BitSafe that you are ready. **Start recording before they confirm**, because the page updates on its own every three seconds and the change is the shot.

- Hold on the strip at **1 of 2**.
- It flips to **2 of 2 confirmed** and a green button appears: **Settle 5 legs, now approved**.
- Hold three seconds on the green button without clicking.

You cannot film their screen and should not pretend to. The page changing by itself, because somebody else acted, *is* the evidence. Card 4 belongs just before this.

### Shot 6 - it settles (about 15 seconds)

- Move to the green button, hold a beat, click once.
- Do not move the mouse while it works.

**What should happen:** a green strip reading **SETTLED · 5 of 5 legs · 8,421.88 USD**, with an update id and the submitted-to-committed time.

- Hold five seconds on that strip.

### Shot 7 - the holders are paid (about 15 seconds)

- Scroll slowly down the holder cards.

Every card now reads **PAID** with cash against it. Scroll back to the top.

Scrolling the grid again after settling was the operator's idea on the first film and it was right: without it a viewer cannot tell whether only the visible cards changed.

### Shot 8 - the proof (about 12 seconds)

- Click the **Activity** tab.
- Hold on the settlement row.
- Hover the update id so it is readable.

---

## Part E. The edit (about 30 minutes, DaVinci Resolve)

Timeline 1920x1080, 30 fps.

| Order | Clip | Length |
|---|---|---|
| 0 | Shot 0 - signing in | 8 s |
| 1 | Card 1 | 3 s |
| 2 | Card 2 | 3 s |
| 3 | Shot 1 | 8 s |
| 4 | Card 3 | 3 s |
| 5 | Shot 2 | 10 s |
| 6 | Shot 3 | 10 s |
| 7 | Card 5 | 3 s |
| 8 | Shot 4 | 8 s |
| 9 | Card 4 | 3 s |
| 10 | Shot 5 | 10 s |
| 11 | Card 6 | 3 s |
| 12 | Shot 6 | 10 s |
| 13 | Shot 7 | 12 s |
| 14 | Shot 8 | 8 s |
| 15 | Card 7 | 4 s |

That is **about 1 minute 46 seconds** with shot 0, or 1 minute 38 without it. Trim the holds rather than the cards if it runs long: the cards are the only words in the film.

- Cross dissolve, 12 frames, between every clip.
- No music. The main film has none either.
- Export: **MP4, H.264, 1920x1080, 30 fps**, to `../Indivisa-recording/ready/Indivisa-Governed-DevNet.mp4`.

**Card 7 goes last, after the proof.** Ending on what the demo does *not* do is deliberate: a judge who has just watched a settlement is exactly the person who will wonder what was off camera, and answering before they ask is worth more than another second of success.

---

## Part F. Shot 0 - signing in (about 8 seconds)

**Operator sign-in works on DevNet.** Verified 2 October: signed in as a real Keycloak account, the proxy accepting the token, and a reload keeping the session. It is no longer conditional.

**Film it, at the very front, before card 1.** A judge watching an application that moves money is entitled to ask who is allowed to press the button, and eight seconds answers it better than any sentence on a card.

- Start on the sign-in screen: *"This console settles money. Sign in before it will read or write anything."*
- Click **Sign in**. Keycloak takes over.
- Type the credentials **off camera if you prefer** - pause the recording, sign in, resume on the console. Nothing is lost: the shot is the gate and the arrival, not the typing.
- Land on the console, with the operator name visible at the top right.

**Two things not to claim.** No card, and no caption beyond what the screen says. There are no roles yet and no maker-checker, so anything implying a permission model would be overclaiming; that gap is written down in `production-readiness.md` and on deck slide 13. And the Keycloak page title currently reads **"Chian Experts Canton Devnet"** - a typo in the realm display name, reported to DevOps. If it has not been fixed by the day, either accept it or keep the Keycloak page off camera by pausing as above.

## Part F2. The withdraw link, which is on screen whether you use it or not

From shot 2 onwards the amber strip carries **"Withdraw this request"**. It is a real control: the paying agent signs the request, so it can take it back, and doing so clears the action from the approvers' board.

**The recommendation is to leave it visible and not make a beat of it.** This film makes one argument - that a coupon can need an approval nobody at our company can give - and every second spent elsewhere dilutes it. The control is already on deck slide 11 and written up in `decentralization.md`, which is where a judge who wants it will look.

**If you do want it in the film**, the place is shot 4, where the page is otherwise static at 1 of 2: hover the link for two seconds without clicking, and let it speak for itself. Do not click it - a withdrawal mid-film would need a re-ask, and the run would have to be rebuilt on camera.


## Part G. What a caption may and may not claim

| May say | May not say |
|---|---|
| A coupon one company cannot pay alone | "Nobody can move the money" - we can, with the approvers' agreement, which is the point |
| BitSafe held one of two approvals on their own node | "Three independent operators" - there are two |
| Settled on Canton DevNet | "On MainNet" |
| One transaction, five holders, all or nothing | "No holder saw another" *on DevNet* - all five participant names point at one validator there; that claim belongs to the local five-node run |
| The cash is `splice-test-token-v2`, standing in | "Settled in Canton Coin" |
| The console files the request; the approvers agree elsewhere | "The console approves" - it deliberately cannot confirm |

---

## Troubleshooting

**The vote shows "could not be read".** The DecMan refresh token is stale or missing. Fetch a new one (C1) and restart `npm run dev`.

**`prepare` says there are no holdings.** The agent is out of cash. Run `fund` and try again.

**The page announces a settlement that did not happen, or shows an old refusal.** This was a real bug, fixed on 1 October: a run id is reused, so outcomes are now matched on the ledger's own offsets. If you ever see it again, the filter has regressed - do not film around it.

**"A security-sensitive error has been received."** Canton is refusing a command whose user id does not match the token, and declining to say so. The participant map serves the right id; if this appears, the map is stale - re-run `prepare`, which regenerates it.

**The strip stays at 0 of 2 after BitSafe confirm.** Their confirmation went to a different proposal. Check the action in DecMan's Approvals tab is the one the page filed in shot 2.

**The vote never appears at all after pressing the button.** The page is showing a proposal that is not the one DecMan knows about, and a dead proposal has no vote.

This cannot happen across a settlement: `Run_Settle` consumes the `DistributionRun`, so the next `prepare` creates a fresh one and an older proposal, which points at the archived run, no longer matches. **It can happen when a request is withdrawn and filed again**, because then the run contract is the same one and both proposals belong to it. Since 1 October the page takes the newest by ledger offset, which settles it. If you ever see an outstanding request the approvers do not have, the ordering has regressed.

**Before you call BitSafe, note the action id.** Run:

```powershell
pwsh infra\bitsafe\govern-devnet.ps1 status -Tag gov1
```

and send them the `action cid` and `description` it prints, so there is no question which action to confirm. Checked on 1 October: DecMan listed **zero** pending actions with a stale proposal on the ledger, so their Approvals tab is normally clean - but confirm it rather than assume it.
