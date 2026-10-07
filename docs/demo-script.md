# The recording: a complete script

> For the **governed** settlement filmed end to end as its own story - with the console showing the agent's own button refused until a second company agrees - see [`demo-script-governed.md`](demo-script-governed.md). This script films the product's normal mode and carries the governed run as a section near the end.

This is written for someone who has never seen the project. Follow it top to bottom. Every command is given exactly; every screen is described before you see it, so you know whether you are looking at the right thing.

Nothing in the recording is mocked. The numbers on screen are read from a Canton ledger running on this machine while you record. There is **no Docker** in the main recording (Parts A to H); the network is one Java process started by a script. Part I, a separate short clip for the BitSafe challenge, is the one place Docker appears.

Time budget, first time through: about 2.5 hours, of which 1 hour is waiting for two demo seats to build. Second time: about 1 hour.

## 0. What the recording session produces

None of this exists yet. Following this script creates it; the folder is made at the first save.

| File | What it is |
|---|---|
| `../Indivisa-recording/raw/take1.mp4` | the success run, one clip |
| `../Indivisa-recording/raw/take2-rejected.mp4` | the deliberate failure |
| `../Indivisa-recording/raw/take2-settled.mp4` | the fix and the retry |
| `../Indivisa-recording/raw/take3-governed-refused.mp4` | one approval is not enough (Part I) |
| `../Indivisa-recording/raw/take3-governed-settled.mp4` | two approvals, and it settles (Part I) |
| `../Indivisa-recording/cards.pptx` and `cards/Slide1.PNG` … `Slide8.PNG` | eight title cards |
| `../Indivisa-recording/Indivisa-HackCanton-S3.mp4` | **the finished video, one file, under 2 minutes** |

**One submission, one video.** HackCanton allows a single entry to entre several challenges, so the governed settlement is not a separate film: it is the last third of the same one. Part I is a third recording session, on a different network, cut into the same timeline. The parts are recorded on different days only because the two networks do not fit in memory together.

The `Indivisa-recording` folder sits **next to** the repo, not inside it, so video files never end up in git.

## 1. What you need

- This workstation (Windows 11), with the repository already set up (dpm, Node, PowerShell 7, Chrome). If `dpm build --all` has ever worked here, everything is in place.
- **OBS Studio** (free, obsproject.com) to record the screen. Install with defaults. Windows' own Game Bar (Win+Alt+R) also works but records only one window and gives you no control; OBS is worth the ten minutes.
- **DaVinci Resolve** to cut the clips together (free from blackmagicdesign.com). Part F is written for it.
- **PowerPoint** for eight title cards.
- A quiet hour for the recording itself. Turn on Do Not Disturb (Windows Settings → System → Notifications → Do not disturb: On) so no toast pops into the video.
- Keep the machine **awake** from the moment the network starts until the last clip is recorded: Settings → System → Power → Screen and sleep → both "Never" for now. The network lives in memory; if the PC sleeps or restarts, everything seated is gone and Part A starts again.

## Part A. Bring the network up and seat the two demos (≈ 1¼ hours, mostly waiting)

Open **PowerShell 7**: press the Windows key, type `pwsh`, Enter. A window with a `PS C:\Users\...>` prompt appears. Keep this window open for the whole session; call it **window 1**.

**A1. Go to the repo.**

```
cd <the repository>
```

**A2. Build the Daml packages** (2 minutes; it must happen before the network starts, because the network uploads the built package on start).

```
dpm build --all
```

Wait for the prompt to come back. Among the last lines there must be `Created .daml\dist\indivisa-0.4.0.dar` and `Created .daml\dist\indivisa-test-0.1.0.dar` (three more packages build after them; they belong to a separate challenge and do not matter here). Any line starting with `error` means stop and ask for help.

**A3. Start LocalNet** (about 5 minutes).

```
pwsh infra\localnet\up.ps1 -Heap 12g
```

Text scrolls for a few minutes while five Canton nodes start and upload packages. It ends with a line containing **`LocalNet is up`**. If instead you see `Timed out` or `exited early`, run `pwsh infra\localnet\up.ps1 -Down`, wait ten seconds, and run A3 again.

**A4. Seat demo one** (the success run; 30 to 35 minutes).

```
pwsh infra\demo.ps1 seat -Holders 250 -Tag take1
```

This creates 250 holder parties, the bond, the register, the holders' one-time agreements, the coupon announcement and the payment schedule. Nothing prints for a long time; that is normal. It ends with one line:

```
seat 'take1' on localnet: 250 holders in 2,0xxs -> infra/localnet/demo/seat-take1.json
```

**A5. Seat demo two** (the failure run; another 30 to 35 minutes).

```
pwsh infra\demo.ps1 seat -Holders 250 -Tag take2
```

Same ending line, with `take2`.

**A6. Prepare both runs** (under a minute each). This creates the cash allocations that the one transaction will settle. Demo one gets all of them; demo two is deliberately left with one holder missing.

```
pwsh infra\demo.ps1 prepare -Tag take1
pwsh infra\demo.ps1 prepare -Tag take2 -Withhold 1
```

Expected endings: `prepare 'take1' (withhold 0): 1xs -> ...prepared-take1.json` and, for take2, a line `withholding the receipt allocation of 'Hanna-Ivanova-take2-...'` followed by `prepare 'take2' (withhold 1): 1xs -> ...`. Hanna Ivanova is the last holder of every 250-holder seat; she is the one who will block the batch.

**A7. Start the two web pages.** Open a **second** PowerShell window (window 2) and run:

```
cd ui
npm install
$env:INDIVISA_TAG = "take1"
npm run dev
```

`npm install` only does anything the first time. The last lines show `➜  Local:   http://localhost:5173/`. Leave window 2 alone; it is now serving demo one.

Open a **third** PowerShell window (window 3):

```
cd ui
$env:INDIVISA_TAG = "take2"
npm run dev -- --port 5174
```

It shows `➜  Local:   http://localhost:5174/`. Window 3 serves demo two.

**A8. Check both pages in Chrome.** Open Chrome, go to `http://localhost:5173`. Within two seconds you should see:

- A dark bar across the top: the **Indivisa** mark and wordmark, the line *Corporate actions, settled in one atomic batch, without exposing the register.*, a green **live** pill, and two labels: "real · ledger reads and the settle are live over the JSON Ledger API" and "simulated · the cash is TestTokenV2, the holders are synthetic".
- Under it a row of figures: INSTRUMENT *Northwind Rail 4.375% 2031 XS2999912340 · coupon · record 2027-11-15 · pays 2027-12-01* · HOLDERS *250* · PER UNIT *21.875 USD* (with *x 54,731 units = 1,197,240.625* beneath it; the rate keeps its decimals, it is not money) · TOTAL DUE **1,197,240.63 USD** · ALLOCATIONS **251 / 251** with a full bar · RUN **PREPARED**.
- A big green button **Settle 250 legs in one transaction** and the note "All or nothing. If any leg cannot settle, nothing moves."
- Four tabs (**Holders 250**, Schedule, Privacy, Activity) with Holders open: a search box, the chips **All 250 · Waiting 0 · Ready 250 · Paid 0**, and a card for every holder, each showing its participant, units, amount due and cash, with a **READY** pill.

Now open a second tab at `http://localhost:5174`. Identical, except the button's note ends **Waiting for <a holder name>** in red, the chips read **Waiting 1 · Ready 249**, and that holder's card has a red left edge and a **WAITING** pill.

If either page shows a red error box instead, see Troubleshooting at the end. Do not record until both pages look right.

The network and both pages can now sit for hours. Do the cards and the recorder setup next.

## Part B. The eight title cards in PowerPoint (≈ 28 minutes)

Open PowerPoint → Blank Presentation. Design → Slide Size → Widescreen (16:9) (it usually is already). Set every slide to a plain background: Design → Format Background → Solid fill → colour `#F6F7F3` (the page's off-white); text colour `#1B2622`; the green used below is `#1E6B48`. Use one clean font throughout (Segoe UI or Calibri), large: 44 pt for the first line, 28 pt for the rest. Left-aligned, generous margins. No clip art, no animations.

| Slide | Text, exactly |
|---|---|
| 1 | **Indivisa** (green, 66 pt) / Corporate actions, settled in one atomic batch, without exposing the register. / Chain-Experts · HackCanton Season 3 |
| 2 | **A bond coupon. 250 holders. One paying agent.** / Every number you are about to see is read live from a Canton ledger. / *(small, 20 pt, at the bottom)* Real: the ledger, the settlement, the update id. Simulated: the cash (TestTokenV2, the reference Token Standard V2 asset) and the holders. |
| 3 | **Each holder's node holds its own line.** / And nothing about anyone else. Not filtered: never delivered. |
| 4 | **Now the same run, with one holder not ready.** / This is the atomicity test. If any leg cannot settle, nothing moves. |
| 5 | **A coupon this size should not move on one signature.** / The run can name an approver: a party no single company controls. / *(small, 20 pt)* Governed through BitSafe's Decentralization Manager. Three approver nodes, threshold two. |
| 6 | **Below the threshold, the ledger refuses.** / One approval is not enough. Nothing moves. |
| 8 | **The holder is made ready.** / Same run. Same button. Nothing else changes. *(used between the refusal and the fix, not at the end - add it as the LAST slide so the earlier numbers do not move)* |
| 7 | **One transaction. 250 holders paid at the same instant, or nobody.** / Measured on LocalNet: 250 legs in 1.6 s · 1,000 in 11.1 s · pushed to 13,000 legs in 10.4 s / **Settled on Canton DevNet, 24 Sep 2026**, update id `1220652e…f466b` / **Run it yourself:** `cd quickstart && docker compose up` / Built on Token Standard V2 (CIP-0112, approved June 2026) · github.com/Chain-Experts/Indivisa |

Save: File → Save As → `../Indivisa-recording/cards.pptx` (create the folder in the dialog if it does not exist).

Export as images: File → Export → Change File Type → PNG Portable Network Graphics → Save As → choose the folder `../Indivisa-recording`, file name `cards` → Save → when asked "Which slides do you want to export?" click **All Slides**. PowerPoint creates a folder `cards` with `Slide1.PNG` … `Slide8.PNG`.

## Part C. Set up the screen and the recorder (≈ 15 minutes)

**C1. Chrome.** Use one Chrome window with the two tabs from A8, nothing else open in it. Hide the bookmarks bar (Ctrl+Shift+B until it disappears). Press **F11** for full screen: the address bar vanishes, so no "localhost" appears in the video. Check the zoom: press Ctrl+0 (100%), then Ctrl and + once (110%). The figures across the top must sit on **one row** and the card grid must be at least five cards wide; if either has broken up, press Ctrl and − once. Scroll to the top of the page (Home key).

**C2. OBS.** Open OBS Studio.

- Settings (bottom right) → **Video**: Base (Canvas) Resolution 1920x1080, Output (Scaled) Resolution 1920x1080, Common FPS Values 30. OK.
- Settings → **Output**: Output Mode *Simple*; Recording Path → Browse → `../Indivisa-recording/raw` (create it); Recording Quality *High Quality, Medium File Size*; Recording Format *MP4* (or *Hybrid MP4* on newer OBS). OK.
- Settings → **Audio**: if you will speak, leave Mic/Auxiliary on your microphone; if not, set every device to Disabled so the video is silent.
- In the main window, under **Sources**, click **+** → **Display Capture** → OK → pick the monitor Chrome is on → OK. The preview shows your desktop.
- Do a ten-second test: **Start Recording**, Alt+Tab to Chrome, wait, Alt+Tab back, **Stop Recording**. Open the file in `../Indivisa-recording/raw` and check it plays and the panes are sharp. Delete the test file.

**C3. Rename as you go.** OBS names files by date and time. After each clip, rename it in File Explorer to the name in section 0 so the edit is easy.

## Part D. Record take 1: the success run (≈ 5 minutes)

Chrome is full screen on the **5173** tab (demo one). OBS is behind it.

1. In OBS click **Start Recording**. Alt+Tab to Chrome. Let the page sit still for **five full seconds** with the mouse parked at the bottom right, off any text. (This still frame is shots 1 and 2 of the edit.)
2. Move the mouse slowly down the card grid: **every one of the 250 holders has a card**, each marked **READY**, then back up to the button. Take about eight seconds. Do not click anything.
3. Click **Omar Berg**'s card. The panel on the right opens: his position, his agreement, his allocation, his cash, and under WHAT THIS NODE HOLDS ABOUT OTHER HOLDERS six lines all reading **0**, ending in "Nothing. Not hidden. Never received by this participant." Rest there three seconds, close it, and open **Ingrid Andersen**'s for three more. Two different nodes, the same answer.
4. Move to the green button **Settle 250 legs in one transaction** and **click it once**. The button text changes to *Settling…*. Do not move the mouse.
5. After one to three seconds the pane changes: the pill reads **SETTLED**, the button is greyed out and reads *Settled*, and a green box appears: **SETTLED · 250 of 250 legs · 1,197,240.63 USD**, then *update id 1220…* (a long code), then *effective 2026-… · submitted to committed in 1,6xx ms*. ALLOCATIONS now reads *251 consumed by the settlement*. Within two more seconds **every card in the grid turns green at once**: green border, green tint, pill **PAID**, and the CASH figure on each fills in, and the chips read **Paid 250**. Open any card again: the six zeros are unchanged.
6. Let it sit for **ten seconds**, so the green box can be read. Then scroll slowly down through the grid a second time: every one of the 250 cards is green, not only the ones that were on screen. This mirrors the scroll in step 2 - 250 READY before, 250 PAID after - and is what makes "all or nothing" visible rather than asserted. **End there.** Do not scroll back to the top: the video cuts to a title card next, and a screen full of green cards is the stronger last frame. Alt+Tab to OBS, **Stop Recording**.
7. Rename the new file to `take1.mp4`.

If step 5 shows a red box instead of green, something is wrong with the seat, not with your recording; stop, keep the file, and see Troubleshooting.

## Part E. Record take 2: the deliberate failure, then the fix (≈ 10 minutes)

**Success first, failure second**, which is why take 1 is the success run. A failure shown cold reads as a bug rather than as a guarantee; shown after a settlement that worked, it reads as the ledger refusing to do half a job.

Switch Chrome to the **5174** tab (Ctrl+Tab, or Ctrl+2). Confirm ALLOCATIONS reads **250 of 251 · waiting for <name>**.

**E1. The refusal.**

1. **Start Recording** in OBS, Alt+Tab to Chrome, five seconds still with the mouse parked. Hover over the red **Waiting for <name>** for two seconds, then click the **Waiting 1** chip: the grid drops to that one card, with its red edge and **WAITING** pill. Rest there for three, then click **All** to bring the 250 back. The page names the holder who is holding the batch up before the ledger does; that is worth showing, because the refusal then agrees with it.
2. Click **Settle 250 legs in one transaction**. *Settling…* for about a second, then the pill turns red **REJECTED** and a red box appears: **SETTLEMENT REJECTED · 250 payments requested · 0 executed**, then **NO PARTIAL SETTLEMENT**, then several lines of the ledger's own reason (it contains the words *missing authorizations* and the name *Hanna-Ivanova-take2-…*), then *recorded on-ledger at 2026-…*.
3. Look at the grid: unchanged. Every card still **READY**, no green, every CASH still **0.00**. Rest the mouse there for three seconds. Nothing moved for the 249 who were ready either. That is the point.
4. Ten seconds still, then **Stop Recording**. Rename to `take2-rejected.mp4`.

**E2. The fix.** In **window 1** (PowerShell, the repo folder) run:

```
pwsh infra\demo.ps1 prepare -Tag take2
```

It ends with `prepare 'take2' (withhold 0): 1xs -> ...`. This creates the one allocation that was withheld. **Record this window.** Card 4 sets up the failure and does not explain the fix, so without this shot the film cuts from a refusal straight to a settlement with nothing in between - which reads as the refusal having been random rather than a real constraint being cleared. A plain terminal, one command, one line back, is also the only moment in the film where a person visibly does something. Start Recording, type the command, wait for the line, Stop Recording, rename to `take2-fix.mp4`.

**E3. The retry.** Back in Chrome on the 5174 tab, within a few seconds ALLOCATIONS reads **251 of 251**; the red box and the REJECTED pill are still showing (that is correct: the refusal happened and is on record).

1. **Start Recording**, five seconds still, hover on **251 of 251**.
2. Click the button. *Settling…*, then green: **SETTLED · 250 of 250 legs · 1,197,240.63 USD**, update id, commit time; every card in the grid flips to **PAID**, green, with its cash.
3. Ten seconds still. **Stop Recording**. Rename to `take2-settled.mp4`.

Recording is finished. You can close OBS. Leave the network running until the edit is done in case a clip needs re-shooting.

## Part F. The edit in DaVinci Resolve (≈ 45 minutes)

Written for someone who has not used Resolve before. Menu paths rather than shortcuts, because the shortcuts differ between versions.

**F1. Set the project up.**

Open DaVinci Resolve → **New Project**, call it `Indivisa`. Then **File → Project Settings → Master Settings**: Timeline Resolution **1920 x 1080**, Timeline Frame Rate **30**. These must match what OBS recorded or Resolve will letterbox or resample the footage.

While you are there: **Preferences → User → Editing → Standard still duration** = **3 seconds**. That is roughly what a title card needs, and it saves changing each one by hand.

**F2. Bring the files in.**

Bottom of the window there is a row of pages: Media, Cut, Edit, Fusion, Color, Fairlight, Deliver. Click **Media**.

Drag in every `.mp4` from `../Indivisa-recording/raw` and every `Slide*.PNG` from `../Indivisa-recording/cards`. They land in the **Media Pool**.

Click **Edit**.

**F3. Lay the timeline out.**

Drag items onto the timeline in this order. The "keep" column is the part of the clip that survives trimming, not the length of the file.

| # | Item | Keep | What it carries |
|---|---|---|---|
| 1 | `Slide1.PNG` | 3 s | title |
| 2 | `Slide2.PNG` | 4 s | 250 holders, and what is real or simulated |
| 3 | `take1.mp4`, from the start to just before the click | ~14 s | the page, the grid of 250, the two holder cards with their six zeros |
| 4 | `Slide3.PNG` | 3 s | "Each holder's node holds its own line" |
| 5 | `take1.mp4`, the click through the green box, the cards going green, and the scroll through them | ~16 s | the settlement |
| 6 | `Slide4.PNG` | 4 s | "Now the same run, with one holder not ready" |
| 7 | `take2-rejected.mp4`, the click through the red box and the unchanged grid | ~12 s | the refusal |
| 7b | `Slide8.PNG` | 3 s | "The holder is made ready" - without this the terminal is unexplained |
| 7a | `take2-fix.mp4`, the command and the line coming back | ~5 s | the one withheld allocation is created - this is what changed |
| 8 | `take2-settled.mp4`, the click through the green box | ~9 s | the retry |
| 9 | `Slide7.PNG` | 6 s | closing |

That lands near **79 seconds**. Note the order: item **7b** (the card) comes before **7a** (the terminal). There is deliberately no card between 7a and 8 - the fix and the retry are one thought, and a card there would cut it in half. The organisers allow five minutes; two is the target, because judging is asynchronous and a judge watches many.

**Trimming.** The quickest way in Resolve is to drag a clip's left or right edge inwards; the clip shortens and a gap opens. Then right-click the gap and choose **Delete Gap** (or select the piece you do not want and right-click → **Ripple Delete**, which removes it and closes up in one move). To cut a clip in two first, park the playhead and use **Timeline → Blade** (Ctrl+B on most builds).

**Do not add music, transitions or zoom effects.** A straight cut is right for this, and effects read as padding.

**F4. When the governed clips exist.**

Part I produces `take3-governed-refused.mp4` and `take3-governed-settled.mp4`. When they do, insert four items between 8 and 9 above, and nothing else changes:

| # | Item | Keep |
|---|---|---|
| 8a | `Slide5.PNG` | 4 s |
| 8b | `take3-governed-refused.mp4`, the click through the red box | ~11 s |
| 8c | `Slide6.PNG` | 3 s |
| 8d | `take3-governed-settled.mp4`, the second confirmation through the green box | ~11 s |

That takes the film to about **108 seconds**, still inside the target. **Cut and keep the shorter version first.** A finished 79-second film in hand beats a 100-second one that depends on a network you do not control.

**F5. Voice-over, if you want one.**

The lines are in Part G, one sentence per shot. In Resolve, add an audio track (right-click the track header → **Add Track**), then use the **Fairlight** page to record onto it while the timeline plays. Because the picture is already cut, you can redo the voice as often as you like.

Silence with good title cards is a perfectly respectable submission. Decide after you have watched the cut once.

**F6. Export.**

**Deliver** page → preset **H.264 Master** → Format MP4, Codec H.264, Resolution 1920x1080, Frame rate 30 → set the filename to `Indivisa-HackCanton-S3` and the location to `../Indivisa-recording/` → **Add to Render Queue** → **Render All**.

Play it once, end to end, before you call it done.

## Part F2. What ships beside the video

The film is one of four things a judge can look at. Do not try to get the other three into it; point at them instead.

| | Where |
|---|---|
| **The DevNet run** | `docs/devnet-run.md`: update id `1220652e…f466b`, 24 Sep 2026 |
| **Run it yourself** | `quickstart/`: `docker compose up`, no account, no toolchain. The same package also runs the governed settlement, so a judge can hold the vote themselves |
| **The measured ceiling** | `docs/benchmark.md`: 13,000 legs in one transaction, and where it stops |
| **The governed settlement** | `docs/decentralization.md`: the BitSafe integration, written up |

Card 7 carries the first two. The README carries all four, and it is the first thing a judge opens after the video.

## Part G. What to say, if there is a voice-over

One sentence per shot, spoken slowly; silence is fine between them.

- Over the still page: "A bond pays its coupon to two hundred and fifty holders. This is the paying agent's view: every holder, every amount."
- Over the card grid: "Every holder, read from its own node." Over the opened card: "This is one holder's view, answered by its own participant. Its own line, and nothing about anyone else. Not filtered. Never delivered."
- Over the click: "One transaction."
- Over the green box: "Settled. Every holder paid at the same instant. The update id is on screen."
- Over card 4 and the second click: "Now the same run with one holder not ready. If any leg cannot settle, nothing moves."
- Over the red box: "Refused by the ledger. Two hundred and fifty requested, zero executed. The refusal itself is recorded."
- Over the retry: "The holder is made ready. Same button. Settled."
- Over the closing card: "This ran on Canton DevNet on the twenty-fourth of September; the update id is on screen. And you can run all of it yourself in one command. Indivisa. Corporate actions, settled in one atomic batch, without exposing the register."

## Part H. What a caption may and may not claim

- "Every holder paid at the same instant or nobody": yes; that is what one `SettlementFactory_SettleBatch` transaction means, and take 2 shows the "nobody" half.
- "No holder sees another's payment": yes on LocalNet, where each holder is on its own participant; the zeros are absence, not filtering. On a DevNet with one validator say "each holder's view contains only its own leg".
- **Never** "zero information leakage": the paying agent sees everything, by design, and the schedule table shows it.
- "One transaction": yes; the update id on screen is one id. Do not say "one block" or "one second".
- The cash is `TestTokenV2`, the reference Token Standard V2 asset, not Canton Coin; the holders and their positions are generated. Both labels are in the page header throughout; keep the header in frame.
- The timing line on card 7 is from `benchmark.md`; quote it as LocalNet (five nodes on one machine). The DevNet line beside it is a different claim and both are true: the numbers are LocalNet, the update id is DevNet.
- **The DevNet run is real and may be shown** (24 Sep 2026, five holders, one transaction, update id `1220652e2e4d32822c39d2ad72088e163eed04718ad1108998001b01aa3483ff466b`, `docs/devnet-run.md`). What it proves is that the real network vets our packages and commits a real `SettlementFactory_SettleBatch`. It does **not** prove cross-operator privacy: Chain-Experts runs one validator, so every party is on one node there. Say "settled on DevNet", never "each holder on its own node on DevNet".
- The 13,000-leg figure on card 5 is **legs, not holders**: 13,000 legs over 250 holders, the run that found the ceiling. The holder figure is 1,000 measured and about 6,400 derived. Saying "13,000 holders" would be false.

## Part I. The governed settlement, on DevNet (about 30 minutes, plus waiting)

**Filmed against DevNet, not the Docker sandbox.** The sandbox version is three approver nodes on this machine: an honest demonstration of the mechanism and a simulated one of the independence. On DevNet the second approver is BitSafe, on BitSafe's node, and that difference is the whole point of the section. The sandbox instructions are kept below as a fallback.

Nothing here needs LocalNet, so it does not compete with Parts D and E for memory and needs no separate day.

**The constraint is BitSafe, not us.** Four of the six clips need nobody; two need someone on their side to confirm, ideally at an arranged time so the confirmation can be filmed landing.

### I0. A fresh seat needs a fresh admission

The trap that cost a take on 30 September. **Every seat allocates a new paying agent party**, and the agent must be admitted to the governance rules as an *additional proposer* before it can file a proposal. That admission is granted to one party id and does not carry to the next seat, so a new seat's proposal fails at confirmation with `The requirement 'Proposer is authorized (member or additional proposer)' was not met`.

So **reuse a seat whose agent is already admitted**. `prepare` can be run again on a settled tag: it creates a fresh run and fresh allocations under the same agent, provided that agent still holds unlocked cash.

```powershell
$env:INDIVISA_CLIENT_SECRET = "..."
pwsh infra/bitsafe/govern-devnet.ps1 prepare -Tag gov1
```

Seat a new tag only if you must, and then expect an extra approval round to admit its agent (`infra/bitsafe/admit-proposer.ps1`), which needs BitSafe too.

### I1. Prepare, not filmed (about 3 minutes)

Run the `prepare` above. Do **not** run `disclose` yet - run it after the refusal shot, so the blobs match the allocations the execute consumes.

### I2. The six clips

Terminal shots: PowerShell full screen, `cls` first, nothing else visible. Browser shots: Chrome on the DecMan **Approvals tab**, F11.

**Never film the Parties tab** - it shows the Keycloak client id and secret. Fetch `DECMAN_TOKEN` from the browser console *before* recording, not during.

| # | Clip | Needs BitSafe | What it shows |
| --- | --- | --- | --- |
| 1 | `take3-propose.mp4` | no | `propose` - the agent asks for something it cannot grant itself |
| 2 | `take3-confirm-ours.mp4` | no | our confirmation in the DecMan UI, 0 of 2 to 1 of 2 |
| 3 | `take3-governed-refused.mp4` | no | `settle-execute.ps1` at 1 of 2, then `-Execute -Force`, and the engine refusing |
| 4 | `take3-confirm-theirs.mp4` | **yes** | their confirmation landing, 1 of 2 to 2 of 2 |
| 5 | `take3-governed-settled.mp4` | after 4 | `settle-execute.ps1 -Execute` - settled |
| 6 | `take3-evidence.mp4` | after 5 | `evidence` - the receipt and the update id |

Each clip: start recording, hold five seconds, do the thing, hold ten seconds, stop.

**Clip 3 must use `-Force`.** Without it the script prints its own guard, `not yet at threshold`, which is this repository declining to submit and not the ledger refusing. The sentence worth filming is the engine's:

```text
REFUSED by the governance engine

  The requirement 'Enough confirmations to execute action' was not met.

  1 of 2 confirmations. Nothing moved.
```

Between clips 3 and 5, run `disclose` (not filmed):

```powershell
pwsh infra/bitsafe/govern-devnet.ps1 disclose -Tag gov1
```

### I3. Where the clips go

Into the same film, between items 8 and 9 of the running order in Part F4. Cards 5 and 6 are already made. Expect to use three or four of the six: the edit wants the refusal, the confirmation landing and the settlement, and the rest exist so the choice does.

---

### Fallback: the Docker sandbox

Only if BitSafe cannot be reached before the deadline. This runs on their own sandbox in Docker rather than our LocalNet, and the two do not fit in memory together, so record Parts D and E first, stop LocalNet, and do this on another day.

### I1. Bring up the sandbox (≈ 40 minutes the first time, 5 after)

In **window 1** (PowerShell 7):

```
cd ../decentralization-manager
bash hackathon/up.sh
bash hackathon/seed.sh
```

`up.sh` ends with `LocalNet is up` and three URLs; `seed.sh` ends with `The demo party is ready` and prints the party (`demo-party::1220…`), the rules contract and three member parties. If either fails, read its last lines: the usual cause is Docker with less than 12 GB.

Then, in the Indivisa repo:

```
cd <the repository>
dpm build --all
pwsh infra\bitsafe\distribute.ps1
```

`distribute.ps1` ends with three lines `node 808x: governance-settlement-v0, indivisa, indivisa-governance-v0, splice-test-token-v2`. Copy the demo party id from seed.sh's output (or from `../decentralization-manager/hackathon/.state`, line `DEC_PARTY_ID=`); you need it twice below. Call it `<DP>`.

### I2. Seat, admit, prepare, propose (≈ 3 minutes)

```
pwsh infra\demo.ps1   seat    -Network bitsafe -Holders 10 -Tag clip -User ledger-api-user
pwsh infra\govern.ps1 admit   -Network bitsafe -Tag clip
pwsh infra\demo.ps1   prepare -Network bitsafe -Tag clip -Approver <DP>
```

Expected endings: `seat 'clip' on bitsafe: 10 holders in 2xs`, then `admit`'s three lines `node 1 confirmed`, `node 2 confirmed`, `executed`, then `prepare 'clip' (withhold 0): 1xs`. Do **not** run `propose` yet; that is done on camera.

**Window 2**: the console, pointed at the sandbox.

```
cd ui
$env:INDIVISA_NETWORK = "bitsafe"
$env:INDIVISA_TAG = "clip"
npm run dev
```

Chrome, tab A: `http://localhost:5173`. RUN reads **PREPARED**, ALLOCATIONS **11 / 11**, and under the button a second line: **Approver** *demo party · a decentralised party; its members must confirm before the settle can execute*, above the note *All or nothing, and not alone: this run names an approver, so the agent cannot settle it. The button signs a request instead.* Open a card on the node that also hosts the paying agent and it says *This node also hosts the paying agent, so the data is on the node; the ledger filters it by party* instead of *never received*: in the sandbox one of the three nodes hosts both, and the page says so rather than claiming more than it should.

Chrome, tab B: `http://localhost:8081`, BitSafe's Decentralization Manager for node 1. Click **Parties**, then the `demo-party` row, then expand **Audit Trail**. Leave it there.

DecMan's **Approvals** page does not list our proposal (it renders only its own proposal types; checked 22 September), so the confirmations are made with our `govern.ps1`, which calls the same DecMan API their own demo script calls. The Audit Trail shows them all the same.

Recorder as in Part C. Window 1 (PowerShell) and Chrome both need to be on screen: make the PowerShell window large-font (Settings → Appearance → font size 18) and Alt+Tab between them; a split screen is harder to read.

### I3. The shots

| # | Seconds | On screen | Caption | Real / simulated |
|---|---|---|---|---|
| 1 | 0–6 | Card: **Governed settlement** / Indivisa on BitSafe's Decentralization Manager / *one governed action: `Run_Settle`* | | |
| 2 | 6–14 | Tab A, still. Mouse rests on the **APPROVER** line, then on the note under the button. | The paying agent sees every leg. It can no longer settle alone: the run names an approver, a decentralised party. | real |
| 3 | 14–22 | Tab A. **Click the button.** Red box: **SETTLEMENT REJECTED · 10 payments requested · 0 executed**, and in the reason the words *requires authorizers … Approvers … but only … PayingAgent were given*. Every card unchanged. | The agent's own button, refused by the ledger. The authority is not there. | real |
| 4 | 22–30 | Window 1: type `pwsh infra\govern.ps1 propose -Network bitsafe -Tag clip`, Enter. One line back: `proposed XS2999912340/Coupon/2027-12-01: 10 legs, 16034.38 -> 00…` | So it proposes. Ten legs, $16,034.38, filed for the approvers. | real |
| 5 | 30–38 | Window 1: `pwsh infra\govern.ps1 confirm -Network bitsafe -Tag clip -Node 1` → `node 1 confirmed`. Then `pwsh infra\govern.ps1 execute -Network bitsafe -Tag clip -Node 2` → **REFUSED:** … *'Enough confirmations to execute action' was not met.* | One of three approvers has confirmed. Execution refused. Nothing moved. | real |
| 6 | 38–46 | Window 1: `pwsh infra\govern.ps1 confirm -Network bitsafe -Tag clip -Node 2` → `node 2 confirmed`. Then `… execute -Network bitsafe -Tag clip -Node 3` → `node 3 executes with 2 confirmation(s); can_execute=True` … **EXECUTED**. | Two of three. The third member executes. | real |
| 7 | 46–54 | Tab A. Within two seconds: pill **SETTLED**, green box **SETTLED · 10 of 10 legs · 16,034.38 USD** with the update id; every card green and **PAID**. | Settled. Every holder paid in one transaction, and only because two members agreed. | real |
| 8 | 54–60 | Tab B. The Audit Trail: rows `propose`, `confirm`, `confirm`, `execute`, `execute_result`, each with an update id. | BitSafe's own trail: every step attributable. | real |
| 9 | 60–66 | Card: *Three nodes on one workstation are not three operators. The threshold is real; the independence is simulated. Cash is TestTokenV2; holders are synthetic.* / *`governance-settlement-v0`: any Token Standard V2 batch, no Indivisa in it.* | | |

Record it as one continuous clip if you can (there is no waiting in it: the refusal and the settle each take a second or two); otherwise stop and start between shots 3 and 4 and cut in Resolve as in Part F. The two cards are made in PowerPoint exactly as in Part B (`cards-bitsafe.pptx`, two slides).

If shot 3 shows a green box instead of a red one, the run was prepared without `-Approver`; stop, and redo I2 with a new tag.

### I4. What this clip may claim

- "Two of three approvers must confirm": yes; the threshold is in the `GovernanceRules` contract on the ledger, not in our code.
- "The agent cannot settle alone": yes, and shot 3 shows the ledger saying so; the sentence to avoid is "the agent cannot see the run", which is false and not the point.
- "Independent approvers": **no.** Three DecMan nodes and three participants on one workstation run by one person. Card 9 says so; keep it in.
- "Built on BitSafe's Decentralization Manager": yes, unmodified. Never "BitSafe governs the settlement": they provide the tooling; we govern the action.

## Troubleshooting

| You see | It means | Do this |
|---|---|---|
| The page says *No seat file. Run: pwsh infra/demo.ps1 seat…* | the dev server was started with the wrong tag, or the seat did not finish | in that window press Ctrl+C, set `$env:INDIVISA_TAG` again, `npm run dev` again |
| The page says *No participant map…* | the party map file is missing | in window 1: `pwsh infra\participants-with-parties.ps1` |
| A red box beginning *Error: 4…* that stays for more than ten seconds | the page cannot reach the ledger | check window 1: is LocalNet still up (`LocalNet is up` and no `exited`)? check windows 2 and 3 are still running |
| The button is grey and says *Prepare the run first* | A6 was not run for that tag | run the `prepare` line for that tag |
| Names repeat in the schedule (two identical people) | an old build | `dpm build --all`, then reseat |
| *Settling…* for more than 30 seconds | the network is struggling | wait a full minute; if nothing, stop recording, `pwsh infra\localnet\up.ps1 -Down`, then Part A from A3 (about an hour) |
| The PC restarted or slept | LocalNet is gone (it lives in memory) | Part A from A3, new tags (`take3`, `take4`) |

Anything else: keep the PowerShell windows open, screenshot them, and ask.
