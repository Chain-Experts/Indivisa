# The recording: a complete script

This is written for someone who has never seen the project. Follow it top to
bottom. Every command is given exactly; every screen is described before
you see it, so you know whether you are looking at the right thing.

Nothing in the recording is mocked. The numbers on screen are read from a
Canton ledger running on this machine while you record. There is **no
Docker** anywhere in this; the network is one Java process started by a
script.

Time budget, first time through: about 2.5 hours, of which 1 hour is
waiting for two demo seats to build. Second time: about 1 hour.

## 0. What you will end up with

| File | What it is |
|---|---|
| `D:\Dev\ChainExperts\Indivisa-recording\raw\take1.mp4` | the success run, one clip |
| `D:\Dev\ChainExperts\Indivisa-recording\raw\take2-rejected.mp4` | the deliberate failure |
| `D:\Dev\ChainExperts\Indivisa-recording\raw\take2-settled.mp4` | the fix and the retry |
| `D:\Dev\ChainExperts\Indivisa-recording\cards.pptx` and `cards\Slide1.PNG` … `Slide5.PNG` | five title cards |
| `D:\Dev\ChainExperts\Indivisa-recording\Indivisa-HackCanton-S3.mp4` | the finished 60–90 second video |

The `Indivisa-recording` folder sits **next to** the repo, not inside it, so
video files never end up in git.

## 1. What you need

- This workstation (Windows 11), the repo at `D:\Dev\ChainExperts\Indivisa`,
  already set up (dpm, Node, PowerShell 7, Chrome). If `dpm build --all`
  has ever worked here, everything is in place.
- **OBS Studio** (free, obsproject.com) to record the screen. Install with
  defaults. Windows' own Game Bar (Win+Alt+R) also works but records only
  one window and gives you no control; OBS is worth the ten minutes.
- **Clipchamp** to cut the clips together. It is built into Windows 11
  (Start menu, type "Clipchamp").
- **PowerPoint** for five title cards.
- A quiet hour for the recording itself. Turn on Do Not Disturb (Windows
  Settings → System → Notifications → Do not disturb: On) so no toast pops
  into the video.
- Keep the machine **awake** from the moment the network starts until the
  last clip is recorded: Settings → System → Power → Screen and sleep →
  both "Never" for now. The network lives in memory; if the PC sleeps or
  restarts, everything seated is gone and Part A starts again.

## Part A. Bring the network up and seat the two demos (≈ 1 hour, mostly waiting)

Open **PowerShell 7**: press the Windows key, type `pwsh`, Enter. A window
with a `PS C:\Users\...>` prompt appears. Keep this window open for the
whole session; call it **window 1**.

**A1. Go to the repo.**

```
cd D:\Dev\ChainExperts\Indivisa
```

**A2. Build the Daml packages** (2 minutes; it must happen before the
network starts, because the network uploads the built package on start).

```
dpm build --all
```

Wait for the prompt to come back. Among the last lines there must be
`Created .daml\dist\indivisa-0.4.0.dar` and
`Created .daml\dist\indivisa-test-0.1.0.dar` (three more packages build
after them; they belong to a separate challenge and do not matter here).
Any line starting with `error` means stop and ask for help.

**A3. Start LocalNet** (about 5 minutes).

```
pwsh infra\localnet\up.ps1 -Heap 12g
```

Text scrolls for a few minutes while five Canton nodes start and upload
packages. It ends with a line containing **`LocalNet is up`**. If instead
you see `Timed out` or `exited early`, run `pwsh infra\localnet\up.ps1
-Down`, wait ten seconds, and run A3 again.

**A4. Seat demo one** (the success run; 20 to 30 minutes).

```
pwsh infra\demo.ps1 seat -Holders 250 -Tag take1
```

This creates 250 holder parties, the bond, the register, the holders'
one-time agreements, the coupon announcement and the payment schedule.
Nothing prints for a long time; that is normal. It ends with one line:

```
seat 'take1' on localnet: 250 holders in 1,2xxs -> D:\Dev\ChainExperts\Indivisa\infra\localnet\demo\seat-take1.json
```

**A5. Seat demo two** (the failure run; another 20 to 30 minutes).

```
pwsh infra\demo.ps1 seat -Holders 250 -Tag take2
```

Same ending line, with `take2`.

**A6. Prepare both runs** (under a minute each). This creates the cash
allocations that the one transaction will settle. Demo one gets all of
them; demo two is deliberately left with one holder missing.

```
pwsh infra\demo.ps1 prepare -Tag take1
pwsh infra\demo.ps1 prepare -Tag take2 -Withhold 1
```

Expected endings: `prepare 'take1' (withhold 0): 1xs -> ...prepared-take1.json`
and, for take2, a line `withholding the receipt allocation of
'Hanna-Ivanova-take2-...'` followed by `prepare 'take2' (withhold 1): 1xs -> ...`.
Hanna Ivanova is the last holder of every 250-holder seat; she is the one
who will block the batch.

**A7. Start the two web pages.** Open a **second** PowerShell window
(window 2) and run:

```
cd D:\Dev\ChainExperts\Indivisa\ui
npm install
$env:INDIVISA_TAG = "take1"
npm run dev
```

`npm install` only does anything the first time. The last lines show
`➜  Local:   http://localhost:5173/`. Leave window 2 alone; it is now
serving demo one.

Open a **third** PowerShell window (window 3):

```
cd D:\Dev\ChainExperts\Indivisa\ui
$env:INDIVISA_TAG = "take2"
npm run dev -- --port 5174
```

It shows `➜  Local:   http://localhost:5174/`. Window 3 serves demo two.

**A8. Check both pages in Chrome.** Open Chrome, go to
`http://localhost:5173`. Within two seconds you should see:

- A header: **Indivisa** — *Corporate actions, settled in one atomic batch,
  without exposing the register.* — and two small labels on the right,
  "real · ledger reads and the settle are live over the JSON Ledger API" and
  "simulated · the cash is TestTokenV2, the holders are synthetic".
- A wide left pane, **Meridian Paying Agent**, with a green pill
  **PREPARED**, and these lines: INSTRUMENT *Northwind Rail 4.375% 2031
  XS2999912340* · EVENT *Coupon · record date 2027-11-15 · payment date
  2027-12-01* · PER UNIT *21.88 USD · rounding LargestRemainder* · HOLDERS
  *250* · TOTAL DUE **1,197,240.63 USD** · ALLOCATIONS **251 of 251** · 1
  send + 250 receipts. Under that a big green button **Settle 250 legs in
  one transaction** and the note "All or nothing. If any leg cannot settle,
  nothing moves." Below the button, a table headed THE SCHEDULE listing
  holders with units and amounts.
- Three narrower panes: **Omar Berg** (MY POSITION 5 units, MY ALLOCATION
  109.37 USD), **Ingrid Andersen** (30 units, 656.25 USD), **Tomasz Kaur**
  (300 units, 6,562.50 USD). Each has the pill **ALLOCATED**, MY CASH
  **0.00 USD**, and a list "WHAT THIS NODE HOLDS ABOUT OTHER HOLDERS" with
  six lines all reading **0**, ending in the box "Nothing. Not hidden —
  never received by this participant."

Now open a second tab at `http://localhost:5174`. Identical, except
ALLOCATIONS reads **250 of 251** · 1 send + 250 receipts · **1 missing**
(the "1 missing" in red).

If either page shows a red error box instead, see Troubleshooting at the
end. Do not record until both pages look right.

The network and both pages can now sit for hours. Do the cards and the
recorder setup next.

## Part B. The five title cards in PowerPoint (≈ 20 minutes)

Open PowerPoint → Blank Presentation. Design → Slide Size → Widescreen
(16:9) (it usually is already). Set every slide to a plain background:
Design → Format Background → Solid fill → colour `#F6F7F3` (the page's
off-white); text colour `#1B2622`; the green used below is `#1E6B48`.
Use one clean font throughout (Segoe UI or Calibri), large: 44 pt for the
first line, 28 pt for the rest. Left-aligned, generous margins. No clip
art, no animations.

| Slide | Text, exactly |
|---|---|
| 1 | **Indivisa** (green, 66 pt) / Corporate actions, settled in one atomic batch, without exposing the register. / Chain-Experts · HackCanton Season 3 |
| 2 | **A bond coupon. 250 holders. One paying agent.** / Every number you are about to see is read live from a Canton ledger. / *(small, 20 pt, at the bottom)* Real: the ledger, the settlement, the update id. Simulated: the cash (TestTokenV2, the reference Token Standard V2 asset) and the holders. |
| 3 | **Each holder's node holds its own line.** / And nothing about anyone else. Not filtered: never delivered. |
| 4 | **Now the same run, with one holder not ready.** / This is the atomicity test. If any leg cannot settle, nothing moves. |
| 5 | **One transaction. 250 holders paid at the same instant, or nobody.** / Measured on LocalNet: 250 legs in 1.6 s · 500 in 4.0 s · 1,000 in 11.1 s / Built on Token Standard V2 (CIP-0112, approved June 2026) / github.com/Chain-Experts/Indivisa |

Save: File → Save As → `D:\Dev\ChainExperts\Indivisa-recording\cards.pptx`
(create the folder in the dialog if it does not exist).

Export as images: File → Export → Change File Type → PNG Portable Network
Graphics → Save As → choose the folder `D:\Dev\ChainExperts\Indivisa-recording`,
file name `cards` → Save → when asked "Which slides do you want to
export?" click **All Slides**. PowerPoint creates a folder `cards` with
`Slide1.PNG` … `Slide5.PNG`.

## Part C. Set up the screen and the recorder (≈ 15 minutes)

**C1. Chrome.** Use one Chrome window with the two tabs from A8, nothing
else open in it. Hide the bookmarks bar (Ctrl+Shift+B until it disappears).
Press **F11** for full screen: the address bar vanishes, so no
"localhost" appears in the video. Check the zoom: press Ctrl+0 (100%),
then Ctrl and + once (110%). All four panes must sit on **one row**; if
the third holder pane has dropped to a second row, press Ctrl and − once.
Scroll to the top of the page (Home key).

**C2. OBS.** Open OBS Studio.

- Settings (bottom right) → **Video**: Base (Canvas) Resolution 1920x1080,
  Output (Scaled) Resolution 1920x1080, Common FPS Values 30. OK.
- Settings → **Output**: Output Mode *Simple*; Recording Path → Browse →
  `D:\Dev\ChainExperts\Indivisa-recording\raw` (create it); Recording
  Quality *High Quality, Medium File Size*; Recording Format *MP4* (or
  *Hybrid MP4* on newer OBS). OK.
- Settings → **Audio**: if you will speak, leave Mic/Auxiliary on your
  microphone; if not, set every device to Disabled so the video is silent.
- In the main window, under **Sources**, click **+** → **Display Capture**
  → OK → pick the monitor Chrome is on → OK. The preview shows your
  desktop.
- Do a ten-second test: **Start Recording**, Alt+Tab to Chrome, wait,
  Alt+Tab back, **Stop Recording**. Open the file in
  `Indivisa-recording\raw` and check it plays and the panes are sharp.
  Delete the test file.

**C3. Rename as you go.** OBS names files by date and time. After each
clip, rename it in File Explorer to the name in section 0 so the edit is
easy.

## Part D. Record take 1: the success run (≈ 5 minutes)

Chrome is full screen on the **5173** tab (demo one). OBS is behind it.

1. In OBS click **Start Recording**. Alt+Tab to Chrome. Let the page sit
   still for **five full seconds** with the mouse parked at the bottom
   right, off any text. (This still frame is shots 1 and 2 of the edit.)
2. Move the mouse slowly down the schedule table on the agent pane, then
   back up to the button. Take about eight seconds. Do not click anything.
3. Move the mouse over **Omar Berg**'s pane and rest it on the six zeros
   for three seconds, then over **Ingrid Andersen**'s for three seconds.
4. Move to the green button **Settle 250 legs in one transaction** and
   **click it once**. The button text changes to *Settling…*. Do not move
   the mouse.
5. After one to three seconds the pane changes: the pill reads **SETTLED**,
   the button is greyed out and reads *Settled*, and a green box appears:
   **SETTLED · 250 of 250 legs · 1,197,240.63 USD**, then *update id
   1220…* (a long code), then *effective 2026-… · submitted to committed in
   1,6xx ms*. ALLOCATIONS now reads *251 consumed by the settlement*. Within
   two more seconds every holder pane flips: pill **PAID**, MY CASH in
   large type (**109.37 USD · 1 holding**, **656.25 USD**, **6,562.50
   USD**), MY ALLOCATION *none for this run*, and the six zeros unchanged.
6. Let it sit for **ten seconds**. Then Alt+Tab to OBS, **Stop Recording**.
7. Rename the new file to `take1.mp4`.

If step 5 shows a red box instead of green, something is wrong with the
seat, not with your recording; stop, keep the file, and see Troubleshooting.

## Part E. Record take 2: the deliberate failure, then the fix (≈ 10 minutes)

Switch Chrome to the **5174** tab (Ctrl+Tab, or Ctrl+2). Confirm
ALLOCATIONS reads **250 of 251 · 1 missing**.

**E1. The refusal.**

1. **Start Recording** in OBS, Alt+Tab to Chrome, five seconds still with
   the mouse parked. Hover over the words **1 missing** for two seconds.
2. Click **Settle 250 legs in one transaction**. *Settling…* for about a
   second, then the pill turns red **REJECTED** and a red box appears:
   **SETTLEMENT REJECTED · 250 payments requested · 0 executed**, then
   **NO PARTIAL SETTLEMENT**, then several lines of the ledger's own
   reason (it contains the words *missing authorizations* and the name
   *Hanna-Ivanova-take2-…*), then *recorded on-ledger at 2026-…*.
3. Look at the three holder panes: unchanged. Still **ALLOCATED**, MY CASH
   still **0.00 USD**. Rest the mouse on one of them for three seconds.
4. Ten seconds still, then **Stop Recording**. Rename to
   `take2-rejected.mp4`.

**E2. The fix.** In **window 1** (PowerShell, the repo folder) run:

```
pwsh infra\demo.ps1 prepare -Tag take2
```

It ends with `prepare 'take2' (withhold 0): 1xs -> ...`. This creates the
one allocation that was withheld. You may record this window for the
video (a plain terminal, one command, one line back) or leave it out and
let card 4's second line explain it. If you record it: Start Recording,
type the command, wait for the line, Stop Recording, rename to
`take2-fix.mp4`.

**E3. The retry.** Back in Chrome on the 5174 tab, within a few seconds
ALLOCATIONS reads **251 of 251**; the red box and the REJECTED pill are
still showing (that is correct: the refusal happened and is on record).

1. **Start Recording**, five seconds still, hover on **251 of 251**.
2. Click the button. *Settling…*, then green: **SETTLED · 250 of 250 legs ·
   1,197,240.63 USD**, update id, commit time; holder panes flip to
   **PAID** with their cash.
3. Ten seconds still. **Stop Recording**. Rename to `take2-settled.mp4`.

Recording is finished. You can close OBS. Leave the network running until
the edit is done in case a clip needs re-shooting.

## Part F. The edit in Clipchamp (≈ 30 minutes)

Open Clipchamp → **Create a new video**. Click **Import media** and select
the three (or four) `.mp4` files from `Indivisa-recording\raw` and the five
`Slide*.PNG` files from `Indivisa-recording\cards`.

Drag items onto the timeline in this order, and set each card's duration
by dragging its right edge (the default is 5 s; make cards **3 s**):

| # | Item | Keep | Caption it carries |
|---|---|---|---|
| 1 | Slide1.PNG | 3 s | title |
| 2 | Slide2.PNG | 4 s | "A bond coupon. 250 holders…" |
| 3 | take1.mp4, from the start to just before the click | ~16 s | the still page, the schedule scroll, the holders |
| 4 | Slide3.PNG | 3 s | "Each holder's node holds its own line" |
| 5 | take1.mp4, the click through the green box and the paid holders | ~12 s | the settle |
| 6 | Slide4.PNG | 4 s | "Now the same run, with one holder not ready…" |
| 7 | take2-rejected.mp4, the click through the red box | ~12 s | the refusal |
| 8 | take2-fix.mp4 (optional) | ~5 s | the one command |
| 9 | take2-settled.mp4, the click through the green box | ~10 s | the retry |
| 10 | Slide5.PNG | 6 s | closing |

To cut a clip: click it on the timeline, move the playhead to the cut
point, press **S** (split), click the piece you do not want, press
Delete. Total should land between 70 and 80 seconds.

Do not add music, transitions or zoom effects; a straight cut is right for
this. If you recorded voice, it is already in the clips. If not and you
want a voice-over, Clipchamp's **Record & create → Audio** lets you record
over the timeline; the lines to say are in Part G.

Export: **Export** (top right) → 1080p → it renders and downloads to your
Downloads folder → move it to `D:\Dev\ChainExperts\Indivisa-recording\`
and rename to `Indivisa-HackCanton-S3.mp4`. Play it once end to end.

## Part G. What to say, if there is a voice-over

One sentence per shot, spoken slowly; silence is fine between them.

- Over the still page: "A bond pays its coupon to two hundred and fifty
  holders. This is the paying agent's view: every holder, every amount."
- Over the holder panes: "This is a holder's view, read from its own
  node. Its own line, and nothing about anyone else. Not filtered — never
  delivered."
- Over the click: "One transaction."
- Over the green box: "Settled. Every holder paid at the same instant.
  The update id is on screen."
- Over card 4 and the second click: "Now the same run with one holder
  not ready. If any leg cannot settle, nothing moves."
- Over the red box: "Refused by the ledger. Two hundred and fifty
  requested, zero executed. The refusal itself is recorded."
- Over the retry: "The holder is made ready. Same button. Settled."
- Over the closing card: "Indivisa. Corporate actions, settled in one
  atomic batch, without exposing the register."

## Part H. What a caption may and may not claim

- "Every holder paid at the same instant or nobody": yes; that is what one
  `SettlementFactory_SettleBatch` transaction means, and take 2 shows the
  "nobody" half.
- "No holder sees another's payment": yes on LocalNet, where each holder
  is on its own participant; the zeros are absence, not filtering. On a
  DevNet with one validator say "each holder's view contains only its own
  leg".
- **Never** "zero information leakage": the paying agent sees everything,
  by design, and the schedule table shows it.
- "One transaction": yes; the update id on screen is one id. Do not say
  "one block" or "one second".
- The cash is `TestTokenV2`, the reference Token Standard V2 asset, not
  Canton Coin; the holders and their positions are generated. Both labels
  are in the page header throughout; keep the header in frame.
- The timing line on card 5 is from `benchmark.md`; quote it as LocalNet
  (five nodes on one machine), not as DevNet, until the DevNet run exists.

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
