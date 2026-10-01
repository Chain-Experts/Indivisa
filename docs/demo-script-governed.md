# The governed settlement: a complete recording script

This films one thing from start to finish: **a coupon that one company cannot
pay on its own.**

It is written for someone who has never seen the project. Every command is
given exactly. Every screen is described before you see it, so you know
whether you are looking at the right thing.

## What makes this different from the main recording

`demo-script.md` films the product's normal mode: the paying agent presses a
button and 250 holders are paid. The governed settlement was added to that
film afterwards, as a section near the end.

This script films the governed mode **as the whole story**, with the console
in it. That matters because the console is where a viewer sees the agent try
to pay and be told no — and the existing film never shows that.

You may end up with two videos, or you may use this one to replace the last
third of the first. Decide after you have watched it.

## Before you film this: it may be about to change

**1-2 October.** Four of the shots below are PowerShell commands, and work is
under way to move two of them (`propose` and `execute`) into the page, with
the vote visible there. See "The terminal gap" in `TASKS.md`.

If that lands, this script changes in one important way: **shot 2 disappears**.
A button that files a proposal when an approver is named is not a button the
ledger can refuse, so the agent never tries and fails. The replacement is the
page saying the run needs approval and offering that instead - a better
product and a quieter film.

The threshold refusal, shot 4, survives either way: it is a deliberately
forced request and no interface prevents it.

**So do not film until that is decided.** If the work is abandoned, this
script stands exactly as written.

## What you need

- The repo at `D:\Dev\ChainExperts\Indivisa`, built (`dpm build --all`).
- The DevNet client secret.
- **Someone at BitSafe available to click Confirm**, at a time you agree in
  advance. This is the only part you cannot do alone, and it is the part the
  film exists to show.
- OBS, DaVinci Resolve, PowerPoint.

No LocalNet. No Docker. Everything here runs against the real DevNet.

## Time

About 90 minutes, of which 10 minutes is filming and the rest is setting up
and waiting for BitSafe.

---

## Part A. Prepare the run (not filmed, about 5 minutes)

### A1. Open PowerShell and set the secret

```powershell
cd D:\Dev\ChainExperts\Indivisa
$env:INDIVISA_CLIENT_SECRET = "<the validator client secret>"
```

### A2. Create a fresh run under an agent that is already admitted

```powershell
pwsh infra\bitsafe\govern-devnet.ps1 prepare -Tag gov1
pwsh infra\bitsafe\govern-devnet.ps1 propose -Tag gov1
```

**Why `gov1` and not a new name.** Every seat creates a brand new paying
agent party, and that party has to be admitted to the governance rules
before it may propose anything. `gov1`'s agent was admitted on 29 September.
A new seat would need BitSafe to approve the admission first, which is an
extra round of waiting.

`prepare` ends with `6 allocations, 5 legs, total 8421.88`.
`propose` ends with `PROPOSED` and an action contract id. Keep that id: it is
what BitSafe will confirm.

If `prepare` fails saying there are no holdings, the agent has run out of
cash and you do need a new seat. See Troubleshooting.

### A3. Do **not** run `disclose` yet

Run it later, after the refusal shot. It collects the contracts the final
step needs, and they must match the allocations that step will consume.

---

## Part B. The title cards (about 20 minutes)

Six cards. Use the prompt in `docs/prompts/governed-cards.md` to have Claude
Desktop build them from the existing deck, so the look matches the other
film exactly.

They export as `Slide1.PNG` to `Slide6.PNG` in
`D:\Dev\ChainExperts\Indivisa-recording\governed-cards\`.

---

## Part C. Set up the screen and the recorder (about 15 minutes)

### C1. The console

The console is the web page that shows the coupon run. Point it at DevNet:

Open a **second** PowerShell window and run:

```powershell
cd D:\Dev\ChainExperts\Indivisa\ui
$env:INDIVISA_CLIENT_SECRET = "<the secret>"
$env:INDIVISA_NETWORK = "devnet"
$env:INDIVISA_TAG = "gov1"
npm run dev
```

It ends with `Local: http://localhost:5173/`. **Leave this window alone** -
it is serving the page.

Open `http://localhost:5173` in Chrome. You should see:

- A dark bar at the top with the Indivisa mark.
- A row of figures: HOLDERS **5**, TOTAL DUE **8,421.88 USD**,
  ALLOCATIONS **6 / 6**, RUN **PREPARED**.
- A green button, **Settle 5 legs in one transaction**.
- Under the button, in place of the usual note:
  *"All or nothing, and not alone: this run names an approver, so the
  agent's own button is refused until the approvers have confirmed and
  executed."*
- Below that: **Approver `indivisa-approvers`** · a decentralised party; its
  members must confirm before the settle can execute.

**If those last two lines are missing, stop.** It means the run has no
approver, and the whole film depends on it. Re-run `prepare` with the
approver named.

### C2. Chrome

Two tabs, nothing else:

1. `http://localhost:5173` - the console.
2. `https://<decman-host>` - the Decentralization Manager,
   on the **Approvals** tab.

Hide the bookmarks bar with **Ctrl+Shift+B**. Press **F11** for full screen.

**Never show the Parties tab on camera.** It displays the Keycloak client id
and secret.

### C3. The DecMan token

You will need it for two commands. Get it **now**, before recording:

On the DecMan tab press **F12**, click **Console**, paste this and press
Enter:

```js
sessionStorage.getItem("dec_party_manager_token")
```

Copy the value without the quotes. In your first PowerShell window:

```powershell
$env:DECMAN_TOKEN = "<paste it>"
cls
```

Close the browser console. The token expires quickly, so if a command later
says the token is bad, fetch a fresh one the same way.

### C4. OBS

- Settings → **Video**: 1920x1080 for both resolutions, 30 fps.
- Settings → **Output**: Simple; Recording Path
  `D:\Dev\ChainExperts\Indivisa-recording\raw`; High Quality, Medium File
  Size; **MP4**.
- Settings → **Audio**: set every device to **Disabled**. You are not
  speaking. If you want narration, add it over the finished cut.
- Sources → **+** → **Display Capture** → pick the monitor Chrome is on.

Record ten seconds, check it plays and the text is sharp, delete it.

**Check the recording path.** OBS defaults to your Videos folder, and on
30 September a whole session was recorded there by mistake.

---

## Part D. The eight shots

Every shot follows the same pattern:

> Start Recording → hold still 5 seconds → do the thing → hold still 10
> seconds → Stop.

The holds matter. They give the editor room to cut, and they give a viewer
time to read.

Rename each file as soon as you stop, or you will not remember which is
which.

### Shot 1 - the run, waiting

**Where:** Chrome, the console tab.

Hold still on the page for five seconds. Then move the mouse slowly to the
**Approver** line and rest there three seconds, so it can be read.

**Name it:** `g1-run-with-approver.mp4`

**What it shows:** a coupon ready to pay, and a named party that has to agree
first.

### Shot 2 - the agent tries alone

**Where:** the same page, still recording or a new recording.

Click the green **Settle 5 legs in one transaction** button. Do not move the
mouse afterwards.

**What should happen:** the ledger refuses, and the page shows a red
**REJECTED** state with the reason.

**Name it:** `g2-agent-alone-refused.mp4`

**If the button is greyed out** and cannot be clicked, do not force it.
Film the note and the Approver line instead, and rename the file
`g2-agent-alone-note.mp4`. Tell the editor; card 3 still works.

### Shot 3 - the first approver agrees

**Where:** Chrome, the DecMan tab, Approvals.

You should see a row: **SettleDistributionRun**, with the description
*Settle XS2999912340/Coupon/2027-12-01: 5 legs, 8421.88 USD*, and **0 of 2**.

Rest on it three seconds so the amount can be read. Click **Confirm**. Wait
until it reads **1 of 2**.

**Name it:** `g3-confirm-ours.mp4`

### Shot 4 - one is not enough

**Where:** PowerShell.

```powershell
pwsh infra\bitsafe\settle-execute.ps1 -Tag gov1
```

It prints `confirmations 1`, `can execute False`. Hold three seconds. Then:

```powershell
pwsh infra\bitsafe\settle-execute.ps1 -Tag gov1 -Execute -Force
```

**What should happen:**

```text
REFUSED by the governance engine

  The requirement 'Enough confirmations to execute action' was not met.

  1 of 2 confirmations. Nothing moved.
```

**Name it:** `g4-below-threshold-refused.mp4`

**`-Force` is essential.** Without it the script prints its own message,
`not yet at threshold`, which is this repository declining to send the
request. That is not the ledger refusing, and filming it would claim
something we did not show.

### Shot 5 - the second approver agrees

**Where:** Chrome, the DecMan tab.

This is the shot BitSafe have to be present for. Agree a time with them, have
the recording running, and film the count change from **1 of 2** to
**2 of 2**.

**Name it:** `g5-confirm-theirs.mp4`

**This is the most important shot in the film.** It is another company
agreeing, in their own software, on their own machine, before your money
moves.

### Shot 6 - now it settles

**Where:** PowerShell. First, not filmed:

```powershell
pwsh infra\bitsafe\govern-devnet.ps1 disclose -Tag gov1
```

Then start recording:

```powershell
pwsh infra\bitsafe\settle-execute.ps1 -Tag gov1
```

`confirmations 2`, `can execute True`. Hold three seconds. Then:

```powershell
pwsh infra\bitsafe\settle-execute.ps1 -Tag gov1 -Execute
```

It prints **EXECUTED**.

**Name it:** `g6-settled.mp4`

### Shot 7 - the holders are paid

**Where:** Chrome, back on the console tab.

Within a few seconds the page changes on its own: the pill reads **SETTLED**,
a green box appears, and every holder card turns green with a **PAID** pill.

Rest there. Do not click anything.

**Name it:** `g7-console-settled.mp4`

**This is the payoff.** The same page that refused the agent two minutes ago
now shows every holder paid - and the only thing that changed is that a
second company agreed.

### Shot 8 - the proof

**Where:** PowerShell.

```powershell
pwsh infra\bitsafe\govern-devnet.ps1 evidence -Tag gov1
```

It prints the receipt and an **update id** - a long code that identifies the
transaction on the real network. Hold ten seconds so a viewer can pause and
read it.

**Name it:** `g8-evidence.mp4`

---

## Part E. The edit (about 30 minutes, DaVinci Resolve)

New project. **File → Project Settings**: 1920x1080, 30 fps.
**Preferences → User → Editing → Standard still duration**: 3 seconds.

Drag everything in: the eight clips from `raw`, and the six PNGs from
`governed-cards`.

Lay them out in this order:

| # | Item | Keep | What it carries |
| --- | --- | --- | --- |
| 1 | `Slide1.PNG` | 3 s | title |
| 2 | `Slide2.PNG` | 4 s | a coupon, five holders, and an approver |
| 3 | `g1-run-with-approver.mp4` | ~8 s | the run, and the party that must agree |
| 4 | `Slide3.PNG` | 4 s | the agent cannot settle alone |
| 5 | `g2-agent-alone-refused.mp4` | ~8 s | it tries; the ledger refuses |
| 6 | `Slide4.PNG` | 4 s | two approvers, one of them not ours |
| 7 | `g3-confirm-ours.mp4` | ~6 s | the first agrees |
| 8 | `g4-below-threshold-refused.mp4` | ~9 s | one is not enough |
| 9 | `Slide5.PNG` | 3 s | below the threshold nothing moves |
| 10 | `g5-confirm-theirs.mp4` | ~7 s | **the second agrees** |
| 11 | `g6-settled.mp4` | ~7 s | executed |
| 12 | `g7-console-settled.mp4` | ~8 s | every holder paid |
| 13 | `g8-evidence.mp4` | ~6 s | the update id |
| 14 | `Slide6.PNG` | 6 s | closing |

That lands near **85 seconds**.

**Trimming.** Drag a clip's edge inwards, then right-click the gap and choose
**Delete Gap**. To cut a clip in two, park the playhead and use
**Timeline → Blade**.

**No music, no transitions, no zoom effects.** A straight cut is right for
this, and effects read as padding.

**Export:** Deliver page → H.264 Master → MP4, 1920x1080, 30 fps → name it
`Indivisa-Governed.mp4` → Add to Render Queue → Render All. Watch it once,
end to end.

---

## Part F. What to say, if there is a voice-over

One sentence per shot, spoken slowly. Silence between them is fine.

- Over the run: "A bond coupon, five holders, and a paying agent that cannot
  pay them by itself. This run names an approver."
- Over the refusal: "The agent presses its own button. The ledger refuses.
  It does not have the authority alone."
- Over the first confirmation: "One approver agrees."
- Over the engine refusing: "One is not enough. Nothing moves."
- Over the second confirmation: "The second approver is not us. It is
  BitSafe, on BitSafe's own node."
- Over the settlement: "Now it executes. Five holders paid in one
  transaction."
- Over the evidence: "On Canton DevNet. The update id is on screen; you can
  check it."

---

## Part G. What a caption may and may not claim

**May say:**

- The settlement needed two approvals, and one of them was not ours.
- BitSafe ran the second node. We could not have produced this transaction
  alone.
- The refusal came from the ledger and from BitSafe's governance engine, not
  from our own code.
- The update id is real and on Canton DevNet.

**May not say:**

- That the cash is real money. It is `splice-test-token-v2`, the Token
  Standard's own reference asset. Say so.
- That holders never authorise. They authorise once, at onboarding.
- That no one can see the run. The paying agent sees all of it, by design,
  and so do the approvers. What is private is that **no holder sees
  another**.
- "Two of three approvers." On DevNet it is **two of two**. Three of three
  approver nodes is the local Docker version, where the independence is
  simulated.

---

## Troubleshooting

| What happened | What it means | What to do |
| --- | --- | --- |
| `prepare` says no holdings | The agent spent its cash on an earlier settlement | Seat a new tag, then admit its agent with `infra\bitsafe\admit-proposer.ps1` - this needs BitSafe as well |
| Confirming fails: *Proposer is authorized...* | The agent of this seat was never admitted | You are on a fresh seat. Use `gov1`, or admit this one |
| Any command says the token is bad | The DecMan token expired | Fetch a fresh one, see C3 |
| `No such host is known` | Local DNS hiccup, not DevNet | Wait a minute, try again |
| The console shows no Approver line | The run was prepared without an approver | Re-run `prepare -Tag gov1`; the script passes the approver automatically |
| The console shows nothing at all | Wrong network or tag | Check `INDIVISA_NETWORK=devnet` and `INDIVISA_TAG=gov1` in the window running `npm run dev` |
| Clip 4 prints `not yet at threshold` | You left off `-Force` | Re-film with it |
| `evidence` shows an old update id | There are several receipts | Already fixed - it takes the newest and says how many it found |
